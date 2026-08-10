import Link from "next/link";

const REPORTS = [
  { href: "/reports/pnl", label: "Profit & Loss", desc: "Revenue − COGS − expenses", icon: "📊" },
  { href: "/reports/sales", label: "Sales report", desc: "Revenue, channels, B2B/B2C, receivables", icon: "🧾" },
  { href: "/reports/product-sales", label: "Product-wise sales", desc: "Quantity, revenue, COGS, gross profit", icon: "🍰" },
  { href: "/reports/purchases", label: "Purchase report", desc: "By supplier and ingredient", icon: "📦" },
  { href: "/reports/expenses", label: "Expense report", desc: "By category and date", icon: "💸" },
  { href: "/reports/inventory", label: "Inventory report", desc: "Stock and movement by type", icon: "📥" },
  { href: "/payables", label: "Payables", desc: "Outstanding amounts owed", icon: "📄" },
  { href: "/cashflow", label: "Cash flow", desc: "Opening + receipts − payments", icon: "🏦" },
];

export default function ReportsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-neutral-500">All figures are calculated from source transactions.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="card hover:border-brand">
            <div className="text-2xl">{r.icon}</div>
            <div className="mt-2 font-semibold">{r.label}</div>
            <div className="text-sm text-neutral-500">{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
