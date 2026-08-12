"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_OVERHEAD_CATEGORIES } from "@/lib/constants";
import { money } from "@/lib/format";
import type { Overhead } from "@/lib/types";

type FormState = { name: string; category: string; monthly_amount: string; notes: string };
const EMPTY: FormState = { name: "", category: DEFAULT_OVERHEAD_CATEGORIES[0], monthly_amount: "", notes: "" };

const CATEGORY_COLOR = [
  "bg-brand", "bg-emerald-500", "bg-amber-500", "bg-sky-500", "bg-violet-500", "bg-rose-500",
];

export default function OverheadsClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<Overhead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("overheads").select("*").order("category").order("name");
    if (error) setError(error.message);
    else setRows((data as Overhead[]) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => rows.filter((r) => r.active_status), [rows]);
  const monthlyTotal = useMemo(() => active.reduce((s, r) => s + Number(r.monthly_amount), 0), [active]);
  const annualTotal = monthlyTotal * 12;

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of active) m.set(r.category, (m.get(r.category) ?? 0) + Number(r.monthly_amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [active]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }
  function openEdit(o: Overhead) {
    setEditingId(o.id);
    setForm({ name: o.name, category: o.category, monthly_amount: String(o.monthly_amount), notes: o.notes ?? "" });
    setError(null);
    setShowForm(true);
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Name is required.";
    const amt = Number(form.monthly_amount);
    if (form.monthly_amount.trim() === "" || Number.isNaN(amt) || amt < 0) return "Monthly amount must be a number ≥ 0.";
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || "Misc",
      monthly_amount: Number(form.monthly_amount),
      notes: form.notes.trim() || null,
    };
    const res = editingId
      ? await supabase.from("overheads").update(payload).eq("id", editingId)
      : await supabase.from("overheads").insert(payload);
    setSaving(false);
    if (res.error) { setError(res.error.message); return; }
    setShowForm(false);
    load();
  }

  async function toggleActive(o: Overhead) {
    const { error } = await supabase.from("overheads").update({ active_status: !o.active_status }).eq("id", o.id);
    if (error) { setError(error.message); return; }
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overheads</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Recurring monthly fixed costs — rent, payroll, subscriptions. A planning layer only:
            adding one here does not create an expense or payment record.
          </p>
        </div>
        <button className="btn" onClick={openAdd}>+ Add overhead</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs font-medium text-neutral-500">Monthly overheads</div>
          <div className="mt-1 text-2xl font-bold">{money(monthlyTotal)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium text-neutral-500">Annual projection</div>
          <div className="mt-1 text-2xl font-bold">{money(annualTotal)}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium text-neutral-500">Active overheads</div>
          <div className="mt-1 text-2xl font-bold">{active.length}</div>
          <div className="text-xs text-neutral-400">{rows.length - active.length} inactive</div>
        </div>
      </div>

      {byCategory.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Breakdown by category</h2>
          <div className="space-y-3">
            {byCategory.map(([cat, amt], i) => (
              <div key={cat}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{cat}</span>
                  <span className="text-neutral-500">{money(amt)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${CATEGORY_COLOR[i % CATEGORY_COLOR.length]}`}
                    style={{ width: `${monthlyTotal > 0 ? (amt / monthlyTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="card space-y-4">
          <h2 className="font-semibold">{editingId ? "Edit overhead" : "New overhead"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input className="input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shop rent" required />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" list="overhead-categories" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <datalist id="overhead-categories">
                {DEFAULT_OVERHEAD_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Monthly amount</label>
              <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
                value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-2">
            <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button className="btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">No overheads yet. Add your first recurring cost.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Monthly</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{o.category}</td>
                  <td className="px-4 py-3 text-right">{money(o.monthly_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${o.active_status ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>
                      {o.active_status ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="mr-3 text-sm font-semibold text-brand hover:underline" onClick={() => openEdit(o)}>Edit</button>
                    <button className="text-sm font-semibold text-neutral-500 hover:underline" onClick={() => toggleActive(o)}>
                      {o.active_status ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
