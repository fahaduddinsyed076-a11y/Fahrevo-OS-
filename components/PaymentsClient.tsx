"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_METHODS } from "@/lib/constants";
import { money, dateShort } from "@/lib/format";
import type { ExpenseFinancial, PurchaseFinancial, SaleFinancial } from "@/lib/types";

type PaymentRow = {
  id: string; payment_number: string; payment_date: string; direction: string; amount: number; payment_method: string;
  sales: { sale_number: string } | null; purchases: { purchase_number: string } | null; expenses: { category: string } | null;
};

export default function PaymentsClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [sales, setSales] = useState<SaleFinancial[]>([]);
  const [purchases, setPurchases] = useState<PurchaseFinancial[]>([]);
  const [expenses, setExpenses] = useState<ExpenseFinancial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dir, setDir] = useState<"received" | "paid">("received");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, pu, ex] = await Promise.all([
      supabase.from("payments").select("id,payment_number,payment_date,direction,amount,payment_method,sales(sale_number),purchases(purchase_number),expenses(category)").order("payment_date", { ascending: false }).limit(200),
      supabase.from("sale_financials").select("*").eq("status", "confirmed").gt("receivable", 0),
      supabase.from("purchase_financials").select("*").eq("status", "received").gt("payable", 0),
      supabase.from("expense_financials").select("*").gt("payable", 0),
    ]);
    setRows((p.data as unknown as PaymentRow[]) ?? []);
    setSales((s.data as SaleFinancial[]) ?? []);
    setPurchases((pu.data as PurchaseFinancial[]) ?? []);
    setExpenses((ex.data as ExpenseFinancial[]) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function record() {
    setError(null);
    if (!target) { setError("Select what this payment is against."); return; }
    if (!(Number(amount) > 0)) { setError("Enter an amount greater than 0."); return; }
    const [kind, id] = target.split(":");
    const payload: Record<string, unknown> = { direction: dir, amount: Number(amount), payment_method: method };
    if (kind === "sale") payload.sale_id = id;
    else if (kind === "purchase") payload.purchase_id = id;
    else if (kind === "expense") payload.expense_id = id;
    setBusy(true);
    const { error } = await supabase.from("payments").insert(payload);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setAmount(""); setTarget("");
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="mt-1 text-sm text-neutral-500">Record money received (against sales) or paid (against purchases/expenses).</p>
      </div>

      <div className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Direction</label>
          <select className="input" value={dir} onChange={(e) => { setDir(e.target.value as "received" | "paid"); setTarget(""); }}>
            <option value="received">Payment received (from customer)</option>
            <option value="paid">Payment made (to supplier / expense)</option>
          </select>
        </div>
        <div>
          <label className="label">Against</label>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Select…</option>
            {dir === "received"
              ? sales.map((s) => <option key={s.sale_id} value={`sale:${s.sale_id}`}>{s.sale_number} · due {money(s.receivable)}</option>)
              : (
                <>
                  {purchases.map((p) => <option key={p.purchase_id} value={`purchase:${p.purchase_id}`}>{p.purchase_number} · due {money(p.payable)}</option>)}
                  {expenses.map((x) => <option key={x.expense_id} value={`expense:${x.expense_id}`}>Expense {x.category} · due {money(x.payable)}</option>)}
                </>
              )}
          </select>
        </div>
        <div><label className="label">Amount</label><input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label className="label">Method</label><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><button className="btn" onClick={record} disabled={busy}>{busy ? "Recording…" : "Record payment"}</button></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent payments</h2>
        {loading ? <p className="p-6 text-sm text-neutral-500">Loading…</p> : rows.length === 0 ? <p className="p-6 text-sm text-neutral-500">No payments yet.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Direction</th><th className="px-4 py-2">Reference</th><th className="px-4 py-2">Method</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2 text-neutral-600">{p.payment_number}</td>
                <td className="px-4 py-2 text-neutral-600">{dateShort(p.payment_date)}</td>
                <td className="px-4 py-2"><span className={`badge ${p.direction === "received" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{p.direction}</span></td>
                <td className="px-4 py-2">{p.sales?.sale_number ?? p.purchases?.purchase_number ?? (p.expenses ? `Expense · ${p.expenses.category}` : "—")}</td>
                <td className="px-4 py-2 text-neutral-600">{p.payment_method}</td>
                <td className={`px-4 py-2 text-right font-medium ${p.direction === "received" ? "text-green-700" : "text-red-600"}`}>{p.direction === "received" ? "+" : "−"} {money(p.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
