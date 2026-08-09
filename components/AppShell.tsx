"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/products", label: "Products", icon: "🍰" },
  { href: "/ingredients", label: "Ingredients", icon: "🧂" },
];

export default function AppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white md:flex md:flex-col">
        <div className="px-5 py-5 text-xl font-extrabold tracking-tight text-brand">
          Fahrevo OS
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "bg-brand-light text-brand" : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                <span>{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-200 p-3">
          <div className="mb-2 truncate px-2 text-xs text-neutral-500">{email}</div>
          <form action="/auth/signout" method="post">
            <button className="btn-secondary w-full" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <span className="text-lg font-extrabold text-brand">Fahrevo OS</span>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-semibold text-neutral-600" type="submit">Sign out</button>
          </form>
        </header>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-2 md:hidden">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-brand-light text-brand" : "text-neutral-600"
                }`}
              >
                {n.icon} {n.label}
              </Link>
            );
          })}
        </nav>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
