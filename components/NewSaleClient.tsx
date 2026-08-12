"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  SALES_CHANNELS, CUSTOMER_TYPES, PAYMENT_METHODS,
  type CustomerType,
} from "@/lib/constants";
import { money } from "@/lib/format";
import type { Customer, Product } from "@/lib/types";

type Line = {
  product_id: string;
  quantity: string;
  unit_price: string;
  discount: string;
};

const emptyLine: Line = { product_id: "", quantity: "1", unit_price: "", discount: "0" };

function friendlyError(msg: string): string {
  if (msg.includes("NO_RECIPE:")) {
    const name = msg.split("NO_RECIPE:")[1]?.trim();
    return `Recipe not configured for ${name}. Configure its recipe before confirming — inventory cannot be automatically consumed.`;
  }
  if (msg.includes("INSUFFICIENT_STOCK:")) {
    return "Insufficient stock: " + msg.split("INSUFFICIENT_STOCK:")[1]?.trim() +
      ". Resolve it via a stock adjustment, then confirm.";
  }
  return msg;
}

export default function NewSaleClient() {
  const supabase = createClient();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recipeProductIds, setRecipeProductIds] = useState<Set<string>>(new Set());

  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState("");
  const [customerType, setCustomerType] = useState<CustomerType>("B2C");
  const [channel, setChannel] = useState<string>("Direct");
  const [orderType, setOrderType] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [amountReceived, setAmountReceived] = useState("0");
  const [payMethod, setPayMethod] = useState<string>("Cash");

  const [error, setError] = useState<string | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick-add customer
  const [showAddCust, setShowAddCust] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustType, setNewCustType] = useState<CustomerType>("B2C");

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach((p) => (m[p.id] = p));
    return m;
  }, [products]);

  const load = useCallback(async () => {
    const [p, c, r] = await Promise.all([
      supabase.from("products").select("*").eq("active_status", true).order("product_name"),
      supabase.from("customers").select("id,customer_name,customer_type,active_status").eq("active_status", true).order("customer_name"),
      supabase.from("recipes").select("product_id"),
    ]);
    setProducts((p.data as Product[]) ?? []);
    setCustomers((c.data as Customer[]) ?? []);
    setRecipeProductIds(new Set(((r.data as { product_id: string }[]) ?? []).map((x) => x.product_id)));
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Price for the current customer type; null if that specific price is unset.
  function priceFor(p: Product | undefined, type: CustomerType): number | null {
    if (!p) return null;
    return type === "B2B" ? p.b2b_price : p.b2c_price;
  }

  function autofillLinePrice(idx: number, productId: string, type: CustomerType) {
    const price = priceFor(productById[productId], type);
    setLines((prev) => prev.map((l, i) =>
      i === idx ? { ...l, product_id: productId, unit_price: price != null ? String(price) : "" } : l));
  }

  function onCustomerChange(id: string) {
    setCustomerId(id);
    const cust = customers.find((c) => c.id === id);
    if (cust) {
      setCustomerType(cust.customer_type);
      applyCustomerType(cust.customer_type);
    }
  }
  function onChannelChange(ch: string) {
    setChannel(ch);
    if (!customerId) {
      const t: CustomerType = ch === "B2B" ? "B2B" : "B2C";
      setCustomerType(t);
      applyCustomerType(t);
    }
  }
  function applyCustomerType(type: CustomerType) {
    setLines((prev) => prev.map((l) => {
      if (!l.product_id) return l;
      const price = priceFor(productById[l.product_id], type);
      return { ...l, unit_price: price != null ? String(price) : "" };
    }));
  }

  function setLine(idx: number, patch: Partial<Line>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines([...lines, { ...emptyLine }]); }
  function removeLine(idx: number) {
    setLines(lines.length > 1 ? lines.filter((_, i) => i !== idx) : lines);
  }

  const lineTotals = lines.map((l) =>
    Math.max((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) - (Number(l.discount) || 0), 0));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const finalAmount = Math.max(subtotal - (Number(discount) || 0) + (Number(tax) || 0), 0);

  const missingRecipe = lines
    .filter((l) => l.product_id && !recipeProductIds.has(l.product_id))
    .map((l) => productById[l.product_id]?.product_name)
    .filter(Boolean);

  async function addCustomer() {
    if (!newCustName.trim()) return;
    const { data, error } = await supabase.from("customers")
      .insert({ customer_name: newCustName.trim(), customer_type: newCustType, phone: newCustPhone.trim() || null })
      .select("id,customer_name,customer_type,active_status").single();
    if (error) { setError(error.message); return; }
    const c = data as Customer;
    setCustomers((prev) => [...prev, c].sort((a, b) => a.customer_name.localeCompare(b.customer_name)));
    setShowAddCust(false);
    setNewCustName("");
    setNewCustPhone("");
    onCustomerChange(c.id);
  }

  function validate(): string | null {
    const clean = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (clean.length === 0) return "Add at least one product with a quantity.";
    for (const l of clean) {
      if (l.unit_price.trim() === "" || Number.isNaN(Number(l.unit_price)))
        return `Enter a unit price for ${productById[l.product_id]?.product_name}. Prices are never assumed.`;
      if (Number(l.unit_price) < 0) return "Unit price cannot be negative.";
    }
    return null;
  }

  async function createDraft(): Promise<string | null> {
    const clean = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    const { data: sale, error: e1 } = await supabase.from("sales").insert({
      sale_date: saleDate,
      customer_id: customerId || null,
      sales_channel: channel,
      order_type: orderType.trim() || null,
      discount: Number(discount) || 0,
      tax: Number(tax) || 0,
      notes: notes.trim() || null,
    }).select("id").single();
    if (e1) { setError(e1.message); return null; }
    const saleId = (sale as { id: string }).id;
    const items = clean.map((l) => ({
      sale_id: saleId,
      product_id: l.product_id,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      discount: Number(l.discount) || 0,
    }));
    const { error: e2 } = await supabase.from("sale_items").insert(items);
    if (e2) {
      await supabase.from("sales").delete().eq("id", saleId);
      setError(e2.message);
      return null;
    }
    return saleId;
  }

  async function onSaveDraft() {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true); setError(null); setSavedDraftId(null);
    const id = await createDraft();
    setBusy(false);
    if (id) router.push(`/sales/${id}`);
  }

  async function onConfirm() {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true); setError(null); setSavedDraftId(null);
    const id = await createDraft();
    if (!id) { setBusy(false); return; }
    const { error } = await supabase.rpc("confirm_sale", {
      p_sale_id: id,
      p_amount_received: Number(amountReceived) || 0,
      p_payment_method: (Number(amountReceived) || 0) > 0 ? payMethod : null,
      p_payment_date: saleDate,
    });
    setBusy(false);
    if (error) {
      // The sale is saved as a draft; keep it so the user can resolve & confirm.
      setSavedDraftId(id);
      setError(friendlyError(error.message));
      return;
    }
    router.push(`/sales/${id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New sale</h1>
        <Link href="/sales" className="text-sm font-semibold text-neutral-500 hover:underline">← All sales</Link>
      </div>

      {/* Header */}
      <div className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Sale date</label>
          <input className="input" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Channel</label>
          <select className="input" value={channel} onChange={(e) => onChannelChange(e.target.value)}>
            {SALES_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Customer</label>
          <div className="flex gap-2">
            <select className="input" value={customerId} onChange={(e) => onCustomerChange(e.target.value)}>
              <option value="">Walk-in / none</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_name} ({c.customer_type})</option>)}
            </select>
            <button className="btn-secondary shrink-0" type="button" onClick={() => setShowAddCust(!showAddCust)}>+ New</button>
          </div>
          {showAddCust && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="input" placeholder="Customer name" value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)} />
              <input className="input" type="tel" placeholder="Contact number (optional)" value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)} />
              <select className="input w-28" value={newCustType} onChange={(e) => setNewCustType(e.target.value as CustomerType)}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button className="btn shrink-0" type="button" onClick={addCustomer}>Add</button>
            </div>
          )}
        </div>
        <div>
          <label className="label">Customer type</label>
          <select className="input" value={customerType}
            onChange={(e) => { const t = e.target.value as CustomerType; setCustomerType(t); applyCustomerType(t); }}>
            {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Order type (optional)</label>
          <input className="input" value={orderType} onChange={(e) => setOrderType(e.target.value)}
            placeholder="e.g. Delivery, Pickup" />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Line items */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Products</h2>
          <span className="text-sm text-neutral-500">Prices from {customerType} price · editable</span>
        </div>
        {lines.map((l, idx) => {
          const p = productById[l.product_id];
          const priceMissing = l.product_id && priceFor(p, customerType) == null;
          const noRecipe = l.product_id && !recipeProductIds.has(l.product_id);
          const lt = lineTotals[idx];
          return (
            <div key={idx} className="rounded-lg border border-neutral-200 p-3">
              <div className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <label className="label">Product</label>
                  <select className="input" value={l.product_id}
                    onChange={(e) => autofillLinePrice(idx, e.target.value, customerType)}>
                    <option value="">Select…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.product_name}</option>)}
                  </select>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="label">Qty</label>
                  <input className="input" type="number" min="0" step="0.001" inputMode="decimal"
                    value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="label">Unit price</label>
                  <input className={`input ${priceMissing ? "border-amber-400" : ""}`} type="number" min="0" step="0.01"
                    inputMode="decimal" value={l.unit_price}
                    onChange={(e) => setLine(idx, { unit_price: e.target.value })} placeholder="Set price" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="label">Line disc.</label>
                  <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
                    value={l.discount} onChange={(e) => setLine(idx, { discount: e.target.value })} />
                </div>
                <div className="col-span-1 text-right">
                  <button className="px-2 py-2 text-red-500" title="Remove" onClick={() => removeLine(idx)}>×</button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-neutral-500">Line total: <b className="text-neutral-800">{money(lt)}</b></span>
                {priceMissing && <span className="text-amber-600">No {customerType} price set — enter one.</span>}
                {noRecipe && <span className="text-amber-600">⚠ No recipe — cannot auto-consume inventory.</span>}
              </div>
            </div>
          );
        })}
        <button className="btn-secondary" type="button" onClick={addLine}>+ Add product</button>
      </div>

      {/* Totals + payment */}
      <div className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Sale discount</label>
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
            value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div>
          <label className="label">Tax (entered, never assumed)</label>
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
            value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>
        <div>
          <label className="label">Amount received now (optional)</label>
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
            value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
        </div>
        <div>
          <label className="label">Payment method</label>
          <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 space-y-1 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Discount</span><span>− {money(Number(discount) || 0)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Tax</span><span>+ {money(Number(tax) || 0)}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Final amount</span><span>{money(finalAmount)}</span></div>
        </div>
      </div>

      {missingRecipe.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ These products have no recipe and cannot be confirmed until configured: <b>{missingRecipe.join(", ")}</b>.
          You can still save the sale as a draft.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          {savedDraftId && (
            <> {" "}<Link href={`/sales/${savedDraftId}`} className="font-semibold underline">Open the saved draft →</Link></>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button className="btn" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : "Confirm sale"}
        </button>
        <button className="btn-secondary" onClick={onSaveDraft} disabled={busy}>Save as draft</button>
      </div>
      <p className="text-xs text-neutral-400">
        Confirming validates recipes and stock, consumes inventory, and records the sale atomically.
      </p>
    </div>
  );
}
