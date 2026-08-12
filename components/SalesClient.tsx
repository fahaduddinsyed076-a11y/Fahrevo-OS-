"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SALES_CHANNELS, PAYMENT_STATUSES, SALE_STATUSES } from "@/lib/constants";
import { money, dateShort } from "@/lib/format";
import type { Customer, SaleFinancial } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  confirmed: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-600",
};
const PAY_STYLE: Record<string, string> = {
  Unpaid: "bg-red-100 text-red-600",
  Partial: "bg-amber-100 text-amber-700",
  Paid: "bg-green-100 text-green-700",
};

export default function SalesClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<SaleFinancial[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("");
  const [fChannel, setFChannel] = useState("");
  const [fPay, setFPay] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      supabase.from("sale_financials").select("*").order("sale_date", { ascending: false }).limit(500),
      supabase.from("customers").select("id,customer_name,customer_type,active_status"),
    ]);
    setRows((s.data as SaleFinancial[]) ?? []);
    const map: Record<string, Customer> = {};
    for (const cu of (c.data as Customer[]) ?? []) map[cu.id] = cu;
    setCustomers(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function typeOf(r: SaleFinancial): "B2B" | "B2C" {
    if (r.customer_id && customers[r.customer_id]) return customers[r.customer_id].customer_type;
    return r.sales_channel === "B2B" ? "B2B" : "B2C";
  }
  function nameOf(r: SaleFinancial): string {
    return r.customer_id && customers[r.customer_id] ? customers[r.customer_id].customer_name : "Walk-in";
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fType && typeOf(r) !== fType) return false;
      if (fChannel && r.sales_channel !== fChannel) return false;
      if (fPay && r.payment_status !== fPay) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (fFrom && r.sale_date < fFrom) return false;
      if (fTo && r.sale_date > fTo) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.sale_number.toLowerCase().includes(q) && !nameOf(r).toLowerCase().includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, customers, fType, fChannel, fPay, fStatus, fFrom, fTo, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="mt-1 text-sm text-neutral-500">Only confirmed sales affect revenue and receivables.</p>
        </div>
        <Link href="/sales/new" className="btn">+ New sale</Link>
      </div>

      {/* Filters */}
      <div className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <input className="input lg:col-span-2" placeholder="Search # or customer"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">All statuses</option>
          {SALE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={fPay} onChange={(e) => setFPay(e.target.value)}>
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={fChannel} onChange={(e) => setFChannel(e.target.value)}>
          <option value="">All channels</option>
          {SALES_CHANNELS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">B2B & B2C</option>
          <option value="B2B">B2B</option>
          <option value="B2C">B2C</option>
        </select>
        <div className="flex items-center gap-2 sm:col-span-3">
          <input className="input" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          <span className="text-neutral-400">→</span>
          <input className="input" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">No sales match. Create your first sale.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Sale #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.sale_id} className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/sales/${r.sale_id}`} className="text-brand hover:underline">{r.sale_number}</Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{dateShort(r.sale_date)}</td>
                  <td className="px-4 py-3">{nameOf(r)}</td>
                  <td className="px-4 py-3">{typeOf(r)}</td>
                  <td className="px-4 py-3 text-neutral-600">{r.sales_channel}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(r.final_amount)}</td>
                  <td className="px-4 py-3"><span className={`badge ${PAY_STYLE[r.payment_status]}`}>{r.payment_status}</span></td>
                  <td className="px-4 py-3"><span className={`badge ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
