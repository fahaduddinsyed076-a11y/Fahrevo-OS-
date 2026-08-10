"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppSettings } from "@/lib/types";

function numOrNull(v: string): number | null {
  const t = v.trim();
  return t === "" ? null : Number(t);
}

export default function SettingsClient() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    business_name: "", opening_cash: "", opening_bank: "", opening_upi: "", opening_other: "",
    opening_balance_date: "", categories: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("app_settings").select("*").eq("id", true).single();
    const s = data as AppSettings | null;
    if (s) {
      setF({
        business_name: s.business_name ?? "",
        opening_cash: s.opening_cash?.toString() ?? "",
        opening_bank: s.opening_bank?.toString() ?? "",
        opening_upi: s.opening_upi?.toString() ?? "",
        opening_other: s.opening_other?.toString() ?? "",
        opening_balance_date: s.opening_balance_date ?? "",
        categories: (s.expense_categories ?? []).join(", "),
      });
    }
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setError(null); setSaved(false);
    const cats = f.categories.split(",").map((c) => c.trim()).filter(Boolean);
    const { error } = await supabase.from("app_settings").update({
      business_name: f.business_name.trim() || null,
      opening_cash: numOrNull(f.opening_cash),
      opening_bank: numOrNull(f.opening_bank),
      opening_upi: numOrNull(f.opening_upi),
      opening_other: numOrNull(f.opening_other),
      opening_balance_date: f.opening_balance_date || null,
      expense_categories: cats.length ? cats : null,
    }).eq("id", true);
    if (error) { setError(error.message); return; }
    setSaved(true); load();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">Configure business info and opening balances. Leave a balance blank to keep it unconfigured — nothing is assumed.</p>
      </div>

      <div className="card grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Business name</label><input className="input" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} /></div>
        <div><label className="label">Opening cash</label><input className="input" type="number" step="0.01" value={f.opening_cash} onChange={(e) => setF({ ...f, opening_cash: e.target.value })} placeholder="not configured" /></div>
        <div><label className="label">Opening bank</label><input className="input" type="number" step="0.01" value={f.opening_bank} onChange={(e) => setF({ ...f, opening_bank: e.target.value })} placeholder="not configured" /></div>
        <div><label className="label">Opening UPI</label><input className="input" type="number" step="0.01" value={f.opening_upi} onChange={(e) => setF({ ...f, opening_upi: e.target.value })} placeholder="not configured" /></div>
        <div><label className="label">Opening other</label><input className="input" type="number" step="0.01" value={f.opening_other} onChange={(e) => setF({ ...f, opening_other: e.target.value })} placeholder="not configured" /></div>
        <div><label className="label">Opening balance date</label><input className="input" type="date" value={f.opening_balance_date} onChange={(e) => setF({ ...f, opening_balance_date: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">Expense categories (comma separated)</label><input className="input" value={f.categories} onChange={(e) => setF({ ...f, categories: e.target.value })} /></div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
        Tax rates and platform commissions are entered manually per transaction and are never assumed (no GST/commission automation).
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Settings saved.</p>}
      <button className="btn" onClick={save}>Save settings</button>
    </div>
  );
}
