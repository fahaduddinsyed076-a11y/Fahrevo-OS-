# Fahrevo OS

Business system for a dessert cloud kitchen. Built in phases.

## Stage 1 — Database schema

This stage sets up the Supabase connection and the core database schema only.
No UI, no derived/calculated logic yet — those come in later stages.

### Supabase project

- **URL:** https://csutesdytvepazfmwvnk.supabase.co
- **Project ref:** `csutesdytvepazfmwvnk`

Copy `.env.example` to `.env` for local use. The publishable key is a
client-side key and is safe to expose in the browser.

### Schema

Five tables, created via `supabase/migrations/20260809211923_initial_schema.sql`:

| Table         | Purpose                                                        |
| ------------- | ------------------------------------------------------------- |
| `products`    | Catalog of items sold.                                        |
| `sales`       | Sales orders across channels (B2C, B2B, Swiggy, Zomato, etc). |
| `sale_items`  | Line items per sale (FK → `sales`, FK → `products`).          |
| `expenses`    | Business expenses by category and payment method.             |
| `cash_ledger` | Cash in/out movements (positive = in, negative = out).        |

**Enum types:** `sales_channel`, `payment_status`, `expense_category`,
`payment_method`, `cash_ledger_type`.

**Relationships:**
- `sale_items.sale_id` → `sales.id` (on delete cascade)
- `sale_items.product_id` → `products.id` (on delete restrict)

**Security:** Row Level Security is enabled on all five tables with a simple
authenticated-users-only policy for this stage.

### Applying the migration

With the Supabase CLI linked to the project:

```bash
supabase db push
```

Or apply the migration files in `supabase/migrations/` through the Supabase
MCP / SQL editor.

## Stage 2 — Calculated logic

`supabase/migrations/20260809220206_calculated_logic.sql` adds DB-level
triggers/functions (no table changes): auto `line_total`, rolled-up
`gross_amount`, derived `net_amount` / `amount_pending` / `payment_status`, and
automatic `cash_ledger` entries for sale receipts and expense payments.

## Stage 3 — Operations UI

A single-file, mobile-first web app (`index.html`) for daily kitchen use. No
build step — plain HTML/CSS/JS loading `@supabase/supabase-js` from a CDN.

Four screens plus a home grid / bottom nav:

1. **+ Sale** — channel, optional customer, one or more line items (product
   dropdown, qty, auto-filled-but-editable unit price), live gross total,
   discount, platform commission (shown only for Swiggy/Zomato), amount
   received. Creates the `sales` row + `sale_items`; the DB triggers compute
   net/pending/status. Confirmation shows the calculated net and status.
2. **+ Expense** — category, date, description, amount, payment method.
   Inserts `expenses`; the trigger writes the matching `cash_ledger` row.
3. **+ Payment Received** — lists Pending/Partial sales; adds the entered
   amount to `amount_received`; triggers recalc status and log the receipt.
4. **+ Cash Adjustment** — Owner Deposit (positive) / Owner Withdrawal
   (negative) written directly to `cash_ledger`.

No amounts are calculated client-side — the app only writes inputs and reads
back the database-calculated results.

### Authentication

RLS stays locked to authenticated users. The app signs in **anonymously**, so
no login screen is needed. This requires anonymous sign-ins to be enabled:
Supabase Dashboard → **Authentication → Sign In / Providers → Allow anonymous
sign-ins** → on.

### Deploying to Vercel

The app is a static site (just `index.html`), so:

1. In Vercel, **Add New → Project** and import this GitHub repo.
2. Framework preset: **Other**. No build command or output directory needed
   (Vercel serves `index.html` at the root).
3. Deploy, then open the resulting URL on your phone.

The Supabase URL and publishable key are embedded in `index.html` (both are
safe public client values).
