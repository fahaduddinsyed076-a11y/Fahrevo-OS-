"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, qty } from "@/lib/format";
import { presetRange, type RangeKey } from "@/lib/ranges";
import type { Supplier } from "@/lib/types";

type Item = { quantity: number; unit: string; total_cost: number; ingredients: { ingredient_name: string } | null; purchases: { status: string; purchase_date: string; supplier_id: string | null } | null };

export default function PurchaseReportClient() {
  const supabase = createClient();
  const [preset, setPreset] = useState<RangeKey>("month");
  const init = presetRange("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);

  function applyPreset(k: RangeKey) { setPreset(k); if (k !== "custom") { const r = presetRange(k); setFrom(r.from); setTo(r.to); } }

  const load = useCallback(async () => {
    setLoading(true);
    const [it, s] = await Promise.all([
      supabase.from("purchase_items").select("quantity,unit,total_cost,ingredients(ingredient_name),purchases!inner(status,purchase_date,supplier_id)").eq("purchases.status", "received").gte("purchases.purchase_date", from).lte("purchases.purchase_date", to),
      supabase.from("suppliers").select("*"),
    ]);
    setItems((it.data as unknown as Item[]) ?? []);
    const m: Record<string, Supplier> = {};
    for (const su of (s.data as Supplier[]) ?? []) m[su.id] = su;
    setSuppliers(m);
    setLoading(false);
  }, [supabase, from, to]);
  useEffect(() => { load(); }, [load]);

  const r = useMemo(() => {
    const total = items.reduce((a, x) => a + Number(x.total_cost), 0);
    const bySupplier: Record<string, number> = {};
    const byIngredient: Record<string, { cost: number; label: string }> = {};
    for (const x of items) {
      const sid = x.purchases?.supplier_id ?? "none";
      bySupplier[sid] = (bySupplier[sid] ?? 0) + Number(x.total_cost);
      const name = x.ingredients?.ingredient_name ?? "—";
      byIngredient[name] = byIngredient[name] ?? { cost: 0, label: name };
      byIngredient[name].cost += Number(x.total_cost);
    }
    return { total, bySupplier, byIngredient };
  }, [items]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Purchase report</h1>
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
          <div className="card inline-block"><div className="text-xs text-neutral-500">Total received purchases</div><div className="mt-1 text-2xl font-bold">{money(r.total)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">By supplier</h2>
              {Object.entries(r.bySupplier).length === 0 ? <p className="text-sm text-neutral-500">No data.</p> : Object.entries(r.bySupplier).map(([sid, cost]) => (
                <div key={sid} className="flex justify-between border-b border-neutral-100 py-1 text-sm last:border-0"><span>{sid === "none" ? "No supplier" : suppliers[sid]?.supplier_name ?? "—"}</span><span className="font-medium">{money(cost)}</span></div>
              ))}
            </div>
            <div className="card">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">By ingredient</h2>
              {Object.values(r.byIngredient).length === 0 ? <p className="text-sm text-neutral-500">No data.</p> : Object.values(r.byIngredient).sort((a, b) => b.cost - a.cost).map((x) => (
                <div key={x.label} className="flex justify-between border-b border-neutral-100 py-1 text-sm last:border-0"><span>{x.label}</span><span className="font-medium">{money(x.cost)}</span></div>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="text-xs text-neutral-400">{items.length > 0 ? `${qty(items.reduce((a, x) => a + Number(x.quantity), 0))} total units purchased across lines.` : ""}</p>
    </div>
  );
}
