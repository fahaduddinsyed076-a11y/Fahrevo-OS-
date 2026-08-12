-- ============================================================================
-- Fahrevo OS — Milestone 3: Purchases, expenses, payments, cash, payables, P&L
-- Additive migration. No tables dropped; existing sales/recipe/inventory logic
-- is preserved. Reuses the existing costing method (current cost, latest
-- purchase) and the derived-from-ledger stock model.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Settings (singleton) — opening balances, business info, editable lists.
--    Values are nullable so "not configured" is explicit (never assumed).
-- ---------------------------------------------------------------------------
create table if not exists app_settings (
  id                 boolean primary key default true,
  business_name      text,
  opening_cash       numeric(14, 2),
  opening_bank       numeric(14, 2),
  opening_upi        numeric(14, 2),
  opening_other      numeric(14, 2),
  opening_balance_date date,
  expense_categories text[] not null default array[
    'Raw Material','Packaging','Rent','Electricity','Staff','Delivery',
    'Marketing','Equipment','Maintenance','Platform Fees','Miscellaneous'],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists trg_app_settings_updated on app_settings;
create trigger trg_app_settings_updated before update on app_settings
  for each row execute function set_updated_at();

alter table app_settings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='app_settings' and policyname='Authenticated full access') then
    create policy "Authenticated full access" on app_settings for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Purchase auditability
-- ---------------------------------------------------------------------------
alter table purchases add column if not exists void_reason text;

-- ---------------------------------------------------------------------------
-- 3. Purchase line + total maintenance (mirrors the sales pattern)
-- ---------------------------------------------------------------------------
create or replace function fn_purchase_item_validate_unit() returns trigger
language plpgsql as $$
declare b unit_type;
begin
  select base_unit into b from ingredients where id = new.ingredient_id;
  if b is null then raise exception 'Ingredient not found'; end if;
  if not units_compatible(new.unit, b) then
    raise exception 'UNIT_MISMATCH: purchase unit % is incompatible with ingredient base unit %', new.unit, b;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_purchase_item_validate_unit on purchase_items;
create trigger trg_purchase_item_validate_unit
  before insert or update on purchase_items
  for each row execute function fn_purchase_item_validate_unit();

create or replace function fn_purchase_item_total() returns trigger
language plpgsql as $$
begin
  new.total_cost := round(coalesce(new.quantity,0) * coalesce(new.unit_cost,0), 2);
  return new;
end;
$$;
drop trigger if exists trg_purchase_item_total on purchase_items;
create trigger trg_purchase_item_total
  before insert or update on purchase_items
  for each row execute function fn_purchase_item_total();

create or replace function fn_recalc_purchase_totals() returns trigger
language plpgsql as $$
declare pid uuid;
begin
  pid := case when tg_op='DELETE' then old.purchase_id else new.purchase_id end;
  update purchases set subtotal =
    coalesce((select sum(total_cost) from purchase_items where purchase_id = pid), 0)
    where id = pid;
  if tg_op='UPDATE' and new.purchase_id is distinct from old.purchase_id then
    update purchases set subtotal =
      coalesce((select sum(total_cost) from purchase_items where purchase_id = old.purchase_id), 0)
      where id = old.purchase_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists trg_recalc_purchase_totals on purchase_items;
create trigger trg_recalc_purchase_totals
  after insert or update or delete on purchase_items
  for each row execute function fn_recalc_purchase_totals();

create or replace function fn_purchase_amounts() returns trigger
language plpgsql as $$
begin
  new.final_amount := greatest(coalesce(new.subtotal,0) + coalesce(new.tax,0), 0);
  return new;
end;
$$;
drop trigger if exists trg_purchase_amounts on purchases;
create trigger trg_purchase_amounts
  before insert or update on purchases
  for each row execute function fn_purchase_amounts();

