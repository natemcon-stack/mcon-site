"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";

function NewContact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", source: "referral", notes: "", additional_emails: [] });
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    // Drop blank rows and duplicates before they reach the database.
    const seen = new Set();
    const payload = {
      ...form,
      additional_emails: (form.additional_emails || [])
        .map((a) => (a || "").trim())
        .filter((a) => {
          if (!a) return false;
          const key = a.toLowerCase();
          if (key === (form.email || "").trim().toLowerCase()) return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
    };

    const { error } = await supabase.from("contacts").insert([payload]);
    setSaving(false);
    if (!error) router.push("/contacts");
  }

  const inputClass = "w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-steel";
  const labelClass = "block text-xs font-display uppercase tracking-wide text-ink/60 mb-1";

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-5">New Contact</h1>
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

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
                <button type="button"
                  onClick={() => setForm({ ...form, additional_emails: (form.additional_emails || []).filter((_, n) => n !== i) })}
                  className="text-ink/30 hover:text-accent-dark px-2" aria-label="Remove this address">✕</button>
              </div>
            ))}

            <button type="button"
              onClick={() => setForm({ ...form, additional_emails: [...(form.additional_emails || []), ""] })}
              className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark mt-2">
              + Add another email
            </button>
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Source</label>
            <select className={inputClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="referral">Referral</option>
              <option value="website">Website</option>
              <option value="permit_lead">Permit lead</option>
              <option value="repeat">Repeat customer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-2.5 rounded disabled:opacity-50">
            {saving ? "Saving..." : "Add contact"}
          </button>
        </form>
      </main>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <NewContact />
    </AuthGate>
  );
}
