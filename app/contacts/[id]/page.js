"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";

function EditContact() {
  const { id } = useParams();
  const router = useRouter();
  const { isAdmin } = useProfile();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("contacts").select("*").eq("id", id).single().then(({ data }) => setForm(data));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { id: _id, created_at, external_ref, ...updates } = form;

    // Drop empty rows left behind by "Add another email" and any address typed twice,
    // so blanks don't reach the send paths.
    const seen = new Set();
    updates.additional_emails = (updates.additional_emails || [])
      .map((a) => (a || "").trim())
      .filter((a) => {
        if (!a) return false;
        const key = a.toLowerCase();
        if (key === (updates.email || "").trim().toLowerCase()) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const { error } = await supabase.from("contacts").update(updates).eq("id", id);
    setSaving(false);
    if (!error) router.push("/contacts");
  }

  async function handleDelete() {
    if (!confirm(`Delete ${form.name}? This can't be undone. Jobs linked to this contact will keep their history but lose the contact link.`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (!error) router.push("/contacts");
    else alert(error.message);
  }

  const inputClass = "w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-steel";
  const labelClass = "block text-xs font-display uppercase tracking-wide text-ink/60 mb-1";

  if (!form) {
    return <><Nav /><main className="max-w-lg mx-auto px-4 py-6 text-ink/40 text-sm">Loading...</main></>;
  }

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-5">Edit Contact</h1>
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input required className={inputClass} value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />

            {/* Extra addresses. Some clients are a couple who both want the invoice,
                or an office manager alongside the owner. Everything the CRM sends —
                estimates, invoices, reminders, review requests — goes to all of them. */}
            {(form.additional_emails || []).map((addr, i) => (
              <div key={i} className="flex gap-2 mt-2">
                <input
                  type="email"
                  className={inputClass}
                  placeholder="Another email address"
                  value={addr}
                  onChange={(e) => {
                    const next = [...(form.additional_emails || [])];
                    next[i] = e.target.value;
                    setForm({ ...form, additional_emails: next });
                  }}
                />
                <button
                  type="button"
                  onClick={() => setForm({
                    ...form,
                    additional_emails: (form.additional_emails || []).filter((_, n) => n !== i),
                  })}
                  className="text-ink/30 hover:text-accent-dark px-2"
                  aria-label="Remove this address"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setForm({
                ...form,
                additional_emails: [...(form.additional_emails || []), ""],
              })}
              className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark mt-2"
            >
              + Add another email
            </button>

            {(form.additional_emails || []).filter((e) => e.trim()).length > 0 && (
              <p className="text-xs text-ink/40 mt-1.5">
                Everything we send this client goes to all of these addresses.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <div className="flex gap-2">
              <input className={inputClass} value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {form.phone && (
                <>
                  <a href={`tel:${form.phone}`} className="shrink-0 border border-border rounded px-3 py-2 text-steel">Call</a>
                  <a href={`sms:${form.phone}`} className="shrink-0 border border-border rounded px-3 py-2 text-steel">Text</a>
                </>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass}>Address line 1</label>
            <input className={inputClass} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
          </div>
          <div>
            <label className={labelClass}>Address line 2 (optional)</label>
            <input className={inputClass} value={form.address_line2 || ""} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} placeholder="Unit, suite, etc." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>City</label>
              <input className={inputClass} value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={brand.defaultCity} />
            </div>
            <div>
              <label className={labelClass}>Province</label>
              <input className={inputClass} value={form.province || "BC"} onChange={(e) => setForm({ ...form, province: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={labelClass}>Postal code</label>
              <input className={inputClass} value={form.postal_code || ""} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="V8A 0C6" />
            </div>
            {form.address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent([form.address, form.city, form.province, form.postal_code].filter(Boolean).join(", "))}`}
                target="_blank" rel="noreferrer" className="shrink-0 border border-border rounded px-3 py-2 text-steel">
                Map
              </a>
            )}
          </div>
          <div>
            <label className={labelClass}>Source</label>
            <select className={inputClass} value={form.source || "referral"} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="referral">Referral</option>
              <option value="website">Website</option>
              <option value="permit_lead">Permit lead</option>
              <option value="repeat">Repeat customer</option>
              <option value="joist_import">Joist import</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea rows={3} className={inputClass} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-2.5 rounded disabled:opacity-50">
            {saving ? "Saving..." : "Save changes"}
          </button>
          {isAdmin && (
            <button type="button" onClick={handleDelete}
              className="w-full text-accent-dark border border-accent-dark/40 font-display uppercase tracking-wide py-2.5 rounded hover:bg-accent/5">
              Delete contact
            </button>
          )}
        </form>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><EditContact /></AuthGate>;
}
