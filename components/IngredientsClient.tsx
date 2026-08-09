"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UNITS } from "@/lib/constants";
import type { Ingredient } from "@/lib/types";

type Stock = { current_stock: number; below_minimum: boolean };

type FormState = {
  ingredient_name: string;
  sku: string;
  category: string;
  base_unit: string;
  current_cost_per_base_unit: string;
  minimum_stock_level: string;
  active_status: boolean;
};

const EMPTY: FormState = {
  ingredient_name: "",
  sku: "",
  category: "",
  base_unit: "g",
  current_cost_per_base_unit: "",
  minimum_stock_level: "",
  active_status: true,
};

function num(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  return Number(t);
}

export default function IngredientsClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<Ingredient[]>([]);
  const [stock, setStock] = useState<Record<string, Stock>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ing, stk] = await Promise.all([
      supabase.from("ingredients").select("*").order("ingredient_name"),
      supabase.from("ingredient_stock").select("ingredient_id,current_stock,below_minimum"),
    ]);
    if (ing.error) setError(ing.error.message);
    else setRows((ing.data as Ingredient[]) ?? []);
    const map: Record<string, Stock> = {};
    for (const s of (stk.data as { ingredient_id: string; current_stock: number; below_minimum: boolean }[] | null) ?? []) {
      map[s.ingredient_id] = { current_stock: s.current_stock, below_minimum: s.below_minimum };
    }
    setStock(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }
  function openEdit(i: Ingredient) {
    setEditingId(i.id);
    setForm({
      ingredient_name: i.ingredient_name,
      sku: i.sku ?? "",
      category: i.category ?? "",
      base_unit: i.base_unit,
      current_cost_per_base_unit: i.current_cost_per_base_unit?.toString() ?? "",
      minimum_stock_level: i.minimum_stock_level?.toString() ?? "",
      active_status: i.active_status,
    });
    setError(null);
    setShowForm(true);
  }

  function validate(): string | null {
    if (!form.ingredient_name.trim()) return "Ingredient name is required.";
    if (!UNITS.includes(form.base_unit as (typeof UNITS)[number])) return "Base unit is required.";
    const cost = num(form.current_cost_per_base_unit);
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) return "Cost must be a number ≥ 0.";
    const min = num(form.minimum_stock_level);
    if (min !== null && (Number.isNaN(min) || min < 0)) return "Minimum stock must be a number ≥ 0.";
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    setError(null);
    const payload = {
      ingredient_name: form.ingredient_name.trim(),
      sku: form.sku.trim() || null,
      category: form.category.trim() || null,
      base_unit: form.base_unit,
      current_cost_per_base_unit: num(form.current_cost_per_base_unit),
      minimum_stock_level: num(form.minimum_stock_level),
      active_status: form.active_status,
    };
    const res = editingId
      ? await supabase.from("ingredients").update(payload).eq("id", editingId)
      : await supabase.from("ingredients").insert(payload);
    setSaving(false);
    if (res.error) { setError(res.error.message); return; }
    setShowForm(false);
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ingredients</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Raw materials. Current stock is derived from the inventory ledger.
          </p>
        </div>
        <button className="btn" onClick={openAdd}>+ Add ingredient</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card space-y-4">
          <h2 className="font-semibold">{editingId ? "Edit ingredient" : "New ingredient"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Ingredient name *</label>
              <input className="input" value={form.ingredient_name}
                onChange={(e) => setForm({ ...form, ingredient_name: e.target.value })} required />
            </div>
            <div>
              <label className="label">SKU</label>
              <input className="input" value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className="label">Base unit *</label>
              <select className="input" value={form.base_unit}
                onChange={(e) => setForm({ ...form, base_unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cost per base unit</label>
              <input className="input" type="number" min="0" step="0.0001" inputMode="decimal"
                value={form.current_cost_per_base_unit}
                onChange={(e) => setForm({ ...form, current_cost_per_base_unit: e.target.value })} />
            </div>
            <div>
              <label className="label">Minimum stock level</label>
              <input className="input" type="number" min="0" step="0.001" inputMode="decimal"
                value={form.minimum_stock_level}
                onChange={(e) => setForm({ ...form, minimum_stock_level: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.active_status}
                onChange={(e) => setForm({ ...form, active_status: e.target.checked })} />
              Active
            </label>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-2">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">No ingredients yet. Add your first one.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Base unit</th>
                <th className="px-4 py-3">Cost/unit</th>
                <th className="px-4 py-3">Current stock</th>
                <th className="px-4 py-3">Min</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const s = stock[i.id];
                return (
                  <tr key={i.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {i.ingredient_name}
                      {i.sku && <span className="ml-2 text-xs text-neutral-400">{i.sku}</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{i.category ?? "—"}</td>
                    <td className="px-4 py-3">{i.base_unit}</td>
                    <td className="px-4 py-3">
                      {i.current_cost_per_base_unit == null ? "—" : "₹" + i.current_cost_per_base_unit}
                    </td>
                    <td className="px-4 py-3">
                      <span className={s?.below_minimum ? "font-semibold text-red-600" : ""}>
                        {s ? `${s.current_stock} ${i.base_unit}` : `0 ${i.base_unit}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {i.minimum_stock_level == null ? "—" : i.minimum_stock_level}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${i.active_status ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>
                        {i.active_status ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-sm font-semibold text-brand hover:underline" onClick={() => openEdit(i)}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
