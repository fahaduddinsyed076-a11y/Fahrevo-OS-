import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

const ACTIONS = [
  { label: "Sale", icon: "🧾", href: "/sales/new" },
  { label: "Purchase", icon: "📦", href: "/purchases/new" },
  { label: "Expense", icon: "💸", href: "/expenses" },
  { label: "Payment Received", icon: "💰", href: "/payments" },
  { label: "Payment Made", icon: "🏦", href: "/payments" },
  { label: "Stock Adjustment", icon: "⚖️", href: "/inventory" },
];

type SF = { final_amount: number; cogs: number | null; receivable: number };

function summarize(sales: SF[]) {
  const revenue = sales.reduce((a, s) => a + Number(s.final_amount), 0);
  const complete = sales.every((s) => s.cogs != null);
  const cogs = sales.reduce((a, s) => a + Number(s.cogs ?? 0), 0);
  const receivable = sales.reduce((a, s) => a + Number(s.receivable), 0);
  return { revenue, orders: sales.length, cogs, cogsComplete: complete, receivable };
}

export default async function DashboardPage() {
  const supabase = createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [salesToday, salesMonth, expToday, expMonth, paysToday, purPayable, expPayable] = await Promise.all([
    supabase.from("sale_financials").select("final_amount,cogs,receivable").eq("status", "confirmed").eq("sale_date", today),
    supabase.from("sale_financials").select("final_amount,cogs,receivable").eq("status", "confirmed").gte("sale_date", monthStart),
    supabase.from("expenses").select("amount").eq("expense_date", today),
    supabase.from("expenses").select("amount").gte("expense_date", monthStart),
    supabase.from("payments").select("amount").eq("direction", "received").eq("payment_date", today),
    supabase.from("purchase_financials").select("payable").eq("status", "received"),
    supabase.from("expense_financials").select("payable"),
  ]);

  const t = summarize((salesToday.data as SF[]) ?? []);
  const m = summarize((salesMonth.data as SF[]) ?? []);
  const expTodayTotal = ((expToday.data as { amount: number }[]) ?? []).reduce((a, x) => a + Number(x.amount), 0);
  const expMonthTotal = ((expMonth.data as { amount: number }[]) ?? []).reduce((a, x) => a + Number(x.amount), 0);
  const cashReceivedToday = ((paysToday.data as { amount: number }[]) ?? []).reduce((a, x) => a + Number(x.amount), 0);
  const payables = ((purPayable.data as { payable: number }[]) ?? []).reduce((a, x) => a + Number(x.payable), 0)
    + ((expPayable.data as { payable: number }[]) ?? []).reduce((a, x) => a + Number(x.payable), 0);

  const cogsCell = (c: number, complete: boolean) => (complete ? money(c) : money(c) + "*");
  const grossToday = t.cogsComplete ? t.revenue - t.cogs : null;
  const netToday = grossToday == null ? null : grossToday - expTodayTotal;
  const grossMonth = m.cogsComplete ? m.revenue - m.cogs : null;
  const netMonth = grossMonth == null ? null : grossMonth - expMonthTotal;
  const foodCostMonth = m.revenue > 0 ? (m.cogs / m.revenue) * 100 : null;

  const todayCards = [
    { label: "Revenue", value: money(t.revenue) },
    { label: "Orders", value: String(t.orders) },
    { label: "COGS", value: cogsCell(t.cogs, t.cogsComplete) },
    { label: "Gross profit", value: grossToday == null ? "—*" : money(grossToday) },
    { label: "Expenses", value: money(expTodayTotal) },
    { label: "Net profit", value: netToday == null ? "—*" : money(netToday) },
    { label: "Cash received", value: money(cashReceivedToday) },
    { label: "Receivables", value: money(t.receivable) },
    { label: "Payables", value: money(payables) },
  ];
  const monthCards = [
    { label: "Revenue", value: money(m.revenue) },
    { label: "Orders", value: String(m.orders) },
    { label: "COGS", value: cogsCell(m.cogs, m.cogsComplete) },
    { label: "Gross profit", value: grossMonth == null ? "—*" : money(grossMonth) },
    { label: "Expenses", value: money(expMonthTotal) },
    { label: "Net profit", value: netMonth == null ? "—*" : money(netMonth) },
    { label: "Food cost %", value: foodCostMonth == null ? "—" : foodCostMonth.toFixed(2) + "%" },
  ];

  const anyIncomplete = !t.cogsComplete || !m.cogsComplete;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">All figures are calculated from confirmed transactions — never stored or estimated.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Record activity</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ACTIONS.map((a) => (
            <Link key={a.label} href={a.href} className="card flex flex-col items-center gap-2 py-5 text-center hover:border-brand">
              <span className="text-2xl">{a.icon}</span><span className="text-xs font-semibold">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Today</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {todayCards.map((c) => <Card key={c.label} {...c} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">This month</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {monthCards.map((c) => <Card key={c.label} {...c} />)}
        </div>
      </section>

      {anyIncomplete && (
        <p className="text-xs text-amber-600">* COGS/profit marked incomplete because one or more confirmed sales have ingredients without a recorded cost. Record purchase costs to complete them.</p>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="text-xs font-medium text-neutral-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>;
}
