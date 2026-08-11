"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeCapital, type PaymentForCapital } from "@/lib/capital";
import { money } from "@/lib/format";
import type { AppSettings } from "@/lib/types";

function numOrNull(v: string): number | null {
  const t = v.trim();
  return t === "" ? null : Number(t);
}

export default function CashFlowClient() {
  const supabase = createClient();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pays, setPays] = useState<PaymentForCapital[]>([]);
  const [loading, setLoading] = useState(true);

  const [showEdit, setShowEdit] = useState(false);
  const [f, setF] = useState({ opening_cash: "", opening_bank: "", opening_upi: "", opening_other: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id", true).single(),
      supabase.from("payments").select("direction,payment_method,amount"),
    ]);
    const st = (s.data as AppSettings) ?? null;
    setSettings(st);
    setPays((p.data as PaymentForCapital[]) ?? []);
    setF({
      opening_cash: st?.opening_cash?.toString() ?? "",
      opening_bank: st?.opening_bank?.toString() ?? "",
      opening_upi: st?.opening_upi?.toString() ?? "",
      opening_other: st?.opening_other?.toString() ?? "",
    });
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function saveOpening() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("app_settings").update({
      opening_cash: numOrNull(f.opening_cash),
      opening_bank: numOrNull(f.opening_bank),
      opening_upi: numOrNull(f.opening_upi),
      opening_other: numOrNull(f.opening_other),
    }).eq("id", true);
    setSaving(false);
    if (error) { setError(error.message); return; }
    setShowEdit(false);
    load();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  const capital = computeCapital(settings, pays);
  const bankRow = capital.rows.find((r) => r.method === "Bank");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Cash flow</h1>
        <p className="mt-1 text-sm text-neutral-500">Balance = opening + actual receipts − actual payments. Cash is not profit.</p>
      </div>

      {!capital.anyConfigured && !showEdit && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Opening balances not configured.{" "}
          <button className="font-semibold underline" onClick={() => setShowEdit(true)}>Set them now →</button>
        </div>
      )}

      {/* Prominent Available Capital + Bank balance */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card bg-brand-light">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">Available capital</div>
          <div className="mt-1 text-3xl font-bold text-brand-dark">
            {capital.totalKnown ? money(capital.totalBalance) : money(capital.totalBalance) + "*"}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {capital.totalKnown
              ? "Opening balance + payments received − payments made, across all methods."
              : "* Some methods have no opening balance configured — total is partial."}
          </div>
        </div>
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Bank account balance</div>
          <div className="mt-1 text-3xl font-bold">{bankRow?.balance == null ? "Not configured" : money(bankRow.balance)}</div>
          <div className="mt-1 text-xs text-neutral-500">
            {bankRow?.opening == null ? "Set an opening bank balance to track this." : `Opening ${money(bankRow.opening)}`}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-secondary" onClick={() => setShowEdit(!showEdit)}>
          {showEdit ? "Cancel" : "Set opening balances"}
        </button>
      </div>

      {showEdit && (
        <div className="card grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Opening cash</label>
            <input className="input" type="number" step="0.01" value={f.opening_cash}
              onChange={(e) => setF({ ...f, opening_cash: e.target.value })} placeholder="not configured" />
          </div>
          <div>
            <label className="label">Opening bank</label>
            <input className="input" type="number" step="0.01" value={f.opening_bank}
              onChange={(e) => setF({ ...f, opening_bank: e.target.value })} placeholder="not configured" />
          </div>
          <div>
            <label className="label">Opening UPI</label>
            <input className="input" type="number" step="0.01" value={f.opening_upi}
              onChange={(e) => setF({ ...f, opening_upi: e.target.value })} placeholder="not configured" />
          </div>
          <div>
            <label className="label">Opening other</label>
            <input className="input" type="number" step="0.01" value={f.opening_other}
              onChange={(e) => setF({ ...f, opening_other: e.target.value })} placeholder="not configured" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button className="btn" onClick={saveOpening} disabled={saving}>{saving ? "Saving…" : "Save opening balances"}</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Opening</th><th className="px-4 py-3 text-right">Receipts</th><th className="px-4 py-3 text-right">Payments</th><th className="px-4 py-3 text-right">Balance</th></tr>
          </thead>
          <tbody>
            {capital.rows.map((r) => (
              <tr key={r.method} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium">{r.method}</td>
                <td className="px-4 py-3 text-right">{r.opening == null ? <span className="text-amber-600">not configured</span> : money(r.opening)}</td>
                <td className="px-4 py-3 text-right text-green-700">+ {money(r.receipts)}</td>
                <td className="px-4 py-3 text-right text-red-600">− {money(r.payments)}</td>
                <td className="px-4 py-3 text-right font-semibold">{r.balance == null ? "—" : money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 font-bold">
              <td className="px-4 py-3">Total</td><td /><td /><td />
              <td className="px-4 py-3 text-right">{capital.totalKnown ? money(capital.totalBalance) : <span className="text-amber-600">partial</span>}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
