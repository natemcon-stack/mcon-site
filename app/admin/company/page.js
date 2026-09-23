"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import SetupPanel from "@/components/SetupPanel";
import { getSignedUrl } from "@/lib/signedUrl";
import { brand } from "@/lib/brand";
import { PROVINCES, statHolidaysFor, HOLIDAY_CAVEAT } from "@/lib/statHolidays";
import { SCHEDULE_LABELS, WEEKDAYS } from "@/lib/payrollPeriods";

function CompanyPage() {
  const { isAdmin, loading, companyId } = useProfile();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [certSignedUrl, setCertSignedUrl] = useState(null);

  async function load() {
    const { data } = await supabase.from("company_settings").select("*").maybeSingle();
    setSettings(data);
    const legacyPath = data?.insurance_certificate_path
      || (data?.insurance_certificate_url
        ? (() => {
            const marker = "/storage/v1/object/public/documents/";
            const idx = data.insurance_certificate_url.indexOf(marker);
            return idx === -1 ? null : data.insurance_certificate_url.slice(idx + marker.length);
          })()
        : null);
    if (legacyPath) getSignedUrl("documents", legacyPath).then(setCertSignedUrl);
  }
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const { id, updated_at, ...updates } = settings;
    const { error } = await supabase.from("company_settings").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    setSaving(false);
    if (error) alert("Couldn't save: " + error.message);
  }

  async function uploadCertificate(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `insurance-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file);
    if (!error) {
      setSettings({ ...settings, insurance_certificate_path: path });
      await supabase.from("company_settings").update({ insurance_certificate_path: path }).eq("id", settings.id);
      getSignedUrl("documents", path).then(setCertSignedUrl);
    } else {
      alert("Upload failed: " + error.message + " — make sure a 'documents' storage bucket exists (Private) in Supabase.");
    }
    setUploading(false);
  }

  // --- logo ---------------------------------------------------------------
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    if (!settings?.logo_path) { setLogoPreview(null); return; }
    getSignedUrl("documents", settings.logo_path).then(setLogoPreview);
  }, [settings?.logo_path]);

  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logos should be under 2 MB — a large image slows every invoice that carries it.");
      return;
    }
    setLogoUploading(true);
    // Company-prefixed like every other upload, so the storage policies apply.
    const ext = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").slice(0, 5);
    const path = `${companyId}/branding/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("documents")
      .upload(path, file, { contentType: file.type || "image/png" });
    if (error) {
      setLogoUploading(false);
      alert(`Couldn't upload that: ${error.message}`);
      return;
    }
    // The old file is left in place deliberately: an invoice already sent references it,
    // and removing it would blank the logo on a document a client may still open.
    await supabase.from("company_settings").update({ logo_path: path }).eq("id", settings.id);
    setLogoUploading(false);
    load();
  }

  async function removeLogo() {
    await supabase.from("company_settings").update({ logo_path: null }).eq("id", settings.id);
    load();
  }

  // --- province -----------------------------------------------------------
  const [presets, setPresets] = useState([]);

  // Connection status only. The secret is never selected client-side; this just says
  // whether one is set so the panel can show "connected".
  const [companyRow, setCompanyRow] = useState(null);
  async function loadCompanyRow() {
    const { data } = await supabase
      .from("companies").select("id, paypal_client_id, paypal_mode").maybeSingle();
    setCompanyRow(data ? {
      paypal_connected: Boolean(data.paypal_client_id),
      paypal_mode: data.paypal_mode,
    } : null);
  }
  useEffect(() => { loadCompanyRow(); }, []);
  useEffect(() => {
    supabase.from("tax_presets").select("*").order("province").order("sort_order")
      .then(({ data }) => setPresets(data || []));
  }, []);

  async function changeProvince(code) {
    setSettings((v) => ({ ...v, province: code }));
    await supabase.from("company_settings").update({ province: code }).eq("id", settings.id);

    // Offer the province's taxes without switching any on. A company registered for GST
    // only shouldn't silently start charging PST because someone corrected the province.
    const { data: existing } = await supabase.from("tax_rates").select("name");
    const have = new Set((existing || []).map((t) => t.name.toUpperCase()));
    const missing = presets.filter((p) => p.province === code && !have.has(p.name.toUpperCase()));
    if (missing.length) {
      await supabase.from("tax_rates").insert(
        missing.map((p) => ({ name: p.name, rate: p.rate, enabled: false, sort_order: p.sort_order }))
      );
    }
    // The tax list is a sibling component; a reload is the simplest way to keep both
    // views honest without wiring shared state through the page.
    window.dispatchEvent(new Event("tax-rates-changed"));
  }

  if (loading || !settings) return null;
  if (!isAdmin) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  const inputClass = "w-full border border-border rounded px-3 py-2";
  const labelClass = "block text-xs font-display uppercase tracking-wide text-ink/60 mb-1";

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Company Info</h1>
        <p className="text-sm text-ink/60 mb-5">
          Shown on every invoice and estimate sent to clients. WCB/insurance formatting here is a
          clean standard layout — if you want it to match your old Joist invoices exactly, send
          me a screenshot of one and I'll match the format precisely.
        </p>
        <form onSubmit={save} className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div className="pb-2 border-b border-border">
            <div className="font-display text-sm uppercase tracking-wide text-ink/70">Identity</div>
            <p className="text-xs text-ink/50 mt-1">
              Leave any of these blank to fall back to this deployment&apos;s configured default,
              shown as the placeholder.
            </p>
          </div>
          <div>
            <label className={labelClass}>Company legal name</label>
            <input className={inputClass} placeholder={brand.companyName} value={settings.company_name || ""}
              onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} />
            <p className="text-xs text-ink/40 mt-1">Used on invoices, estimates, PDFs, and email signatures.</p>
          </div>
          <div>
            <label className={labelClass}>Sending email address</label>
            <input type="email" className={inputClass} placeholder={brand.fromEmail} value={settings.from_email || ""}
              onChange={(e) => setSettings({ ...settings, from_email: e.target.value })} />
            <p className="text-xs text-ink/40 mt-1">
              Must be on a domain verified in Resend, or sends will fail. Replies go to the reply-to
              address below, not here.
            </p>
          </div>
          <div>
            <label className={labelClass}>Reply-to email</label>
            <input type="email" className={inputClass} placeholder={brand.replyToEmail}
              value={settings.reply_to_email || ""}
              onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })} />
            <p className="text-xs text-ink/40 mt-1">
              Where client replies land, and the address copied in when you tick &ldquo;copy
              me&rdquo; on a send. It must be a real mailbox you can receive at.
            </p>
            {(!settings.reply_to_email
              || settings.reply_to_email.toLowerCase() === (settings.from_email || "").toLowerCase()) && (
              <p className="text-xs text-warn mt-1">
                This is empty or the same as your sending address. A sending address usually
                has no mailbox behind it, so mail copied there bounces — and once a bounced
                address is suppressed, whole emails to your clients get blocked with it.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Bookkeeper / accountant email</label>
            <input type="email" className={inputClass} placeholder={brand.accountantEmail || "not set"} value={settings.accountant_email || ""}
              onChange={(e) => setSettings({ ...settings, accountant_email: e.target.value })} />
            <p className="text-xs text-ink/40 mt-1">Where the payroll hours report is sent. Falls back to reply-to if blank.</p>
          </div>
          <div>
            <label className={labelClass}>Logo</label>
            <p className="text-xs text-ink/40 mb-2">
              Shown on invoices, estimates and the client-facing pages. A PNG with a
              transparent background works best — it sits on a light header.
            </p>
            {logoPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Current logo"
                className="h-14 mb-2 bg-white border border-border rounded px-2 py-1 object-contain" />
            )}
            <div className="flex gap-2 items-center">
              <label className="text-sm border border-border rounded px-3 py-1.5 cursor-pointer hover:text-steel">
                {logoUploading ? "Uploading..." : logoPreview ? "Replace logo" : "Upload logo"}
                <input type="file" accept="image/*" className="hidden"
                  disabled={logoUploading} onChange={uploadLogo} />
              </label>
              {settings.logo_path && (
                <button type="button" onClick={removeLogo}
                  className="text-xs text-ink/40 hover:text-accent-dark">Remove</button>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>Header shown to your crew</label>
            <input className={inputClass}
              placeholder={`${settings.company_name || "Your Company"} Job Board`}
              value={settings.app_header || ""}
              onChange={(e) => setSettings({ ...settings, app_header: e.target.value })} />
            <p className="text-xs text-ink/40 mt-1">
              Leave blank to use your company name followed by &ldquo;Job Board&rdquo;.
            </p>
          </div>

          <div>
            <label className={labelClass}>Province</label>
            <select className={inputClass} value={settings.province || "BC"}
              onChange={(e) => changeProvince(e.target.value)}>
              {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <p className="text-xs text-ink/40 mt-1">
              Sets your statutory holidays and offers the right sales taxes. Changing it
              doesn&apos;t alter anything already invoiced.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Default city</label>
              <input className={inputClass} placeholder={brand.defaultCity || "not set"} value={settings.default_city || ""}
                onChange={(e) => setSettings({ ...settings, default_city: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Default province</label>
              <input className={inputClass} placeholder={brand.defaultProvince} value={settings.default_province || ""}
                onChange={(e) => setSettings({ ...settings, default_province: e.target.value })} />
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <div className="font-display text-sm uppercase tracking-wide text-ink/70">Compliance</div>
          </div>
          <div>
            <label className={labelClass}>WorkSafeBC registration number</label>
            <input className={inputClass} value={settings.wcb_number || ""}
              onChange={(e) => setSettings({ ...settings, wcb_number: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Insurance provider</label>
            <input className={inputClass} value={settings.insurance_provider || ""}
              onChange={(e) => setSettings({ ...settings, insurance_provider: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Policy number</label>
            <input className={inputClass} value={settings.insurance_policy_number || ""}
              onChange={(e) => setSettings({ ...settings, insurance_policy_number: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Coverage amount</label>
            <input className={inputClass} placeholder="$2,000,000" value={settings.insurance_amount || ""}
              onChange={(e) => setSettings({ ...settings, insurance_amount: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Proof of insurance (PDF or image)</label>
            <input type="file" accept=".pdf,image/*" onChange={uploadCertificate} disabled={uploading} className="text-sm" />
            {(settings.insurance_certificate_path || settings.insurance_certificate_url) && (
              <a href={certSignedUrl || settings.insurance_certificate_url || "#"} target="_blank" rel="noreferrer" className="block text-xs text-steel mt-1">
                Current file → {certSignedUrl ? "" : "(loading link...)"}
              </a>
            )}
          </div>
          <div>
            <label className={labelClass}>Business address</label>
            <input className={inputClass} value={settings.address || ""}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={settings.phone || ""}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Website</label>
            <input className={inputClass} value={settings.website || ""}
              onChange={(e) => setSettings({ ...settings, website: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Business / Tax number</label>
            <input className={inputClass} value={settings.business_number || ""}
              onChange={(e) => setSettings({ ...settings, business_number: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Default payment terms</label>
            <input className={inputClass} value={settings.payment_terms || ""}
              onChange={(e) => setSettings({ ...settings, payment_terms: e.target.value })} placeholder="Due upon receipt" />
          </div>
          <div>
            <label className={labelClass}>Insurance job markup % (optional, on top of normal markup)</label>
            <input type="number" className={inputClass} value={settings.insurance_markup_pct || ""}
              onChange={(e) => setSettings({ ...settings, insurance_markup_pct: e.target.value })} placeholder="0" />
            <p className="text-xs text-ink/40 mt-1">Applied only on documents where you check "Apply insurance markup" — a way to price toward the higher end insurers in remote/expensive regions would typically approve, using your own judgment rather than pulling real Xactimate/ICC region data (which isn't something this app can access).</p>
          </div>
          <div>
            <label className={labelClass}>Terms & conditions (shown on every invoice/estimate)</label>
            <textarea rows={5} className={inputClass} value={settings.terms_and_conditions || ""}
              onChange={(e) => setSettings({ ...settings, terms_and_conditions: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Reply-to email for client emails</label>
            <input type="email" className={inputClass} value={settings.reply_to_email || ""}
              onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Estimate email — subject</label>
            <input className={inputClass} value={settings.estimate_email_subject || ""}
              onChange={(e) => setSettings({ ...settings, estimate_email_subject: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Estimate email — message</label>
            <textarea rows={2} className={inputClass} value={settings.estimate_email_body || ""}
              onChange={(e) => setSettings({ ...settings, estimate_email_body: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Invoice email — subject</label>
            <input className={inputClass} value={settings.invoice_email_subject || ""}
              onChange={(e) => setSettings({ ...settings, invoice_email_subject: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Invoice email — message</label>
            <textarea rows={2} className={inputClass} value={settings.invoice_email_body || ""}
              onChange={(e) => setSettings({ ...settings, invoice_email_body: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Google review link (for review requests)</label>
            <input className={inputClass} value={settings.google_review_url || ""}
              onChange={(e) => setSettings({ ...settings, google_review_url: e.target.value })} placeholder="https://g.page/r/.../review" />
          </div>
          <div>
            <label className={labelClass}>Review request email — subject</label>
            <input className={inputClass} value={settings.review_email_subject || ""}
              onChange={(e) => setSettings({ ...settings, review_email_subject: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Review request email — message</label>
            <textarea rows={3} className={inputClass} value={settings.review_email_body || ""}
              onChange={(e) => setSettings({ ...settings, review_email_body: e.target.value })} />
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-2.5 rounded disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </form>

        <TaxRates />
        <PayrollSchedule settings={settings} onSaved={load} />
        <StatHolidays province={settings.province} />
        <SetupPanel company={companyRow} onSaved={loadCompanyRow} />
      </main>
    </>
  );
}

function TaxRates() {
  const [rates, setRates] = useState([]);
  const [form, setForm] = useState({ name: "", rate: "" });
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    const { data } = await supabase.from("tax_rates").select("*").order("sort_order");
    setRates(data || []);
  }
  useEffect(() => {
    load();
    // Changing province adds that province's taxes; this keeps the list in step
    // without threading state through the page.
    const onChange = () => load();
    window.addEventListener("tax-rates-changed", onChange);
    return () => window.removeEventListener("tax-rates-changed", onChange);
  }, []);

  // The rate itself is editable: provincial rates move (Nova Scotia went from 15% to
  // 14% in 2025), and waiting on someone to ship an update is worse than typing it.
  async function updateRate(id, value) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return;
    await supabase.from("tax_rates").update({ rate }).eq("id", id);
    load();
  }

  async function add(e) {
    e.preventDefault();
    if (!form.name || !form.rate) return;
    await supabase.from("tax_rates").insert([{ name: form.name, rate: Number(form.rate), sort_order: rates.length }]);
    setForm({ name: "", rate: "" });
    load();
  }

  async function toggle(id, enabled) {
    await supabase.from("tax_rates").update({ enabled: !enabled }).eq("id", id);
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this tax rate?")) return;
    await supabase.from("tax_rates").delete().eq("id", id);
    load();
  }

  return (
    <div className="mt-6">
      <h2 className="font-display text-lg font-semibold tracking-wide mb-2">Taxes</h2>
      <p className="text-sm text-ink/60 mb-1">
        Applied to every estimate and invoice total. Switch on only the taxes you&apos;re
        actually registered to collect.
      </p>
      <p className="text-xs text-ink/40 mb-3">
        Setting your province above adds that province&apos;s taxes here, switched off.
        Rates are editable — provincial rates change from time to time.
      </p>
      <form onSubmit={add} className="bg-surface border border-border rounded-lg p-4 flex gap-2 mb-3">
        <input placeholder="Name (e.g. PST)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="flex-1 border border-border rounded px-3 py-2" />
        <input type="number" step="0.01" placeholder="Rate %" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })}
          className="w-24 border border-border rounded px-3 py-2" />
        <button className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3">Add</button>
      </form>
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        {rates.map((t) => (
          <div key={t.id} className={`px-4 py-2 flex items-center justify-between text-sm gap-3 ${t.enabled ? "" : "opacity-60"}`}>
            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
              <input type="checkbox" checked={t.enabled} onChange={() => toggle(t.id, t.enabled)} />
              <span className="font-medium">{t.name}</span>
            </label>
            <span className="flex items-center gap-2 shrink-0">
              <input type="number" step="0.001" defaultValue={t.rate}
                onBlur={(e) => e.target.value !== String(t.rate) && updateRate(t.id, e.target.value)}
                className="w-20 border border-border rounded px-2 py-1 text-right font-mono" />
              <span className="text-ink/40">%</span>
              <button onClick={() => remove(t.id)} className="text-ink/30 hover:text-accent-dark">✕</button>
            </span>
          </div>
        ))}
        {rates.length === 0 && <div className="px-4 py-6 text-center text-ink/40 text-sm">No tax rates yet.</div>}
      </div>
    </div>
  );
}

// Pay schedule. Was fixed at the 11th and 26th because that's one company's cycle.
function PayrollSchedule({ settings, onSaved }) {
  const [form, setForm] = useState({
    payroll_schedule: settings.payroll_schedule || "semi_monthly",
    payroll_day_1: settings.payroll_day_1 ?? 11,
    payroll_day_2: settings.payroll_day_2 ?? 26,
    payroll_weekday: settings.payroll_weekday ?? 5,
    payroll_anchor_date: settings.payroll_anchor_date || "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("company_settings").update({
      ...form,
      payroll_day_1: Number(form.payroll_day_1),
      payroll_day_2: Number(form.payroll_day_2),
      payroll_weekday: Number(form.payroll_weekday),
      payroll_anchor_date: form.payroll_anchor_date || null,
    }).eq("id", settings.id);
    setSaving(false);
    onSaved?.();
  }

  const input = "border border-border rounded px-2 py-1.5 text-sm";

  return (
    <form onSubmit={save} className="mt-6">
      <h2 className="font-display text-lg font-semibold tracking-wide mb-2">Payroll schedule</h2>
      <p className="text-sm text-ink/60 mb-3">
        When pay periods close and the crew is reminded to submit hours.
      </p>

      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-xs text-ink/50 mb-1">How often</label>
          <select value={form.payroll_schedule}
            onChange={(e) => setForm({ ...form, payroll_schedule: e.target.value })}
            className={input + " w-full"}>
            {Object.entries(SCHEDULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {form.payroll_schedule === "semi_monthly" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink/50 mb-1">First period closes on</label>
              <input type="number" min={1} max={28} value={form.payroll_day_1}
                onChange={(e) => setForm({ ...form, payroll_day_1: e.target.value })} className={input + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-ink/50 mb-1">Second closes on</label>
              <input type="number" min={1} max={28} value={form.payroll_day_2}
                onChange={(e) => setForm({ ...form, payroll_day_2: e.target.value })} className={input + " w-full"} />
            </div>
            <p className="col-span-2 text-xs text-ink/40">
              Kept to the 28th or earlier so the day exists in February.
            </p>
          </div>
        )}

        {(form.payroll_schedule === "weekly" || form.payroll_schedule === "biweekly") && (
          <div>
            <label className="block text-xs text-ink/50 mb-1">Period closes on</label>
            <select value={form.payroll_weekday}
              onChange={(e) => setForm({ ...form, payroll_weekday: e.target.value })}
              className={input + " w-full"}>
              {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </div>
        )}

        {form.payroll_schedule === "biweekly" && (
          <div>
            <label className="block text-xs text-ink/50 mb-1">Start of a known pay period</label>
            <input type="date" value={form.payroll_anchor_date}
              onChange={(e) => setForm({ ...form, payroll_anchor_date: e.target.value })}
              className={input + " w-full"} />
            <p className="text-xs text-ink/40 mt-1">
              Needed to work out which fortnight is which — &ldquo;every second Friday&rdquo;
              doesn&apos;t say which Friday on its own.
            </p>
          </div>
        )}

        <button type="submit" disabled={saving}
          className="border border-border rounded px-3 py-1.5 text-sm font-display uppercase tracking-wide disabled:opacity-50">
          {saving ? "Saving..." : "Save schedule"}
        </button>
      </div>
    </form>
  );
}

// Statutory holidays for the company's province, generated rather than imported.
function StatHolidays({ province }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const holidays = statHolidaysFor(province || "BC", year);

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="font-display text-lg font-semibold tracking-wide">Statutory holidays</h2>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="border border-border rounded px-2 py-1 text-sm">
          {[year - 1, year, year + 1, year + 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <p className="text-xs text-ink/40 mb-3">{HOLIDAY_CAVEAT}</p>

      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        {holidays.map((h) => (
          <div key={h.date} className="px-4 py-2 flex justify-between text-sm">
            <span>{h.name}</span>
            <span className="font-mono text-ink/50">
              {new Date(`${h.date}T00:00:00Z`).toLocaleDateString(undefined, {
                weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return <AuthGate><CompanyPage /></AuthGate>;
}
