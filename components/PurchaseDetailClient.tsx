"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_METHODS } from "@/lib/constants";
import { money, qty, dateShort } from "@/lib/format";
import type { PurchaseFinancial, Supplier } from "@/lib/types";

type Row = { id: string; purchase_number: string; purchase_date: string; status: string; supplier_id: string | null; subtotal: number; tax: number; final_amount: number; payment_status: string; notes: string | null; void_reason: string | null };
type Item = { id: string; quantity: number; unit: string; unit_cost: number; total_cost: number; ingredients: { ingredient_name: string } | null };
type Pay = { id: string; payment_number: string; payment_date: string; amount: number; payment_method: string };

export default function PurchaseDetailClient({ purchaseId }: { purchaseId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [row, setRow] = useState<Row | null>(null);
  const [fin, setFin] = useState<PurchaseFinancial | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amt, setAmt] = useState("0"); const [method, setMethod] = useState("Cash");
  const [payAmt, setPayAmt] = useState(""); const [payMethod, setPayMethod] = useState("Cash");
  const [showVoid, setShowVoid] = useState(false); const [voidReason, setVoidReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [p, f, it, pm] = await Promise.all([
      supabase.from("purchases").select("id,purchase_number,purchase_date,status,supplier_id,subtotal,tax,final_amount,payment_status,notes,void_reason").eq("id", purchaseId).single(),
      supabase.from("purchase_financials").select("*").eq("purchase_id", purchaseId).single(),
      supabase.from("purchase_items").select("id,quantity,unit,unit_cost,total_cost,ingredients(ingredient_name)").eq("purchase_id", purchaseId),
      supabase.from("payments").select("id,payment_number,payment_date,amount,payment_method").eq("purchase_id", purchaseId).order("payment_date"),
    ]);
    if (p.error) { setError(p.error.message); setLoading(false); return; }
    const r = p.data as Row; setRow(r);
    setFin((f.data as PurchaseFinancial) ?? null);
    setItems((it.data as unknown as Item[]) ?? []);
    setPays((pm.data as Pay[]) ?? []);
    if (r.supplier_id) { const s = await supabase.from("suppliers").select("*").eq("id", r.supplier_id).single(); setSupplier((s.data as Supplier) ?? null); }
    else setSupplier(null);
    setLoading(false);
  }, [supabase, purchaseId]);
  useEffect(() => { load(); }, [load]);

  async function doReceive() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("confirm_purchase", { p_purchase_id: purchaseId, p_amount_paid: Number(amt) || 0, p_method: (Number(amt) || 0) > 0 ? method : null, p_date: row?.purchase_date });
    setBusy(false); if (error) { setError(error.message); return; } load();
  }
  async function doDelete() {
    if (!confirm("Delete this draft purchase?")) return;
    setBusy(true); const { error } = await supabase.from("purchases").delete().eq("id", purchaseId); setBusy(false);
    if (error) { setError(error.message); return; } router.push("/purchases");
  }
  async function doPay() {
    if (!(Number(payAmt) > 0)) { setError("Enter an amount > 0."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from("payments").insert({ direction: "paid", amount: Number(payAmt), payment_method: payMethod, purchase_id: purchaseId });
    setBusy(false); if (error) { setError(error.message); return; } setPayAmt(""); load();
  }
  async function doVoid() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("void_purchase", { p_purchase_id: purchaseId, p_reason: voidReason.trim() || null });
    setBusy(false); if (error) { setError(error.message); return; } setShowVoid(false); load();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!row) return <p className="text-sm text-red-600">{error ?? "Not found."}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{row.purchase_number}</h1>
          <span className={`badge ${row.status === "received" ? "bg-green-100 text-green-700" : row.status === "void" ? "bg-red-100 text-red-600" : "bg-neutral-200 text-neutral-700"}`}>{row.status}</span>
        </div>
        <Link href="/purchases" className="text-sm font-semibold text-neutral-500 hover:underline">← All purchases</Link>
      </div>

      {row.status === "void" && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">Voided — inventory receipt reversed. {row.void_reason && <>Reason: <b>{row.void_reason}</b></>}</div>}
      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card grid gap-3 text-sm sm:grid-cols-3">
        <div><div className="label">Supplier</div>{supplier ? supplier.supplier_name : "—"}</div>
        <div><div className="label">Date</div>{dateShort(row.purchase_date)}</div>
        <div><div className="label">Notes</div>{row.notes ?? "—"}</div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr><th className="px-4 py-3">Ingredient</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3 text-right">Unit cost</th><th className="px-4 py-3 text-right">Line total</th></tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium">{it.ingredients?.ingredient_name ?? "—"}</td>
                <td className="px-4 py-3 text-right">{qty(it.quantity)}</td>
                <td className="px-4 py-3">{it.unit}</td>
                <td className="px-4 py-3 text-right">{money(it.unit_cost)}</td>
                <td className="px-4 py-3 text-right font-medium">{money(it.total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card space-y-1 text-sm sm:w-1/2">
        <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{money(row.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Tax</span><span>+ {money(row.tax)}</span></div>
        <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-bold"><span>Final amount</span><span>{money(row.final_amount)}</span></div>
        <div className="flex justify-between pt-2"><span className="text-neutral-500">Amount paid</span><span>{money(fin?.amount_paid ?? 0)}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Payable</span><span className={fin && fin.payable > 0 && row.status === "received" ? "font-semibold text-red-600" : ""}>{row.status === "received" ? money(fin?.payable ?? 0) : "—"}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Payment status</span><span className="font-semibold">{row.payment_status}</span></div>
      </div>

      {pays.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Payments made</h2>
          {pays.map((p) => <div key={p.id} className="flex justify-between text-sm"><span className="text-neutral-600">{p.payment_number} · {dateShort(p.payment_date)} · {p.payment_method}</span><span className="font-medium">{money(p.amount)}</span></div>)}
        </div>
      )}

      {row.status === "draft" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Receive this purchase</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Amount paid now (optional)</label><input className="input" type="number" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
            <div><label className="label">Method</label><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
          </div>
          <div className="flex gap-2"><button className="btn" onClick={doReceive} disabled={busy}>{busy ? "Working…" : "Receive"}</button><button className="btn-secondary" onClick={doDelete} disabled={busy}>Delete draft</button></div>
        </div>
      )}

      {row.status === "received" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-3">
            <h2 className="font-semibold">Record a payment (made)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Amount</label><input className="input" type="number" min="0" step="0.01" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></div>
              <div><label className="label">Method</label><select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
            </div>
            <button className="btn" onClick={doPay} disabled={busy}>Record payment</button>
          </div>
          <div className="card space-y-3">
            <h2 className="font-semibold">Void this purchase</h2>
            <p className="text-sm text-neutral-500">Reverses the inventory receipt. Original is preserved.</p>
            {!showVoid ? <button className="btn-secondary" onClick={() => setShowVoid(true)}>Void purchase…</button>
              : <div className="space-y-2"><input className="input" placeholder="Reason (optional)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} /><div className="flex gap-2"><button className="btn" style={{ background: "#c0392b" }} onClick={doVoid} disabled={busy}>Confirm void</button><button className="btn-secondary" onClick={() => setShowVoid(false)}>Cancel</button></div></div>}
          </div>
        </div>
      )}
    </div>
  );
}
