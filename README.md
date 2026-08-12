# Fahrevo OS

Business management & financial tracking system for the Fahrevo dessert /
cloud-kitchen business. Built on the principle that **the database is the single
source of truth** — all financial and inventory figures are derived from
auditable transaction records using deterministic logic, never estimated.

## Tech stack

- **Next.js 14 (App Router)** + **TypeScript** + **Tailwind CSS**
- **Supabase / PostgreSQL** (project ref `csutesdytvepazfmwvnk`)
- **Supabase Auth** (email + password) with Row Level Security on every table

## Getting started (local)

```bash
cp .env.example .env.local   # public Supabase URL + publishable key
npm install
npm run dev                  # http://localhost:3000
```

## Database

The schema lives in `supabase/migrations/`. Apply via the Supabase CLI
(`supabase db push`) or the Supabase MCP / SQL editor. The current foundation
migration is `20260809225400_foundation_schema.sql`.

### Entities (12 tables)

`customers`, `suppliers`, `products`, `ingredients`, `recipes`, `sales`,
`sale_items`, `purchases`, `purchase_items`, `expenses`,
`inventory_transactions`, `payments`.

Key design points:

- **Prices and costs are nullable** — the system never invents a value; unknown
  fields show as `—` until the owner enters them.
- **Inventory is a ledger.** `inventory_transactions` records every signed stock
  movement; current stock is the derived `ingredient_stock` view, never a stored
  editable number. A check constraint blocks invalid negative movements
  (e.g. a `purchase` must be positive).
- **Payments are separate** from sales/purchases/expenses, so revenue ≠ cash and
  receivables/payables are computable.
- **Auditability:** `created_at` / `updated_at` (auto-maintained), void columns
  instead of destructive deletes on sales/purchases, and document sequences
  (`S-`, `P-`, `PAY-`).
- **RLS** is enabled on all tables with an authenticated-users-only policy.

## App structure

```
app/
  page.tsx                 # routes to /dashboard or /login by auth state
  login/page.tsx           # email/password sign in + create account
  auth/signout/route.ts    # POST sign-out
  (app)/                   # protected group (requires auth)
    layout.tsx             # session guard + shell
    dashboard/page.tsx     # actions + KPI placeholders (no fabricated numbers)
    products/page.tsx      # Products section (CRUD)
    ingredients/page.tsx   # Ingredients section (CRUD + derived stock)
components/                # AppShell, ProductsClient, IngredientsClient
lib/supabase/              # browser + server + middleware clients
middleware.ts              # session refresh + route protection
```

## Auth setup

This build uses Supabase email/password auth. Enable it in the Supabase
Dashboard → **Authentication → Providers → Email** (and, for instant login
without inbox confirmation during setup, you may disable "Confirm email").
Create the owner account from the app's **Create account** link or in
Dashboard → Authentication → Users.

## Deploy (Vercel)

1. Import this repo in Vercel — the **Next.js** preset is detected automatically.
2. Add environment variables `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (values in `.env.example`).
3. Deploy.

## Milestone 2 — Sales, recipes & automatic inventory consumption

Adds the operational engine on top of the foundation (additive migration
`20260809232507_sales_engine.sql`, no tables dropped).

- **Recipes** (`/recipes`) — configure per-product ingredient requirements
  (quantity per one finished product, unit, wastage %). Estimated recipe cost
  shown, or "Cost unavailable — missing ingredient cost" (never invented).
  Incompatible units (e.g. `ml` for a `g` ingredient) are rejected in the DB.
- **Sales** (`/sales`, `/sales/new`, `/sales/[id]`) — draft → confirm lifecycle
  with B2B/B2C pricing (from `b2b_price`/`b2c_price`, editable, never assumed),
  filters, search, and a full auditable sale detail.
- **Automatic inventory consumption** — confirming a sale runs the atomic
  `confirm_sale()` DB function: validates every product has a recipe, checks
  sufficient stock, then writes `sale_consumption` ledger rows (with a COGS cost
  snapshot) — all-or-nothing. No recipe or insufficient stock blocks the whole
  sale; nothing is half-committed. Stock stays derived from the ledger.
- **Payments & receivables** — derived deterministically from the `payments`
  table (`payment_status`, `receivable`); no stored balance.
- **Void** — `void_sale()` reverses consumption via correction rows and excludes
  the sale from revenue/receivables while preserving the original (auditable).
- **Product-wise sales** (`/reports/product-sales`) and **dashboard KPIs**
  (today's revenue/orders/units/receivables) computed from confirmed sales.

### Key database functions

`confirm_sale(sale_id, amount_received, method, date)`,
`void_sale(sale_id, reason)`, `recompute_sale_payment_status(sale_id)`,
`convert_to_unit()`, `units_compatible()`; triggers maintain line/sale totals
and payment status; views `sale_financials`, `sale_item_financials`,
`ingredient_stock` (all `security_invoker`, so RLS is enforced for the caller).

## Milestone 3 — Purchases, expenses, payments, cash, payables & P&L

Additive migration `20260810070923_operations_engine.sql` (no destructive
changes) completes the operational and financial layer.

- **Purchases** (`/purchases`) — draft → receive lifecycle. `confirm_purchase()`
  atomically writes positive inventory receipts (converted to base units),
  snapshots the actual cost, and updates each ingredient's current cost
  (existing latest-cost method — no FIFO/weighted average). `void_purchase()`
  reverses the receipt non-destructively.
- **Expenses** (`/expenses`) — operating expenses (kept separate from inventory
  purchases), editable categories, optional immediate payment.
- **Payments** (`/payments`) — record received (against sales) and made
  (against purchases/expenses). Payment status for sales/purchases/expenses is
  derived from the `payments` table via one unified trigger.
- **Suppliers & Customers** (`/suppliers`, `/customers`) with detail pages whose
  totals (purchases/paid/payable, sales/received/receivable) come only from
  transactions.
- **Payables** (`/payables`) and **Cash flow** (`/cashflow`) — cash = opening
  balance + receipts − payments per method; "not configured" shown when an
  opening balance is unset (never assumed).
- **Inventory** (`/inventory`) — derived stock, ledger, and stock adjustments
  (adjustment/wastage/correction/return).
- **Reports** (`/reports`) — P&L, sales, product-wise sales, purchases,
  expenses, inventory. **Settings** (`/settings`) — business info, opening
  balances, editable expense categories.
- **Dashboard** — Today and This-Month KPIs (revenue, orders, COGS, gross/net
  profit, expenses, cash received, receivables, payables, food-cost %), all
  computed from source records. COGS/profit are flagged incomplete rather than
  assuming zero when an ingredient cost is missing.

### Added database functions/views

`confirm_purchase()`, `void_purchase()`, `recompute_purchase_payment_status()`,
`recompute_expense_payment_status()`, unified `fn_sync_payment_status`; purchase
line/total triggers; `app_settings` (opening balances, categories);
views `purchase_financials`, `expense_financials`.

## Scope

The three planned milestones (Foundation, Sales engine, Operations & financials)
are complete. Tax/GST and platform-commission automation remain intentionally
manual/configurable.