-- ---------------------------------------------------------------------------
-- 4. Payment-status derivation for purchases & expenses (mirrors sales)
-- ---------------------------------------------------------------------------
create or replace function recompute_purchase_payment_status(p_id uuid) returns void
language plpgsql as $$
declare fa numeric; paid numeric;
begin
  select final_amount into fa from purchases where id = p_id;
  if fa is null then return; end if;
  select coalesce(sum(amount),0) into paid from payments where purchase_id = p_id and direction='paid';
  update purchases set payment_status = (case
      when fa > 0 and paid >= fa then 'Paid'
      when paid > 0 then 'Partial'
      else 'Unpaid' end)::payment_status
    where id = p_id;
end;
$$;

create or replace function recompute_expense_payment_status(p_id uuid) returns void
language plpgsql as $$
declare amt numeric; paid numeric;
begin
  select amount into amt from expenses where id = p_id;
  if amt is null then return; end if;
  select coalesce(sum(amount),0) into paid from payments where expense_id = p_id and direction='paid';
  update expenses set status = (case
      when amt > 0 and paid >= amt then 'Paid'
      when paid > 0 then 'Partial'
      else 'Unpaid' end)::payment_status
    where id = p_id;
end;
$$;

-- Unified payment sync (extends the M2 sale-only trigger; sales behavior kept).
create or replace function fn_sync_payment_status() returns trigger
language plpgsql as $$
declare r record;
begin
  r := case when tg_op='DELETE' then old else new end;
  if r.sale_id    is not null then perform recompute_sale_payment_status(r.sale_id); end if;
  if r.purchase_id is not null then perform recompute_purchase_payment_status(r.purchase_id); end if;
  if r.expense_id  is not null then perform recompute_expense_payment_status(r.expense_id); end if;
  if tg_op='UPDATE' then
    if old.sale_id     is not null and old.sale_id     is distinct from new.sale_id     then perform recompute_sale_payment_status(old.sale_id); end if;
    if old.purchase_id is not null and old.purchase_id is distinct from new.purchase_id then perform recompute_purchase_payment_status(old.purchase_id); end if;
    if old.expense_id  is not null and old.expense_id  is distinct from new.expense_id  then perform recompute_expense_payment_status(old.expense_id); end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sale_payment_status on payments;
drop trigger if exists trg_sync_payment_status on payments;
create trigger trg_sync_payment_status
  after insert or update or delete on payments
  for each row execute function fn_sync_payment_status();

