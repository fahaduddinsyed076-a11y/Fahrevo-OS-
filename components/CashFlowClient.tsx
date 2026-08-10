"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_METHODS } from "@/lib/constants";
import { money } from "@/lib/format";
import type { AppSettings } from "@/lib/types";

type PayRow = { direction: string; payment_method: string; amount: number };

export default function CashFlowClient() {
  const supabase = createClient();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pays, setPays] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id", true).single(),
      supabase.from("payments").select("direction,payment_method,amount"),
    ]);
    setSettings((s.data as AppSettings) ?? null);
    setPays((p.data as PayRow[]) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  const openingOf = (m: string): number | null => {
    if (!settings) return null;
    if (m === "Cash") return settings.opening_cash;
    if (m === "Bank") return settings.opening_bank;
    if (m === "UPI") return settings.opening_upi;
    return settings.opening_other;
  };
  const sum = (dir: string, m: string) => pays.filter((p) => p.direction === dir && p.payment_method === m).reduce((s, p) => s + Number(p.amount), 0);

  const anyConfigured = PAYMENT_METHODS.some((m) => openingOf(m) != null);
  let totalBalance = 0; let totalKnown = true;

  const rows = PAYMENT_METHODS.map((m) => {
    const opening = openingOf(m);
    const receipts = sum("received", m);
    const payments = sum("paid", m);
    const balance = opening == null ? null : opening + receipts - payments;
    if (balance == null) totalKnown = false; else totalBalance += balance;
    return { m, opening, receipts, payments, balance };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Cash flow</h1>
        <p className="mt-1 text-sm text-neutral-500">Balance = opening + actual receipts − actual payments. Cash is not profit.</p>
      </div>

      {!anyConfigured && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Opening balances not configured. <Link href="/settings" className="font-semibold underline">Configure them in Settings →</Link>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Opening</th><th className="px-4 py-3 text-right">Receipts</th><th className="px-4 py-3 text-right">Payments</th><th className="px-4 py-3 text-right">Balance</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium">{r.m}</td>
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
              <td className="px-4 py-3 text-right">{totalKnown ? money(totalBalance) : <span className="text-amber-600">partial</span>}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
