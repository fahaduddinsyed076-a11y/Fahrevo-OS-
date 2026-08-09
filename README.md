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

Or apply `supabase/migrations/20260809211923_initial_schema.sql` through the
Supabase MCP / SQL editor.
