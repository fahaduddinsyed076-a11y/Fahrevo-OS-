"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CUSTOMER_TYPES, type CustomerType } from "@/lib/constants";
import type { Customer } from "@/lib/types";

export default function CustomersClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ customer_name: "", customer_type: "B2C" as CustomerType, phone: "", email: "", address: "", payment_terms: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("customers").select("id,customer_name,customer_type,active_status").order("customer_name");
    setRows((data as Customer[]) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.customer_name.trim()) { setError("Customer name is required."); return; }
    const { error } = await supabase.from("customers").insert({
      customer_name: form.customer_name.trim(), customer_type: form.customer_type, phone: form.phone.trim() || null,
      email: form.email.trim() || null, address: form.address.trim() || null, payment_terms: form.payment_terms.trim() || null, notes: form.notes.trim() || null,
    });
    if (error) { setError(error.message); return; }
    setShow(false); setForm({ customer_name: "", customer_type: "B2C", phone: "", email: "", address: "", payment_terms: "", notes: "" }); load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button className="btn" onClick={() => setShow(!show)}>+ New customer</button>
      </div>
      {show && (
        <div className="card grid gap-4 sm:grid-cols-2">
          <div><label className="label">Name *</label><input className="input" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><label className="label">Type</label><select className="input" value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value as CustomerType })}>{CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Payment terms</label><input className="input" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><button className="btn" onClick={save}>Save</button><button className="btn-secondary" onClick={() => setShow(false)}>Cancel</button></div>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        {loading ? <p className="p-6 text-sm text-neutral-500">Loading…</p>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-neutral-500">No customers yet.</p>
          : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium"><Link href={`/customers/${c.id}`} className="text-brand hover:underline">{c.customer_name}</Link></td>
                    <td className="px-4 py-3">{c.customer_type}</td>
                    <td className="px-4 py-3"><span className={`badge ${c.active_status ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>{c.active_status ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
