"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { withDisplayTotals } from "@/lib/documentDisplayTotals";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";
import { brand, withBrandDefaults } from "@/lib/brand";
import { useProfile } from "@/lib/useProfile";
import { getCurrentPosition, geocodeAddress } from "@/lib/geocode";
import { getSignedUrl, getSignedUrls } from "@/lib/signedUrl";
import { makeThumbnail, thumbPathFor } from "@/lib/thumbnail";
import { generateWeeklyReportPdf } from "@/lib/generateWeeklyReportPdf";
import { safeDate } from "@/lib/safeFilter";
import DocumentAttachments from "@/components/DocumentAttachments";
import { createWorkOrderFromDocument } from "@/lib/workOrderFromDoc";
import { generateAndStoreInvoicePdf } from "@/lib/generateInvoicePdf";
import ComposeEmailModal from "@/components/ComposeEmailModal";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), { ssr: false });

const ALL_TABS = ["Overview", "Hours", "Mileage", "Expenses", "Photos", "Notes", "Work Orders", "Financials", "Weekly Report"];

export const TAX_CATEGORIES = [
  "Materials & supplies (COGS)",
  "Subcontractor costs",
  "Vehicle & fuel",
  "Tools (expensed, under $500)",
  "Equipment (capital / CCA)",
  "Insurance",
  "Permits & licenses",
  "Advertising & marketing",
  "Meals & entertainment",
  "Office & admin",
  "Other",
];

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function JobDetail() {
  const { id } = useParams();
  const { isAdmin, isManagement } = useProfile();
  const [job, setJob] = useState(null);
  const [tab, setTab] = useState("Overview");
  const TABS = isManagement ? ALL_TABS : ALL_TABS.filter((t) => t !== "Financials");

  const loadJob = useCallback(async () => {
    const { data } = await supabase.from("jobs").select("*, contacts(name, email, phone)").eq("id", id).single();
    setJob(data);
  }, [id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  if (!job) {
    return (
      <>
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-6 text-ink/40 font-mono text-sm">Loading job...</main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-5 no-print">
          <div className="font-mono text-xs text-ink/40">#{job.job_number}</div>
          <h1 className="font-display text-2xl font-semibold tracking-wide">{job.title}</h1>
          <p className="text-ink/60 text-sm">{job.contacts?.name} {job.address ? `· ${job.address}` : ""}</p>
        </div>

        <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto no-print">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 font-display text-sm uppercase tracking-wide whitespace-nowrap border-b-2 ${
                tab === t ? "border-accent text-ink" : "border-transparent text-ink/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Overview" && <Overview job={job} onUpdate={loadJob} isAdmin={isAdmin} isManagement={isManagement} />}
        {tab === "Hours" && <Hours jobId={id} />}
        {tab === "Mileage" && <Mileage jobId={id} />}
        {tab === "Expenses" && <Expenses jobId={id} />}
        {tab === "Photos" && <Photos jobId={id} />}
        {tab === "Notes" && <SiteNotes jobId={id} />}
        {tab === "Work Orders" && <WorkOrders jobId={id} />}
        {tab === "Financials" && isManagement && <Financials jobId={id} job={job} />}
        {tab === "Weekly Report" && <WeeklyReport jobId={id} job={job} />}
      </main>
    </>
  );
}

function Overview({ job, onUpdate, isAdmin, isManagement }) {
  const [status, setStatus] = useState(job.status);
  const [editingDetails, setEditingDetails] = useState(false);
  const [details, setDetails] = useState({
    title: job.title || "", job_number: job.job_number || "", address: job.address || "",
    address_line2: job.address_line2 || "", city: job.city || "", province: job.province || "BC", postal_code: job.postal_code || "",
    // Dates could only be set when the job was first created, so a job that got moved
    // — which is most of them — was stuck on whatever was guessed at the start, and
    // never appeared on the right day of the crew's week.
    start_date: job.start_date || "", end_date: job.end_date || "",
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const router = useRouter();

  async function saveDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    // An empty date field is "" from the input, which Postgres rejects for a date
    // column — send null instead so a date can be cleared as well as set.
    const patch = {
      ...details,
      start_date: details.start_date || null,
      end_date: details.end_date || null,
    };
    const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
    setSavingDetails(false);
    if (error) { alert("Couldn't save: " + error.message); return; }
    setEditingDetails(false);
    onUpdate();
  }

  async function updateStatus(e) {
    const val = e.target.value;
    setStatus(val);
    await supabase.from("jobs").update({ status: val }).eq("id", job.id);
    onUpdate();
  }
  async function toggleArchive() {
    const archiving = !job.archived_at;
    if (archiving && !confirm(`Archive "${job.title}"? It stays on file and can be brought back at any time.`)) return;
    const { error } = await supabase.from("jobs")
      .update({ archived_at: archiving ? new Date().toISOString() : null })
      .eq("id", job.id);
    if (error) alert(error.message);
    else onUpdate();
  }

  async function deleteJob() {
    if (!confirm(`Delete "${job.title}" and everything under it (hours, expenses, photos, estimates, invoices, work orders)? This can't be undone.`)) return;
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    if (error) alert(error.message);
    else router.push("/");
  }
  async function retryGeocode() {
    const coords = await geocodeAddress(job.address, job.city || brand.defaultCity, job.province || brand.defaultProvince);
    if (coords) {
      await supabase.from("jobs").update({ lat: coords.lat, lng: coords.lng }).eq("id", job.id);
      onUpdate();
    } else {
      alert("Couldn't find that address — try 'Use my current location' instead if you're on site.");
    }
  }
  async function useMyLocation() {
    const coords = await getCurrentPosition();
    if (coords) {
      await supabase.from("jobs").update({ lat: coords.lat, lng: coords.lng }).eq("id", job.id);
      onUpdate();
    } else {
      alert("Couldn't get your location — check location permission for this site.");
    }
  }
  async function saveLocation(lat, lng) {
    await supabase.from("jobs").update({ lat, lng }).eq("id", job.id);
    onUpdate();
  }
  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-3 max-w-md">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-display uppercase tracking-wide text-ink/60">Job details</label>
          {isAdmin && !editingDetails && (
            <button onClick={() => setEditingDetails(true)} className="text-xs text-steel hover:text-steel-dark">Edit</button>
          )}
        </div>
        {editingDetails ? (
          <form onSubmit={saveDetails} className="space-y-2 border border-border rounded-lg p-3">
            <input placeholder="Job title" value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })}
              className="w-full border border-border rounded px-2 py-1.5 text-sm" required />
            <input placeholder="Job number" value={details.job_number} onChange={(e) => setDetails({ ...details, job_number: e.target.value })}
              className="w-full border border-border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Address line 1" value={details.address} onChange={(e) => setDetails({ ...details, address: e.target.value })}
              className="w-full border border-border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Address line 2 (optional)" value={details.address_line2} onChange={(e) => setDetails({ ...details, address_line2: e.target.value })}
              className="w-full border border-border rounded px-2 py-1.5 text-sm" />
            <div className="grid grid-cols-3 gap-2">
              <input placeholder="City" value={details.city} onChange={(e) => setDetails({ ...details, city: e.target.value })}
                className="border border-border rounded px-2 py-1.5 text-sm" />
              <input placeholder="Province" value={details.province} onChange={(e) => setDetails({ ...details, province: e.target.value })}
                className="border border-border rounded px-2 py-1.5 text-sm" />
              <input placeholder="Postal code" value={details.postal_code} onChange={(e) => setDetails({ ...details, postal_code: e.target.value })}
                className="border border-border rounded px-2 py-1.5 text-sm" />
            </div>

            {/* What puts the job on the crew's week. Leaving these blank is fine — the
                job simply isn't scheduled yet. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">Starts</label>
                <input type="date" value={details.start_date}
                  onChange={(e) => setDetails({ ...details, start_date: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">Ends</label>
                <input type="date" value={details.end_date}
                  onChange={(e) => setDetails({ ...details, end_date: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-sm" />
              </div>
              <p className="col-span-2 text-[11px] text-ink/40">
                A job shows on every day between these two. Leave the end date blank for
                a one-day job.
              </p>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={savingDetails}
                className="flex-1 bg-accent hover:bg-accent-dark text-white text-xs font-display uppercase tracking-wide rounded px-3 py-2 disabled:opacity-50">
                {savingDetails ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={() => setEditingDetails(false)}
                className="text-xs text-ink/40 border border-border rounded px-3 py-2">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="text-sm">
            <div className="font-medium">{job.title}</div>
            {job.job_number && <div className="text-xs text-ink/40">#{job.job_number}</div>}
            {job.address && <div className="text-ink/60">{job.address}{job.address_line2 ? `, ${job.address_line2}` : ""}</div>}
            {(job.city || job.province || job.postal_code) && (
              <div className="text-ink/60">{[job.city, job.province, job.postal_code].filter(Boolean).join(", ")}</div>
            )}
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-display uppercase tracking-wide text-ink/60 mb-1">Status</label>
        <select value={status} onChange={updateStatus} className="border border-border rounded px-3 py-2">
          <option value="estimate">Estimate</option>
          <option value="active">Active</option>
          <option value="complete">Complete</option>
        </select>
      </div>
      {job.contacts && (
        <div className="text-sm">
          <div className="text-ink/40 font-display uppercase text-xs tracking-wide mb-1">Contact</div>
          <div>{job.contacts.name}</div>
          <div className="text-ink/60">{job.contacts.email} {job.contacts.phone}</div>
        </div>
      )}
      <div className="text-sm">
        <div className="text-ink/40 font-display uppercase text-xs tracking-wide mb-1">Map location</div>
        <div className="flex gap-2 mb-2 flex-wrap">
          <button onClick={retryGeocode} className="text-xs border border-border rounded px-2 py-1">Look up address</button>
          <button onClick={useMyLocation} className="text-xs border border-border rounded px-2 py-1">Use my current location</button>
          {job.lat && job.lng && (
            <a href={`https://www.openstreetmap.org/?mlat=${job.lat}&mlon=${job.lng}#map=16/${job.lat}/${job.lng}`}
              target="_blank" rel="noreferrer" className="text-xs border border-border rounded px-2 py-1 text-steel">
              Open full map →
            </a>
          )}
        </div>
        {job.lat && job.lng ? (
          <div>
            <p className="text-xs text-ink/40 mb-1">Drag the pin (or tap the map) if it's in the wrong spot:</p>
            <LocationPicker lat={job.lat} lng={job.lng} onChange={saveLocation} />
          </div>
        ) : (
          <p className="text-xs text-ink/40">No location set yet — look up the address or use your current location.</p>
        )}
      </div>
      {job.notes && (
        <div className="text-sm">
          <div className="text-ink/40 font-display uppercase text-xs tracking-wide mb-1">Notes</div>
          <div className="whitespace-pre-wrap">{job.notes}</div>
        </div>
      )}
      {/* Archiving is the foreman's version of getting a job out of the way — it's
          reversible and leaves the record intact. Deleting stays with the admin. */}
      {isManagement && (
        <button onClick={toggleArchive}
          className="w-full text-ink/60 border border-border font-display uppercase text-sm tracking-wide py-2 rounded hover:bg-paper mt-2">
          {job.archived_at ? "Unarchive job" : "Archive job"}
        </button>
      )}
      {isAdmin && (
        <button onClick={deleteJob}
          className="w-full text-accent-dark border border-accent-dark/40 font-display uppercase text-sm tracking-wide py-2 rounded hover:bg-accent/5 mt-2">
          Delete job
        </button>
      )}
    </div>
  );
}

function Hours({ jobId }) {
  const { isAdmin, profile } = useProfile();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ worker_name: "", date: "", hours: "", note: "" });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("job_hours").select("*").eq("job_id", jobId).order("date", { ascending: false });
    setRows(data || []);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // Pre-fill with whatever name is already on file for this person, so it's a
  // one-time thing to type — after that it's remembered automatically.
  useEffect(() => {
    if (profile?.full_name) setForm((f) => ({ ...f, worker_name: profile.full_name }));
  }, [profile]);

  async function add(e) {
    e.preventDefault();
    if (!form.worker_name || !form.date || !form.hours) return;
    await supabase.from("job_hours").insert([{ job_id: jobId, ...form, hours: Number(form.hours) }]);
    // If this is the first time (or they corrected it), remember it on their own
    // profile so it's auto-filled next time without retyping.
    if (profile && form.worker_name.trim() && form.worker_name.trim() !== profile.full_name) {
      await supabase.from("profiles").update({ full_name: form.worker_name.trim() }).eq("id", profile.id);
    }
    setForm((f) => ({ ...f, date: "", hours: "", note: "" }));
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this hours entry?")) return;
    await supabase.from("job_hours").delete().eq("id", id);
    load();
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditDraft({ worker_name: r.worker_name, date: r.date, hours: r.hours });
  }

  async function saveEdit(id) {
    const { error } = await supabase.from("job_hours").update({
      worker_name: editDraft.worker_name, date: editDraft.date, hours: Number(editDraft.hours),
    }).eq("id", id);
    if (error) { alert("Couldn't save: " + error.message); return; }
    setEditingId(null);
    load();
  }

  const total = rows.reduce((s, r) => s + Number(r.hours), 0);

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-surface border border-border rounded-lg p-4 grid sm:grid-cols-4 gap-2">
        <input placeholder="Worker name" className="border border-border rounded px-3 py-2 sm:col-span-1"
          value={form.worker_name} onChange={(e) => setForm({ ...form, worker_name: e.target.value })} />
        <input type="date" className="border border-border rounded px-3 py-2"
          value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="number" step="0.25" placeholder="Hours" className="border border-border rounded px-3 py-2"
          value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
        <button className="bg-steel hover:bg-steel-dark text-white rounded px-3 py-2 font-display uppercase text-sm">
          Log hours
        </button>
      </form>
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        <div className="px-4 py-2 flex justify-between text-sm font-display uppercase tracking-wide text-ink/50">
          <span>Entries</span><span>Total: {total} hrs</span>
        </div>
        {rows.map((r) => (
          editingId === r.id ? (
            <div key={r.id} className="px-4 py-2 grid sm:grid-cols-4 gap-2 items-center text-sm bg-paper">
              <input value={editDraft.worker_name} onChange={(e) => setEditDraft({ ...editDraft, worker_name: e.target.value })}
                className="border border-border rounded px-2 py-1" />
              <input type="date" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                className="border border-border rounded px-2 py-1" />
              <input type="number" step="0.25" value={editDraft.hours} onChange={(e) => setEditDraft({ ...editDraft, hours: e.target.value })}
                className="border border-border rounded px-2 py-1 font-mono" />
              <div className="flex gap-2">
                <button onClick={() => saveEdit(r.id)} className="text-xs text-success border border-success/40 rounded px-2 py-1">Save</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-ink/40 border border-border rounded px-2 py-1">Cancel</button>
              </div>
            </div>
          ) : (
            <div key={r.id} className="px-4 py-2 flex justify-between items-center text-sm">
              <span>{r.worker_name} — {r.date}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono">{r.hours} hrs</span>
                {isAdmin && (
                  <>
                    <button onClick={() => startEdit(r)} className="text-xs text-steel hover:text-steel-dark px-1">Edit</button>
                    <button onClick={() => remove(r.id)} className="text-ink/30 hover:text-accent-dark px-1">✕</button>
                  </>
                )}
              </span>
            </div>
          )
        ))}
        {rows.length === 0 && <div className="px-4 py-6 text-center text-ink/40 text-sm">No hours logged yet.</div>}
      </div>
    </div>
  );
}

