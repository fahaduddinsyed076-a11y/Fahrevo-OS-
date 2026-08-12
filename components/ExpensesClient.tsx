"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_METHODS, DEFAULT_EXPENSE_CATEGORIES } from "@/lib/constants";
import { money, dateShort } from "@/lib/format";
import type { ExpenseFinancial } from "@/lib/types";

const PAY_STYLE: Record<string, string> = {
  Unpaid: "bg-red-100 text-red-600", Partial: "bg-amber-100 text-amber-700", Paid: "bg-green-100 text-green-700",
};

export default function ExpensesClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<ExpenseFinancial[]>([]);
  const [categories, setCategories] = useState<string[]>([...DEFAULT_EXPENSE_CATEGORIES]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payNow, setPayNow] = useState(true);
  const [method, setMethod] = useState("Cash");

  const [payFor, setPayFor] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState(""); const [payMethod, setPayMethod] = useState("Cash");

  const load = useCallback(async () => {
    setLoading(true);
    const [e, s] = await Promise.all([
      supabase.from("expense_financials").select("*").order("expense_date", { ascending: false }).limit(500),
      supabase.from("app_settings").select("expense_categories").eq("id", true).single(),
    ]);
    setRows((e.data as ExpenseFinancial[]) ?? []);
    const cats = (s.data as { expense_categories: string[] } | null)?.expense_categories;
    if (cats && cats.length) { setCategories(cats); setCategory(cats[0]); }
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!(Number(amount) > 0)) { setError("Enter an amount greater than 0."); return; }
    setBusy(true); setError(null);
    const { data, error } = await supabase.from("expenses").insert({
      expense_date: date, category, description: description.trim() || null, amount: Number(amount), payment_method: payNow ? method : null,
    }).select("id").single();
    if (error) { setBusy(false); setError(error.message); return; }
    if (payNow) {
      const { error: e2 } = await supabase.from("payments").insert({ direction: "paid", amount: Number(amount), payment_method: method, expense_id: (data as { id: string }).id });
      if (e2) { setBusy(false); setError(e2.message); return; }
    }
    setBusy(false); setShow(false); setDescription(""); setAmount("");
    load();
  }

  async function recordPayment(expenseId: string) {
    if (!(Number(payAmt) > 0)) { setError("Enter an amount > 0."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from("payments").insert({ direction: "paid", amount: Number(payAmt), payment_method: payMethod, expense_id: expenseId });
    setBusy(false); if (error) { setError(error.message); return; }
    setPayFor(null); setPayAmt(""); load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="mt-1 text-sm text-neutral-500">Operating expenses only — ingredient purchases are inventory, not expenses.</p>
        </div>
        <button className="btn" onClick={() => setShow(!show)}>+ New expense</button>
      </div>

      {show && (
        <div className="card grid gap-4 sm:grid-cols-2">
          <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div className="sm:col-span-2"><label className="label">Description</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><label className="label">Amount</label><input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label className="label">Payment method</label><select className="input" value={method} onChange={(e) => setMethod(e.target.value)} disabled={!payNow}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} /> Paid now (records a cash-out payment)</label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save expense"}</button><button className="btn-secondary" onClick={() => setShow(false)}>Cancel</button></div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        {loading ? <p className="p-6 text-sm text-neutral-500">Loading…</p>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-neutral-500">No expenses yet.</p>
          : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Payable</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.expense_id}>
                    <tr className="border-b border-neutral-100">
                      <td className="px-4 py-3 text-neutral-600">{dateShort(r.expense_date)}</td>
                      <td className="px-4 py-3">{r.category}</td>
                      <td className="px-4 py-3 text-neutral-600">{r.description ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{money(r.amount)}</td>
                      <td className="px-4 py-3 text-right">{money(r.payable)}</td>
                      <td className="px-4 py-3"><span className={`badge ${PAY_STYLE[r.status]}`}>{r.status}</span></td>
                      <td className="px-4 py-3 text-right">{r.payable > 0 && <button className="text-sm font-semibold text-brand hover:underline" onClick={() => { setPayFor(payFor === r.expense_id ? null : r.expense_id); setPayAmt(String(r.payable)); }}>Pay</button>}</td>
                    </tr>
                    {payFor === r.expense_id && (
                      <tr className="border-b border-neutral-100 bg-neutral-50"><td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <div><label className="label">Amount</label><input className="input w-32" type="number" min="0" step="0.01" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></div>
                          <div><label className="label">Method</label><select className="input w-28" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
                          <button className="btn" onClick={() => recordPayment(r.expense_id)} disabled={busy}>Record</button>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
