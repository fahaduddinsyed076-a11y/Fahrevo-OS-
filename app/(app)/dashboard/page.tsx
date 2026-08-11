import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { money, dateShort } from "@/lib/format";

const ACTIONS = [
  { label: "Sale", icon: "🧾", href: "/sales/new" },
  { label: "Purchase", icon: "📦", href: "/purchases/new" },
  { label: "Expense", icon: "💸", href: "/expenses" },
  { label: "Payment Received", icon: "💰", href: "/payments" },
  { label: "Payment Made", icon: "🏦", href: "/payments" },
  { label: "Stock Adjustment", icon: "⚖️", href: "/inventory" },
];

type SF = { final_amount: number; cogs: number | null; receivable: number };
type RecentSale = {
  sale_id: string; sale_number: string; sale_date: string;
  sales_channel: string; customer_id: string | null; final_amount: number;
};

function summarize(sales: SF[]) {
  const revenue = sales.reduce((a, s) => a + Number(s.final_amount), 0);
  const complete = sales.every((s) => s.cogs != null);
  const cogs = sales.reduce((a, s) => a + Number(s.cogs ?? 0), 0);
  const receivable = sales.reduce((a, s) => a + Number(s.receivable), 0);
  return { revenue, orders: sales.length, cogs, cogsComplete: complete, receivable };
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function weekdayLabel(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

export default async function DashboardPage() {
  const supabase = createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const days7 = lastNDays(7);
  const trendStart = days7[0];

  const [
    salesToday, salesMonth, expToday, expMonth, purPayable, expPayable,
    trendSales, monthReceipts, overheadsActive, recentSales, customersAll,
    totalReceivableRes,
  ] = await Promise.all([
    supabase.from("sale_financials").select("final_amount,cogs,receivable").eq("status", "confirmed").eq("sale_date", today),
    supabase.from("sale_financials").select("final_amount,cogs,receivable").eq("status", "confirmed").gte("sale_date", monthStart),
    supabase.from("expenses").select("amount").eq("expense_date", today),
    supabase.from("expenses").select("amount").gte("expense_date", monthStart),
    supabase.from("purchase_financials").select("payable").eq("status", "received"),
    supabase.from("expense_financials").select("payable"),
    supabase.from("sale_financials").select("sale_date,final_amount").eq("status", "confirmed").gte("sale_date", trendStart),
    supabase.from("payments").select("payment_method,amount").eq("direction", "received").gte("payment_date", monthStart),
    supabase.from("overheads").select("monthly_amount").eq("active_status", true),
    supabase.from("sale_financials").select("sale_id,sale_number,sale_date,sales_channel,customer_id,final_amount").eq("status", "confirmed").order("sale_date", { ascending: false }).limit(5),
    supabase.from("customers").select("id,customer_name,active_status"),
    // Total outstanding receivable across ALL confirmed sales (no date filter) —
    // matches how Payables is computed (also unscoped by date).
    supabase.from("sale_financials").select("receivable").eq("status", "confirmed"),
  ]);

  const t = summarize((salesToday.data as SF[]) ?? []);
  const m = summarize((salesMonth.data as SF[]) ?? []);
  const expTodayTotal = ((expToday.data as { amount: number }[]) ?? []).reduce((a, x) => a + Number(x.amount), 0);
  const expMonthTotal = ((expMonth.data as { amount: number }[]) ?? []).reduce((a, x) => a + Number(x.amount), 0);
  const payables = ((purPayable.data as { payable: number }[]) ?? []).reduce((a, x) => a + Number(x.payable), 0)
    + ((expPayable.data as { payable: number }[]) ?? []).reduce((a, x) => a + Number(x.payable), 0);
  const overheadsMonthTotal = ((overheadsActive.data as { monthly_amount: number }[]) ?? []).reduce((a, x) => a + Number(x.monthly_amount), 0);
  const totalReceivable = ((totalReceivableRes.data as { receivable: number }[]) ?? []).reduce((a, x) => a + Number(x.receivable), 0);

  // Net profit (month) = Revenue − COGS − Expenses − active monthly overheads.
  // Overheads are a planning figure (no transactions), included here only as a
  // subtraction so the KPI matches "after COGS, expenses & overheads".
  const netProfitMonth = m.cogsComplete ? m.revenue - m.cogs - expMonthTotal - overheadsMonthTotal : null;
  const aov = m.orders > 0 ? m.revenue / m.orders : 0;

  // 7-day revenue trend, deterministic sum per day.
  const trendByDay = new Map<string, number>();
  for (const d of days7) trendByDay.set(d, 0);
  for (const s of (trendSales.data as { sale_date: string; final_amount: number }[]) ?? []) {
    trendByDay.set(s.sale_date, (trendByDay.get(s.sale_date) ?? 0) + Number(s.final_amount));
  }
  const trendMax = Math.max(1, ...days7.map((d) => trendByDay.get(d) ?? 0));

  // Payment split (month), received only.
  const splitByMethod = new Map<string, number>();
  for (const p of (monthReceipts.data as { payment_method: string; amount: number }[]) ?? []) {
    splitByMethod.set(p.payment_method, (splitByMethod.get(p.payment_method) ?? 0) + Number(p.amount));
  }
  const splitTotal = [...splitByMethod.values()].reduce((a, b) => a + b, 0);

  // Break-even monitor — fixed-overhead recovery only, from real Overheads
  // data. No per-channel unit sales targets: nothing configures those yet,
  // so they are not shown rather than invented.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const beCostPerDay = daysInMonth > 0 ? overheadsMonthTotal / daysInMonth : 0;
  const beConfigured = overheadsMonthTotal > 0;
  const beTodayPct = beConfigured && beCostPerDay > 0 ? (t.revenue / beCostPerDay) * 100 : null;
  const beMonthCost = beCostPerDay * dayOfMonth;
  const beMonthPct = beConfigured && beMonthCost > 0 ? (m.revenue / beMonthCost) * 100 : null;

  const customers = (customersAll.data as { id: string; customer_name: string; active_status: boolean }[]) ?? [];
  const activeCustomerCount = customers.filter((c) => c.active_status).length;
  const customerName = (id: string | null) => (id ? customers.find((c) => c.id === id)?.customer_name ?? "—" : "Walk-in");

  const anyIncomplete = !t.cogsComplete || !m.cogsComplete;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Your business at a glance — every figure is calculated from confirmed transactions.</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi icon="📈" iconBg="bg-emerald-100" label="Today's revenue" value={money(t.revenue)} sub={`${t.orders} order${t.orders === 1 ? "" : "s"} today`} />
        <Kpi icon="🛒" iconBg="bg-blue-100" label="This month revenue" value={money(m.revenue)} sub={`${m.orders} order${m.orders === 1 ? "" : "s"} · AOV ${money(aov)}`} />
        <Kpi
          icon="💹" iconBg="bg-brand-light"
          label="Net profit (month)"
          value={netProfitMonth == null ? money(m.revenue - m.cogs - expMonthTotal - overheadsMonthTotal) + "*" : money(netProfitMonth)}
          sub="After COGS, expenses & overheads"
          tone={netProfitMonth != null && netProfitMonth < 0 ? "danger" : "default"}
        />
      </div>

      {/* Record activity */}
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

      {/* Break-even monitor */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Break-even monitor</h2>
          <span className="text-xs text-neutral-400">Fixed overhead recovery</span>
        </div>
        {!beConfigured ? (
          <p className="text-sm text-neutral-400">
            No active overheads configured yet. <Link href="/overheads" className="font-semibold text-brand hover:underline">Add some in Overheads →</Link>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-neutral-500">BE cost / day</div>
              <div className="mt-1 text-xl font-bold">{money(beCostPerDay)}</div>
              <div className="mt-1 text-xs text-neutral-400">{money(overheadsMonthTotal)} active overheads ÷ {daysInMonth} days</div>
            </div>
            <BeProgress label="Today" have={t.revenue} need={beCostPerDay} pct={beTodayPct} />
            <BeProgress label="This month" have={m.revenue} need={beMonthCost} pct={beMonthPct} />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue trend */}
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Revenue trend</h2>
            <span className="text-xs text-neutral-400">Last 7 days</span>
          </div>
          <div className="flex h-32 items-end gap-3">
            {days7.map((d) => {
              const v = trendByDay.get(d) ?? 0;
              const isToday = d === today;
              const pct = Math.max(4, (v / trendMax) * 100);
              return (
                <div key={d} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-24 w-full items-end justify-center">
                    <div
                      className={`w-full max-w-[28px] rounded-t-md ${isToday ? "bg-brand" : v > 0 ? "bg-brand/40" : "bg-neutral-200"}`}
                      style={{ height: `${pct}%` }}
                      title={money(v)}
                    />
                  </div>
                  <span className={`text-xs ${isToday ? "font-semibold text-brand" : "text-neutral-400"}`}>{weekdayLabel(d)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment split */}
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Payment split (month)</h2>
          {splitTotal === 0 ? (
            <p className="text-sm text-neutral-400">No payments received yet this month.</p>
          ) : (
            <div className="space-y-3">
              {[...splitByMethod.entries()].sort((a, b) => b[1] - a[1]).map(([method, amt]) => (
                <div key={method}>
                  <div className="mb-1 flex justify-between text-sm"><span>{method}</span><span className="font-medium">{money(amt)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(amt / splitTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent sales */}
      <div className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent sales</h2>
          <Link href="/sales" className="text-sm font-semibold text-brand hover:underline">View all →</Link>
        </div>
        {((recentSales.data as RecentSale[]) ?? []).length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">No confirmed sales yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {((recentSales.data as RecentSale[]) ?? []).map((s) => (
                <tr key={s.sale_id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">
                    <span className="badge mr-2 bg-brand-light text-brand">{s.sales_channel}</span>
                    <Link href={`/sales/${s.sale_id}`} className="font-medium text-brand hover:underline">{s.sale_number}</Link>
                    <span className="ml-2 text-neutral-500">{customerName(s.customer_id)}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{dateShort(s.sale_date)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(s.final_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Secondary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi icon="👤" iconBg="bg-violet-100" label="Active customers" value={String(activeCustomerCount)} />
        <Kpi icon="⏳" iconBg="bg-amber-100" label="Receivables" value={money(totalReceivable)} sub="Outstanding, all confirmed sales" />
        <Kpi icon="📤" iconBg="bg-rose-100" label="Payables" value={money(payables)} sub="Purchases + expenses" />
      </div>

      {anyIncomplete && (
        <p className="text-xs text-amber-600">* COGS/profit marked incomplete because one or more confirmed sales have ingredients without a recorded cost. Record purchase costs to complete them.</p>
      )}
    </div>
  );
}

function Kpi({
  label, value, sub, tone, icon, iconBg,
}: {
  label: string; value: string; sub?: string; tone?: "default" | "danger"; icon?: string; iconBg?: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-neutral-500">{label}</div>
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${iconBg ?? "bg-neutral-100"}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${tone === "danger" ? "text-red-600" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

function BeProgress({ label, have, need, pct }: { label: string; have: number; need: number; pct: number | null }) {
  const covered = pct != null && pct >= 100;
  const width = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span className={`font-semibold ${covered ? "text-green-600" : "text-neutral-600"}`}>
          {pct == null ? "—" : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${covered ? "bg-green-500" : "bg-brand"}`} style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1 text-xs text-neutral-400">{money(have)} of {money(need)}</div>
    </div>
  );
}
