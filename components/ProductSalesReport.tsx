"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, qty } from "@/lib/format";
import type { SaleItemFinancial } from "@/lib/types";

function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

type Agg = {
  product_id: string; product_name: string;
  quantity: number; revenue: number; discounts: number;
  cogs: number | null; grossProfit: number | null;
};

export default function ProductSalesReport() {
  const supabase = createClient();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<SaleItemFinancial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sale_item_financials")
      .select("*")
      .eq("status", "confirmed")
      .gte("sale_date", from)
      .lte("sale_date", to);
    setRows((data as SaleItemFinancial[]) ?? []);
    setLoading(false);
  }, [supabase, from, to]);

  useEffect(() => { load(); }, [load]);

  const agg = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const a = m.get(r.product_id) ?? {
        product_id: r.product_id, product_name: r.product_name,
        quantity: 0, revenue: 0, discounts: 0, cogs: 0, grossProfit: 0,
      };
      a.quantity += Number(r.quantity);
      a.revenue += Number(r.revenue);
      a.discounts += Number(r.discount);
      // COGS available only if every line has a cost.
      if (a.cogs != null && r.line_cogs != null) a.cogs += Number(r.line_cogs);
      else a.cogs = null;
      m.set(r.product_id, a);
    }
    const list = [...m.values()].map((a) => ({
      ...a,
      grossProfit: a.cogs == null ? null : a.revenue - a.cogs,
    }));
    return list.sort((x, y) => y.revenue - x.revenue);
  }, [rows]);

  const totals = useMemo(() => {
    return agg.reduce(
      (t, a) => ({ quantity: t.quantity + a.quantity, revenue: t.revenue + a.revenue, discounts: t.discounts + a.discounts }),
      { quantity: 0, revenue: 0, discounts: 0 },
    );
  }, [agg]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Product-wise sales</h1>
        <p className="mt-1 text-sm text-neutral-500">Confirmed sales only, derived from sale items and consumption records.</p>
      </div>

      <div className="card flex flex-wrap items-center gap-2">
        <input className="input w-auto" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-neutral-400">→</span>
        <input className="input w-auto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : agg.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">No confirmed sales in this range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Qty sold</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Discounts</th>
                <th className="px-4 py-3 text-right">COGS</th>
                <th className="px-4 py-3 text-right">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              {agg.map((a) => (
                <tr key={a.product_id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{a.product_name}</td>
                  <td className="px-4 py-3 text-right">{qty(a.quantity)}</td>
                  <td className="px-4 py-3 text-right">{money(a.revenue)}</td>
                  <td className="px-4 py-3 text-right">{money(a.discounts)}</td>
                  <td className="px-4 py-3 text-right">{a.cogs == null ? <span className="text-amber-600">n/a</span> : money(a.cogs)}</td>
                  <td className="px-4 py-3 text-right">{a.grossProfit == null ? <span className="text-amber-600">n/a</span> : money(a.grossProfit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{qty(totals.quantity)}</td>
                <td className="px-4 py-3 text-right">{money(totals.revenue)}</td>
                <td className="px-4 py-3 text-right">{money(totals.discounts)}</td>
                <td className="px-4 py-3 text-right text-neutral-400">—</td>
                <td className="px-4 py-3 text-right text-neutral-400">—</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="text-xs text-neutral-400">COGS/gross profit show “n/a” for any product whose consumed ingredients are missing a recorded cost — never assumed as zero.</p>
    </div>
  );
}
