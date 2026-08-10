"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, dateShort } from "@/lib/format";
import type { Customer, SaleFinancial } from "@/lib/types";

type Pay = { id: string; payment_number: string; payment_date: string; amount: number; payment_method: string; sale_id: string | null };

export default function CustomerDetailClient({ customerId }: { customerId: string }) {
  const supabase = createClient();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<SaleFinancial[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, s] = await Promise.all([
      supabase.from("customers").select("id,customer_name,customer_type,active_status").eq("id", customerId).single(),
      supabase.from("sale_financials").select("*").eq("customer_id", customerId).order("sale_date", { ascending: false }),
    ]);
    setCustomer((c.data as Customer) ?? null);
    const sf = (s.data as SaleFinancial[]) ?? [];
    setSales(sf);
    const ids = sf.map((x) => x.sale_id);
    if (ids.length) {
      const { data } = await supabase.from("payments").select("id,payment_number,payment_date,amount,payment_method,sale_id").in("sale_id", ids).order("payment_date", { ascending: false });
      setPays((data as Pay[]) ?? []);
    } else setPays([]);
    setLoading(false);
  }, [supabase, customerId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!customer) return <p className="text-sm text-red-600">Customer not found.</p>;

  const confirmed = sales.filter((s) => s.status === "confirmed");
  const totalSales = confirmed.reduce((s, x) => s + Number(x.final_amount), 0);
  const totalReceived = confirmed.reduce((s, x) => s + Number(x.amount_received), 0);
  const outstanding = confirmed.reduce((s, x) => s + Number(x.receivable), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><h1 className="text-2xl font-bold">{customer.customer_name}</h1><span className="badge bg-neutral-100 text-neutral-700">{customer.customer_type}</span></div>
        <Link href="/customers" className="text-sm font-semibold text-neutral-500 hover:underline">← All customers</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="text-xs text-neutral-500">Total sales</div><div className="mt-1 text-xl font-bold">{money(totalSales)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Total received</div><div className="mt-1 text-xl font-bold">{money(totalReceived)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Outstanding receivable</div><div className="mt-1 text-xl font-bold text-red-600">{money(outstanding)}</div></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent sales</h2>
        {sales.length === 0 ? <p className="p-6 text-sm text-neutral-500">No sales.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Receivable</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>{sales.slice(0, 15).map((s) => (
              <tr key={s.sale_id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2"><Link href={`/sales/${s.sale_id}`} className="text-brand hover:underline">{s.sale_number}</Link></td>
                <td className="px-4 py-2 text-neutral-600">{dateShort(s.sale_date)}</td>
                <td className="px-4 py-2 text-right">{money(s.final_amount)}</td>
                <td className="px-4 py-2 text-right">{s.status === "confirmed" ? money(s.receivable) : "—"}</td>
                <td className="px-4 py-2">{s.status}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {pays.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent payments</h2>
          {pays.slice(0, 15).map((p) => <div key={p.id} className="flex justify-between text-sm"><span className="text-neutral-600">{p.payment_number} · {dateShort(p.payment_date)} · {p.payment_method}</span><span className="font-medium">{money(p.amount)}</span></div>)}
        </div>
      )}
    </div>
  );
}
