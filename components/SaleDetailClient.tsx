"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_METHODS } from "@/lib/constants";
import { money, qty, dateShort } from "@/lib/format";
import type { Customer, SaleFinancial } from "@/lib/types";

type SaleRow = {
  id: string; sale_number: string; sale_date: string; status: string;
  sales_channel: string; order_type: string | null; customer_id: string | null;
  subtotal: number; discount: number; tax: number; final_amount: number;
  payment_status: string; notes: string | null; void_reason: string | null;
};
type Item = { id: string; quantity: number; unit_price: number; discount: number; final_line_amount: number; products: { product_name: string } | null };
type Pay = { id: string; payment_number: string; payment_date: string; amount: number; payment_method: string; notes: string | null };
type Inv = { id: string; transaction_type: string; quantity: number; unit: string; reference_type: string | null; line_cost: number | null; ingredients: { ingredient_name: string } | null };

function friendly(msg: string): string {
  if (msg.includes("NO_RECIPE:")) return `Recipe not configured for ${msg.split("NO_RECIPE:")[1]?.trim()}.`;
  if (msg.includes("INSUFFICIENT_STOCK:")) return "Insufficient stock: " + msg.split("INSUFFICIENT_STOCK:")[1]?.trim();
  return msg;
}

export default function SaleDetailClient({ saleId }: { saleId: string }) {
  const supabase = createClient();
  const router = useRouter();

  const [sale, setSale] = useState<SaleRow | null>(null);
  const [fin, setFin] = useState<SaleFinancial | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [confAmount, setConfAmount] = useState("0");
  const [confMethod, setConfMethod] = useState("Cash");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [voidReason, setVoidReason] = useState("");
  const [showVoid, setShowVoid] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, f, it, pm, iv] = await Promise.all([
      supabase.from("sales").select("id,sale_number,sale_date,status,sales_channel,order_type,customer_id,subtotal,discount,tax,final_amount,payment_status,notes,void_reason").eq("id", saleId).single(),
      supabase.from("sale_financials").select("*").eq("sale_id", saleId).single(),
      supabase.from("sale_items").select("id,quantity,unit_price,discount,final_line_amount,products(product_name)").eq("sale_id", saleId),
      supabase.from("payments").select("id,payment_number,payment_date,amount,payment_method,notes").eq("sale_id", saleId).order("payment_date"),
      supabase.from("inventory_transactions").select("id,transaction_type,quantity,unit,reference_type,line_cost,ingredients(ingredient_name)").eq("reference_id", saleId).in("reference_type", ["sale", "sale_void"]),
    ]);
    if (s.error) { setError(s.error.message); setLoading(false); return; }
    const srow = s.data as SaleRow;
    setSale(srow);
    setFin((f.data as SaleFinancial) ?? null);
    setItems((it.data as unknown as Item[]) ?? []);
    setPays((pm.data as Pay[]) ?? []);
    setInv((iv.data as unknown as Inv[]) ?? []);
    if (srow.customer_id) {
      const c = await supabase.from("customers").select("id,customer_name,customer_type,active_status").eq("id", srow.customer_id).single();
      setCustomer((c.data as Customer) ?? null);
    } else setCustomer(null);
    setLoading(false);
  }, [supabase, saleId]);

  useEffect(() => { load(); }, [load]);

  async function doConfirm() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("confirm_sale", {
      p_sale_id: saleId,
      p_amount_received: Number(confAmount) || 0,
      p_payment_method: (Number(confAmount) || 0) > 0 ? confMethod : null,
      p_payment_date: sale?.sale_date,
    });
    setBusy(false);
    if (error) { setError(friendly(error.message)); return; }
    load();
  }
  async function doDeleteDraft() {
    if (!confirm("Delete this draft sale? Drafts have no financial impact.")) return;
    setBusy(true);
    const { error } = await supabase.from("sales").delete().eq("id", saleId);
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push("/sales");
  }
  async function doPayment() {
    if (!(Number(payAmount) > 0)) { setError("Enter a payment amount greater than 0."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.from("payments").insert({
      direction: "received", amount: Number(payAmount), payment_method: payMethod, sale_id: saleId,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setPayAmount("");
    load();
  }
  async function doVoid() {
    setBusy(true); setError(null);
    const { error } = await supabase.rpc("void_sale", { p_sale_id: saleId, p_reason: voidReason.trim() || null });
    setBusy(false);
    if (error) { setError(friendly(error.message)); return; }
    setShowVoid(false);
    load();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!sale) return <p className="text-sm text-red-600">{error ?? "Sale not found."}</p>;

  const consumed = inv.filter((t) => t.reference_type === "sale" && t.transaction_type === "sale_consumption");
  const cogs = fin?.cogs ?? null;
  const grossProfit = cogs != null && fin ? fin.final_amount - cogs : null;
  const custType = customer ? customer.customer_type : sale.sales_channel === "B2B" ? "B2B" : "B2C";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{sale.sale_number}</h1>
            <span className={`badge ${sale.status === "confirmed" ? "bg-green-100 text-green-700" : sale.status === "voided" ? "bg-red-100 text-red-600" : "bg-neutral-200 text-neutral-700"}`}>
              {sale.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">{dateShort(sale.sale_date)} · {sale.sales_channel} · {custType}</p>
        </div>
        <Link href="/sales" className="text-sm font-semibold text-neutral-500 hover:underline">← All sales</Link>
      </div>

      {sale.status === "voided" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          This sale is voided and excluded from revenue, receivables and inventory. Original records are preserved for audit.
          {sale.void_reason && <> Reason: <b>{sale.void_reason}</b>.</>}
        </div>
      )}
      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Parties */}
      <div className="card grid gap-3 text-sm sm:grid-cols-4">
        <div><div className="label">Customer</div>{customer ? customer.customer_name : "Walk-in"}</div>
        <div><div className="label">Type</div>{custType}</div>
        <div><div className="label">Channel</div>{sale.sales_channel}</div>
        <div><div className="label">Order type</div>{sale.order_type ?? "—"}</div>
      </div>

      {/* Items */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium">{it.products?.product_name ?? "—"}</td>
                <td className="px-4 py-3 text-right">{qty(it.quantity)}</td>
                <td className="px-4 py-3 text-right">{money(it.unit_price)}</td>
                <td className="px-4 py-3 text-right">{money(it.discount)}</td>
                <td className="px-4 py-3 text-right font-medium">{money(it.final_line_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Money summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{money(sale.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Discount</span><span>− {money(sale.discount)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Tax</span><span>+ {money(sale.tax)}</span></div>
          <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-bold"><span>Final amount</span><span>{money(sale.final_amount)}</span></div>
          <div className="flex justify-between pt-2"><span className="text-neutral-500">Amount received</span><span>{money(fin?.amount_received ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Receivable</span><span className={fin && fin.receivable > 0 && sale.status === "confirmed" ? "font-semibold text-red-600" : ""}>{sale.status === "confirmed" ? money(fin?.receivable ?? 0) : "—"}</span></div>
        </div>
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Payment status</span><span className="font-semibold">{sale.payment_status}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">COGS</span><span>{cogs == null ? <span className="text-amber-600">Unavailable</span> : money(cogs)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Gross profit</span><span>{grossProfit == null ? <span className="text-amber-600">Unavailable</span> : money(grossProfit)}</span></div>
          {cogs == null && sale.status === "confirmed" && (
            <p className="pt-1 text-xs text-amber-600">COGS needs every consumed ingredient to have a recorded cost.</p>
          )}
        </div>
      </div>

      {/* Inventory consumed */}
      {consumed.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Inventory consumed</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {consumed.map((t) => (
              <span key={t.id} className="rounded-lg bg-neutral-100 px-3 py-1">
                {t.ingredients?.ingredient_name}: <b>{qty(Math.abs(t.quantity))} {t.unit}</b>
                {t.line_cost != null && <span className="text-neutral-500"> · {money(t.line_cost)}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Payments */}
      {pays.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Payments received</h2>
          <div className="space-y-1 text-sm">
            {pays.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="text-neutral-600">{p.payment_number} · {dateShort(p.payment_date)} · {p.payment_method}</span>
                <span className="font-medium">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {sale.status === "draft" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Confirm this draft</h2>
          <p className="text-sm text-neutral-500">Validates recipes & stock, consumes inventory, and records the sale atomically.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Amount received now (optional)</label>
              <input className="input" type="number" min="0" step="0.01" value={confAmount} onChange={(e) => setConfAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Payment method</label>
              <select className="input" value={confMethod} onChange={(e) => setConfMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={doConfirm} disabled={busy}>{busy ? "Working…" : "Confirm sale"}</button>
            <button className="btn-secondary" onClick={doDeleteDraft} disabled={busy}>Delete draft</button>
          </div>
        </div>
      )}

      {sale.status === "confirmed" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-3">
            <h2 className="font-semibold">Record a payment</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Amount</label>
                <input className="input" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="label">Method</label>
                <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <button className="btn" onClick={doPayment} disabled={busy}>Record payment</button>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold">Void this sale</h2>
            <p className="text-sm text-neutral-500">Reverses inventory consumption and excludes it from revenue & receivables. The original is preserved.</p>
            {!showVoid ? (
              <button className="btn-secondary" onClick={() => setShowVoid(true)}>Void sale…</button>
            ) : (
              <div className="space-y-2">
                <input className="input" placeholder="Reason (optional)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn" style={{ background: "#c0392b" }} onClick={doVoid} disabled={busy}>Confirm void</button>
                  <button className="btn-secondary" onClick={() => setShowVoid(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
