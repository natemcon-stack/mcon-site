"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";
import { geocodeAddress } from "@/lib/geocode";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

export default function NewJobPage() {
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", address: "" });
  const [savingContact, setSavingContact] = useState(false);

  const [form, setForm] = useState({
    title: "",
    job_number: "",
    address: "",
    address_line2: "",
    city: brand.defaultCity,
    province: "BC",
    postal_code: "",
    status: "estimate",
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [coords, setCoords] = useState(null); // { lat, lng } once located/adjusted
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.from("contacts").select("id, name, email").order("name").then(({ data }) => setContacts(data || []));
  }, []);

  async function saveNewContact(e) {
    e.preventDefault();
    if (!newContact.name) return;
    setSavingContact(true);
    const { data: created, error } = await supabase.from("contacts").insert([newContact]).select().single();
    setSavingContact(false);
    if (!error && created) {
      setContacts((c) => [...c, { id: created.id, name: created.name, email: created.email }]);
      setSelectedContact(created);
      setContactPickerOpen(false);
      setShowNewContactForm(false);
      setNewContact({ name: "", email: "", phone: "", address: "" });
    }
  }

  const filteredContacts = contacts.filter((c) => c.name.toLowerCase().includes(contactSearch.toLowerCase()));

  async function locateAddress() {
    if (!form.address.trim()) return;
    setLocating(true);
    const result = await geocodeAddress(form.address, form.city, form.province);
    setLocating(false);
    if (result) setCoords(result);
    else alert("Couldn't find that address automatically — you can still drop the pin manually below.");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase
      .from("jobs")
      .insert([{
        ...form,
        contact_id: selectedContact?.id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      }])
      .select()
      .single();
    setSaving(false);
    if (!error) router.push(`/jobs/${data.id}`);
  }

  const inputClass = "w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-steel";
  const labelClass = "block text-xs font-display uppercase tracking-wide text-ink/60 mb-1";

  return (
    <AuthGate>
      <Nav />
      <main className="max-w-lg mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-5">New Job</h1>
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className={labelClass}>Job title</label>
            <input required className={inputClass} value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Smith kitchen remodel" />
          </div>
          <div>
            <label className={labelClass}>Job number / reference</label>
            <input className={inputClass} value={form.job_number}
              onChange={(e) => setForm({ ...form, job_number: e.target.value })} placeholder="2026-014" />
          </div>

          <div className="relative">
            <label className={labelClass}>Contact</label>
            <button type="button" onClick={() => setContactPickerOpen((v) => !v)}
              className={`${inputClass} text-left flex justify-between items-center`}>
              <span>{selectedContact?.name || "— none —"}</span>
              <span className="text-xs text-steel">{selectedContact ? "Change" : "Select"}</span>
            </button>

            {contactPickerOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg z-40 p-3">
                <input
                  autoFocus
                  placeholder="Search clients..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="w-full border border-border rounded px-3 py-2 mb-2"
                />
                <div className="max-h-48 overflow-y-auto divide-y divide-border mb-2">
                  <button type="button" onClick={() => { setSelectedContact(null); setContactPickerOpen(false); }}
                    className="w-full text-left px-2 py-2 text-sm hover:bg-paper text-ink/50">
                    — none —
                  </button>
                  {filteredContacts.map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => { setSelectedContact(c); setContactPickerOpen(false); setContactSearch(""); }}
                      className="w-full text-left px-2 py-2 text-sm hover:bg-paper">
                      {c.name} {c.email && <span className="text-ink/40 text-xs">· {c.email}</span>}
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <div className="px-2 py-3 text-center text-ink/40 text-sm">No matching clients.</div>
                  )}
                </div>

                {!showNewContactForm ? (
                  <button type="button" onClick={() => setShowNewContactForm(true)}
                    className="w-full text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3 py-2">
                    + New client
                  </button>
                ) : (
                  <div className="space-y-2 border-t border-border pt-2">
                    <input required placeholder="Name" value={newContact.name}
                      onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                      className="w-full border border-border rounded px-2 py-1.5 text-sm" />
                    <input placeholder="Email" value={newContact.email}
                      onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                      className="w-full border border-border rounded px-2 py-1.5 text-sm" />
                    <input placeholder="Phone" value={newContact.phone}
                      onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                      className="w-full border border-border rounded px-2 py-1.5 text-sm" />
                    <input placeholder="Address" value={newContact.address}
                      onChange={(e) => setNewContact({ ...newContact, address: e.target.value })}
                      className="w-full border border-border rounded px-2 py-1.5 text-sm" />
                    <button type="button" onClick={saveNewContact} disabled={savingContact}
                      className="w-full bg-accent hover:bg-accent-dark text-white text-xs font-display uppercase tracking-wide rounded px-3 py-2 disabled:opacity-50">
                      {savingContact ? "Saving..." : "Create & use this client"}
                    </button>
                  </div>
                )}
                <button type="button" onClick={() => setContactPickerOpen(false)}
                  className="w-full text-xs text-ink/40 mt-2">Close</button>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Job site address</label>
            <input className={inputClass} value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
          </div>
          <div>
            <label className={labelClass}>Address line 2 (optional)</label>
            <input className={inputClass} value={form.address_line2}
              onChange={(e) => setForm({ ...form, address_line2: e.target.value })} placeholder="Unit, suite, etc." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>City</label>
              <input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Province</label>
              <input className={inputClass} value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Postal code</label>
              <input className={inputClass} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </div>
          </div>
          <div>
            <button type="button" onClick={locateAddress} disabled={locating || !form.address.trim()}
              className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3 py-2 disabled:opacity-50">
              {locating ? "Locating..." : "Find on map"}
            </button>
            {coords && (
              <div className="mt-2">
                <p className="text-xs text-ink/40 mb-1">Drag the pin (or tap the map) if this isn't quite right:</p>
                <LocationPicker lat={coords.lat} lng={coords.lng} onChange={(lat, lng) => setCoords({ lat, lng })} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start date</label>
              <input type="date" className={inputClass} value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>End date (est.)</label>
              <input type="date" className={inputClass} value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-ink/40 -mt-2">Dates shown on the shared Google Calendar feed.</p>
          <div>
            <label className={labelClass}>Status</label>
            <select className={inputClass} value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="estimate">Estimate</option>
              <option value="active">Active</option>
              <option value="complete">Complete</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass} rows={3} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-2.5 rounded disabled:opacity-50">
            {saving ? "Saving..." : "Create job"}
          </button>
        </form>
      </main>
    </AuthGate>
  );
}