function Mileage({ jobId }) {
  const { isAdmin } = useProfile();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ driver_name: "", date: "", km: "", purpose: "" });

  const load = useCallback(async () => {
    const { data } = await supabase.from("job_mileage").select("*").eq("job_id", jobId).order("date", { ascending: false });
    setRows(data || []);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!form.driver_name || !form.date || !form.km) return;
    await supabase.from("job_mileage").insert([{ job_id: jobId, ...form, km: Number(form.km) }]);
    setForm({ driver_name: "", date: "", km: "", purpose: "" });
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this mileage entry?")) return;
    await supabase.from("job_mileage").delete().eq("id", id);
    load();
  }

  const totalKm = rows.reduce((s, r) => s + Number(r.km), 0);
  // 2026 CRA reasonable per-km allowance: 73¢ for the first 5,000 km, 67¢ after — informational only.
  const estimatedReimbursement = totalKm <= 5000 ? totalKm * 0.73 : 5000 * 0.73 + (totalKm - 5000) * 0.67;

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-surface border border-border rounded-lg p-4 grid sm:grid-cols-5 gap-2">
        <input placeholder="Driver name" className="border border-border rounded px-3 py-2"
          value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
        <input type="date" className="border border-border rounded px-3 py-2"
          value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="number" step="0.1" placeholder="Kilometers" className="border border-border rounded px-3 py-2"
          value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} />
        <input placeholder="Purpose (optional)" className="border border-border rounded px-3 py-2"
          value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        <button className="bg-steel hover:bg-steel-dark text-white rounded px-3 py-2 font-display uppercase text-sm">
          Log km
        </button>
      </form>
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        <div className="px-4 py-2 flex justify-between text-sm font-display uppercase tracking-wide text-ink/50">
          <span>Entries</span>
          <span>Total: {totalKm} km {isAdmin && <span className="text-ink/30 normal-case">(~${estimatedReimbursement.toFixed(2)} at CRA 2026 rate)</span>}</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-2 flex justify-between items-center text-sm">
            <span>{r.driver_name} — {r.date} {r.purpose && <span className="text-ink/40">· {r.purpose}</span>}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono">{r.km} km</span>
              {isAdmin && <button onClick={() => remove(r.id)} className="text-ink/30 hover:text-accent-dark px-1">✕</button>}
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="px-4 py-6 text-center text-ink/40 text-sm">No mileage logged yet.</div>}
      </div>
    </div>
  );
}

function Expenses({ jobId }) {
  const { isAdmin } = useProfile();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ description: "", amount: "", date: "", category: "materials", tax_category: "" });

  const load = useCallback(async () => {
    const { data } = await supabase.from("job_expenses").select("*").eq("job_id", jobId).order("date", { ascending: false });
    setRows(data || []);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!form.description || !form.amount || !form.date) return;
    await supabase.from("job_expenses").insert([{ job_id: jobId, ...form, amount: Number(form.amount), tax_category: form.tax_category || null }]);
    setForm({ description: "", amount: "", date: "", category: "materials", tax_category: "" });
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this expense?")) return;
    await supabase.from("job_expenses").delete().eq("id", id);
    load();
  }

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-surface border border-border rounded-lg p-4 grid sm:grid-cols-6 gap-2">
        <input placeholder="Description" className="border border-border rounded px-3 py-2 sm:col-span-2"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className="border border-border rounded px-3 py-2" value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option value="materials">Materials</option>
          <option value="labor">Subcontractor labor</option>
          <option value="permits">Permits/fees</option>
          <option value="equipment">Equipment</option>
          <option value="other">Other</option>
        </select>
        <select className="border border-border rounded px-3 py-2 text-ink/70" value={form.tax_category}
          onChange={(e) => setForm({ ...form, tax_category: e.target.value })}>
          <option value="">Tax category (optional)</option>
          {TAX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" className="border border-border rounded px-3 py-2"
          value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="number" step="0.01" placeholder="Amount" className="border border-border rounded px-3 py-2"
          value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <button className="bg-steel hover:bg-steel-dark text-white rounded px-3 py-2 font-display uppercase text-sm sm:col-span-6">
          Log expense
        </button>
      </form>
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        <div className="px-4 py-2 flex justify-between text-sm font-display uppercase tracking-wide text-ink/50">
          <span>Entries</span><span>Total: {money(total)}</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-2 flex justify-between items-center text-sm gap-2">
            <span className="truncate">{r.description} <span className="text-ink/40">· {r.category}</span>
              {r.tax_category
                ? <span className="text-ink/30 text-xs"> · {r.tax_category}</span>
                : <span className="text-warn text-xs"> · needs tax category</span>}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-mono">{money(r.amount)}</span>
              {isAdmin && <button onClick={() => remove(r.id)} className="text-ink/30 hover:text-accent-dark px-1">✕</button>}
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="px-4 py-6 text-center text-ink/40 text-sm">No expenses logged yet.</div>}
      </div>
    </div>
  );
}

// Fetches a fresh signed URL for a private-bucket file and displays it — used for
// job photos and sketches now that neither bucket has a permanent public URL.
// Older rows only have the old public URL saved (from before this change); this
// pulls the storage path back out of that URL so existing photos keep working
// without needing to be re-uploaded.
// Older rows only have the old public URL saved (from before the buckets went
// private). Supabase has emitted several URL shapes over time — /object/public/,
// /object/sign/, /object/authenticated/ — and signed ones carry a ?token= query, so
// matching only the public form left a lot of legacy photos unrenderable. This tries
// each shape and strips any query string before returning the storage path.
function pathFromLegacyUrl(bucket, url) {
  if (!url) return null;
  const withoutQuery = url.split("?")[0];
  for (const kind of ["public", "sign", "authenticated"]) {
    const marker = `/storage/v1/object/${kind}/${bucket}/`;
    const idx = withoutQuery.indexOf(marker);
    if (idx !== -1) return decodeURIComponent(withoutQuery.slice(idx + marker.length));
  }
  // Last resort: some very old rows stored a bare path with no host at all.
  if (!withoutQuery.startsWith("http")) {
    return withoutQuery.replace(new RegExp(`^/?${bucket}/`), "");
  }
  return null;
}

