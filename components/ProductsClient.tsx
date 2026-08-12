"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { estimateRecipeCost, type IngredientCostInfo, type RecipeCostLine } from "@/lib/recipeCost";
import type { Product } from "@/lib/types";

type FormState = {
  product_name: string;
  sku: string;
  category: string;
  selling_price: string;
  b2b_price: string;
  b2c_price: string;
  active_status: boolean;
};

const EMPTY: FormState = {
  product_name: "",
  sku: "",
  category: "",
  selling_price: "",
  b2b_price: "",
  b2c_price: "",
  active_status: true,
};

// Empty string -> null (missing values are never invented); otherwise a number.
function num(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  return Number(t);
}
function price(v: number | null): string {
  return v == null ? "—" : "₹" + v.toFixed(2);
}

type RecipeLineRow = { product_id: string; ingredient_id: string; quantity_required: number; unit: RecipeCostLine["unit"] };
type IngredientRow = { id: string; base_unit: IngredientCostInfo["base_unit"]; current_cost_per_base_unit: number | null };

export default function ProductsClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<Product[]>([]);
  const [recipeLines, setRecipeLines] = useState<RecipeLineRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, r, i] = await Promise.all([
      supabase.from("products").select("*").order("product_name"),
      supabase.from("recipes").select("product_id,ingredient_id,quantity_required,unit"),
      supabase.from("ingredients").select("id,base_unit,current_cost_per_base_unit"),
    ]);
    if (p.error) setError(p.error.message);
    else setRows((p.data as Product[]) ?? []);
    setRecipeLines((r.data as RecipeLineRow[]) ?? []);
    setIngredients((i.data as IngredientRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const ingredientById = useMemo(() => {
    const m: Record<string, IngredientCostInfo> = {};
    ingredients.forEach((i) => (m[i.id] = i));
    return m;
  }, [ingredients]);

  function estCogs(productId: string): number | null {
    const lines = recipeLines.filter((r) => r.product_id === productId);
    return estimateRecipeCost(lines, ingredientById);
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }
  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      product_name: p.product_name,
      sku: p.sku ?? "",
      category: p.category ?? "",
      selling_price: p.selling_price?.toString() ?? "",
      b2b_price: p.b2b_price?.toString() ?? "",
      b2c_price: p.b2c_price?.toString() ?? "",
      active_status: p.active_status,
    });
    setError(null);
    setShowForm(true);
  }

  function validate(): string | null {
    if (!form.product_name.trim()) return "Product name is required.";
    for (const [k, v] of [
      ["Selling price", form.selling_price],
      ["B2B price", form.b2b_price],
      ["B2C price", form.b2c_price],
    ] as const) {
      const n = num(v);
      if (n !== null && (Number.isNaN(n) || n < 0)) return `${k} must be a number ≥ 0.`;
    }
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    setError(null);
    const payload = {
      product_name: form.product_name.trim(),
      sku: form.sku.trim() || null,
      category: form.category.trim() || null,
      selling_price: num(form.selling_price),
      b2b_price: num(form.b2b_price),
      b2c_price: num(form.b2c_price),
      active_status: form.active_status,
    };
    const res = editingId
      ? await supabase.from("products").update(payload).eq("id", editingId)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (res.error) { setError(res.error.message); return; }
    setShowForm(false);
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Items you sell. Prices are yours to set — leave blank if unknown.
          </p>
        </div>
        <button className="btn" onClick={openAdd}>+ Add product</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="card space-y-4">
          <h2 className="font-semibold">{editingId ? "Edit product" : "New product"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Product name *</label>
              <input className="input" value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })} required />
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
              <label className="label">Selling price</label>
              <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })} />
            </div>
            <div>
              <label className="label">B2B price</label>
              <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
                value={form.b2b_price}
                onChange={(e) => setForm({ ...form, b2b_price: e.target.value })} />
            </div>
            <div>
              <label className="label">B2C price</label>
              <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
                value={form.b2c_price}
                onChange={(e) => setForm({ ...form, b2c_price: e.target.value })} />
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
          <p className="p-6 text-center text-sm text-neutral-500">No products yet. Add your first one.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Selling</th>
                <th className="px-4 py-3">B2B</th>
                <th className="px-4 py-3">B2C</th>
                <th className="px-4 py-3">Est. COGS</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const cogs = estCogs(p.id);
                return (
                <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {p.product_name}
                    {p.sku && <span className="ml-2 text-xs text-neutral-400">{p.sku}</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{p.category ?? "—"}</td>
                  <td className="px-4 py-3">{price(p.selling_price)}</td>
                  <td className="px-4 py-3">{price(p.b2b_price)}</td>
                  <td className="px-4 py-3">{price(p.b2c_price)}</td>
                  <td className="px-4 py-3">
                    {cogs == null
                      ? <span className="text-amber-600">Cost unavailable</span>
                      : <span className="font-medium">{price(cogs)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${p.active_status ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>
                      {p.active_status ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-sm font-semibold text-brand hover:underline" onClick={() => openEdit(p)}>Edit</button>
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
