"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, dateShort } from "@/lib/format";
import type { PurchaseFinancial, Supplier } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  received: "bg-green-100 text-green-700",
  void: "bg-red-100 text-red-600",
};
const PAY_STYLE: Record<string, string> = {
  Unpaid: "bg-red-100 text-red-600", Partial: "bg-amber-100 text-amber-700", Paid: "bg-green-100 text-green-700",
};

export default function PurchasesClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<PurchaseFinancial[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([
      supabase.from("purchase_financials").select("*").order("purchase_date", { ascending: false }).limit(500),
      supabase.from("suppliers").select("*"),
    ]);
    setRows((p.data as PurchaseFinancial[]) ?? []);
    const m: Record<string, Supplier> = {};
    for (const su of (s.data as Supplier[]) ?? []) m[su.id] = su;
    setSuppliers(m);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchases</h1>
          <p className="mt-1 text-sm text-neutral-500">Stock is received only when a purchase is confirmed.</p>
        </div>
        <Link href="/purchases/new" className="btn">+ New purchase</Link>
      </div>

      <div className="card overflow-x-auto p-0">
        {loading ? <p className="p-6 text-sm text-neutral-500">Loading…</p>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-neutral-500">No purchases yet.</p>
          : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Purchase #</th><th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Supplier</th><th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Payable</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.purchase_id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium"><Link href={`/purchases/${r.purchase_id}`} className="text-brand hover:underline">{r.purchase_number}</Link></td>
                    <td className="px-4 py-3 text-neutral-600">{dateShort(r.purchase_date)}</td>
                    <td className="px-4 py-3">{r.supplier_id && suppliers[r.supplier_id] ? suppliers[r.supplier_id].supplier_name : "—"}</td>
                    <td className="px-4 py-3 text-right">{money(r.final_amount)}</td>
                    <td className="px-4 py-3 text-right">{r.status === "received" ? money(r.payable) : "—"}</td>
                    <td className="px-4 py-3"><span className={`badge ${PAY_STYLE[r.payment_status]}`}>{r.payment_status}</span></td>
                    <td className="px-4 py-3"><span className={`badge ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
