-- ============================================================================
-- Fahrevo OS — Foundation schema (replaces the Stage 1–3 prototype schema)
-- Dessert / cloud-kitchen business management & financial tracking system.
--
-- This migration DROPS the earlier 5-table prototype and its triggers/enums,
-- then creates the 12-entity foundation. The database is the single source of
-- truth: financial numbers are stored on transaction records only, current
-- stock is derived from an inventory ledger, and money/quantity values are
-- nullable where unknown (never invented).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop previous prototype objects (idempotent)
-- ---------------------------------------------------------------------------
drop view if exists ingredient_stock cascade;

drop table if exists sale_items  cascade;
drop table if exists cash_ledger cascade;
drop table if exists sales       cascade;
drop table if exists expenses    cascade;
drop table if exists products    cascade;

drop function if exists fn_sale_items_set_line_total()  cascade;
drop function if exists fn_sale_items_recalc_sale()     cascade;
drop function if exists fn_sales_derive_amounts()       cascade;
drop function if exists fn_sales_cash_receipt()         cascade;
drop function if exists fn_expenses_cash_payment()      cascade;

drop type if exists sales_channel     cascade;
drop type if exists payment_status    cascade;
drop type if exists expense_category  cascade;
drop type if exists payment_method    cascade;
drop type if exists cash_ledger_type  cascade;

-- ---------------------------------------------------------------------------
-- 1. Enum types
--    (Values that the spec explicitly enumerates. Editable lists such as
--     product/ingredient/expense categories are plain text, not enums.)
-- ---------------------------------------------------------------------------
create type unit_type          as enum ('g', 'kg', 'ml', 'L', 'pcs');
create type sales_channel      as enum ('Direct', 'B2B', 'Swiggy', 'Zomato', 'Other');
create type payment_status     as enum ('Unpaid', 'Partial', 'Paid');
create type payment_method     as enum ('Cash', 'Bank', 'UPI', 'Other');
create type customer_type      as enum ('B2C', 'B2B');
create type purchase_status    as enum ('draft', 'received', 'void');
create type payment_direction  as enum ('received', 'paid');
create type inventory_txn_type as enum
  ('purchase', 'sale_consumption', 'wastage', 'adjustment', 'return', 'correction');

-- ---------------------------------------------------------------------------
-- 2. Shared helper: keep updated_at fresh (auditability)
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Human-readable document number sequences (deterministic, not invented)
-- ---------------------------------------------------------------------------
create sequence if not exists sale_number_seq;
create sequence if not exists purchase_number_seq;
create sequence if not exists payment_number_seq;

-- ---------------------------------------------------------------------------
-- 4. Master data
-- ---------------------------------------------------------------------------

