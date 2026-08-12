-- Fahrevo OS — Stage 2: Database-level calculated logic
-- Adds triggers/functions on top of the existing 5 tables.
-- No table-structure changes in this stage.
--
-- Design notes on ordering / recursion safety:
--   * sale_items BEFORE trigger sets line_total (in-row, no writes).
--   * sale_items AFTER trigger writes only sales.gross_amount.
--   * sales BEFORE trigger derives net_amount, amount_pending, payment_status
--     purely from the row's own columns (in-row, no writes) — so it runs
--     correctly whether the update came from a user or from the sale_items
--     trigger updating gross_amount.
--   * sales AFTER trigger writes only to cash_ledger; that gross_amount-only
--     update leaves amount_received unchanged, so it never inserts a ledger
--     row and never loops back.
--   * cash_ledger has no triggers, so nothing recurses.

-- ---------------------------------------------------------------------------
-- 1. sale_items.line_total = quantity * unit_price
-- ---------------------------------------------------------------------------
create or replace function fn_sale_items_set_line_total()
returns trigger
language plpgsql
as $$
begin
  new.line_total := coalesce(new.quantity, 0) * coalesce(new.unit_price, 0);
  return new;
end;
$$;

create trigger trg_sale_items_line_total
  before insert or update on sale_items
  for each row
  execute function fn_sale_items_set_line_total();

-- ---------------------------------------------------------------------------
-- 2. Recalculate the parent sales.gross_amount when sale_items change.
--    (net_amount / amount_pending / payment_status are derived by the
--     sales BEFORE trigger below, which fires from this gross_amount update.)
-- ---------------------------------------------------------------------------
create or replace function fn_sale_items_recalc_sale()
returns trigger
language plpgsql
as $$
begin
  -- Recompute gross for the sale this row belongs to.
  if (tg_op = 'DELETE') then
    update sales
      set gross_amount = coalesce(
        (select sum(line_total) from sale_items where sale_id = old.sale_id), 0)
      where id = old.sale_id;
    return old;
  end if;

  update sales
    set gross_amount = coalesce(
      (select sum(line_total) from sale_items where sale_id = new.sale_id), 0)
    where id = new.sale_id;

  -- If an item was moved to a different sale, refresh the old sale too.
  if (tg_op = 'UPDATE' and new.sale_id is distinct from old.sale_id) then
    update sales
      set gross_amount = coalesce(
        (select sum(line_total) from sale_items where sale_id = old.sale_id), 0)
      where id = old.sale_id;
  end if;

  return new;
end;
$$;

create trigger trg_sale_items_recalc_sale
  after insert or update or delete on sale_items
  for each row
  execute function fn_sale_items_recalc_sale();

-- ---------------------------------------------------------------------------
-- 3. Derive sales.net_amount, amount_pending, payment_status on every
--    insert/update. This covers amount_received changes and any change to
--    gross_amount / discount / platform_commission.
-- ---------------------------------------------------------------------------
create or replace function fn_sales_derive_amounts()
returns trigger
language plpgsql
as $$
begin
  new.net_amount :=
      coalesce(new.gross_amount, 0)
    - coalesce(new.discount, 0)
    - coalesce(new.platform_commission, 0);

  -- Never below 0.
  new.amount_pending := greatest(new.net_amount - coalesce(new.amount_received, 0), 0);

  if new.amount_pending = 0 then
    new.payment_status := 'Paid';
  elsif coalesce(new.amount_received, 0) > 0 then
    new.payment_status := 'Partial';
  else
    new.payment_status := 'Pending';
  end if;

  return new;
end;
$$;

create trigger trg_sales_derive_amounts
  before insert or update on sales
  for each row
  execute function fn_sales_derive_amounts();

-- ---------------------------------------------------------------------------
-- 4a. Auto cash_ledger entry when a sale's amount_received increases.
--     INSERT: increase = amount_received (from an implicit 0).
--     UPDATE: increase = new.amount_received - old.amount_received.
--     Only a positive increase produces a 'Sale Receipt' (money in).
-- ---------------------------------------------------------------------------
create or replace function fn_sales_cash_receipt()
returns trigger
language plpgsql
as $$
declare
  increase numeric(10, 2);
begin
  if (tg_op = 'INSERT') then
    increase := coalesce(new.amount_received, 0);
  else
    increase := coalesce(new.amount_received, 0) - coalesce(old.amount_received, 0);
  end if;

  if increase > 0 then
    insert into cash_ledger (type, reference_id, amount)
    values ('Sale Receipt', new.id, increase);
  end if;

  return new;
end;
$$;

create trigger trg_sales_cash_receipt
  after insert or update on sales
  for each row
  execute function fn_sales_cash_receipt();

-- ---------------------------------------------------------------------------
-- 4b. Auto cash_ledger entry when an expense is recorded (money out).
-- ---------------------------------------------------------------------------
create or replace function fn_expenses_cash_payment()
returns trigger
language plpgsql
as $$
begin
  insert into cash_ledger (type, reference_id, amount)
  values ('Expense Payment', new.id, -1 * coalesce(new.amount, 0));
  return new;
end;
$$;

create trigger trg_expenses_cash_payment
  after insert on expenses
  for each row
  execute function fn_expenses_cash_payment();
