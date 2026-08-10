"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { qty } from "@/lib/format";

type Stock = { ingredient_id: string; ingredient_name: string; base_unit: string; current_stock: number; below_minimum: boolean };
type Txn = { transaction_type: string; quantity: number };

const TYPES = ["purchase", "sale_consumption", "wastage", "adjustment", "correction", "return"];
const LABEL: Record<string, string> = {
  purchase: "Receipts", sale_consumption: "Sale consumption", wastage: "Wastage",
  adjustment: "Adjustments", correction: "Corrections", return: "Returns",
};

export default function InventoryReportClient() {
  const supabase = createClient();
  const [stock, setStock] = useState<Stock[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, t] = await Promise.all([
      supabase.from("ingredient_stock").select("*").order("ingredient_name"),
      supabase.from("inventory_transactions").select("transaction_type,quantity"),
    ]);
    setStock((s.data as Stock[]) ?? []);
    setTxns((t.data as Txn[]) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of txns) m[t.transaction_type] = (m[t.transaction_type] ?? 0) + Number(t.quantity);
    return m;
  }, [txns]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Inventory report</h1>

      {loading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {TYPES.map((t) => (
              <div key={t} className="card"><div className="text-xs text-neutral-500">{LABEL[t]}</div><div className={`mt-1 text-lg font-bold ${(byType[t] ?? 0) < 0 ? "text-red-600" : ""}`}>{qty(byType[t] ?? 0)}</div></div>
            ))}
          </div>
          <div className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Current stock</h2>
            {stock.length === 0 ? <p className="p-6 text-sm text-neutral-500">No ingredients.</p> : (
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">Ingredient</th><th className="px-4 py-2 text-right">Current stock</th></tr></thead>
                <tbody>{stock.map((s) => (
                  <tr key={s.ingredient_id} className="border-b border-neutral-100 last:border-0"><td className="px-4 py-2 font-medium">{s.ingredient_name}</td><td className="px-4 py-2 text-right"><span className={s.below_minimum ? "font-semibold text-red-600" : ""}>{qty(s.current_stock)} {s.base_unit}</span></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <p className="text-xs text-neutral-400">Movement totals are net signed quantities across all ingredients (base units). Consumption/wastage are negative.</p>
        </>
      )}
    </div>
  );
}
