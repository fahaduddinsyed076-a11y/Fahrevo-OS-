"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";
import { presetRange, type RangeKey } from "@/lib/ranges";
import type { SaleFinancial } from "@/lib/types";

export default function PnlClient() {
  const supabase = createClient();
  const [preset, setPreset] = useState<RangeKey>("month");
  const initial = presetRange("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [sales, setSales] = useState<SaleFinancial[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  function applyPreset(k: RangeKey) {
    setPreset(k);
    if (k !== "custom") { const r = presetRange(k); setFrom(r.from); setTo(r.to); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [s, e] = await Promise.all([
      supabase.from("sale_financials").select("*").eq("status", "confirmed").gte("sale_date", from).lte("sale_date", to),
      supabase.from("expenses").select("amount").gte("expense_date", from).lte("expense_date", to),
    ]);
    setSales((s.data as SaleFinancial[]) ?? []);
    setExpenseTotal(((e.data as { amount: number }[]) ?? []).reduce((a, x) => a + Number(x.amount), 0));
    setLoading(false);
  }, [supabase, from, to]);
  useEffect(() => { load(); }, [load]);

  const calc = useMemo(() => {
    const revenue = sales.reduce((a, s) => a + Number(s.final_amount), 0);
    const cogsComplete = sales.every((s) => s.cogs != null);
    const cogs = sales.reduce((a, s) => a + Number(s.cogs ?? 0), 0);
    const gross = revenue - cogs;
    const net = gross - expenseTotal;
    const foodCost = revenue > 0 ? (cogs / revenue) * 100 : null;
    return { revenue, cogs, cogsComplete, gross, net, foodCost, orders: sales.length };
  }, [sales, expenseTotal]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Profit &amp; Loss</h1>
        <p className="mt-1 text-sm text-neutral-500">Confirmed, non-voided sales only. All values from source transactions.</p>
      </div>

      <div className="card flex flex-wrap items-center gap-2">
        {(["today", "week", "month", "custom"] as RangeKey[]).map((k) => (
          <button key={k} onClick={() => applyPreset(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${preset === k ? "bg-brand text-white" : "bg-neutral-100 text-neutral-600"}`}>
            {k === "today" ? "Today" : k === "week" ? "This week" : k === "month" ? "This month" : "Custom"}
          </button>
        ))}
        <input className="input w-auto" type="date" value={from} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} />
        <span className="text-neutral-400">→</span>
        <input className="input w-auto" type="date" value={to} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} />
      </div>

      {loading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="card mx-auto max-w-lg space-y-2 text-sm">
          <Row label="Revenue" value={money(calc.revenue)} bold />
          <Row label={`COGS${calc.cogsComplete ? "" : " (incomplete — missing costs)"}`} value={"− " + money(calc.cogs)} amber={!calc.cogsComplete} />
          <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold"><span>Gross profit</span><span>{money(calc.gross)}</span></div>
          <Row label="Operating expenses" value={"− " + money(expenseTotal)} />
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-lg font-bold"><span>Net profit</span><span className={calc.net < 0 ? "text-red-600" : ""}>{money(calc.net)}</span></div>
          <div className="flex justify-between pt-3 text-neutral-500"><span>Orders</span><span>{calc.orders}</span></div>
          <div className="flex justify-between text-neutral-500"><span>Food cost %</span><span>{calc.foodCost == null ? "—" : calc.foodCost.toFixed(2) + "%"}</span></div>
          {calc.revenue === 0 && <p className="pt-2 text-xs text-neutral-400">No confirmed revenue in this period.</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, amber }: { label: string; value: string; bold?: boolean; amber?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={amber ? "text-amber-600" : "text-neutral-500"}>{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
