"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UNITS, type Unit } from "@/lib/constants";
import { unitsCompatible } from "@/lib/units";
import { estimateRecipeCost } from "@/lib/recipeCost";
import { money } from "@/lib/format";
import type { Ingredient, Product } from "@/lib/types";

type RecipeRow = {
  ingredient_id: string;
  quantity_required: string;
  unit: Unit;
  wastage_percentage: string;
};

type RecipeJoined = {
  product_id: string;
  ingredient_id: string;
  quantity_required: number;
  unit: Unit;
  wastage_percentage: number;
};

export default function RecipesClient() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeJoined[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ingredientById = useMemo(() => {
    const m: Record<string, Ingredient> = {};
    ingredients.forEach((i) => (m[i.id] = i));
    return m;
  }, [ingredients]);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, i, r] = await Promise.all([
      supabase.from("products").select("*").order("product_name"),
      supabase.from("ingredients").select("*").eq("active_status", true).order("ingredient_name"),
      supabase.from("recipes").select("product_id,ingredient_id,quantity_required,unit,wastage_percentage"),
    ]);
    if (p.error) setError(p.error.message);
    setProducts((p.data as Product[]) ?? []);
    setIngredients((i.data as Ingredient[]) ?? []);
    setRecipes((r.data as RecipeJoined[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const recipesFor = useCallback(
    (productId: string) => recipes.filter((r) => r.product_id === productId),
    [recipes],
  );

  function estimatedCost(productId: string): number | null {
    return estimateRecipeCost(recipesFor(productId), ingredientById);
  }

  function startEdit(productId: string) {
    const existing = recipesFor(productId);
    setRows(
      existing.length > 0
        ? existing.map((r) => ({
            ingredient_id: r.ingredient_id,
            quantity_required: String(r.quantity_required),
            unit: r.unit,
            wastage_percentage: String(r.wastage_percentage),
          }))
        : [{ ingredient_id: "", quantity_required: "", unit: "g", wastage_percentage: "0" }],
    );
    setError(null);
    setEditing(productId);
  }

  function addRow() {
    setRows([...rows, { ingredient_id: "", quantity_required: "", unit: "g", wastage_percentage: "0" }]);
  }
  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }
  function setRow(idx: number, patch: Partial<RecipeRow>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function onPickIngredient(idx: number, ingredientId: string) {
    const ing = ingredientById[ingredientId];
    setRow(idx, { ingredient_id: ingredientId, unit: ing ? ing.base_unit : rows[idx].unit });
  }

  async function save() {
    setError(null);
    // Validate
    const clean = rows.filter((r) => r.ingredient_id && r.quantity_required.trim() !== "");
    if (clean.length === 0) {
      setError("Add at least one ingredient with a quantity.");
      return;
    }
    const seen = new Set<string>();
    for (const r of clean) {
      const ing = ingredientById[r.ingredient_id];
      const q = Number(r.quantity_required);
      const w = Number(r.wastage_percentage || "0");
      if (!(q > 0)) return setError("Quantity must be greater than 0.");
      if (w < 0 || w > 100) return setError("Wastage must be between 0 and 100%.");
      if (ing && !unitsCompatible(r.unit, ing.base_unit)) {
        return setError(`Unit ${r.unit} is incompatible with ${ing.ingredient_name} (base ${ing.base_unit}).`);
      }
      if (seen.has(r.ingredient_id)) {
        return setError(`Ingredient ${ing?.ingredient_name ?? ""} is listed more than once.`);
      }
      seen.add(r.ingredient_id);
    }

    setSaving(true);
    // Replace the product's recipe rows.
    const del = await supabase.from("recipes").delete().eq("product_id", editing);
    if (del.error) { setSaving(false); return setError(del.error.message); }
    const payload = clean.map((r) => ({
      product_id: editing,
      ingredient_id: r.ingredient_id,
      quantity_required: Number(r.quantity_required),
      unit: r.unit,
      wastage_percentage: Number(r.wastage_percentage || "0"),
    }));
    const ins = await supabase.from("recipes").insert(payload);
    setSaving(false);
    if (ins.error) return setError(ins.error.message);
    setEditing(null);
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Configure how each product is made. Quantities are per one finished product.
        </p>
      </div>

      {editing && (
        <div className="card space-y-4">
          <h2 className="font-semibold">
            Recipe · {products.find((p) => p.id === editing)?.product_name}
          </h2>
          <p className="text-xs text-neutral-500">Quantity required to make ONE finished product.</p>

          <div className="space-y-3">
            {rows.map((r, idx) => {
              const ing = ingredientById[r.ingredient_id];
              const bad = ing && !unitsCompatible(r.unit, ing.base_unit);
              return (
                <div key={idx} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 sm:col-span-5">
                    <label className="label">Ingredient</label>
                    <select className="input" value={r.ingredient_id}
                      onChange={(e) => onPickIngredient(idx, e.target.value)}>
                      <option value="">Select…</option>
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>{i.ingredient_name} ({i.base_unit})</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="label">Qty</label>
                    <input className="input" type="number" min="0" step="0.001" inputMode="decimal"
                      value={r.quantity_required}
                      onChange={(e) => setRow(idx, { quantity_required: e.target.value })} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="label">Unit</label>
                    <select className={`input ${bad ? "border-red-400" : ""}`} value={r.unit}
                      onChange={(e) => setRow(idx, { unit: e.target.value as Unit })}>
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="label">Wastage %</label>
                    <input className="input" type="number" min="0" max="100" step="0.01" inputMode="decimal"
                      value={r.wastage_percentage}
                      onChange={(e) => setRow(idx, { wastage_percentage: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    <button className="px-2 py-2 text-red-500" title="Remove" onClick={() => removeRow(idx)}>×</button>
                  </div>
                </div>
              );
            })}
          </div>

          <button className="btn-secondary" type="button" onClick={addRow}>+ Add ingredient</button>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-2">
            <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save recipe"}</button>
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : products.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">No products yet. Add products first.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Recipe</th>
                <th className="px-4 py-3">Ingredients</th>
                <th className="px-4 py-3">Estimated cost</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const rs = recipesFor(p.id);
                const configured = rs.length > 0;
                const cost = estimatedCost(p.id);
                return (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {p.product_name}
                      {p.sku && <span className="ml-2 text-xs text-neutral-400">{p.sku}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${configured ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {configured ? "Configured" : "Not configured"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{rs.length}</td>
                    <td className="px-4 py-3">
                      {!configured ? (
                        <span className="text-neutral-400">—</span>
                      ) : cost == null ? (
                        <span className="text-amber-600">Cost unavailable — missing ingredient cost</span>
                      ) : (
                        <span className="font-medium">{money(cost)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-sm font-semibold text-brand hover:underline" onClick={() => startEdit(p.id)}>
                        {configured ? "Edit" : "Configure"}
                      </button>
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
