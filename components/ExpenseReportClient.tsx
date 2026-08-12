"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, dateShort } from "@/lib/format";
import { presetRange, type RangeKey } from "@/lib/ranges";

type Exp = { expense_date: string; category: string; amount: number; description: string | null };

export default function ExpenseReportClient() {
  const supabase = createClient();
  const [preset, setPreset] = useState<RangeKey>("month");
  const init = presetRange("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [rows, setRows] = useState<Exp[]>([]);
  const [loading, setLoading] = useState(true);

  function applyPreset(k: RangeKey) { setPreset(k); if (k !== "custom") { const r = presetRange(k); setFrom(r.from); setTo(r.to); } }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("expenses").select("expense_date,category,amount,description").gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false });
    setRows((data as Exp[]) ?? []);
    setLoading(false);
  }, [supabase, from, to]);
  useEffect(() => { load(); }, [load]);

  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.category] = (m[r.category] ?? 0) + Number(r.amount);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Expense report</h1>
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
          <div className="card inline-block"><div className="text-xs text-neutral-500">Total expenses</div><div className="mt-1 text-2xl font-bold">{money(total)}</div></div>
          <div className="card">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">By category</h2>
            {byCategory.length === 0 ? <p className="text-sm text-neutral-500">No expenses.</p> : byCategory.map(([c, amt]) => (
              <div key={c} className="flex justify-between border-b border-neutral-100 py-1 text-sm last:border-0"><span>{c}</span><span className="font-medium">{money(amt)}</span></div>
            ))}
          </div>
          <div className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">By date</h2>
            {rows.length === 0 ? <p className="p-6 text-sm text-neutral-500">No expenses.</p> : (
              <table className="w-full text-sm"><tbody>{rows.map((r, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0"><td className="px-4 py-2 text-neutral-600">{dateShort(r.expense_date)}</td><td className="px-4 py-2">{r.category}</td><td className="px-4 py-2 text-neutral-500">{r.description ?? "—"}</td><td className="px-4 py-2 text-right font-medium">{money(r.amount)}</td></tr>
              ))}</tbody></table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
