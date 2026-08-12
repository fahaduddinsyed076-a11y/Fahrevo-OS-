"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";
import { presetRange, type RangeKey } from "@/lib/ranges";
import type { Customer, SaleFinancial } from "@/lib/types";

export default function SalesReportClient() {
  const supabase = createClient();
  const [preset, setPreset] = useState<RangeKey>("month");
  const init = presetRange("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [sales, setSales] = useState<SaleFinancial[]>([]);
  const [custMap, setCustMap] = useState<Record<string, Customer>>({});
  const [loading, setLoading] = useState(true);

  function applyPreset(k: RangeKey) { setPreset(k); if (k !== "custom") { const r = presetRange(k); setFrom(r.from); setTo(r.to); } }

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      supabase.from("sale_financials").select("*").eq("status", "confirmed").gte("sale_date", from).lte("sale_date", to),
      supabase.from("customers").select("id,customer_name,customer_type,active_status"),
    ]);
    setSales((s.data as SaleFinancial[]) ?? []);
    const m: Record<string, Customer> = {};
    for (const cu of (c.data as Customer[]) ?? []) m[cu.id] = cu;
    setCustMap(m);
    setLoading(false);
  }, [supabase, from, to]);
  useEffect(() => { load(); }, [load]);

  const r = useMemo(() => {
    const revenue = sales.reduce((a, s) => a + Number(s.final_amount), 0);
    const discounts = sales.reduce((a, s) => a + Number(s.discount), 0);
    const taxes = sales.reduce((a, s) => a + Number(s.tax), 0);
    const received = sales.reduce((a, s) => a + Number(s.amount_received), 0);
    const receivable = sales.reduce((a, s) => a + Number(s.receivable), 0);
    const byChannel: Record<string, { count: number; revenue: number }> = {};
    const byType: Record<string, { count: number; revenue: number }> = { B2B: { count: 0, revenue: 0 }, B2C: { count: 0, revenue: 0 } };
    for (const s of sales) {
      const ch = s.sales_channel;
      byChannel[ch] = byChannel[ch] ?? { count: 0, revenue: 0 };
      byChannel[ch].count++; byChannel[ch].revenue += Number(s.final_amount);
      const t = s.customer_id && custMap[s.customer_id] ? custMap[s.customer_id].customer_type : (ch === "B2B" ? "B2B" : "B2C");
      byType[t].count++; byType[t].revenue += Number(s.final_amount);
    }
    return { revenue, discounts, taxes, received, receivable, orders: sales.length, byChannel, byType };
  }, [sales, custMap]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sales report</h1>
        <Link href="/reports/product-sales" className="text-sm font-semibold text-brand hover:underline">Product-wise →</Link>
      </div>
      <div className="card flex flex-wrap items-center gap-2">
        {(["today", "week", "month", "custom"] as RangeKey[]).map((k) => (
          <button key={k} onClick={() => applyPreset(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${preset === k ? "bg-brand text-white" : "bg-neutral-100 text-neutral-600"}`}>{k === "today" ? "Today" : k === "week" ? "Week" : k === "month" ? "Month" : "Custom"}</button>
        ))}
        <input className="input w-auto" type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} />
        <span className="text-neutral-400">→</span>
        <input className="input w-auto" type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} />
      </div>

      {loading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label="Revenue" value={money(r.revenue)} />
            <Kpi label="Orders" value={String(r.orders)} />
            <Kpi label="Discounts" value={money(r.discounts)} />
            <Kpi label="Taxes" value={money(r.taxes)} />
            <Kpi label="Payments received" value={money(r.received)} />
            <Kpi label="Receivables" value={money(r.receivable)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Breakdown title="By channel" data={r.byChannel} />
            <Breakdown title="By customer type" data={r.byType} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="text-xs text-neutral-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>;
}
function Breakdown({ title, data }: { title: string; data: Record<string, { count: number; revenue: number }> }) {
  const rows = Object.entries(data).filter(([, v]) => v.count > 0);
  return (
    <div className="card">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-neutral-500">No data.</p> : rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-neutral-100 py-1 text-sm last:border-0"><span>{k} <span className="text-neutral-400">({v.count})</span></span><span className="font-medium">{money(v.revenue)}</span></div>
      ))}
    </div>
  );
}