// Signs every path in a list with one request and returns a { path: url } map.
// Used by any view that renders a gallery — per-image signing does not scale past a
// couple of dozen photos.
// Renders an already-signed URL. Kept dumb on purpose: all the signing happens once in
// useSignedUrlMap, so this never issues a request of its own. Lazy-loaded because these
// are full-resolution phone photos — the browser fetching forty at once is what made
// them fail mid-transfer in the first place.
// Limits how many photos are fetching at any one time. A job with 200 full-resolution
// phone photos otherwise asks the browser for all of them at once; the storage endpoint
// throttles the excess and those requests error out, which is what produced a grid half
// full of "image unavailable" even though every file was present and signed correctly.
const imageQueue = {
  active: 0,
  limit: 6,
  waiting: [],
  acquire() {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  },
  release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active = Math.max(0, this.active - 1);
  },
};

// A failed image is retried before being written off — throttling and flaky job-site
// connections are transient, and the previous behaviour turned one bad moment into a
// permanent "unavailable" until the page was reloaded.
const MAX_ATTEMPTS = 3;

function GalleryImage({ src, ready, alt, className, eager }) {
  const [state, setState] = useState("queued"); // queued -> loading -> ok | failed
  const [displaySrc, setDisplaySrc] = useState(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    attemptRef.current = 0;
    setState("queued");
    setDisplaySrc(null);

    async function attempt() {
      await imageQueue.acquire();
      if (cancelled) { imageQueue.release(); return; }
      setState("loading");

      // Loading through an Image object rather than the <img> element keeps the retry
      // logic out of the render path and lets the queue slot be released the moment the
      // bytes are in cache — the visible <img> then paints from cache immediately.
      const probe = new Image();
      let settled = false;
      // A request that stalls without firing load or error would hold its queue slot
      // forever and block every photo behind it, so treat a long silence as a failure.
      const stallTimer = setTimeout(() => { if (!settled) probe.onerror(); }, 20000);

      const finish = () => {
        if (settled) return true;
        settled = true;
        clearTimeout(stallTimer);
        imageQueue.release();
        return false;
      };

      probe.onload = () => {
        if (finish()) return;
        if (cancelled) return;
        setDisplaySrc(src);
        setState("ok");
      };
      probe.onerror = () => {
        if (finish()) return;
        if (cancelled) return;
        attemptRef.current += 1;
        if (attemptRef.current < MAX_ATTEMPTS) {
          // Backing off spreads retries out instead of re-flooding the endpoint.
          setTimeout(() => { if (!cancelled) attempt(); }, 400 * attemptRef.current);
        } else {
          setState("failed");
        }
      };
      probe.src = src;
    }

    attempt();
    return () => { cancelled = true; };
  }, [src]);

  if (!ready || (src && state !== "ok" && state !== "failed")) {
    return <div className={className + " bg-paper animate-pulse"} />;
  }
  if (!src || state === "failed") {
    return (
      <div className={className + " bg-paper flex items-center justify-center"}
        title="This photo couldn't be loaded after several attempts.">
        <span className="text-[10px] text-ink/40 px-1 text-center">image unavailable</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={displaySrc} alt={alt} className={className} decoding="async" />;
}

function useSignedUrlMap(bucket, rows, width) {
  const [urls, setUrls] = useState({});
  // Join the paths into a stable key so the effect re-runs when the set actually
  // changes, not on every re-render that hands back a new array instance.
  // Prefer the stored thumbnail — that's the whole point of generating it. Falls back to
  // the original for rows that predate thumbnailing or where generation failed.
  const pathFor = (r) => r.thumb_path || r.storage_path || pathFromLegacyUrl(bucket, r.url);
  const paths = rows.map(pathFor).filter(Boolean);
  const key = paths.join("|");

  useEffect(() => {
    let active = true;
    if (!paths.length) { setUrls({}); return () => { active = false; }; }
    getSignedUrls(bucket, paths, width).then((map) => { if (active) setUrls(map); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, key, width]);

  // Resolves one row to a displayable src, or null if it can't be signed.
  function srcFor(row) {
    const path = pathFor(row);
    return (path && urls[path]) || null;
  }

  // Distinguishes "still fetching" from "definitely unavailable".
  const ready = paths.length === 0 || Object.keys(urls).length > 0;
  return { srcFor, ready };
}

function SignedImage({ bucket, path, fallbackUrl, alt, className, onError }) {
  const [src, setSrc] = useState(null);
  // "loading" until we know; "failed" once there's nothing left to try. A private
  // bucket returns 400 for an unsigned URL, which renders as a broken-image icon —
  // an explicit state is clearer than that and easier to diagnose.
  const [state, setState] = useState("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    setSrc(null);

    const effectivePath = path || pathFromLegacyUrl(bucket, fallbackUrl);
    if (!effectivePath) {
      // Nothing signable. A raw fallback URL only works if it was genuinely public.
      if (fallbackUrl) { setSrc(fallbackUrl); setState("ready"); }
      else setState("failed");
      return () => { active = false; };
    }

    getSignedUrl(bucket, effectivePath).then((url) => {
      if (!active) return;
      if (url) { setSrc(url); setState("ready"); }
      else if (fallbackUrl) { setSrc(fallbackUrl); setState("ready"); }
      else setState("failed");
    });

    return () => { active = false; };
  }, [bucket, path, fallbackUrl]);

  if (state === "loading") return <div className={className + " bg-paper animate-pulse"} />;
  if (state === "failed") {
    return (
      <div className={className + " bg-paper border border-border flex items-center justify-center"}
        title="This photo's file couldn't be located in storage.">
        <span className="text-[10px] text-ink/40 px-1 text-center">image unavailable</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img src={src} alt={alt} className={className}
      onError={(e) => { setState("failed"); if (onError) onError(e); }} />
  );
}

function Photos({ jobId }) {
  const { isAdmin } = useProfile();
  const [rows, setRows] = useState([]);
  const { companyId } = useProfile();
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("job_photos").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
    setRows(data || []);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const { srcFor, ready } = useSignedUrlMap("job-photos", rows, 500);

  // Admin-only check for when photos show as unavailable: reports whether the files are
  // actually in storage at the paths the database recorded.
  const [diag, setDiag] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);
  async function runDiagnostic() {
    setDiagRunning(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/photos/diagnose?jobId=${jobId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setDiag(res.ok ? await res.json() : { error: `Server returned ${res.status}` });
    setDiagRunning(false);
  }

  const unavailableCount = ready ? rows.filter((r) => !srcFor(r)).length : 0;

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    const coords = await getCurrentPosition();
    const exifr = (await import("exifr")).default;

    let failures = 0;
    let lastError = "";
    // A ceiling on what one upload can push into storage. Storage is billed by volume,
    // so an account with upload rights is the cheapest way for someone to run up a bill
    // — deliberately or by dumping a folder of raw camera files. 40 MB clears any phone
    // photo comfortably while stopping video and multi-hundred-megabyte files.
    const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
    // And a ceiling per batch, so a scripted loop can't queue thousands at once.
    const MAX_BATCH = 60;
    if (files.length > MAX_BATCH) {
      alert(`That's ${files.length} photos at once — upload them in batches of ${MAX_BATCH} or fewer.`);
      setUploading(false);
      return;
    }

    for (const file of files) {
      if (file.size > MAX_PHOTO_BYTES) {
        failures++;
        lastError = `${file.name} is over 40 MB`;
        continue;
      }
      // Sanitised: the filename comes from the device and lands in a storage path.
      const safeName = String(file.name || "photo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      // Company-prefixed: the storage policies check the first path segment, so this
      // is what keeps one company's photos out of another's reach at the bucket level
      // rather than only in the database.
      const path = `${companyId || "legacy"}/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, file);
      if (uploadError) { failures++; lastError = `Storage: ${uploadError.message}`; console.error("storage upload failed:", uploadError); continue; }

      // Read the actual date the photo was taken from its EXIF data (most phone
      // cameras write this) so weekly reports group it correctly even if a batch
      // of photos gets uploaded days after they were actually taken. Falls back
      // to the upload time if a photo has no EXIF date (screenshots, some
      // messaging-app-compressed images strip this).
      let takenAt = null;
      try {
        const exifDate = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
        if (exifDate?.DateTimeOriginal) takenAt = new Date(exifDate.DateTimeOriginal).toISOString();
        else if (exifDate?.CreateDate) takenAt = new Date(exifDate.CreateDate).toISOString();
      } catch (e) {
        // no readable EXIF — fine, falls back to upload time below
      }

      // A downscaled copy for display. Best-effort: if it fails, the row simply has no
      // thumb_path and viewers fall back to the original, exactly as before.
      let thumbPath = null;
      try {
        const { blob: thumb } = await makeThumbnail(file);
        if (thumb) {
          const candidate = thumbPathFor(path);
          const { error: thumbError } = await supabase.storage
            .from("job-photos").upload(candidate, thumb, { contentType: "image/jpeg" });
          if (!thumbError) thumbPath = candidate;
        }
      } catch (e) {
        // Non-fatal — the original is already safely uploaded.
      }

      const { error: insertError } = await supabase.from("job_photos").insert([{
        job_id: jobId, storage_path: path, caption,
        lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        taken_at: takenAt,
        thumb_path: thumbPath,
        thumb_checked: true,
      }]);
      if (insertError) { failures++; lastError = `Database: ${insertError.message}`; console.error("photo record insert failed:", insertError); }
    }

    if (failures > 0) {
      alert(`${failures} of ${files.length} photo(s) failed to save.\n\nError: ${lastError}`);
    }
    setCaption("");
    load();
    setUploading(false);
    e.target.value = "";
  }

  async function removePhoto(id) {
    if (!confirm("Delete this photo?")) return;
    // Remove the stored files too, or deleting a photo leaves its bytes in the bucket
    // forever with no row pointing at them.
    const row = rows.find((r) => r.id === id);
    const toRemove = [row?.storage_path, row?.thumb_path].filter(Boolean);
    if (toRemove.length) {
      await supabase.storage.from("job-photos").remove(toRemove);
    }
    await supabase.from("job_photos").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-lg p-4 flex flex-col sm:flex-row gap-2">
        <input placeholder="Caption (optional, applies to all selected)" className="border border-border rounded px-3 py-2 flex-1"
          value={caption} onChange={(e) => setCaption(e.target.value)} />
        <label className="bg-steel hover:bg-steel-dark text-white rounded px-3 py-2 font-display uppercase text-sm text-center cursor-pointer">
          {uploading ? "Uploading..." : "Add photo(s)"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {isAdmin && unavailableCount > 0 && (
        <div className="bg-surface border border-warn/40 rounded-lg p-3">
          <div className="text-sm">
            {unavailableCount} of {rows.length} photo{rows.length === 1 ? "" : "s"} couldn&apos;t be loaded.
          </div>
          <button onClick={runDiagnostic} disabled={diagRunning}
            className="mt-2 text-xs border border-border rounded px-2 py-1 disabled:opacity-50">
            {diagRunning ? "Checking..." : "Check what's wrong"}
          </button>
          {diag && (
            <pre className="mt-2 text-[10px] bg-paper rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(diag, null, 2)}
            </pre>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {rows.map((r) => (
          // eslint-disable-next-line @next/next/no-img-element
          <div key={r.id} className="bg-surface border border-border rounded-lg overflow-hidden relative">
            <GalleryImage src={srcFor(r)} ready={ready} alt={r.caption || "Job photo"}
              className="w-full h-32 object-cover" />
            <div className="px-2 pt-1 text-[10px] text-ink/40 font-mono">
              {new Date(r.taken_at || r.created_at).toLocaleDateString()}
            </div>
            {r.caption && <div className="p-2 pt-0.5 text-xs text-ink/60">{r.caption}</div>}
            {r.lat && r.lng && (
              <a href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=17/${r.lat}/${r.lng}`}
                target="_blank" rel="noreferrer"
                className="absolute bottom-1 left-1 bg-ink/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                📍
              </a>
            )}
            {isAdmin && (
              <button onClick={() => removePhoto(r.id)}
                className="absolute top-1 right-1 bg-ink/70 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center hover:bg-accent-dark">
                ✕
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="col-span-full text-center text-ink/40 text-sm py-6">No photos yet.</div>}
      </div>
    </div>
  );
}

// Freehand sketch pad for quote/site visit notes — plain <canvas>, works with touch
// (finger/stylus) or mouse. Saved as a PNG alongside the typed note, reusing the
// job-photos bucket so no extra storage setup is needed.
function SketchCanvas({ canvasRef }) {
  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvas._drawing = true;
  }
  function move(e) {
    if (!canvasRef.current?._drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1B2430";
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    if (canvasRef.current) canvasRef.current._drawing = false;
  }

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={340}
      className="w-full border border-border rounded-lg bg-white touch-none"
      style={{ maxWidth: "100%" }}
      onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end}
    />
  );
}

function SiteNotes({ jobId }) {
  const { isAdmin, profile } = useProfile();
  const [rows, setRows] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("job_notes").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
    setRows(data || []);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const realCanvasRef = useRef(null);

  function clearCanvas() {
    const canvas = realCanvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  async function save() {
    if (!noteText.trim()) {
      const canvas = realCanvasRef.current;
      const ctx = canvas.getContext("2d");
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const hasAnything = pixels.some((channel, i) => i % 4 === 3 && channel !== 0);
      if (!hasAnything) { alert("Add a note or a sketch before saving."); return; }
    }
    setSaving(true);
    const canvas = realCanvasRef.current;
    let sketchPath = null;

    // Only upload if something was actually drawn (skip an all-blank canvas).
    const ctx = canvas.getContext("2d");
    const blankCheck = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasDrawing = blankCheck.some((channel, i) => i % 4 === 3 && channel !== 0);

    if (hasDrawing) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const path = `${jobId}/sketch-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, blob);
      if (!uploadError) {
        sketchPath = path;
      } else {
        alert("Note text will save, but the sketch failed to upload: " + uploadError.message);
      }
    }

    const { error } = await supabase.from("job_notes").insert([{
      job_id: jobId, author_name: profile?.full_name || null, note_text: noteText || null, sketch_path: sketchPath,
    }]);
    if (error) alert("Couldn't save note: " + error.message);

    setNoteText("");
    clearCanvas();
    setSaving(false);
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this note?")) return;
    await supabase.from("job_notes").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-xs font-display uppercase tracking-wide text-ink/60 mb-1">
            Note (e.g. from a quote appointment)
          </label>
          <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3}
            className="w-full border border-border rounded px-3 py-2" placeholder="Client wants..." />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-xs font-display uppercase tracking-wide text-ink/60">Sketch (optional)</label>
            <button type="button" onClick={clearCanvas} className="text-xs text-ink/40 hover:text-accent-dark">Clear</button>
          </div>
          <SketchCanvas canvasRef={realCanvasRef} />
        </div>
        <button onClick={save} disabled={saving}
          className="bg-accent hover:bg-accent-dark text-white rounded px-4 py-2 font-display uppercase text-sm disabled:opacity-50">
          {saving ? "Saving..." : "Save note"}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="bg-surface border border-border rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-ink/40">{r.author_name || "Unknown"} — {new Date(r.created_at).toLocaleString()}</span>
              {isAdmin && <button onClick={() => remove(r.id)} className="text-ink/30 hover:text-accent-dark text-xs">Delete</button>}
            </div>
            {r.note_text && <p className="text-sm whitespace-pre-wrap mb-2">{r.note_text}</p>}
            {(r.sketch_path || r.sketch_url) && (
              <SignedImage bucket="job-photos" path={r.sketch_path} fallbackUrl={r.sketch_url} alt="Sketch" className="border border-border rounded max-w-full" />
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="text-center text-ink/40 text-sm py-6">No notes yet.</div>}
      </div>
    </div>
  );
}

function Financials({ jobId, job }) {
  const { isAdmin } = useProfile();
  // Its own router: the one at the top of the file belongs to the page component and
  // isn't in scope here.
  const router = useRouter();
  const [estimates, setEstimates] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [form, setForm] = useState({ amount: "", date: "", note: "", payment_method: "cash" });
  const [companySettings, setCompanySettings] = useState(null);
  const [composeDoc, setComposeDoc] = useState(null); // { kind, r } while the modal is open

  useEffect(() => {
    supabase.from("company_settings").select("*").maybeSingle().then(({ data }) => setCompanySettings(data));
  }, []);

  const load = useCallback(async () => {
    const [e, i, d] = await Promise.all([
      supabase.from("estimates").select("*").eq("job_id", jobId).order("date", { ascending: false }),
      supabase.from("invoices").select("*").eq("job_id", jobId).order("date", { ascending: false }),
      supabase.from("deposits").select("*").eq("job_id", jobId).order("date", { ascending: false }),
    ]);
    // Totals include tax. `amount` on these rows is the pre-tax subtotal, so anything
    // showing it directly understates the document by the GST — and, worse, the Mark
    // Paid button was recording that short figure as payment in full.
    setEstimates(await withDisplayTotals(e.data || [], "estimate"));
    setInvoices(await withDisplayTotals(i.data || [], "invoice"));
    setDeposits(d.data || []);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!form.amount || !form.date) return;
    await supabase.from("deposits").insert([{
      job_id: jobId, amount: Number(form.amount), date: form.date, note: form.note, payment_method: form.payment_method,
    }]);
    setForm({ amount: "", date: "", note: "", payment_method: "cash" });
    load();
  }

  async function exportToWorkOrder(kind, r) {
    // Created straight away with no date and nobody assigned. Both are set on the Work
    // Orders tab, where the work order is visible while you decide — a dialog asking for
    // a date before anything exists is a decision made blind.
    let wo;
    try {
      wo = await createWorkOrderFromDocument({
        jobId, kind, doc: r, amount: r.amount, date: r.date, scheduledDate: null,
      });
    } catch (e) {
      alert(e.message || "Couldn't create the work order.");
      return;
    }
    if (wo) {
      alert("Work order created. Set the day it goes out and who it's for on the Work Orders tab.");
    }
  }

  async function exportMaterialsCsv(kind, r) {
    const { data: materials } = await supabase.from("line_items").select("*").eq("parent_type", kind).eq("parent_id", r.id).eq("is_material", true);
    if (!materials || materials.length === 0) { alert("No materials on this " + kind + " yet."); return; }
    const csv = ["description,quantity,unit"].concat(
      materials.map((m) => `"${m.description.replace(/"/g, '""')}",${m.quantity},${m.unit}`)
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `materials-${kind}-${r.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openCompose(kind, r) {
    setComposeDoc({ kind, r });
  }

  async function textClient(kind, r) {
    const rawPhone = job?.contacts?.phone;
    if (!rawPhone) { alert("This contact has no phone number on file."); return; }

    // Strip formatting — a number like "(778) 230-7676" breaks the sms: handler on
    // several platforms, and it's how phone numbers actually get typed in.
    const phone = String(rawPhone).replace(/[^\d+]/g, "");
    const label = kind === "estimate" ? "estimate" : "invoice";
    const link = `${window.location.origin}/pay/${r.public_token}?kind=${kind}`;
    const message = `Hi, here's your ${label} from ${brand.companyName}: ${link}`;

    // Record it the same way an email send is recorded, so the document's history shows
    // how the client was actually reached.
    supabase.from("document_activity").insert([{
      parent_type: kind, parent_id: r.id, event_type: "texted", meta: { phone },
    }]).then(() => {});

    // sms: links do nothing on a desktop browser, so copy the message instead rather
    // than appearing to have silently failed.
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent || "");
    if (!isMobile) {
      try {
        await navigator.clipboard.writeText(message);
        alert("No texting app on this computer — the message has been copied instead:\n\n" + message);
      } catch (e) {
        prompt("Copy this and send it to the client:", message);
      }
      return;
    }

    // "?&body=" rather than "?body=": iOS wants the ampersand form and Android accepts
    // either, so this is the one shape that works on both.
    window.location.href = `sms:${phone}?&body=${encodeURIComponent(message)}`;
  }

  async function markPaid(invoiceId) {
    const method = prompt("Payment method (cash, cheque, e_transfer, paypal, credit_card, other):", "cash");
    if (!method) return;
    const date = new Date().toISOString().slice(0, 10);
    await supabase.from("invoices").update({ payment_status: "paid", paid_date: date, payment_method: method }).eq("id", invoiceId);

    // Record the money as well as the status. Marking an invoice paid without a payment
    // row left the job's ledger short by the amount, and the accountant export with it.
    const invoice = invoices.find((i) => i.id === invoiceId);
    const alreadyPaid = deposits
      .filter((d) => d.invoice_id === invoiceId)
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const remaining = Number(invoice?.display_total ?? invoice?.amount ?? 0) - alreadyPaid;
    if (remaining > 0.01) {
      await supabase.from("deposits").insert([{
        job_id: jobId,
        invoice_id: invoiceId,
        amount: remaining,
        date,
        payment_method: method,
        note: `Invoice #${invoice?.doc_number ?? ""} marked paid`,
      }]);
    }

    // Regenerate the library PDF so it now shows the PAID IN FULL stamp and moves
    // to "paid" in the library filters.
    const { data: fullDoc } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    const { data: fullLines } = await supabase.from("line_items").select("*").eq("parent_type", "invoice").eq("parent_id", invoiceId).eq("is_material", false).eq("is_tool", false).eq("is_labour", false).order("sort_order");
    const { data: companySettings } = await supabase.from("company_settings").select("*").maybeSingle();
    await generateAndStoreInvoicePdf({ invoice: fullDoc, job, contact: job?.contacts, lines: fullLines, company: companySettings });

    load();
  }

  async function toggleReminders(invoiceId, current) {
    await supabase.from("invoices").update({ send_reminders: !current }).eq("id", invoiceId);
    load();
  }

  async function setDueDate(invoiceId, due_date) {
    await supabase.from("invoices").update({ due_date }).eq("id", invoiceId);
    load();
  }

  const TABLE_FOR_KIND = { estimate: "estimates", invoice: "invoices", deposit: "deposits" };
  async function deleteDoc(kind, id) {
    if (!confirm(`Delete this ${kind}?`)) return;
    await supabase.from(TABLE_FOR_KIND[kind]).delete().eq("id", id);
    load();
  }

  const [editingDeposit, setEditingDeposit] = useState(null);

  async function saveDeposit(id, patch) {
    const { error } = await supabase.from("deposits").update(patch).eq("id", id);
    if (error) { alert(`Couldn't save that: ${error.message}`); return; }
    setEditingDeposit(null);
    load();
  }

  const PAYMENT_METHODS = ["cash", "cheque", "e_transfer", "paypal", "credit_card", "other"];

  const PAYMENT_STATUS_STYLE = {
    unpaid: "bg-warn/10 text-warn border-warn/30",
    partial: "bg-steel/10 text-steel border-steel/30",
    paid: "bg-success/10 text-success border-success/30",
  };

  // A foreman's document starts as a draft and has to be sent up before an admin sees
  // it in the approvals queue. Approving is admin-only and blocked at the database level
  // as well, so this button can only ever move something to "waiting".
  const [duplicating, setDuplicating] = useState(null);

  // Whether the client actually went ahead. Signing sets this automatically, but most
  // work is won on the phone — without a way to say so, every unsigned estimate looks
  // the same whether it's live or was turned down weeks ago.
  async function setOutcome(row, outcome) {
    let note = null;
    if (outcome === "declined") {
      // Why you lost it is the part worth knowing later. Optional — cancelling the
      // prompt still records the outcome.
      note = prompt("Any reason worth noting? (price, timing, went elsewhere...)", "");
    }
    const { error } = await supabase.from("estimates").update({
      outcome,
      outcome_at: new Date().toISOString(),
      outcome_note: note?.trim() || null,
    }).eq("id", row.id);
    if (error) { alert(`Couldn't update that: ${error.message}`); return; }
    load();
  }

  const OUTCOME_STYLE = {
    accepted: { label: "Accepted", tone: "bg-success/10 text-success border-success/30" },
    declined: { label: "Declined", tone: "bg-accent/10 text-accent-dark border-accent-dark/30" },
    expired: { label: "Expired", tone: "bg-ink/5 text-ink/40 border-border" },
  };

  // Two separate actions on purpose. Duplicating is "another one of these"; converting
  // is "the work was quoted, now bill it". A dialog asking which one you meant is a
  // question the button label should have answered.
  // Where a duplicate should land. Null means this job; a job id means another one.
  // Held here rather than asked in a dialog so the list of jobs is browsable — a prompt
  // asking someone to type a job name is a prompt they get wrong.
  const [copyTarget, setCopyTarget] = useState(null); // { row, kind, asKind }
  const [allJobs, setAllJobs] = useState([]);

  useEffect(() => {
    if (!copyTarget || allJobs.length) return;
    supabase.from("jobs")
      .select("id, title, contacts(name)")
      .neq("status", "complete")
      .order("created_at", { ascending: false })
      .then(({ data }) => setAllJobs(data || []));
  }, [copyTarget, allJobs.length]);

  async function copyDoc(row, kind, asKind, targetJobId) {
    setDuplicating(row.id + (asKind || ""));
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/documents/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ kind, id: row.id, asKind: asKind || kind, targetJobId: targetJobId || null }),
    });
    setDuplicating(null);
    setCopyTarget(null);

    if (!res.ok) { alert(await res.text()); return; }
    const data = await res.json();
    // Straight into the editor: a copy almost always needs the date, quantities or a
    // line changed before it goes anywhere. Note the job in the URL is the TARGET job,
    // so copying to another job takes you there rather than leaving you here.
    router.push(`/jobs/${data.jobId}/new-document?kind=${data.kind}&edit=${data.id}`);
  }

  async function submitForApproval(row, kind) {
    const table = kind === "estimate" ? "estimates" : "invoices";
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from(table).update({
      approval_status: "pending_approval",
      submitted_by: user?.id,
      submitted_at: new Date().toISOString(),
      review_note: null,
    }).eq("id", row.id);
    if (error) { alert(`Couldn't submit that: ${error.message}`); return; }

    // Tell the admins it's waiting. Best-effort: the submission has already been saved,
    // so a mail failure shouldn't look like the submit itself failed.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/documents/request-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind, id: row.id }),
      });
    } catch (e) {
      // Silent: it's in the queue either way.
    }

    alert("Submitted. It's in the approvals queue and the office has been emailed.");
    load();
  }

  // What happened to the email itself, as distinct from whether the client opened the
  // link. A bounce is the one worth acting on.
  const EMAIL_STATUS = {
    sent: { label: "Emailed", tone: "text-ink/50" },
    delivered: { label: "Delivered", tone: "text-ink/50" },
    opened: { label: "Email opened", tone: "text-success" },
    bounced: { label: "Bounced — the address didn't accept it", tone: "text-accent-dark" },
    complained: { label: "Marked as spam by the recipient", tone: "text-accent-dark" },
    // The one people miss: it looks sent, and it never left.
    suppressed: { label: "Blocked — this address bounced before and is now suppressed", tone: "text-accent-dark" },
    failed: { label: "Failed to send", tone: "text-accent-dark" },
    delayed: { label: "Delivery delayed", tone: "text-warn" },
  };

  const EmailStatus = ({ r }) => {
    if (!r.email_status) return null;
    const state = EMAIL_STATUS[r.email_status];
    if (!state) return null;
    return (
      <div className={`text-xs ${state.tone}`}>
        {state.label}
        {r.last_emailed_at && ` · ${new Date(r.last_emailed_at).toLocaleDateString()}`}
        {r.last_email_to && <span className="text-ink/35"> · {r.last_email_to}</span>}
      </div>
    );
  };

  const APPROVAL_LABEL = {
    draft: "Draft — not submitted",
    pending_approval: "Waiting on approval",
    changes_requested: "Sent back for changes",
  };

  // Whether the client has actually opened the link they were sent. "Not opened yet" is
  // as useful as a view count — it distinguishes a client who's ignoring an invoice from
  // one who never received it.
  const ViewStatus = ({ r }) => {
    if (!r.last_viewed_at) {
      return <span className="text-xs text-ink/35">Not opened yet</span>;
    }
    const last = new Date(r.last_viewed_at);
    const count = r.view_count || 1;
    return (
      <span className="text-xs text-success" title={`First opened ${new Date(r.first_viewed_at || r.last_viewed_at).toLocaleString()}`}>
        ✓ Opened {last.toLocaleDateString()} {last.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        {count > 1 && ` · ${count}×`}
      </span>
    );
  };

  // Which document rows have their file panel open. Held here rather than inside Row,
  // because Row is redefined on every render of this component — state inside it would
  // be discarded (and the panel would snap shut) any time the list reloaded.
  const [openFiles, setOpenFiles] = useState({});

  const Row = ({ r, kind }) => {
    const showAttachments = Boolean(openFiles[r.id]);
    const setShowAttachments = (fn) =>
      setOpenFiles((o) => ({ ...o, [r.id]: typeof fn === "function" ? fn(Boolean(o[r.id])) : fn }));
    return (
    <div className="px-4 py-2 text-sm border-b border-border/50 last:border-0">
      {kind === "deposit" && editingDeposit === r.id ? (
        // Edited in place rather than deleted and re-entered — a mistyped amount or the
        // wrong payment method shouldn't cost the record itself, especially now that a
        // PayPal payment writes one automatically.
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" defaultValue={r.date}
            onChange={(e) => (r._date = e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm" />
          <input type="number" step="0.01" defaultValue={r.amount}
            onChange={(e) => (r._amount = e.target.value)}
            className="w-24 border border-border rounded px-2 py-1 text-sm font-mono" />
          <select defaultValue={r.payment_method || "cash"}
            onChange={(e) => (r._method = e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm">
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
          </select>
          <select defaultValue={r.invoice_id || ""}
            onChange={(e) => (r._invoice = e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm">
            <option value="">Not against an invoice</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                #{inv.doc_number} · {money(inv.amount)}
              </option>
            ))}
          </select>
          <input defaultValue={r.note || ""} placeholder="Note"
            onChange={(e) => (r._note = e.target.value)}
            className="flex-1 min-w-[8rem] border border-border rounded px-2 py-1 text-sm" />
          <button onClick={() => saveDeposit(r.id, {
              date: r._date ?? r.date,
              amount: Number(r._amount ?? r.amount),
              payment_method: r._method ?? r.payment_method,
              note: r._note ?? r.note,
              invoice_id: (r._invoice ?? r.invoice_id) || null,
            })}
            className="text-xs font-display uppercase bg-ink text-white rounded px-2 py-1">Save</button>
          <button onClick={() => setEditingDeposit(null)}
            className="text-xs text-ink/40">Cancel</button>
        </div>
      ) : (
      <div className="flex justify-between items-center gap-2">
        <span className="truncate">
          {(kind === "estimate" || kind === "invoice") && r.doc_number && (
            <span className="font-mono text-ink/60 mr-1">#{r.doc_number}</span>
          )}
          {r.date} {r.note && <span className="text-ink/40">· {r.note}</span>}
          {kind === "deposit" && r.payment_method && <span className="text-ink/40 text-xs uppercase"> · {r.payment_method.replace("_", " ")}</span>}
          {/* Which invoice a payment settled — a job with two invoices was previously
              ambiguous about where the money went. */}
          {kind === "deposit" && r.invoice_id && (
            <span className="text-ink/40 text-xs"> · inv #{invoices.find((i) => i.id === r.invoice_id)?.doc_number ?? "?"}</span>
          )}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {kind === "invoice" && (() => {
            // Read from the payments recorded against this invoice rather than from the
            // stored status alone. A database trigger keeps the two in step now, but the
            // badge showing the truth means a part payment reads as "part paid" instead
            // of a flat "unpaid" that hides $3,000 already received.
            const paid = deposits
              .filter((d) => d.invoice_id === r.id)
              .reduce((sum, d) => sum + Number(d.amount || 0), 0);
            const owing = Number(r.display_total ?? r.amount ?? 0) - paid;

            const label = r.payment_status === "paid" || owing <= 0.01
              ? "paid"
              : paid > 0 ? "part paid" : "unpaid";
            const style = label === "paid"
              ? PAYMENT_STATUS_STYLE.paid
              : label === "part paid"
                ? "bg-warn/10 text-warn border-warn/30"
                : PAYMENT_STATUS_STYLE.unpaid;

            return (
              <span className={`text-[10px] font-display uppercase border rounded px-1.5 py-0.5 ${style}`}>
                {label}
              </span>
            );
          })()}
          {kind === "estimate" && r.outcome && r.outcome !== "open" && OUTCOME_STYLE[r.outcome] && (
            <span className={`text-[10px] font-display uppercase border rounded px-1.5 py-0.5 ${OUTCOME_STYLE[r.outcome].tone}`}>
              {OUTCOME_STYLE[r.outcome].label}
            </span>
          )}
          <span className="font-mono">
            {money(r.display_total ?? r.amount)}
            {kind === "invoice" && (() => {
              // What's still owed, worked out from payments assigned to this invoice.
              const paid = deposits
                .filter((d) => d.invoice_id === r.id)
                .reduce((sum, d) => sum + Number(d.amount || 0), 0);
              const owing = Number(r.display_total ?? r.amount ?? 0) - paid;
              if (paid === 0) return null;
              return owing > 0.01 ? (
                <span className="text-warn text-xs ml-1">{money(owing)} owing</span>
              ) : (
                <span className="text-success text-xs ml-1">paid in full</span>
              );
            })()}
          </span>
          {kind === "deposit" && isAdmin && (
            <button onClick={() => setEditingDeposit(r.id)}
              className="text-xs text-ink/40 hover:text-steel">Edit</button>
          )}
        </span>
      </div>
      )}
      {(kind === "estimate" || kind === "invoice") && r.approval_status && r.approval_status !== "approved" && (
        <div className="mt-1.5 border border-warn/40 bg-warn/10 rounded px-2 py-1.5">
          <div className="text-xs font-medium text-warn">
            {APPROVAL_LABEL[r.approval_status] || r.approval_status}
          </div>
          {r.review_note && (
            <div className="text-xs text-ink/60 mt-0.5">Note: {r.review_note}</div>
          )}
          <div className="text-xs text-ink/40 mt-0.5">
            It can&apos;t be emailed or opened by the client until an admin approves it.
          </div>
          {(r.approval_status === "draft" || r.approval_status === "changes_requested") && (
            <button onClick={() => submitForApproval(r, kind)}
              className="text-xs font-display uppercase tracking-wide border border-warn/50 text-warn rounded px-2 py-0.5 mt-1.5">
              Submit for approval
            </button>
          )}
        </div>
      )}
      {(kind === "estimate" || kind === "invoice") && (!r.approval_status || r.approval_status === "approved") && (
        <div className="mt-1">
          <EmailStatus r={r} />
          <ViewStatus r={r} />
        </div>
      )}
      {(kind === "estimate" || kind === "invoice") && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Link href={`/documents/${kind}/${r.id}`} target="_blank"
            className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5">
            View / Print
          </Link>
          {(!r.approval_status || r.approval_status === "approved") && (
            <button onClick={() => {
                const url = `${window.location.origin}/pay/${r.public_token}?kind=${kind}`;
                navigator.clipboard.writeText(url);
                alert("Client link copied:\n" + url);
              }}
              className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5">
              Copy client link
            </button>
          )}
          {/* Duplicate copies onto this job with one tap, since that's the common
              case. The arrow opens a job list for copying elsewhere — the same work
              repeated for a different client is the other half of why people
              duplicate. */}
          <span className="inline-flex">
            <button onClick={() => copyDoc(r, kind)} disabled={duplicating === r.id}
              className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded-l px-2 py-0.5 disabled:opacity-50">
              {duplicating === r.id ? "Copying..." : "Duplicate"}
            </button>
            <button onClick={() => setCopyTarget({ row: r, kind, asKind: kind })}
              title="Duplicate onto a different job"
              className="text-xs text-steel hover:text-steel-dark border border-l-0 border-steel/40 rounded-r px-1.5 py-0.5">
              ▾
            </button>
          </span>
          {kind === "estimate" && (!r.outcome || r.outcome === "open") && (
            <>
              <button onClick={() => setOutcome(r, "accepted")}
                className="text-xs font-display uppercase tracking-wide text-success hover:opacity-80 border border-success/40 rounded px-2 py-0.5">
                Accepted
              </button>
              <button onClick={() => setOutcome(r, "declined")}
                className="text-xs font-display uppercase tracking-wide text-ink/50 hover:text-accent-dark border border-border rounded px-2 py-0.5">
                Declined
              </button>
            </>
          )}
          {kind === "estimate" && r.outcome && r.outcome !== "open" && (
            <button onClick={() => setOutcome(r, "open")}
              className="text-xs text-ink/35 hover:text-steel">Reopen</button>
          )}
          {kind === "estimate" && (
            <button onClick={() => copyDoc(r, kind, "invoice")} disabled={duplicating === r.id + "invoice"}
              className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5 disabled:opacity-50">
              {duplicating === r.id + "invoice" ? "Converting..." : "Make invoice"}
            </button>
          )}
          <Link href={`/jobs/${jobId}/new-document?kind=${kind}&edit=${r.id}`}
            className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5">
            Edit
          </Link>
          {(!r.approval_status || r.approval_status === "approved") && (
            <button onClick={() => openCompose(kind, r)}
              className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5">
              Email client
            </button>
          )}
          <button onClick={() => setShowAttachments((v) => !v)}
            className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5">
            {showAttachments ? "Hide files" : "Files"}
          </button>
          {(!r.approval_status || r.approval_status === "approved") && (
            <button onClick={() => textClient(kind, r)}
              className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5">
              Text client
            </button>
          )}
          <button onClick={() => exportMaterialsCsv(kind, r)}
            className="text-xs font-display uppercase tracking-wide text-ink/50 hover:text-ink border border-border rounded px-2 py-0.5">
            Materials CSV
          </button>
          <button onClick={() => exportToWorkOrder(kind, r)}
            className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-0.5">
            → Work order
          </button>
          <button onClick={() => deleteDoc(kind, r.id)}
            className="text-xs font-display uppercase tracking-wide text-accent-dark hover:text-accent border border-accent-dark/40 rounded px-2 py-0.5">
            Delete
          </button>
        </div>
      )}
      {kind === "deposit" && (
        <div className="flex justify-end mt-1">
          <button onClick={() => deleteDoc(kind, r.id)}
            className="text-xs font-display uppercase tracking-wide text-accent-dark hover:text-accent border border-accent-dark/40 rounded px-2 py-0.5">
            Delete
          </button>
        </div>
      )}
      {kind === "invoice" && (
        <div className="flex items-center gap-3 mt-1.5 text-xs text-ink/50">
          {r.payment_status !== "paid" ? (
            <button onClick={() => markPaid(r.id)} className="text-success hover:underline">Mark paid</button>
          ) : (
            <span>Paid {r.paid_date} · {r.payment_method?.replace("_", " ")}</span>
          )}
          <label className="flex items-center gap-1 cursor-pointer">
            Due
            <input type="date" value={r.due_date || ""} onChange={(e) => setDueDate(r.id, e.target.value)}
              className="border border-border rounded px-1 py-0.5" />
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={!!r.send_reminders} onChange={() => toggleReminders(r.id, r.send_reminders)} />
            Auto-remind if overdue
          </label>
        </div>
      )}
      {showAttachments && (kind === "estimate" || kind === "invoice") && (
        <DocumentAttachments kind={kind} docId={r.id} jobId={jobId} />
      )}
    </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* The job picker for "duplicate onto another job". A panel rather than a browser
          prompt, so the jobs can actually be read and chosen. */}
      {copyTarget && (
        <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setCopyTarget(null)}>
          <div className="bg-surface border border-border rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display uppercase text-sm tracking-wide mb-1">
              Copy {copyTarget.kind} #{copyTarget.row.doc_number} to
            </h3>
            <p className="text-xs text-ink/50 mb-3">
              The copy opens for editing on whichever job you pick. Line items, notes and
              attachments come with it; the document number, client link and any payments
              do not.
            </p>

            <button onClick={() => copyDoc(copyTarget.row, copyTarget.kind, copyTarget.asKind, jobId)}
              className="block w-full text-left text-sm border border-border rounded px-3 py-2 mb-3 hover:border-steel">
              This job — another copy here
            </button>

            <div className="text-xs font-display uppercase tracking-wide text-ink/40 mb-1">
              Another job
            </div>
            <div className="space-y-1">
              {allJobs.filter((j) => j.id !== jobId).map((j) => (
                <button key={j.id}
                  onClick={() => copyDoc(copyTarget.row, copyTarget.kind, copyTarget.asKind, j.id)}
                  className="block w-full text-left text-sm border border-border rounded px-3 py-2 hover:border-steel">
                  {j.title}
                  {j.contacts?.name && (
                    <span className="block text-xs text-ink/40">{j.contacts.name}</span>
                  )}
                </button>
              ))}
              {allJobs.filter((j) => j.id !== jobId).length === 0 && (
                <p className="text-xs text-ink/40">
                  No other open jobs. Create the job first, then copy onto it.
                </p>
              )}
            </div>

            <button onClick={() => setCopyTarget(null)}
              className="text-xs text-ink/40 mt-3">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Link href={`/jobs/${jobId}/new-document?kind=estimate`}
          className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
          + New Estimate
        </Link>
        <Link href={`/jobs/${jobId}/new-document?kind=invoice`}
          className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
          + New Invoice
        </Link>
      </div>

      <form onSubmit={add} className="bg-surface border border-border rounded-lg p-4 grid sm:grid-cols-5 gap-2">
        <div className="text-xs font-display uppercase tracking-wide text-ink/50 self-center">+ Deposit</div>
        <input type="date" className="border border-border rounded px-3 py-2"
          value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input type="number" step="0.01" placeholder="Amount" className="border border-border rounded px-3 py-2"
          value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select className="border border-border rounded px-3 py-2" value={form.payment_method}
          onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
          <option value="e_transfer">E-transfer</option>
          <option value="paypal">PayPal</option>
          <option value="credit_card">Credit card</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Note" className="border border-border rounded px-3 py-2"
          value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="bg-steel hover:bg-steel-dark text-white rounded px-3 py-2 font-display uppercase text-sm sm:col-span-5">
          Add deposit
        </button>
      </form>

      <div className="grid sm:grid-cols-3 gap-3">
        {[["Estimates", estimates, "estimate"], ["Invoices", invoices, "invoice"], ["Deposits", deposits, "deposit"]].map(([label, rows, kind]) => (
          <div key={label} className="bg-surface border border-border rounded-lg divide-y divide-border">
            <div className="px-4 py-2 text-sm font-display uppercase tracking-wide text-ink/50 flex justify-between">
              <span>{label}</span>
              <span>{money(rows.reduce((s, r) => s + Number(r.display_total ?? r.amount), 0))}</span>
            </div>
            {rows.map((r) => <Row key={r.id} r={r} kind={kind} />)}
            {rows.length === 0 && <div className="px-4 py-4 text-center text-ink/40 text-xs">None yet</div>}
          </div>
        ))}
      </div>

      {composeDoc && (
        <ComposeEmailModal
          kind={composeDoc.kind}
          r={composeDoc.r}
          job={job}
          companySettings={companySettings}
          onClose={() => setComposeDoc(null)}
          onSent={load}
        />
      )}
    </div>
  );
}

function WorkOrders({ jobId }) {
  const { isAdmin } = useProfile();
  const [orders, setOrders] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [profiles, setProfiles] = useState({});

  const load = useCallback(async () => {
    // Explicit column list rather than `*`: source_amount is the invoice total, and the
    // Work Orders tab is visible to the whole crew, so a non-admin session never asks
    // for it in the first place.
    const columns = [
      "id", "job_id", "title", "source_type", "source_id", "scheduled_date", "created_at", "created_by",
      isAdmin ? "source_amount" : null,
      "work_order_items(*)", "work_order_materials(*)", "work_order_resources(*)",
    ].filter(Boolean).join(", ");

    const { data: wos } = await supabase
      .from("work_orders")
      .select(columns)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setOrders(wos || []);
    const { data: profs } = await supabase.from("profiles").select("id, full_name");
    const map = {};
    (profs || []).forEach((p) => { map[p.id] = p.full_name; });
    setProfiles(map);
  }, [jobId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function createManual(e) {
    e.preventDefault();
    if (!newTitle) return;
    await supabase.from("work_orders").insert([{ job_id: jobId, title: newTitle, source_type: "manual" }]);
    setNewTitle("");
    load();
  }

  // The day the crew is meant to do it. Clearing it takes the work order off the week
  // view without deleting anything.
  async function setScheduledDate(id, value) {
    await supabase.from("work_orders").update({ scheduled_date: value || null }).eq("id", id);
    load();
  }

  async function setAssignee(id, value) {
    await supabase.from("work_orders").update({ assigned_to: value || null }).eq("id", id);
    load();
  }

  async function deleteWorkOrder(id) {
    if (!confirm("Delete this whole work order, including its checklist, materials, and tool list?")) return;
    await supabase.from("work_orders").delete().eq("id", id);
    load();
  }

  async function addItem(workOrderId, description) {
    if (!description) return;
    await supabase.from("work_order_items").insert([{ work_order_id: workOrderId, description }]);
    load();
  }

  async function removeItem(id) {
    await supabase.from("work_order_items").delete().eq("id", id);
    load();
  }

  async function removeMaterial(id) {
    await supabase.from("work_order_materials").delete().eq("id", id);
    load();
  }

  async function toggleItem(item) {
    const { data: { user } } = await supabase.auth.getUser();
    if (item.checked_at) {
      await supabase.from("work_order_items").update({ checked_at: null, checked_by: null }).eq("id", item.id);
    } else {
      await supabase.from("work_order_items").update({ checked_at: new Date().toISOString(), checked_by: user?.id }).eq("id", item.id);
    }
    load();
  }

  async function addResource(workOrderId, description, needed_by) {
    if (!description) return;
    await supabase.from("work_order_resources").insert([{ work_order_id: workOrderId, description, needed_by: needed_by || null }]);
    load();
  }

  async function removeResource(id) {
    await supabase.from("work_order_resources").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={createManual} className="bg-surface border border-border rounded-lg p-4 flex gap-2">
        <input placeholder="New work order title" className="border border-border rounded px-3 py-2 flex-1"
          value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button className="bg-steel hover:bg-steel-dark text-white rounded px-3 py-2 font-display uppercase text-sm">
          Create
        </button>
      </form>

      {orders.map((wo) => (
        <div key={wo.id} className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="font-display font-semibold">
              {wo.title}
              {isAdmin && wo.source_amount != null && (
                <span className="text-ink/40 font-body font-normal text-sm ml-2">
                  ${Number(wo.source_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
            {isAdmin && (
              <button onClick={() => deleteWorkOrder(wo.id)} className="text-xs text-ink/40 hover:text-accent-dark shrink-0">
                Delete work order
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <label className="text-xs text-ink/50">Goes out</label>
            <input type="date" value={wo.scheduled_date || ""}
              onChange={(e) => setScheduledDate(wo.id, e.target.value)}
              className="border border-border rounded px-2 py-1 text-sm" />
            {wo.scheduled_date && (
              <button onClick={() => setScheduledDate(wo.id, null)}
                className="text-xs text-ink/40 hover:text-accent-dark">Clear</button>
            )}

            <label className="text-xs text-ink/50 ml-2">Assigned to</label>
            <select value={wo.assigned_to || ""} onChange={(e) => setAssignee(wo.id, e.target.value)}
              className="border border-border rounded px-2 py-1 text-sm">
              <option value="">Anyone</option>
              {Object.entries(profiles).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>

            {!wo.scheduled_date && (
              <span className="text-xs text-ink/40 w-full">
                No date set — it won&apos;t appear on the crew&apos;s week until you give it one.
              </span>
            )}
          </div>
          <div className="space-y-1 mb-3">
            {(wo.work_order_items || []).sort((a, b) => a.sort_order - b.sort_order).map((item) => (
              <label key={item.id} className="flex items-start gap-2 text-sm py-1 cursor-pointer">
                <input type="checkbox" checked={!!item.checked_at} onChange={() => toggleItem(item)} className="mt-1" />
                <span className="flex-1">
                  <span className={item.checked_at ? "line-through text-ink/40" : ""}>{item.description}</span>
                  {item.checked_at && (
                    <span className="block text-xs text-ink/40 font-mono">
                      ✓ {profiles[item.checked_by] || "someone"} — {new Date(item.checked_at).toLocaleString()}
                    </span>
                  )}
                </span>
                {isAdmin && (
                  <button onClick={(e) => { e.preventDefault(); removeItem(item.id); }} className="text-ink/30 hover:text-accent-dark text-xs">✕</button>
                )}
              </label>
            ))}
            {(!wo.work_order_items || wo.work_order_items.length === 0) && (
              <div className="text-ink/40 text-sm">No checklist items yet.</div>
            )}
          </div>
          <AddItemForm onAdd={(desc) => addItem(wo.id, desc)} />

          {wo.work_order_materials && wo.work_order_materials.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-1.5">Materials</div>
              {wo.work_order_materials.map((m) => (
                <div key={m.id} className="text-sm text-ink/70 flex justify-between items-center py-0.5">
                  <span>{m.description}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs">{m.quantity} {m.unit}</span>
                    {isAdmin && <button onClick={() => removeMaterial(m.id)} className="text-ink/30 hover:text-accent-dark text-xs">✕</button>}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border">
            <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-1.5">Tools &amp; rental requirements</div>
            {(wo.work_order_resources || []).map((r) => (
              <div key={r.id} className="text-sm flex justify-between items-center py-0.5">
                <span>{r.description} {r.needed_by && <span className="text-ink/40 text-xs">· needed by {r.needed_by}</span>}</span>
                {isAdmin && <button onClick={() => removeResource(r.id)} className="text-ink/30 hover:text-accent-dark text-xs">✕</button>}
              </div>
            ))}
            <AddResourceForm onAdd={(desc, date) => addResource(wo.id, desc, date)} />
          </div>
        </div>
      ))}
      {orders.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-ink/50 text-sm">
          No work orders yet for this job.
        </div>
      )}
    </div>
  );
}

function AddResourceForm({ onAdd }) {
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAdd(desc, date); setDesc(""); setDate(""); }} className="flex gap-2 mt-1.5">
      <input placeholder="e.g. Scissor lift, concrete mixer rental" className="border border-border rounded px-2 py-1 text-sm flex-1"
        value={desc} onChange={(e) => setDesc(e.target.value)} />
      <input type="date" className="border border-border rounded px-2 py-1 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-2">Add</button>
    </form>
  );
}

function AddItemForm({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAdd(val); setVal(""); }} className="flex gap-2">
      <input placeholder="Add checklist item" className="border border-border rounded px-2 py-1 text-sm flex-1"
        value={val} onChange={(e) => setVal(e.target.value)} />
      <button className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-2">
        Add
      </button>
    </form>
  );
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day;
  return new Date(date.setDate(diff)).toISOString().slice(0, 10);
}

function WeeklyReport({ jobId, job }) {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [hours, setHours] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [company, setCompany] = useState(null);
  // null until the client's saved preference loads, so the report doesn't flash the
  // wrong sections on the way in.
  const [includeHours, setIncludeHours] = useState(null);
  const [savingPref, setSavingPref] = useState(false);

  const brandCompany = withBrandDefaults(company);

  useEffect(() => {
    supabase.from("company_settings").select("*").maybeSingle()
      .then(({ data }) => setCompany(data));
  }, []);

  // The include-hours choice lives on the client, not the job — set once, applies to
  // every weekly report that client receives.
  useEffect(() => {
    if (!job?.contact_id) { setIncludeHours(false); return; }
    supabase.from("contacts").select("report_include_hours").eq("id", job.contact_id).maybeSingle()
      .then(({ data }) => setIncludeHours(Boolean(data?.report_include_hours)));
  }, [job?.contact_id]);

  async function setClientPreference(value) {
    setIncludeHours(value);
    if (!job?.contact_id) return;
    setSavingPref(true);
    await supabase.from("contacts").update({ report_include_hours: value }).eq("id", job.contact_id);
    setSavingPref(false);
  }

  // Browsers stamp the document title into the printed page's header margin, which
  // would put the internal app name on a client-facing report. Swapping the title for
  // the duration of the print is the only way to influence that from script.
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printProgress, setPrintProgress] = useState(null);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);

  // Builds the PDF directly rather than going through the print dialog. The browser's
  // print preview has to hold every page in memory at once and stalls on a photo-heavy
  // week; this processes one image at a time and always finishes.
  async function downloadPdf() {
    setBuildingPdf(true);
    setPdfProgress(null);
    try {
      // Signed URLs are already resolved for the visible slice; anything unresolved is
      // rendered as a placeholder rather than holding up the document.
      const photoUrls = {};
      visiblePhotos.forEach((ph) => { photoUrls[ph.id] = photoSrc(ph); });

      await generateWeeklyReportPdf({
        job,
        company: brandCompany,
        weekStart,
        photos: visiblePhotos,
        photoUrls,
        hoursByWorker: byWorker,
        totalHours,
        includeHours: Boolean(includeHours),
        onProgress: (done, total) => setPdfProgress(`${done} of ${total}`),
      });
    } catch (e) {
      alert(`Couldn't build the PDF: ${e.message || e}`);
    }
    setPdfProgress(null);
    setBuildingPdf(false);
  }

  async function printReport() {
    setPreparingPrint(true);
    try {
      // Photos load through a throttled queue, so wait for it to drain before printing —
      // an image still in the queue paints as an empty box, and the print dialog is
      // modal so there's no correcting it afterwards.
      const deadline = Date.now() + 25000;
      while ((imageQueue.active > 0 || imageQueue.waiting.length > 0) && Date.now() < deadline) {
        const done = visiblePhotos.length - imageQueue.waiting.length - imageQueue.active;
        setPrintProgress(`${Math.max(0, done)} of ${visiblePhotos.length}`);
        await new Promise((r) => setTimeout(r, 250));
      }
      setPrintProgress(null);
      const imgs = Array.from(document.querySelectorAll("#report-print img"));
      await Promise.all(imgs.map((img) => (
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((resolve) => {
              // Resolve on failure too — one unloadable photo shouldn't block the print.
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
              setTimeout(resolve, 8000);
            })
      )));
    } catch (e) {
      // Printing anyway is better than not printing.
    }
    setPreparingPrint(false);
    setPrintProgress(null);

    const original = document.title;
    document.title = `${job.title} - Weekly Report - Week of ${weekStart}`;
    const restore = () => { document.title = original; };
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
    // Safari doesn't always fire afterprint.
    setTimeout(restore, 3000);
  }

  useEffect(() => {
    // weekStart reaches the .or() filter below as part of a PostgREST expression rather
    // than as a value, so it's validated to a plain YYYY-MM-DD before use. A date input
    // normally produces exactly that, but "normally" isn't a guarantee — the value can
    // be set from the URL or the console, and a stray comma or paren would rewrite the
    // filter instead of being read as text.
    const start = safeDate(weekStart, startOfWeek(new Date()));
    const end = safeDate(
      new Date(new Date(`${start}T00:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10),
      start
    );
    supabase.from("job_hours").select("*").eq("job_id", jobId).gte("date", start).lte("date", end)
      .then(({ data }) => setHours(data || []));
    supabase.from("job_expenses").select("*").eq("job_id", jobId).gte("date", start).lte("date", end)
      .then(({ data }) => setExpenses(data || []));
    // Group by when the photo was actually taken (EXIF), not when it was
    // uploaded — a batch upload days later shouldn't land in the wrong week.
    // Photos with no readable EXIF date (taken_at is null) fall back to
    // matching on their upload time instead.
    supabase.from("job_photos").select("*").eq("job_id", jobId)
      .or(`and(taken_at.gte.${start},taken_at.lte.${end + "T23:59:59"}),and(taken_at.is.null,created_at.gte.${start},created_at.lte.${end + "T23:59:59"})`)
      .then(({ data }) => setPhotos(data || []));
  }, [jobId, weekStart]);

  // A week with a hundred-plus photos is ~30 pages of images, which is enough to stall
  // the browser's print preview outright. Printing a slice at a time keeps each run
  // small; PHOTOS_PER_PRINT is a page count of 10 at four per page.
  const PHOTOS_PER_PRINT = 60;
  const [photoPage, setPhotoPage] = useState(0);
  const photoPageCount = Math.max(1, Math.ceil(photos.length / PHOTOS_PER_PRINT));
  // Reset to the first slice whenever the week changes, so the selector can't point
  // past the end of a shorter week.
  useEffect(() => { setPhotoPage(0); }, [weekStart]);

  const visiblePhotos = photos.length > PHOTOS_PER_PRINT
    ? photos.slice(photoPage * PHOTOS_PER_PRINT, (photoPage + 1) * PHOTOS_PER_PRINT)
    : photos;

  // 1200px wide is well above what a half-page print needs and a fraction of the bytes
  // of a 4000px original.
  const { srcFor: photoSrc, ready: photosReady } = useSignedUrlMap("job-photos", visiblePhotos, 1200);

  const totalHours = hours.reduce((s, r) => s + Number(r.hours), 0);
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);
  const byWorker = hours.reduce((acc, r) => {
    acc[r.worker_name] = (acc[r.worker_name] || 0) + Number(r.hours);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap no-print">
        <label className="text-xs font-display uppercase tracking-wide text-ink/60">Week of</label>
        <input type="date" value={weekStart} onChange={(e) => setWeekStart(startOfWeek(e.target.value))}
          className="border border-border rounded px-3 py-2" />

        <label className="flex items-center gap-2 text-xs text-ink/70 ml-auto">
          <input type="checkbox" checked={Boolean(includeHours)} disabled={!job?.contact_id || savingPref}
            onChange={(e) => setClientPreference(e.target.checked)} />
          Include hours for this client
        </label>
      </div>

      {photos.length > PHOTOS_PER_PRINT && (
        <div className="bg-surface border border-border rounded-lg p-3 no-print">
          <div className="text-sm mb-2">
            {photos.length} photos this week. Split into batches of {PHOTOS_PER_PRINT} so each PDF stays a manageable size.
          </div>
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: photoPageCount }, (_, i) => (
              <button key={i} onClick={() => setPhotoPage(i)}
                className={`text-xs border rounded px-2 py-1 ${
                  photoPage === i ? "bg-ink text-white border-ink" : "border-border text-ink/60"
                }`}>
                {i * PHOTOS_PER_PRINT + 1}&ndash;{Math.min((i + 1) * PHOTOS_PER_PRINT, photos.length)}
              </button>
            ))}
          </div>
          <div className="text-xs text-ink/40 mt-2">
            Pick a batch, hit Download PDF, then pick the next one.
          </div>
        </div>
      )}
      {job?.contact_id ? (
        <p className="text-xs text-ink/40 no-print">
          Saved against the client, so every weekly report they get comes out the same way.
        </p>
      ) : (
        <p className="text-xs text-ink/40 no-print">
          This job has no client attached, so the hours preference can&apos;t be saved — photos only.
        </p>
      )}

      <div id="report-print" className="bg-surface border border-border rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="font-display text-xl font-semibold">{job.title} — Weekly Report</div>
            <div className="text-ink/50 text-sm font-mono">Week of {weekStart}</div>
          </div>
          <div className="text-right text-xs text-ink/60 shrink-0">
            <div className="font-bold text-sm text-ink">{brandCompany.companyName}</div>
            {brandCompany.address && <div>{brandCompany.address}</div>}
            {brandCompany.phone && <div>{brandCompany.phone}</div>}
            {brandCompany.replyTo && <div>{brandCompany.replyTo}</div>}
          </div>
        </div>

        <div className={includeHours ? "grid sm:grid-cols-2 gap-4" : "hidden"}>
          <div>
            <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-2">Hours by worker</div>
            {Object.keys(byWorker).length === 0 && <div className="text-ink/40 text-sm">No hours logged this week.</div>}
            {Object.entries(byWorker).map(([name, hrs]) => (
              <div key={name} className="flex justify-between text-sm py-0.5">
                <span>{name}</span><span className="font-mono">{hrs} hrs</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-1 border-t border-border mt-1 font-medium">
              <span>Total</span><span className="font-mono">{totalHours} hrs</span>
            </div>
          </div>
          <div>
            <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-2">Expenses</div>
            {expenses.length === 0 && <div className="text-ink/40 text-sm">No expenses logged this week.</div>}
            {expenses.map((r) => (
              <div key={r.id} className="flex justify-between text-sm py-0.5">
                <span>{r.description}</span><span className="font-mono">{money(r.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-1 border-t border-border mt-1 font-medium">
              <span>Total</span><span className="font-mono">{money(totalExpenses)}</span>
            </div>
          </div>
        </div>

        <div className={`report-photos-block ${includeHours && photos.length > 0 ? "break-before-page" : ""}`}>
          <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-2">
            Photos this week ({photos.length})
            {photos.length > PHOTOS_PER_PRINT && (
              <span className="normal-case tracking-normal text-ink/40">
                {" "}— showing {photoPage * PHOTOS_PER_PRINT + 1}&ndash;
                {Math.min((photoPage + 1) * PHOTOS_PER_PRINT, photos.length)}
              </span>
            )}
          </div>
          {photos.length === 0 && <div className="text-ink/40 text-sm">No photos this week.</div>}
          <div className="report-photos grid grid-cols-3 sm:grid-cols-5 gap-2">
            {visiblePhotos.map((ph) => (
              <figure key={ph.id} className="report-photo m-0">
                {/* Photos live in a private bucket, so they need a signed URL — the legacy
                    `url` column is empty for anything uploaded since that change. */}
                <GalleryImage src={photoSrc(ph)} ready={photosReady} alt={ph.caption || ""}
                  className="w-full h-20 object-cover rounded report-photo-img" />
                <figcaption className="report-photo-caption hidden text-xs text-ink/60 mt-1">
                  {ph.caption || ""}
                  <span className="text-ink/40">
                    {ph.caption ? " · " : ""}
                    {new Date(ph.taken_at || ph.created_at).toLocaleDateString()}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap no-print">
        <button onClick={downloadPdf} disabled={buildingPdf || preparingPrint}
          className="bg-ink text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded disabled:opacity-50">
          {buildingPdf
            ? `Building PDF${pdfProgress ? ` (${pdfProgress})` : ""}...`
            : "Download PDF"}
        </button>
        <button onClick={printReport} disabled={buildingPdf || preparingPrint}
          className="border border-border text-ink/70 font-display uppercase text-sm tracking-wide px-4 py-2 rounded disabled:opacity-50">
          {preparingPrint
            ? `Loading photos${printProgress ? ` (${printProgress})` : ""}...`
            : "Print instead"}
        </button>
      </div>
      <p className="text-xs text-ink/40 no-print">
        Download PDF builds the file directly and saves it — use this one. Printing goes
        through the browser&apos;s print dialog, which struggles with photo-heavy weeks.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <JobDetail />
    </AuthGate>
  );
}
