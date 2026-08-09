const ACTIONS = [
  { label: "Sale", icon: "🧾" },
  { label: "Expense", icon: "💸" },
  { label: "Purchase", icon: "📦" },
  { label: "Stock Adjustment", icon: "⚖️" },
  { label: "Payment Received", icon: "💰" },
  { label: "Payment Made", icon: "🏦" },
];

const KPIS = [
  "Revenue",
  "COGS",
  "Gross Profit",
  "Net Profit",
  "Cash Balance",
  "Receivables",
  "Payables",
  "Inventory Value",
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Record business activity below. All figures are calculated from
          transaction records — none are stored or estimated.
        </p>
      </div>

      {/* Primary actions (record activity) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Record activity
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACTIONS.map((a) => (
            <button
              key={a.label}
              disabled
              title="Coming in a later milestone"
              className="card flex cursor-not-allowed flex-col items-center gap-2 py-6 text-center opacity-70"
            >
              <span className="text-3xl">{a.icon}</span>
              <span className="text-sm font-semibold">{a.label}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Coming soon
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* KPI placeholders — deliberately show no numbers yet */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Financial summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k} className="card">
              <div className="text-xs font-medium text-neutral-500">{k}</div>
              <div className="mt-1 text-2xl font-bold text-neutral-300">—</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-400">
          Values appear once the underlying transaction modules are built. They
          will always be computed from the database, never entered directly.
        </p>
      </section>
    </div>
  );
}
