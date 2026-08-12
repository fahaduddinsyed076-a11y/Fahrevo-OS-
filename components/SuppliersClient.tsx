"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "@/lib/types";

export default function SuppliersClient() {
  const supabase = createClient();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ supplier_name: "", phone: "", email: "", address: "", payment_terms: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("suppliers").select("*").order("supplier_name");
    setRows((data as Supplier[]) ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.supplier_name.trim()) { setError("Supplier name is required."); return; }
    const { error } = await supabase.from("suppliers").insert({
      supplier_name: form.supplier_name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null,
      address: form.address.trim() || null, payment_terms: form.payment_terms.trim() || null, notes: form.notes.trim() || null,
    });
    if (error) { setError(error.message); return; }
    setShow(false); setForm({ supplier_name: "", phone: "", email: "", address: "", payment_terms: "", notes: "" }); load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <button className="btn" onClick={() => setShow(!show)}>+ New supplier</button>
      </div>
      {show && (
        <div className="card grid gap-4 sm:grid-cols-2">
          <div><label className="label">Name *</label><input className="input" value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Payment terms</label><input className="input" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><button className="btn" onClick={save}>Save</button><button className="btn-secondary" onClick={() => setShow(false)}>Cancel</button></div>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        {loading ? <p className="p-6 text-sm text-neutral-500">Loading…</p>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-neutral-500">No suppliers yet.</p>
          : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium"><Link href={`/suppliers/${s.id}`} className="text-brand hover:underline">{s.supplier_name}</Link></td>
                    <td className="px-4 py-3 text-neutral-600">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-600">{s.payment_terms ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`badge ${s.active_status ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>{s.active_status ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
