import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

const ACTIONS = [
  { label: "Sale", icon: "🧾", href: "/sales/new", ready: true },
  { label: "Expense", icon: "💸", ready: false },
  { label: "Purchase", icon: "📦", ready: false },
  { label: "Stock Adjustment", icon: "⚖️", ready: false },
  { label: "Payment Received", icon: "💰", href: "/sales", ready: true },
  { label: "Payment Made", icon: "🏦", ready: false },
];

export default async function DashboardPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Deterministic figures from confirmed transactions only.
  const [{ data: salesToday }, { data: itemsToday }, { data: outstanding }] = await Promise.all([
    supabase.from("sale_financials").select("final_amount,receivable").eq("status", "confirmed").eq("sale_date", today),
    supabase.from("sale_item_financials").select("quantity").eq("status", "confirmed").eq("sale_date", today),
    supabase.from("sale_financials").select("receivable").eq("status", "confirmed"),
  ]);

  const revenue = (salesToday ?? []).reduce((s, r) => s + Number(r.final_amount), 0);
  const orders = (salesToday ?? []).length;
  const units = (itemsToday ?? []).reduce((s, r) => s + Number(r.quantity), 0);
  const receivablesToday = (salesToday ?? []).reduce((s, r) => s + Number(r.receivable), 0);
  const receivablesTotal = (outstanding ?? []).reduce((s, r) => s + Number(r.receivable), 0);

  const cards = [
    { label: "Today's revenue", value: money(revenue) },
    { label: "Today's orders", value: String(orders) },
    { label: "Today's units sold", value: units % 1 === 0 ? String(units) : units.toFixed(3) },
    { label: "Today's receivables", value: money(receivablesToday) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Figures are calculated from confirmed transaction records — never stored or estimated.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Today</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="card">
              <div className="text-xs font-medium text-neutral-500">{c.label}</div>
              <div className="mt-1 text-2xl font-bold">{c.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="card inline-block">
            <div className="text-xs font-medium text-neutral-500">Total outstanding receivables</div>
            <div className="mt-1 text-xl font-bold">{money(receivablesTotal)}</div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Record activity</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACTIONS.map((a) =>
            a.ready && a.href ? (
              <Link key={a.label} href={a.href} className="card flex flex-col items-center gap-2 py-6 text-center hover:border-brand">
                <span className="text-3xl">{a.icon}</span>
                <span className="text-sm font-semibold">{a.label}</span>
              </Link>
            ) : (
              <div key={a.label} className="card flex cursor-not-allowed flex-col items-center gap-2 py-6 text-center opacity-70" title="Coming in a later milestone">
                <span className="text-3xl">{a.icon}</span>
                <span className="text-sm font-semibold">{a.label}</span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Coming soon</span>
              </div>
            ),
          )}
        </div>
      </section>

      <p className="text-xs text-neutral-400">
        Full P&amp;L, cash flow, purchases and expenses arrive in later milestones.
      </p>
    </div>
  );
}
