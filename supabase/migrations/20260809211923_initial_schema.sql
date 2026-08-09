-- Fahrevo OS — Stage 1: Initial database schema
-- Dessert cloud kitchen business system.
-- Creates the 5 core tables, enum types, foreign keys, and RLS policies.
-- No calculated/derived logic in this stage.

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type sales_channel as enum (
  'B2C_Direct',
  'B2B',
  'Swiggy',
  'Zomato',
  'WhatsApp'
);

create type payment_status as enum (
  'Paid',
  'Pending',
  'Partial'
);

create type expense_category as enum (
  'Raw Material',
  'Packaging',
  'Rent',
  'Electricity',
  'Staff',
  'Delivery',
  'Marketing',
  'Equipment',
  'Miscellaneous'
);

create type payment_method as enum (
  'Cash',
  'Bank',
  'UPI'
);

create type cash_ledger_type as enum (
  'Sale Receipt',
  'Expense Payment',
  'Receivable Collection',
  'Owner Deposit',
  'Owner Withdrawal'
);

-- ---------------------------------------------------------------------------
-- Table: products
-- ---------------------------------------------------------------------------
create table products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text,
  selling_price numeric(10, 2),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: sales
-- ---------------------------------------------------------------------------
create table sales (
  id                  uuid primary key default gen_random_uuid(),
  sale_date           timestamptz not null default now(),
  channel             sales_channel not null,
  customer_name       text,
  gross_amount        numeric(10, 2) not null default 0,
  discount            numeric(10, 2) not null default 0,
  platform_commission numeric(10, 2) not null default 0,
  net_amount          numeric(10, 2) not null default 0,
  payment_status      payment_status not null,
  amount_received     numeric(10, 2) not null default 0,
  amount_pending      numeric(10, 2) not null default 0,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: sale_items
-- ---------------------------------------------------------------------------
create table sale_items (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references sales (id) on delete cascade,
  product_id uuid not null references products (id) on delete restrict,
  quantity   integer not null,
  unit_price numeric(10, 2) not null,
  line_total numeric(10, 2) not null default 0
);

create index sale_items_sale_id_idx on sale_items (sale_id);
create index sale_items_product_id_idx on sale_items (product_id);

-- ---------------------------------------------------------------------------
-- Table: expenses
-- ---------------------------------------------------------------------------
create table expenses (
  id             uuid primary key default gen_random_uuid(),
  expense_date   date not null,
  category       expense_category not null,
  description    text,
  amount         numeric(10, 2) not null,
  payment_method payment_method not null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: cash_ledger
-- ---------------------------------------------------------------------------
create table cash_ledger (
  id               uuid primary key default gen_random_uuid(),
  transaction_date timestamptz not null default now(),
  type             cash_ledger_type not null,
  reference_id     uuid,
  amount           numeric(10, 2) not null
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Stage 1: simple authenticated-users-only access on every table.
-- ---------------------------------------------------------------------------
alter table products    enable row level security;
alter table sales       enable row level security;
alter table sale_items  enable row level security;
alter table expenses    enable row level security;
alter table cash_ledger enable row level security;

create policy "Authenticated users full access"
  on products for all
  to authenticated
  using (true) with check (true);

create policy "Authenticated users full access"
  on sales for all
  to authenticated
  using (true) with check (true);

create policy "Authenticated users full access"
  on sale_items for all
  to authenticated
  using (true) with check (true);

create policy "Authenticated users full access"
  on expenses for all
  to authenticated
  using (true) with check (true);

create policy "Authenticated users full access"
  on cash_ledger for all
  to authenticated
  using (true) with check (true);
