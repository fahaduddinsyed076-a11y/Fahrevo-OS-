"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, qty, dateShort } from "@/lib/format";
import type { Ingredient } from "@/lib/types";

type Stock = { ingredient_id: string; ingredient_name: string; base_unit: string; minimum_stock_level: number | null; current_stock: number; below_minimum: boolean };
type Ledger = { id: string; transaction_type: string; quantity: number; unit: string; reference_type: string | null; transaction_date: string; notes: string | null; ingredients: { ingredient_name: string } | null };

const ADJ_TYPES = ["adjustment", "wastage", "correction", "return"] as const;

export default function InventoryClient() {
  const supabase = createClient();
  const [stock, setStock] = useState<Stock[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const [ingId, setIngId] = useState("");
  const [txnType, setTxnType] = useState<string>("adjustment");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [s, l, i] = await Promise.all([
      supabase.from("ingredient_stock").select("*").order("ingredient_name"),
      supabase.from("inventory_transactions").select("id,transaction_type,quantity,unit,reference_type,transaction_date,notes,ingredients(ingredient_name)").order("transaction_date", { ascending: false }).limit(50),
      supabase.from("ingredients").select("*").eq("active_status", true).order("ingredient_name"),
    ]);
    setStock((s.data as Stock[]) ?? []);
    setLedger((l.data as unknown as Ledger[]) ?? []);
    setIngredients((i.data as Ingredient[]) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const baseUnit = ingredients.find((i) => i.id === ingId)?.base_unit;
  const effectiveDir = txnType === "wastage" ? "remove" : direction;

  async function save() {
    setError(null);
    const q = Number(quantity);
    if (!ingId) { setError("Select an ingredient."); return; }
    if (!(q > 0)) { setError("Enter a quantity greater than 0."); return; }
    const signed = effectiveDir === "remove" ? -q : q;
    setBusy(true);
    const { error } = await supabase.from("inventory_transactions").insert({
      ingredient_id: ingId, transaction_type: txnType, quantity: signed, unit: baseUnit,
      reference_type: "manual", notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setShow(false); setQuantity(""); setNotes("");
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="mt-1 text-sm text-neutral-500">Current stock is derived from the ledger. Fix discrepancies with an adjustment.</p>
        </div>
        <button className="btn" onClick={() => setShow(!show)}>+ Stock adjustment</button>
      </div>

      {show && (
        <div className="card grid gap-4 sm:grid-cols-2">
          <div><label className="label">Ingredient</label>
            <select className="input" value={ingId} onChange={(e) => setIngId(e.target.value)}>
              <option value="">Select…</option>
              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.ingredient_name} ({i.base_unit})</option>)}
            </select>
          </div>
          <div><label className="label">Type</label>
            <select className="input" value={txnType} onChange={(e) => setTxnType(e.target.value)}>{ADJ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div><label className="label">Direction</label>
            <select className="input" value={effectiveDir} onChange={(e) => setDirection(e.target.value as "add" | "remove")} disabled={txnType === "wastage"}>
              <option value="add">Add stock (+)</option><option value="remove">Remove stock (−)</option>
            </select>
          </div>
          <div><label className="label">Quantity {baseUnit ? `(${baseUnit})` : ""}</label><input className="input" type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save adjustment"}</button><button className="btn-secondary" onClick={() => setShow(false)}>Cancel</button></div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Current stock</h2>
        {loading ? <p className="p-6 text-sm text-neutral-500">Loading…</p> : stock.length === 0 ? <p className="p-6 text-sm text-neutral-500">No ingredients yet.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">Ingredient</th><th className="px-4 py-2 text-right">Current stock</th><th className="px-4 py-2 text-right">Minimum</th></tr></thead>
            <tbody>{stock.map((s) => (
              <tr key={s.ingredient_id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 font-medium">{s.ingredient_name}</td>
                <td className="px-4 py-2 text-right"><span className={s.below_minimum ? "font-semibold text-red-600" : ""}>{qty(s.current_stock)} {s.base_unit}</span></td>
                <td className="px-4 py-2 text-right text-neutral-500">{s.minimum_stock_level == null ? "—" : `${qty(s.minimum_stock_level)} ${s.base_unit}`}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent ledger movements</h2>
        {ledger.length === 0 ? <p className="p-6 text-sm text-neutral-500">No movements yet.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Ingredient</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Source</th><th className="px-4 py-2 text-right">Qty</th></tr></thead>
            <tbody>{ledger.map((l) => (
              <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 text-neutral-600">{dateShort(l.transaction_date)}</td>
                <td className="px-4 py-2">{l.ingredients?.ingredient_name ?? "—"}</td>
                <td className="px-4 py-2">{l.transaction_type}</td>
                <td className="px-4 py-2 text-neutral-500">{l.reference_type ?? "—"}</td>
                <td className={`px-4 py-2 text-right font-medium ${l.quantity < 0 ? "text-red-600" : "text-green-700"}`}>{l.quantity < 0 ? "" : "+"}{qty(l.quantity)} {l.unit}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
