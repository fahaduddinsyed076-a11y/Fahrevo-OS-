-- ============================================================================
-- Fahrevo OS — Milestone 2: Sales + Recipes + automatic inventory consumption
-- Additive migration. No tables dropped; no existing columns removed.
--
-- Decisions (recorded, matching the milestone's auditability principles):
--   * COGS basis: the ingredient's current cost-per-base-unit is SNAPSHOT onto
--     each sale_consumption ledger row at confirm time (unit_cost / line_cost),
--     so historical COGS never drifts when costs change later. Still the
--     "current cost" method — no FIFO / weighted average introduced.
--   * Payment status & receivable are DERIVED from the payments table, never a
--     separately stored balance.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sale lifecycle
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type sale_status as enum ('draft', 'confirmed', 'voided');
  end if;
end $$;

alter table sales add column if not exists status       sale_status not null default 'draft';
alter table sales add column if not exists confirmed_at timestamptz;
alter table sales add column if not exists void_reason  text;

-- ---------------------------------------------------------------------------
-- 2. Cost snapshot + product attribution on the inventory ledger
-- ---------------------------------------------------------------------------
alter table inventory_transactions add column if not exists unit_cost    numeric(12, 4);
alter table inventory_transactions add column if not exists line_cost    numeric(12, 2);
alter table inventory_transactions add column if not exists sale_item_id uuid references sale_items (id) on delete set null;

create index if not exists idx_inv_txn_sale_item on inventory_transactions (sale_item_id);

-- ---------------------------------------------------------------------------
-- 3. Deterministic unit helpers
-- ---------------------------------------------------------------------------
create or replace function unit_factor(u unit_type) returns numeric
language sql immutable as $$
  select case u
    when 'g' then 1 when 'kg' then 1000
    when 'ml' then 1 when 'L' then 1000
    when 'pcs' then 1 end::numeric;
$$;

create or replace function unit_group(u unit_type) returns text
language sql immutable as $$
  select case when u in ('g','kg') then 'mass'
              when u in ('ml','L') then 'volume'
              else 'count' end;
$$;

create or replace function units_compatible(a unit_type, b unit_type) returns boolean
language sql immutable as $$
  select unit_group(a) = unit_group(b);
$$;

-- Convert qty from one unit to another compatible unit; raise on mismatch.
create or replace function convert_to_unit(qty numeric, from_u unit_type, to_u unit_type)
returns numeric language plpgsql immutable as $$
begin
  if not units_compatible(from_u, to_u) then
    raise exception 'UNIT_MISMATCH: cannot convert % to %', from_u, to_u;
  end if;
  return qty * unit_factor(from_u) / unit_factor(to_u);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Recipe unit validation (blocks incompatible unit vs ingredient base unit)
-- ---------------------------------------------------------------------------
create or replace function fn_recipe_validate_unit() returns trigger
language plpgsql as $$
declare b unit_type;
begin
  select base_unit into b from ingredients where id = new.ingredient_id;
  if b is null then raise exception 'Ingredient not found'; end if;
  if not units_compatible(new.unit, b) then
    raise exception 'UNIT_MISMATCH: recipe unit % is incompatible with ingredient base unit %', new.unit, b;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recipe_validate_unit on recipes;
create trigger trg_recipe_validate_unit
  before insert or update on recipes
  for each row execute function fn_recipe_validate_unit();

-- ---------------------------------------------------------------------------
-- 5. Deterministic sale line + total maintenance (server-side authority)
-- ---------------------------------------------------------------------------
create or replace function fn_sale_item_line_amount() returns trigger
language plpgsql as $$
begin
  new.final_line_amount := greatest(
    coalesce(new.quantity, 0) * coalesce(new.unit_price, 0) - coalesce(new.discount, 0), 0);
  return new;
end;
$$;

drop trigger if exists trg_sale_item_line_amount on sale_items;
create trigger trg_sale_item_line_amount
  before insert or update on sale_items
  for each row execute function fn_sale_item_line_amount();

create or replace function fn_recalc_sale_totals() returns trigger
language plpgsql as $$
declare sid uuid;
begin
  sid := case when tg_op = 'DELETE' then old.sale_id else new.sale_id end;
  update sales set subtotal =
    coalesce((select sum(final_line_amount) from sale_items where sale_id = sid), 0)
    where id = sid;
  if tg_op = 'UPDATE' and new.sale_id is distinct from old.sale_id then
    update sales set subtotal =
      coalesce((select sum(final_line_amount) from sale_items where sale_id = old.sale_id), 0)
      where id = old.sale_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_recalc_sale_totals on sale_items;
create trigger trg_recalc_sale_totals
  after insert or update or delete on sale_items
  for each row execute function fn_recalc_sale_totals();

-- final_amount = subtotal - discount + tax (never negative). Tax is never
-- inferred; it is whatever was explicitly entered.
create or replace function fn_sale_amounts() returns trigger
language plpgsql as $$
begin
  new.final_amount := greatest(
    coalesce(new.subtotal, 0) - coalesce(new.discount, 0) + coalesce(new.tax, 0), 0);
  return new;
end;
$$;

drop trigger if exists trg_sale_amounts on sales;
create trigger trg_sale_amounts
  before insert or update on sales
  for each row execute function fn_sale_amounts();

-- ---------------------------------------------------------------------------
-- 6. Payment status derivation (from payments, not a stored balance)
-- ---------------------------------------------------------------------------
create or replace function recompute_sale_payment_status(p_sale_id uuid) returns void
language plpgsql as $$
declare fa numeric; rec numeric;
begin
  select final_amount into fa from sales where id = p_sale_id;
  if fa is null then return; end if;
  select coalesce(sum(amount), 0) into rec
    from payments where sale_id = p_sale_id and direction = 'received';
  update sales set payment_status = (case
      when fa > 0 and rec >= fa then 'Paid'
      when rec > 0 then 'Partial'
      else 'Unpaid' end)::payment_status
    where id = p_sale_id;
end;
$$;

create or replace function fn_sync_sale_payment_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.sale_id is not null then perform recompute_sale_payment_status(old.sale_id); end if;
    return old;
  end if;
  if new.sale_id is not null then perform recompute_sale_payment_status(new.sale_id); end if;
  if tg_op = 'UPDATE' and old.sale_id is not null and old.sale_id is distinct from new.sale_id then
    perform recompute_sale_payment_status(old.sale_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sale_payment_status on payments;
create trigger trg_sync_sale_payment_status
  after insert or update or delete on payments
  for each row execute function fn_sync_sale_payment_status();

-- ---------------------------------------------------------------------------
-- 7. confirm_sale — ATOMIC: validate recipes + stock, consume inventory with
--    cost snapshot, confirm, and (optionally) record an initial payment.
--    Any failure raises and rolls back the entire transaction.
-- ---------------------------------------------------------------------------
create or replace function confirm_sale(
  p_sale_id         uuid,
  p_amount_received numeric        default 0,
  p_payment_method  payment_method default null,
  p_payment_date    date           default current_date
) returns jsonb
language plpgsql as $$
declare
  v_status    sale_status;
  v_missing   text;
  v_ing       record;
begin
  select status into v_status from sales where id = p_sale_id for update;
  if v_status is null then raise exception 'SALE_NOT_FOUND'; end if;
  if v_status <> 'draft' then
    raise exception 'INVALID_STATE: sale is % (only a draft can be confirmed)', v_status;
  end if;
  if (select count(*) from sale_items where sale_id = p_sale_id) = 0 then
    raise exception 'NO_ITEMS: sale has no line items';
  end if;

  -- (a) Every product must have a recipe — otherwise no silent consumption.
  select p.product_name into v_missing
  from sale_items si
  join products p on p.id = si.product_id
  where si.sale_id = p_sale_id
    and not exists (select 1 from recipes r where r.product_id = si.product_id)
  limit 1;
  if v_missing is not null then
    raise exception 'NO_RECIPE: %', v_missing;
  end if;

  -- (b) Sufficient stock for every required ingredient (in base units).
  for v_ing in
    with need as (
      select r.ingredient_id, i.ingredient_name, i.base_unit,
             sum(convert_to_unit(
               r.quantity_required * (1 + r.wastage_percentage / 100.0) * si.quantity,
               r.unit, i.base_unit)) as required
      from sale_items si
      join recipes r     on r.product_id = si.product_id
      join ingredients i on i.id = r.ingredient_id
      where si.sale_id = p_sale_id
      group by r.ingredient_id, i.ingredient_name, i.base_unit
    )
    select need.ingredient_name, need.base_unit, need.required,
           coalesce((select sum(t.quantity) from inventory_transactions t
                     where t.ingredient_id = need.ingredient_id), 0) as available
    from need
  loop
    if v_ing.required > v_ing.available then
      raise exception 'INSUFFICIENT_STOCK: % required % % available % %',
        v_ing.ingredient_name, v_ing.required, v_ing.base_unit, v_ing.available, v_ing.base_unit;
    end if;
  end loop;

  -- (c) Write consumption ledger rows (per sale_item, cost snapshot attached).
  insert into inventory_transactions(
    ingredient_id, transaction_type, quantity, unit,
    reference_type, reference_id, sale_item_id, unit_cost, line_cost, notes)
  select
    r.ingredient_id, 'sale_consumption',
    - convert_to_unit(r.quantity_required * (1 + r.wastage_percentage / 100.0) * si.quantity, r.unit, i.base_unit),
    i.base_unit, 'sale', p_sale_id, si.id,
    i.current_cost_per_base_unit,
    case when i.current_cost_per_base_unit is null then null
         else round(convert_to_unit(r.quantity_required * (1 + r.wastage_percentage / 100.0) * si.quantity, r.unit, i.base_unit)
                    * i.current_cost_per_base_unit, 2) end,
    'Auto consumption on sale confirm'
  from sale_items si
  join recipes r     on r.product_id = si.product_id
  join ingredients i on i.id = r.ingredient_id
  where si.sale_id = p_sale_id;

  -- (d) Confirm + optional initial payment (atomic with the above).
  update sales set status = 'confirmed', confirmed_at = now() where id = p_sale_id;

  if p_amount_received is not null and p_amount_received > 0 then
    insert into payments(payment_date, direction, amount, payment_method, sale_id, notes)
    values (coalesce(p_payment_date, current_date), 'received', p_amount_received,
            coalesce(p_payment_method, 'Cash'), p_sale_id, 'Initial payment on sale confirm');
  else
    perform recompute_sale_payment_status(p_sale_id);
  end if;

  return jsonb_build_object('sale_id', p_sale_id, 'status', 'confirmed');
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. void_sale — ATOMIC: reverse consumption (non-destructive), mark voided.
-- ---------------------------------------------------------------------------
create or replace function void_sale(p_sale_id uuid, p_reason text default null)
returns jsonb language plpgsql as $$
declare v_status sale_status;
begin
  select status into v_status from sales where id = p_sale_id for update;
  if v_status is null then raise exception 'SALE_NOT_FOUND'; end if;
  if v_status <> 'confirmed' then
    raise exception 'INVALID_STATE: only a confirmed sale can be voided (current %)', v_status;
  end if;

  -- Reversing correction rows restore stock without deleting the originals.
  insert into inventory_transactions(
    ingredient_id, transaction_type, quantity, unit,
    reference_type, reference_id, sale_item_id, unit_cost, line_cost, notes)
  select t.ingredient_id, 'correction', -t.quantity, t.unit,
         'sale_void', p_sale_id, t.sale_item_id, t.unit_cost,
         case when t.line_cost is null then null else -t.line_cost end,
         'Reversal of voided sale'
  from inventory_transactions t
  where t.reference_type = 'sale' and t.reference_id = p_sale_id
    and t.transaction_type = 'sale_consumption';

  update sales set
    status = 'voided', is_void = true, voided_at = now(), void_reason = p_reason
  where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id, 'status', 'voided');
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Reporting views (security_invoker so caller RLS is enforced)
-- ---------------------------------------------------------------------------
drop view if exists ingredient_stock;
create view ingredient_stock with (security_invoker = true) as
select
  i.id as ingredient_id, i.ingredient_name, i.base_unit, i.minimum_stock_level,
  coalesce(sum(t.quantity), 0) as current_stock,
  (i.minimum_stock_level is not null
     and coalesce(sum(t.quantity), 0) < i.minimum_stock_level) as below_minimum
from ingredients i
left join inventory_transactions t on t.ingredient_id = i.id
group by i.id, i.ingredient_name, i.base_unit, i.minimum_stock_level;

create or replace view sale_financials with (security_invoker = true) as
select
  s.id as sale_id, s.sale_number, s.sale_date, s.status, s.sales_channel,
  s.customer_id, s.subtotal, s.discount, s.tax, s.final_amount, s.payment_status,
  coalesce((select sum(pm.amount) from payments pm
            where pm.sale_id = s.id and pm.direction = 'received'), 0) as amount_received,
  greatest(s.final_amount - coalesce((select sum(pm.amount) from payments pm
            where pm.sale_id = s.id and pm.direction = 'received'), 0), 0) as receivable,
  (select case
     when count(*) filter (where t.transaction_type = 'sale_consumption') = 0 then null
     when bool_or(t.line_cost is null) filter (where t.transaction_type = 'sale_consumption') then null
     else sum(t.line_cost) filter (where t.transaction_type = 'sale_consumption') end
   from inventory_transactions t
   where t.reference_type = 'sale' and t.reference_id = s.id) as cogs
from sales s;

create or replace view sale_item_financials with (security_invoker = true) as
select
  si.id as sale_item_id, si.sale_id, s.sale_date, s.status, s.sales_channel,
  si.product_id, p.product_name, si.quantity, si.unit_price, si.discount,
  si.final_line_amount as revenue,
  exists (select 1 from recipes r where r.product_id = si.product_id) as has_recipe,
  (select case
     when count(*) = 0 then null
     when bool_or(t.line_cost is null) then null
     else sum(t.line_cost) end
   from inventory_transactions t
   where t.sale_item_id = si.id and t.transaction_type = 'sale_consumption') as line_cogs
from sale_items si
join sales s   on s.id = si.sale_id
join products p on p.id = si.product_id;
