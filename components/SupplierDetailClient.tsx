"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { money, dateShort } from "@/lib/format";
import type { PurchaseFinancial, Supplier } from "@/lib/types";

type Pay = { id: string; payment_number: string; payment_date: string; amount: number; payment_method: string; purchase_id: string | null };

export default function SupplierDetailClient({ supplierId }: { supplierId: string }) {
  const supabase = createClient();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<PurchaseFinancial[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p] = await Promise.all([
      supabase.from("suppliers").select("*").eq("id", supplierId).single(),
      supabase.from("purchase_financials").select("*").eq("supplier_id", supplierId).order("purchase_date", { ascending: false }),
    ]);
    setSupplier((s.data as Supplier) ?? null);
    const purs = (p.data as PurchaseFinancial[]) ?? [];
    setPurchases(purs);
    const ids = purs.map((x) => x.purchase_id);
    if (ids.length) {
      const { data } = await supabase.from("payments").select("id,payment_number,payment_date,amount,payment_method,purchase_id").in("purchase_id", ids).order("payment_date", { ascending: false });
      setPays((data as Pay[]) ?? []);
    } else setPays([]);
    setLoading(false);
  }, [supabase, supplierId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!supplier) return <p className="text-sm text-red-600">Supplier not found.</p>;

  const active = purchases.filter((p) => p.status === "received");
  const totalPurchases = active.reduce((s, p) => s + Number(p.final_amount), 0);
  const totalPaid = active.reduce((s, p) => s + Number(p.amount_paid), 0);
  const outstanding = active.reduce((s, p) => s + Number(p.payable), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{supplier.supplier_name}</h1>
        <Link href="/suppliers" className="text-sm font-semibold text-neutral-500 hover:underline">← All suppliers</Link>
      </div>

      <div className="card grid gap-3 text-sm sm:grid-cols-4">
        <div><div className="label">Phone</div>{supplier.phone ?? "—"}</div>
        <div><div className="label">Email</div>{supplier.email ?? "—"}</div>
        <div><div className="label">Terms</div>{supplier.payment_terms ?? "—"}</div>
        <div><div className="label">Address</div>{supplier.address ?? "—"}</div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="text-xs text-neutral-500">Total purchases</div><div className="mt-1 text-xl font-bold">{money(totalPurchases)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Total paid</div><div className="mt-1 text-xl font-bold">{money(totalPaid)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500">Outstanding payable</div><div className="mt-1 text-xl font-bold text-red-600">{money(outstanding)}</div></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent purchases</h2>
        {purchases.length === 0 ? <p className="p-6 text-sm text-neutral-500">No purchases.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Payable</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>{purchases.slice(0, 15).map((p) => (
              <tr key={p.purchase_id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2"><Link href={`/purchases/${p.purchase_id}`} className="text-brand hover:underline">{p.purchase_number}</Link></td>
                <td className="px-4 py-2 text-neutral-600">{dateShort(p.purchase_date)}</td>
                <td className="px-4 py-2 text-right">{money(p.final_amount)}</td>
                <td className="px-4 py-2 text-right">{p.status === "received" ? money(p.payable) : "—"}</td>
                <td className="px-4 py-2">{p.status}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {pays.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent payments</h2>
          {pays.slice(0, 15).map((p) => <div key={p.id} className="flex justify-between text-sm"><span className="text-neutral-600">{p.payment_number} · {dateShort(p.payment_date)} · {p.payment_method}</span><span className="font-medium">{money(p.amount)}</span></div>)}
        </div>
      )}
    </div>
  );
}
