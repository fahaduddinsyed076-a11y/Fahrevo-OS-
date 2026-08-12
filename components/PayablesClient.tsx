"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, dateShort } from "@/lib/format";
import type { ExpenseFinancial, PurchaseFinancial, Supplier } from "@/lib/types";

export default function PayablesClient() {
  const supabase = createClient();
  const [purchases, setPurchases] = useState<PurchaseFinancial[]>([]);
  const [expenses, setExpenses] = useState<ExpenseFinancial[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, e, s] = await Promise.all([
      supabase.from("purchase_financials").select("*").eq("status", "received").gt("payable", 0).order("purchase_date"),
      supabase.from("expense_financials").select("*").gt("payable", 0).order("expense_date"),
      supabase.from("suppliers").select("*"),
    ]);
    setPurchases((p.data as PurchaseFinancial[]) ?? []);
    setExpenses((e.data as ExpenseFinancial[]) ?? []);
    const m: Record<string, Supplier> = {};
    for (const su of (s.data as Supplier[]) ?? []) m[su.id] = su;
    setSuppliers(m);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const total = purchases.reduce((s, p) => s + Number(p.payable), 0) + expenses.reduce((s, e) => s + Number(e.payable), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Payables</h1>
        <p className="mt-1 text-sm text-neutral-500">Outstanding amounts owed, derived from purchases/expenses minus payments made.</p>
      </div>

      <div className="card inline-block"><div className="text-xs text-neutral-500">Total outstanding payable</div><div className="mt-1 text-2xl font-bold text-red-600">{money(total)}</div></div>

      {loading ? <p className="text-sm text-neutral-500">Loading…</p> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Party / category</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.purchase_id} className="border-b border-neutral-100">
                  <td className="px-4 py-3"><Link href={`/purchases/${p.purchase_id}`} className="font-medium text-brand hover:underline">{p.purchase_number}</Link></td>
                  <td className="px-4 py-3">{p.supplier_id && suppliers[p.supplier_id] ? suppliers[p.supplier_id].supplier_name : "Supplier —"}</td>
                  <td className="px-4 py-3 text-neutral-600">{dateShort(p.purchase_date)}</td>
                  <td className="px-4 py-3 text-right">{money(p.final_amount)}</td>
                  <td className="px-4 py-3 text-right">{money(p.amount_paid)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{money(p.payable)}</td>
                  <td className="px-4 py-3">{p.payment_status}</td>
                </tr>
              ))}
              {expenses.map((e) => (
                <tr key={e.expense_id} className="border-b border-neutral-100">
                  <td className="px-4 py-3"><Link href="/expenses" className="font-medium text-brand hover:underline">Expense</Link></td>
                  <td className="px-4 py-3">{e.category}</td>
                  <td className="px-4 py-3 text-neutral-600">{dateShort(e.expense_date)}</td>
                  <td className="px-4 py-3 text-right">{money(e.amount)}</td>
                  <td className="px-4 py-3 text-right">{money(e.amount_paid)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{money(e.payable)}</td>
                  <td className="px-4 py-3">{e.status}</td>
                </tr>
              ))}
              {purchases.length === 0 && expenses.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-neutral-500">No outstanding payables. 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-neutral-400">Due dates are shown only when explicitly configured (payment terms); none are invented.</p>
    </div>
  );
}
