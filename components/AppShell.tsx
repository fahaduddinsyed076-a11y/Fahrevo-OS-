"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

// Same 14 routes as before — grouped only for presentation, nothing added
// or removed.
const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
  ] },
  { label: "Operations", items: [
    { href: "/sales", label: "Sales", icon: "🧾" },
    { href: "/purchases", label: "Purchases", icon: "📦" },
    { href: "/expenses", label: "Expenses", icon: "💸" },
    { href: "/payments", label: "Payments", icon: "💳" },
    { href: "/inventory", label: "Inventory", icon: "📥" },
    { href: "/overheads", label: "Overheads", icon: "🏢" },
  ] },
  { label: "Catalog", items: [
    { href: "/recipes", label: "Recipes", icon: "📖" },
    { href: "/products", label: "Products", icon: "🍰" },
    { href: "/ingredients", label: "Ingredients", icon: "🧂" },
  ] },
  { label: "Directory", items: [
    { href: "/customers", label: "Customers", icon: "👤" },
    { href: "/suppliers", label: "Suppliers", icon: "🚚" },
  ] },
  { label: "Insights", items: [
    { href: "/reports", label: "Reports", icon: "📈" },
  ] },
  { label: "Admin", items: [
    { href: "/settings", label: "Settings", icon: "⚙️" },
  ] },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);

function initials(email: string): string {
  return email.trim().slice(0, 1).toUpperCase() || "?";
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-3 rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-brand bg-brand-light font-semibold text-brand"
          : "border-transparent text-neutral-600 hover:border-neutral-200 hover:bg-neutral-100 hover:text-neutral-900"
      }`}
    >
      <span className="text-[15px] leading-none">{item.icon}</span>
      {item.label}
    </Link>
  );
}

export default function AppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-4">
          <span className="text-lg font-bold tracking-tight text-brand">Fahrevo OS</span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-neutral-200 p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand">
              {initials(email)}
            </span>
            <span className="truncate text-xs text-neutral-500">{email}</span>
          </div>
          <form action="/auth/signout" method="post">
            <button className="btn-secondary w-full" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <span className="text-base font-bold text-brand">Fahrevo OS</span>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-semibold text-neutral-600" type="submit">Sign out</button>
          </form>
        </header>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(item.href) ? "bg-brand-light text-brand" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
