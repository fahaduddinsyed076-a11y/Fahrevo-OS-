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

## Scope

This is the **foundation milestone**: schema, auth, app shell, navigation,
dashboard placeholder, and the Products & Ingredients sections. Sales,
purchases, expenses, payments, inventory movements, recipes, COGS/P&L reporting
and the live dashboard are later milestones.
