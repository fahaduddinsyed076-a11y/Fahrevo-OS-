"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UNITS, PAYMENT_METHODS, type Unit } from "@/lib/constants";
import { unitsCompatible } from "@/lib/units";
import { money } from "@/lib/format";
import type { Ingredient, Supplier } from "@/lib/types";

type Line = { ingredient_id: string; quantity: string; unit: Unit; unit_cost: string };
const emptyLine: Line = { ingredient_id: "", quantity: "", unit: "g", unit_cost: "" };

export default function NewPurchaseClient() {
  const supabase = createClient();
  const router = useRouter();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [tax, setTax] = useState("0");
  const [amountPaid, setAmountPaid] = useState("0");
  const [method, setMethod] = useState("Cash");
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddSup, setShowAddSup] = useState(false);
  const [newSup, setNewSup] = useState("");

  const ingById = useMemo(() => {
    const m: Record<string, Ingredient> = {};
    ingredients.forEach((i) => (m[i.id] = i));
    return m;
  }, [ingredients]);

  const load = useCallback(async () => {
    const [i, s] = await Promise.all([
      supabase.from("ingredients").select("*").eq("active_status", true).order("ingredient_name"),
      supabase.from("suppliers").select("*").eq("active_status", true).order("supplier_name"),
    ]);
    setIngredients((i.data as Ingredient[]) ?? []);
    setSuppliers((s.data as Supplier[]) ?? []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  function setLine(idx: number, patch: Partial<Line>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function onPickIngredient(idx: number, id: string) {
    const ing = ingById[id];
    setLine(idx, { ingredient_id: id, unit: ing ? ing.base_unit : lines[idx].unit });
  }
  const lineTotals = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const finalAmount = Math.max(subtotal + (Number(tax) || 0), 0);

  async function addSupplier() {
    if (!newSup.trim()) return;
    const { data, error } = await supabase.from("suppliers").insert({ supplier_name: newSup.trim() }).select("*").single();
    if (error) { setError(error.message); return; }
    const s = data as Supplier;
    setSuppliers((p) => [...p, s].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
    setSupplierId(s.id); setShowAddSup(false); setNewSup("");
  }

  function validate(): string | null {
    const clean = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0);
    if (clean.length === 0) return "Add at least one ingredient with a quantity.";
    for (const l of clean) {
      const ing = ingById[l.ingredient_id];
      if (ing && !unitsCompatible(l.unit, ing.base_unit))
        return `Unit ${l.unit} is incompatible with ${ing.ingredient_name} (base ${ing.base_unit}).`;
      if (l.unit_cost.trim() === "" || Number(l.unit_cost) < 0)
        return `Enter a valid unit cost for ${ing?.ingredient_name}. Costs are never assumed.`;
    }
    return null;
  }

  async function createDraft(): Promise<string | null> {
    const clean = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0);
    const { data, error } = await supabase.from("purchases").insert({
      purchase_date: date, supplier_id: supplierId || null, tax: Number(tax) || 0, notes: notes.trim() || null,
    }).select("id").single();
    if (error) { setError(error.message); return null; }
    const id = (data as { id: string }).id;
    const items = clean.map((l) => ({
      purchase_id: id, ingredient_id: l.ingredient_id, quantity: Number(l.quantity), unit: l.unit, unit_cost: Number(l.unit_cost),
    }));
    const { error: e2 } = await supabase.from("purchase_items").insert(items);
    if (e2) { await supabase.from("purchases").delete().eq("id", id); setError(e2.message); return null; }
    return id;
  }

  async function onSaveDraft() {
    const v = validate(); if (v) { setError(v); return; }
    setBusy(true); setError(null); setDraftId(null);
    const id = await createDraft(); setBusy(false);
    if (id) router.push(`/purchases/${id}`);
  }
  async function onReceive() {
    const v = validate(); if (v) { setError(v); return; }
    setBusy(true); setError(null); setDraftId(null);
    const id = await createDraft();
    if (!id) { setBusy(false); return; }
    const { error } = await supabase.rpc("confirm_purchase", {
      p_purchase_id: id, p_amount_paid: Number(amountPaid) || 0,
      p_method: (Number(amountPaid) || 0) > 0 ? method : null, p_date: date,
    });
    setBusy(false);
    if (error) { setDraftId(id); setError(error.message); return; }
    router.push(`/purchases/${id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New purchase</h1>
        <Link href="/purchases" className="text-sm font-semibold text-neutral-500 hover:underline">← All purchases</Link>
      </div>

      <div className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Purchase date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Supplier</label>
          <div className="flex gap-2">
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
            </select>
            <button className="btn-secondary shrink-0" type="button" onClick={() => setShowAddSup(!showAddSup)}>+ New</button>
          </div>
          {showAddSup && (
            <div className="mt-2 flex gap-2">
              <input className="input" placeholder="Supplier name" value={newSup} onChange={(e) => setNewSup(e.target.value)} />
              <button className="btn shrink-0" type="button" onClick={addSupplier}>Add</button>
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Ingredients</h2>
        {lines.map((l, idx) => {
          const ing = ingById[l.ingredient_id];
          const bad = ing && !unitsCompatible(l.unit, ing.base_unit);
          return (
            <div key={idx} className="rounded-lg border border-neutral-200 p-3">
              <div className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <label className="label">Ingredient</label>
                  <select className="input" value={l.ingredient_id} onChange={(e) => onPickIngredient(idx, e.target.value)}>
                    <option value="">Select…</option>
                    {ingredients.map((i) => <option key={i.id} value={i.id}>{i.ingredient_name} ({i.base_unit})</option>)}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="label">Qty</label>
                  <input className="input" type="number" min="0" step="0.001" value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="label">Unit</label>
                  <select className={`input ${bad ? "border-red-400" : ""}`} value={l.unit} onChange={(e) => setLine(idx, { unit: e.target.value as Unit })}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="label">Unit cost</label>
                  <input className="input" type="number" min="0" step="0.0001" value={l.unit_cost} onChange={(e) => setLine(idx, { unit_cost: e.target.value })} />
                </div>
                <div className="col-span-1 text-right">
                  <button className="px-2 py-2 text-red-500" onClick={() => setLines(lines.length > 1 ? lines.filter((_, i) => i !== idx) : lines)}>×</button>
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-500">Line total: <b className="text-neutral-800">{money(lineTotals[idx])}</b>{bad && <span className="ml-2 text-red-600">Incompatible unit</span>}</div>
            </div>
          );
        })}
        <button className="btn-secondary" type="button" onClick={() => setLines([...lines, { ...emptyLine }])}>+ Add ingredient</button>
      </div>

      <div className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Tax (entered, never assumed)</label>
          <input className="input" type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>
        <div />
        <div>
          <label className="label">Amount paid now (optional)</label>
          <input className="input" type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
        </div>
        <div>
          <label className="label">Payment method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 space-y-1 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Tax</span><span>+ {money(Number(tax) || 0)}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Final amount</span><span>{money(finalAmount)}</span></div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{draftId && <> {" "}<Link href={`/purchases/${draftId}`} className="font-semibold underline">Open saved draft →</Link></>}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button className="btn" onClick={onReceive} disabled={busy}>{busy ? "Working…" : "Receive purchase"}</button>
        <button className="btn-secondary" onClick={onSaveDraft} disabled={busy}>Save as draft</button>
      </div>
      <p className="text-xs text-neutral-400">Receiving adds stock to the inventory ledger and updates each ingredient&apos;s current cost, atomically.</p>
    </div>
  );
}