-- ---------------------------------------------------------------------------
-- 5. confirm_purchase — ATOMIC: receive stock, snapshot cost, update current
--    cost (latest-cost method), optional payment. All-or-nothing.
-- ---------------------------------------------------------------------------
create or replace function confirm_purchase(
  p_purchase_id uuid,
  p_amount_paid numeric        default 0,
  p_method      payment_method default null,
  p_date        date           default current_date
) returns jsonb
language plpgsql as $$
declare v_status purchase_status;
begin
  select status into v_status from purchases where id = p_purchase_id for update;
  if v_status is null then raise exception 'PURCHASE_NOT_FOUND'; end if;
  if v_status <> 'draft' then
    raise exception 'INVALID_STATE: purchase is % (only a draft can be received)', v_status;
  end if;
  if (select count(*) from purchase_items where purchase_id = p_purchase_id) = 0 then
    raise exception 'NO_ITEMS: purchase has no line items';
  end if;

  -- Positive inventory receipts (converted to each ingredient's base unit),
  -- with the actual cost-per-base-unit snapshot.
  insert into inventory_transactions(
    ingredient_id, transaction_type, quantity, unit,
    reference_type, reference_id, unit_cost, line_cost, notes)
  select
    pi.ingredient_id, 'purchase',
    convert_to_unit(pi.quantity, pi.unit, i.base_unit),
    i.base_unit, 'purchase', p_purchase_id,
    round(pi.unit_cost / convert_to_unit(1, pi.unit, i.base_unit), 4),
    round(pi.quantity * pi.unit_cost, 2),
    'Inventory receipt on purchase confirm'
  from purchase_items pi
  join ingredients i on i.id = pi.ingredient_id
  where pi.purchase_id = p_purchase_id;

  -- Update each ingredient's current cost to this purchase's cost-per-base-unit
  -- (existing "current/latest cost" method; no FIFO / weighted average).
  update ingredients ing
  set current_cost_per_base_unit = sub.cost_per_base
  from (
    select distinct on (pi.ingredient_id)
      pi.ingredient_id,
      round(pi.unit_cost / convert_to_unit(1, pi.unit, i.base_unit), 4) as cost_per_base
    from purchase_items pi
    join ingredients i on i.id = pi.ingredient_id
    where pi.purchase_id = p_purchase_id
    order by pi.ingredient_id, pi.created_at desc
  ) sub
  where ing.id = sub.ingredient_id;

  update purchases set status='received', received_at=now() where id = p_purchase_id;

  if p_amount_paid is not null and p_amount_paid > 0 then
    insert into payments(payment_date, direction, amount, payment_method, purchase_id, notes)
    values (coalesce(p_date, current_date), 'paid', p_amount_paid,
            coalesce(p_method,'Cash'), p_purchase_id, 'Payment on purchase receipt');
  else
    perform recompute_purchase_payment_status(p_purchase_id);
  end if;

  return jsonb_build_object('purchase_id', p_purchase_id, 'status', 'received');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. void_purchase — reverse the inventory receipt (non-destructive).
--    Note: current ingredient cost is NOT reverted (no cost history under the
--    latest-cost method); stock is corrected via reversal rows.
-- ---------------------------------------------------------------------------
create or replace function void_purchase(p_purchase_id uuid, p_reason text default null)
returns jsonb language plpgsql as $$
declare v_status purchase_status;
begin
  select status into v_status from purchases where id = p_purchase_id for update;
  if v_status is null then raise exception 'PURCHASE_NOT_FOUND'; end if;
  if v_status = 'void' then raise exception 'INVALID_STATE: purchase already void'; end if;

  if v_status = 'received' then
    insert into inventory_transactions(
      ingredient_id, transaction_type, quantity, unit,
      reference_type, reference_id, unit_cost, line_cost, notes)
    select t.ingredient_id, 'correction', -t.quantity, t.unit,
           'purchase_void', p_purchase_id, t.unit_cost,
           case when t.line_cost is null then null else -t.line_cost end,
           'Reversal of voided purchase'
    from inventory_transactions t
    where t.reference_type='purchase' and t.reference_id=p_purchase_id
      and t.transaction_type='purchase';
  end if;

  update purchases set status='void', is_void=true, voided_at=now(), void_reason=p_reason
  where id = p_purchase_id;

  return jsonb_build_object('purchase_id', p_purchase_id, 'status', 'void');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Financial views for payables / suppliers / expenses (security_invoker)
-- ---------------------------------------------------------------------------
create or replace view purchase_financials with (security_invoker = true) as
select
  p.id as purchase_id, p.purchase_number, p.purchase_date, p.status,
  p.supplier_id, p.subtotal, p.tax, p.final_amount, p.payment_status,
  coalesce((select sum(pm.amount) from payments pm where pm.purchase_id=p.id and pm.direction='paid'),0) as amount_paid,
  greatest(p.final_amount - coalesce((select sum(pm.amount) from payments pm where pm.purchase_id=p.id and pm.direction='paid'),0), 0) as payable
from purchases p;

create or replace view expense_financials with (security_invoker = true) as
select
  e.id as expense_id, e.expense_date, e.category, e.description, e.amount, e.status,
  coalesce((select sum(pm.amount) from payments pm where pm.expense_id=e.id and pm.direction='paid'),0) as amount_paid,
  greatest(e.amount - coalesce((select sum(pm.amount) from payments pm where pm.expense_id=e.id and pm.direction='paid'),0), 0) as payable
from expenses e;