-- 4.1 Customers
create table customers (
  id            uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_type customer_type not null default 'B2C',
  phone         text,
  email         text,
  address       text,
  payment_terms text,
  active_status boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4.2 Suppliers
create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  phone         text,
  email         text,
  address       text,
  payment_terms text,
  active_status boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4.3 Products  (prices are nullable — never assumed; owner must enter them)
create table products (
  id            uuid primary key default gen_random_uuid(),
  product_name  text not null,
  sku           text unique,
  category      text,
  selling_price numeric(12, 2) check (selling_price is null or selling_price >= 0),
  b2b_price     numeric(12, 2) check (b2b_price     is null or b2b_price     >= 0),
  b2c_price     numeric(12, 2) check (b2c_price     is null or b2c_price     >= 0),
  unit          text,
  active_status boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4.4 Ingredients (cost/min-stock nullable until known; base_unit is canonical)
create table ingredients (
  id                         uuid primary key default gen_random_uuid(),
  ingredient_name            text not null,
  sku                        text unique,
  category                   text,
  base_unit                  unit_type not null,
  current_cost_per_base_unit numeric(12, 4) check (current_cost_per_base_unit is null or current_cost_per_base_unit >= 0),
  minimum_stock_level        numeric(12, 3) check (minimum_stock_level        is null or minimum_stock_level        >= 0),
  active_status              boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- 4.5 Recipes (product ↔ ingredient with required quantity + wastage)
create table recipes (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products (id)    on delete cascade,
  ingredient_id      uuid not null references ingredients (id) on delete restrict,
  quantity_required  numeric(12, 3) not null check (quantity_required > 0),
  unit               unit_type not null,
  wastage_percentage numeric(5, 2) not null default 0 check (wastage_percentage >= 0 and wastage_percentage <= 100),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (product_id, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- 5. Sales
-- ---------------------------------------------------------------------------
create table sales (
  id             uuid primary key default gen_random_uuid(),
  sale_number    text not null unique default ('S-' || lpad(nextval('sale_number_seq')::text, 5, '0')),
  sale_date      date not null default current_date,
  customer_id    uuid references customers (id) on delete set null,
  sales_channel  sales_channel not null,
  order_type     text,
  subtotal       numeric(12, 2) not null default 0 check (subtotal     >= 0),
  discount       numeric(12, 2) not null default 0 check (discount     >= 0),
  tax            numeric(12, 2) not null default 0 check (tax          >= 0),
  final_amount   numeric(12, 2) not null default 0 check (final_amount >= 0),
  payment_status payment_status not null default 'Unpaid',
  payment_method payment_method,
  notes          text,
  is_void        boolean not null default false,
  voided_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table sale_items (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references sales (id)    on delete cascade,
  product_id        uuid not null references products (id) on delete restrict,
  quantity          numeric(12, 3) not null check (quantity > 0),
  unit_price        numeric(12, 2) not null check (unit_price       >= 0),
  discount          numeric(12, 2) not null default 0 check (discount          >= 0),
  final_line_amount numeric(12, 2) not null default 0 check (final_line_amount >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Purchases (inventory is increased only when status = 'received')
-- ---------------------------------------------------------------------------
create table purchases (
  id              uuid primary key default gen_random_uuid(),
  purchase_number text not null unique default ('P-' || lpad(nextval('purchase_number_seq')::text, 5, '0')),
  supplier_id     uuid references suppliers (id) on delete set null,
  purchase_date   date not null default current_date,
  subtotal        numeric(12, 2) not null default 0 check (subtotal     >= 0),
  tax             numeric(12, 2) not null default 0 check (tax          >= 0),
  final_amount    numeric(12, 2) not null default 0 check (final_amount >= 0),
  payment_status  payment_status not null default 'Unpaid',
  payment_method  payment_method,
  status          purchase_status not null default 'draft',
  received_at     timestamptz,
  notes           text,
  is_void         boolean not null default false,
  voided_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references purchases (id)   on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete restrict,
  quantity      numeric(12, 3) not null check (quantity > 0),
  unit          unit_type not null,
  unit_cost     numeric(12, 4) not null check (unit_cost  >= 0),
  total_cost    numeric(12, 2) not null default 0 check (total_cost >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. Expenses (category is editable text, seeded from the UI, not an enum)
-- ---------------------------------------------------------------------------
create table expenses (
  id             uuid primary key default gen_random_uuid(),
  expense_date   date not null default current_date,
  category       text not null,
  description    text,
  amount         numeric(12, 2) not null check (amount > 0),
  payment_method payment_method,
  status         payment_status not null default 'Unpaid',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. Inventory ledger — current stock is DERIVED from this, never stored.
--    quantity is a signed change in the ingredient's base unit.
-- ---------------------------------------------------------------------------
create table inventory_transactions (
  id               uuid primary key default gen_random_uuid(),
  ingredient_id    uuid not null references ingredients (id) on delete restrict,
  transaction_type inventory_txn_type not null,
  quantity         numeric(12, 3) not null,
  unit             unit_type not null,
  reference_type   text,
  reference_id     uuid,
  transaction_date timestamptz not null default now(),
  notes            text,
  created_at       timestamptz not null default now(),
  -- No zero-effect movements.
  constraint inv_qty_nonzero check (quantity <> 0),
  -- Sign rules: purchases add stock; consumption/wastage remove it.
  -- adjustment / return / correction may be either sign.
  constraint inv_qty_sign check (
    case transaction_type
      when 'purchase'         then quantity > 0
      when 'sale_consumption' then quantity < 0
      when 'wastage'          then quantity < 0
      else true
    end
  )
);

-- ---------------------------------------------------------------------------
-- 9. Payments — separate from sales/purchases/expenses.
--    'received' = money in (against a sale). 'paid' = money out (purchase/expense).
-- ---------------------------------------------------------------------------
create table payments (
  id             uuid primary key default gen_random_uuid(),
  payment_number text not null unique default ('PAY-' || lpad(nextval('payment_number_seq')::text, 5, '0')),
  payment_date   date not null default current_date,
  direction      payment_direction not null,
  amount         numeric(12, 2) not null check (amount > 0),
  payment_method payment_method not null,
  sale_id        uuid references sales (id)     on delete set null,
  purchase_id    uuid references purchases (id) on delete set null,
  expense_id     uuid references expenses (id)  on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A payment references at most one source document.
  constraint pay_single_reference check (
    (sale_id     is not null)::int
  + (purchase_id is not null)::int
  + (expense_id  is not null)::int <= 1
  ),
  -- Direction must match the kind of document it settles.
  constraint pay_direction_consistency check (
    (direction = 'received' and purchase_id is null and expense_id is null)
    or
    (direction = 'paid'     and sale_id is null)
  )
);

-- ---------------------------------------------------------------------------
-- 10. Indexes on foreign keys / common filters
-- ---------------------------------------------------------------------------
create index idx_recipes_product         on recipes (product_id);
create index idx_recipes_ingredient      on recipes (ingredient_id);
create index idx_sales_customer          on sales (customer_id);
create index idx_sales_date              on sales (sale_date);
create index idx_sale_items_sale         on sale_items (sale_id);
create index idx_sale_items_product      on sale_items (product_id);
create index idx_purchases_supplier      on purchases (supplier_id);
create index idx_purchase_items_purchase on purchase_items (purchase_id);
create index idx_purchase_items_ingr     on purchase_items (ingredient_id);
create index idx_inv_txn_ingredient      on inventory_transactions (ingredient_id);
create index idx_inv_txn_reference       on inventory_transactions (reference_type, reference_id);
create index idx_payments_sale           on payments (sale_id);
create index idx_payments_purchase       on payments (purchase_id);
create index idx_payments_expense        on payments (expense_id);

-- ---------------------------------------------------------------------------
-- 11. updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_customers_updated      before update on customers      for each row execute function set_updated_at();
create trigger trg_suppliers_updated      before update on suppliers      for each row execute function set_updated_at();
create trigger trg_products_updated       before update on products       for each row execute function set_updated_at();
create trigger trg_ingredients_updated    before update on ingredients    for each row execute function set_updated_at();
create trigger trg_recipes_updated        before update on recipes        for each row execute function set_updated_at();
create trigger trg_sales_updated          before update on sales          for each row execute function set_updated_at();
create trigger trg_sale_items_updated     before update on sale_items     for each row execute function set_updated_at();
create trigger trg_purchases_updated      before update on purchases      for each row execute function set_updated_at();
create trigger trg_purchase_items_updated before update on purchase_items for each row execute function set_updated_at();
create trigger trg_expenses_updated       before update on expenses       for each row execute function set_updated_at();
create trigger trg_payments_updated       before update on payments       for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. Derived current stock (deterministic sum of the ledger, in base units)
-- ---------------------------------------------------------------------------
create view ingredient_stock as
select
  i.id                                   as ingredient_id,
  i.ingredient_name,
  i.base_unit,
  i.minimum_stock_level,
  coalesce(sum(t.quantity), 0)           as current_stock,
  (i.minimum_stock_level is not null
     and coalesce(sum(t.quantity), 0) < i.minimum_stock_level) as below_minimum
from ingredients i
left join inventory_transactions t on t.ingredient_id = i.id
group by i.id, i.ingredient_name, i.base_unit, i.minimum_stock_level;

-- ---------------------------------------------------------------------------
-- 13. Row Level Security — authenticated users only (email/password owner)
-- ---------------------------------------------------------------------------
alter table customers              enable row level security;
alter table suppliers              enable row level security;
alter table products               enable row level security;
alter table ingredients            enable row level security;
alter table recipes                enable row level security;
alter table sales                  enable row level security;
alter table sale_items             enable row level security;
alter table purchases              enable row level security;
alter table purchase_items         enable row level security;
alter table expenses               enable row level security;
alter table inventory_transactions enable row level security;
alter table payments               enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'customers','suppliers','products','ingredients','recipes','sales',
    'sale_items','purchases','purchase_items','expenses',
    'inventory_transactions','payments'
  ] loop
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      'Authenticated full access', t);
  end loop;
end $$;
