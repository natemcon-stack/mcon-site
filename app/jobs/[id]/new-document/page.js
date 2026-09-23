"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import { saveDraft } from "@/lib/offlineQueue";
import { generateAndStoreInvoicePdf } from "@/lib/generateInvoicePdf";
import DocumentAttachments from "@/components/DocumentAttachments";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function lineTotal(li) {
  return Number(li.quantity) * Number(li.unit_cost) * (1 + Number(li.markup_pct) / 100);
}

// Defined OUTSIDE Builder on purpose — see earlier fix note: a component defined
// inside another component's function body gets recreated every render, which
// steals input focus after every keystroke.
function LineRow({ line, kind, onUpdate, onRemove, docKind, docId, jobId }) {
  const isClient = kind === "client";
  const [showPhotos, setShowPhotos] = useState(false);
  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <div className="grid grid-cols-[1fr_70px_70px_90px_90px_auto] gap-1.5 items-end text-sm">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">
            {isClient ? "Section title" : "Description"}
          </label>
          <input value={line.description} placeholder={isClient ? "e.g. Kitchen Rebuild" : "Description"}
            onChange={(e) => onUpdate({ description: e.target.value })}
            className="w-full border border-border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">Qty</label>
          <input type="number" value={line.quantity} step="0.01"
            onChange={(e) => onUpdate({ quantity: e.target.value })}
            className="w-full border border-border rounded px-2 py-1 font-mono" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">Unit</label>
          <input value={line.unit} onChange={(e) => onUpdate({ unit: e.target.value })}
            className="w-full border border-border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">Rate $</label>
          <input type="number" value={line.unit_cost} step="0.01"
            onChange={(e) => onUpdate({ unit_cost: e.target.value })}
            className="w-full border border-border rounded px-2 py-1 font-mono" />
        </div>
        {isClient ? (
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">Markup %</label>
            <input type="number" value={line.markup_pct} step="1"
              onChange={(e) => onUpdate({ markup_pct: e.target.value })}
              className="w-full border border-border rounded px-2 py-1 font-mono" />
          </div>
        ) : <span />}
        <button onClick={onRemove} className="text-ink/30 hover:text-accent-dark px-1 pb-1.5">✕</button>
      </div>
      {kind === "material" && (
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          <input placeholder="Manufacturer (optional)" value={line.manufacturer || ""}
            onChange={(e) => onUpdate({ manufacturer: e.target.value })}
            className="border border-border rounded px-2 py-1 text-xs" />
          <input placeholder="Color (optional)" value={line.color || ""}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="border border-border rounded px-2 py-1 text-xs" />
          <div className="flex items-center gap-1">
            <input type="number" placeholder="Waste %" value={line.waste_pct || ""}
              onChange={(e) => onUpdate({ waste_pct: e.target.value })}
              className="w-full border border-border rounded px-2 py-1 text-xs" />
            <span className="text-[10px] text-ink/40 shrink-0">waste</span>
          </div>
        </div>
      )}
      {kind === "material" && line.description && (
        <a href={`https://www.rona.ca/en/search?q=${encodeURIComponent(line.rona_search_term || line.description)}`}
          target="_blank" rel="noreferrer"
          className="inline-block text-[11px] text-steel hover:text-steel-dark mt-1">
          Check Rona →
        </a>
      )}
      {isClient && (
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-ink/40 mt-1.5 mb-0.5">Scope of work (shown to client, one line each)</label>
          <textarea
            value={line.scope_notes || ""}
            onChange={(e) => onUpdate({ scope_notes: e.target.value })}
            placeholder={"3/8 Drywall walls 160sqft\nCorner bead 36 linear\nReinstall Cabinets x4"}
            rows={3}
            className="w-full border border-border rounded px-2 py-1.5 text-xs text-ink/70"
          />
        </div>
      )}

      {/* Photos attach to a saved document, so this only appears once there's something
          to attach them to. On a new document the line has no permanent home yet. */}
      {isClient && docId && (
        <div className="mt-1.5">
          <button type="button" onClick={() => setShowPhotos((v) => !v)}
            className="text-[11px] text-steel hover:text-steel-dark">
            {showPhotos ? "Hide photos" : "📷 Photos for this line"}
          </button>
          {showPhotos && (
            <DocumentAttachments kind={docKind} docId={docId} jobId={jobId} lineKey={line.line_key} compact />
          )}
        </div>
      )}
      {isClient && !docId && (
        <div className="mt-1.5 text-[11px] text-ink/30">
          Save the {docKind} to add photos to this line.
        </div>
      )}
    </div>
  );
}

function Builder() {
  const { id: jobId } = useParams();
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind") === "invoice" ? "invoice" : "estimate";
  const editId = searchParams.get("edit");
  const router = useRouter();
  const { isManagement, loading } = useProfile();
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    // Asked of the server rather than read from a table: the flag lives on the company
    // row, which a foreman can't read.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/auth/status", {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
      });
      if (res.ok) setRestricted(Boolean((await res.json())?.subscription?.restricted));
    })();
  }, []);

  const [job, setJob] = useState(null);
  const [priceBook, setPriceBook] = useState([]);
  const [clientLines, setClientLines] = useState([]);
  const [materialLines, setMaterialLines] = useState([]);
  const [toolLines, setToolLines] = useState([]);
  const [laborLines, setLaborLines] = useState([]);
  const [applyInsuranceMarkup, setApplyInsuranceMarkup] = useState(false);
  const [insuranceMarkupPct, setInsuranceMarkupPct] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [depositType, setDepositType] = useState("fixed"); // 'fixed' | 'percent'
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPercent, setDepositPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [docMarkupPct, setDocMarkupPct] = useState("");
  const [autoGenerateInvoice, setAutoGenerateInvoice] = useState(false);
  const [skilledHours, setSkilledHours] = useState("");
  const [unskilledHours, setUnskilledHours] = useState("");
  const [travelHours, setTravelHours] = useState("");
  const [pickupHours, setPickupHours] = useState("");
  const [taxRates, setTaxRates] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentAmountType, setPaymentAmountType] = useState("full"); // 'dollar' | 'percent' | 'full'
  const [paymentAmountValue, setPaymentAmountValue] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [taxExempt, setTaxExempt] = useState(false);
  const [saving, setSaving] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", address: "" });
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    supabase.from("jobs").select("*, contacts(id, name, email, phone, address)").eq("id", jobId).single().then(({ data }) => setJob(data));
    supabase.from("price_book").select("*").order("name").then(({ data }) => setPriceBook(data || []));
    supabase.from("contacts").select("id, name, email, phone, address").order("name").then(({ data }) => setContacts(data || []));
    supabase.from("tax_rates").select("*").eq("enabled", true).order("sort_order").then(({ data }) => setTaxRates(data || []));
    supabase.from("company_settings").select("insurance_markup_pct").maybeSingle().then(({ data }) => setInsuranceMarkupPct(data?.insurance_markup_pct || 0));
  }, [jobId]);

  useEffect(() => {
    if (!editId) return;
    const table = kind === "estimate" ? "estimates" : "invoices";
    supabase.from(table).select("*").eq("id", editId).single().then(({ data: doc }) => {
      if (!doc) return;
      setDate(doc.date || new Date().toISOString().slice(0, 10));
      setDueDate(doc.due_date || "");
      setNote(doc.note || "");
      setPrivateNotes(doc.private_notes || "");
      setPoNumber(doc.po_number || "");
      setDepositType(doc.deposit_type || "fixed");
      setDepositAmount(doc.deposit_type === "fixed" && doc.deposit_request_amount ? String(doc.deposit_request_amount) : "");
      setDepositPercent(doc.deposit_request_percent ? String(doc.deposit_request_percent) : "");
      setDiscountAmount(doc.discount_amount ? String(doc.discount_amount) : "");
      setDocMarkupPct(doc.markup_pct ? String(doc.markup_pct) : "");
      setAutoGenerateInvoice(!!doc.auto_generate_invoice);
      setGstEnabled(doc.gst_enabled !== false);
      setTaxExempt(!!doc.tax_exempt);
      setSkilledHours(doc.skilled_labor_hours ? String(doc.skilled_labor_hours) : "");
      setUnskilledHours(doc.unskilled_labor_hours ? String(doc.unskilled_labor_hours) : "");
      setTravelHours(doc.travel_hours ? String(doc.travel_hours) : "");
      setPickupHours(doc.material_pickup_hours ? String(doc.material_pickup_hours) : "");
    });
    supabase.from("line_items").select("*").eq("parent_type", kind).eq("parent_id", editId).order("sort_order").then(({ data: items }) => {
      if (!items) return;
      const toLine = (l) => ({ ...l, quantity: l.quantity, unit_cost: l.unit_cost, markup_pct: l.markup_pct, line_key: l.line_key || l.id });
      setClientLines(items.filter((l) => !l.is_material && !l.is_tool && !l.is_labour).map(toLine));
      setMaterialLines(items.filter((l) => l.is_material).map(toLine));
      setToolLines(items.filter((l) => l.is_tool).map(toLine));
      setLaborLines(items.filter((l) => l.is_labour).map(toLine));
    });
  }, [editId, kind]);

  const loadPayments = useCallback(async () => {
    if (!editId || kind !== "invoice") return;
    const { data } = await supabase.from("deposits").select("*").eq("invoice_id", editId).order("date", { ascending: false });
    setPayments(data || []);
  }, [editId, kind]);
  useEffect(() => { loadPayments(); }, [loadPayments]);

  const paidSoFar = payments.reduce((s, p) => s + Number(p.amount), 0);

  async function recordPayment() {
    const invoiceTotal = grandTotal; // computed further down from line items/tax/etc
    const remaining = Math.max(invoiceTotal - paidSoFar, 0);
    let amount;
    if (paymentAmountType === "full") amount = remaining;
    else if (paymentAmountType === "percent") amount = invoiceTotal * (Number(paymentAmountValue || 0) / 100);
    else amount = Number(paymentAmountValue || 0);
    if (!amount || amount <= 0) { alert("Enter a payment amount."); return; }

    setRecordingPayment(true);
    const { error } = await supabase.from("deposits").insert([{
      job_id: jobId, invoice_id: editId, amount, date: paymentDate, payment_method: paymentMethod,
      note: "Invoice payment",
    }]);
    if (error) { alert("Couldn't record payment: " + error.message); setRecordingPayment(false); return; }

    const newTotal = paidSoFar + amount;
    const newStatus = newTotal >= invoiceTotal ? "paid" : newTotal > 0 ? "partial" : "unpaid";
    const statusPatch = { payment_status: newStatus };
    if (newStatus === "paid") { statusPatch.paid_date = paymentDate; statusPatch.payment_method = paymentMethod; }
    await supabase.from("invoices").update(statusPatch).eq("id", editId);

    setPaymentAmountValue("");
    setRecordingPayment(false);
    loadPayments();
  }

  async function selectContact(contactId) {
    await supabase.from("jobs").update({ contact_id: contactId }).eq("id", jobId);
    const { data } = await supabase.from("jobs").select("*, contacts(id, name, email, phone, address)").eq("id", jobId).single();
    setJob(data);
    setContactPickerOpen(false);
    setContactSearch("");
  }

  async function saveNewContact(e) {
    e.preventDefault();
    if (!newContact.name) return;
    setSavingContact(true);
    const { data: created, error } = await supabase.from("contacts").insert([newContact]).select().single();
    setSavingContact(false);
    if (!error && created) {
      setContacts((c) => [...c, created]);
      await selectContact(created.id);
      setShowNewContactForm(false);
      setNewContact({ name: "", email: "", phone: "", address: "" });
    } else if (error) {
      alert("Couldn't save client: " + error.message);
    }
  }

  const filteredContacts = contacts.filter((c) => c.name.toLowerCase().includes(contactSearch.toLowerCase()));

  function addLine(fromPriceBook, kindOfLine) {
    const isClient = kindOfLine === "client";
    const base = fromPriceBook
      ? { description: fromPriceBook.name, unit: fromPriceBook.unit, unit_cost: fromPriceBook.unit_cost, markup_pct: fromPriceBook.markup_pct, price_book_id: fromPriceBook.id, rona_search_term: fromPriceBook.rona_search_term }
      : { description: "", unit: "each", unit_cost: 0, markup_pct: isClient ? 20 : 0 };
    // line_key is the line's identity for anything that outlives a save — photos in
    // particular. `id` is only a React key here and is replaced by a fresh database id
    // every time the document is saved.
    const line = { id: crypto.randomUUID(), line_key: crypto.randomUUID(), quantity: 1, is_material: kindOfLine === "material", is_tool: kindOfLine === "tool", is_labour: kindOfLine === "labour", scope_notes: "", waste_pct: 0, ...base };
    if (kindOfLine === "material") setMaterialLines((l) => [...l, line]);
    else if (kindOfLine === "tool") setToolLines((l) => [...l, line]);
    else if (kindOfLine === "labour") setLaborLines((l) => [...l, line]);
    else setClientLines((l) => [...l, line]);
  }

  function updateLine(kindOfLine, lineId, patch) {
    const setter = kindOfLine === "material" ? setMaterialLines : kindOfLine === "tool" ? setToolLines : kindOfLine === "labour" ? setLaborLines : setClientLines;
    setter((lines) => lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  }
  function removeLine(kindOfLine, lineId) {
    const setter = kindOfLine === "material" ? setMaterialLines : kindOfLine === "tool" ? setToolLines : kindOfLine === "labour" ? setLaborLines : setClientLines;
    setter((lines) => lines.filter((l) => l.id !== lineId));
  }

  const total = clientLines.reduce((s, l) => s + lineTotal(l), 0);
  const insuranceBump = applyInsuranceMarkup ? Number(insuranceMarkupPct || 0) : 0;
  const afterMarkup = total * (1 + (Number(docMarkupPct || 0) + insuranceBump) / 100);
  const afterDiscount = afterMarkup - Number(discountAmount || 0);
  const applicableTaxes = taxExempt ? [] : taxRates.filter((t) => gstEnabled || t.name.trim().toUpperCase() !== "GST");
  const taxAmount = applicableTaxes.reduce((s, t) => s + afterDiscount * (Number(t.rate) / 100), 0);
  const grandTotal = afterDiscount + taxAmount;
  const effectiveDeposit = depositType === "percent"
    ? (depositPercent ? grandTotal * (Number(depositPercent) / 100) : null)
    : (depositAmount ? Number(depositAmount) : null);

  const [offline, setOffline] = useState(false);
  const [draftSaved, setDraftSaved] = useState(null);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Keeps whatever has been typed, on the phone, so a quote priced on site survives the
  // app closing, the battery dying, or driving out of range mid-sentence.
  //
  // Deliberately not auto-synced when signal returns: pricing worked out on a roof at
  // 7am usually gets revised before it should go anywhere near a client, so submitting
  // stays a decision rather than something that happens on its own.
  async function keepDraft() {
    const record = await saveDraft({
      id: draftSaved?.id,
      kind,
      jobId,
      note,
      clientLines,
      materialLines,
      toolLines,
      laborLines,
      savedAt: new Date().toISOString(),
    });
    setDraftSaved(record);
    return record;
  }

  async function save() {
    // With no signal there is nothing to save to. Keeping it on the phone means the
    // pricing survives, and it can be submitted properly once back in range.
    if (!navigator.onLine) {
      await keepDraft();
      alert(
        "No signal — this quote has been saved on your phone.\n\n" +
        "Open it again when you're back in range and press Save to send it."
      );
      return;
    }

    setSaving(true);
    const table = kind === "estimate" ? "estimates" : "invoices";
    const payload = {
      job_id: jobId, amount: total, date, note, private_notes: privateNotes || null,
      po_number: poNumber || null,
      deposit_type: depositType,
      gst_enabled: gstEnabled,
      tax_exempt: taxExempt,
      deposit_request_amount: effectiveDeposit,
      deposit_request_percent: depositType === "percent" && depositPercent ? Number(depositPercent) : null,
      discount_amount: discountAmount ? Number(discountAmount) : 0,
      markup_pct: docMarkupPct ? Number(docMarkupPct) : 0,
    };
    if (kind === "invoice" && dueDate) payload.due_date = dueDate;
    if (kind === "estimate") {
      payload.auto_generate_invoice = autoGenerateInvoice;
      payload.skilled_labor_hours = skilledHours ? Number(skilledHours) : null;
      payload.unskilled_labor_hours = unskilledHours ? Number(unskilledHours) : null;
      payload.travel_hours = travelHours ? Number(travelHours) : null;
      payload.material_pickup_hours = pickupHours ? Number(pickupHours) : null;
    }

    let docId = editId;
    if (editId) {
      const { error } = await supabase.from(table).update(payload).eq("id", editId);
      if (error) {
        alert("Couldn't save changes to this " + kind + ": " + error.message);
        setSaving(false);
        return;
      }
      // Replace all line items cleanly rather than trying to diff them.
      const { error: delError } = await supabase.from("line_items").delete().eq("parent_type", kind).eq("parent_id", editId);
      if (delError) {
        alert("Saved the " + kind + ", but couldn't update line items: " + delError.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: doc, error } = await supabase.from(table).insert([payload]).select().single();
      if (error) {
        alert("Couldn't save this " + kind + ": " + error.message);
        setSaving(false);
        return;
      }
      docId = doc.id;
    }

    // Number fields come back from inputs as strings, and an emptied field is "" — which
    // Postgres rejects outright for a numeric column, failing the whole batch after the
    // document itself has already saved. Anything unparseable becomes the field's
    // sensible default instead. Currency symbols and thousands separators are stripped
    // too, since typing "$1,200" is a natural thing to do and would otherwise fail the
    // same way.
    const num = (value, fallback) => {
      if (value === null || value === undefined) return fallback;
      const cleaned = String(value).replace(/[$,\s]/g, "");
      if (cleaned === "") return fallback;
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const allLines = [...clientLines, ...materialLines, ...toolLines, ...laborLines]
      // A row with no description and nothing priced is an empty row the user added and
      // never filled in — saving it would put a blank line on the client's document.
      .filter((l) => (l.description || "").trim() !== "" || num(l.unit_cost, 0) !== 0)
      .map((l, i) => ({
        parent_type: kind, parent_id: docId, price_book_id: l.price_book_id || null,
        line_key: l.line_key || crypto.randomUUID(),
        description: l.description, quantity: num(l.quantity, 1), unit: l.unit,
        unit_cost: num(l.unit_cost, 0), markup_pct: num(l.markup_pct, 0),
        is_material: l.is_material, is_tool: l.is_tool, is_labour: l.is_labour, sort_order: i,
        scope_notes: l.scope_notes || null, waste_pct: num(l.waste_pct, 0),
        manufacturer: l.manufacturer || null, color: l.color || null,
      }));
    if (allLines.length) {
      const { error: lineError } = await supabase.from("line_items").insert(allLines);
      if (lineError) {
        // The document is already saved at this point, so say so plainly — the work
        // isn't lost, and reopening it for editing is the way back in.
        alert(
          `The ${kind} saved, but its line items didn't: ${lineError.message}\n\n`
          + `Open it again from the job page and re-check the line items before sending it.`
        );
        setSaving(false);
        return;
      }
    }

    // Work orders are NOT created automatically. Turning every saved invoice into a
    // work order meant its line items appeared on the crew's week the moment the
    // invoice existed, with no say over when the work was actually meant to happen.
    // Use the "→ Work order" button on the job's documents list instead, which asks
    // for the day it goes out.

    // Every invoice (new or edited) gets a PDF generated and added to the library,
    // so the library always reflects the current numbers and paid status.
    if (kind === "invoice") {
      const { data: fullDoc } = await supabase.from("invoices").select("*").eq("id", docId).single();
      const { data: fullLines } = await supabase.from("line_items").select("*").eq("parent_type", "invoice").eq("parent_id", docId).eq("is_material", false).eq("is_tool", false).eq("is_labour", false).order("sort_order");
      const { data: companySettings } = await supabase.from("company_settings").select("*").maybeSingle();
      await generateAndStoreInvoicePdf({ invoice: fullDoc, job, contact: job?.contacts, lines: fullLines, company: companySettings });
    }

    router.push(`/jobs/${jobId}`);
  }

  if (loading || !job) return <><Nav /><main className="max-w-3xl mx-auto px-4 py-6 text-ink/40 text-sm">Loading...</main></>;
  if (!isManagement) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  // Past due on the subscription: existing documents stay readable and clients can still
  // pay what's already out, but nothing new can be raised until it's settled.
  if (restricted) {
    return (
      <>
        <Nav />
        <main className="max-w-lg mx-auto px-4 py-10 text-center">
          <p className="text-ink mb-2">New estimates and invoices are paused.</p>
          <p className="text-sm text-ink/60 mb-4">
            There&apos;s an unpaid subscription invoice on your account. Everything you&apos;ve
            already created is still here and still works.
          </p>
          <a href="/billing" className="text-steel hover:text-steel-dark underline">Go to billing</a>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">
          {editId ? "Edit" : "New"} {kind === "estimate" ? "Estimate" : "Invoice"}
        </h1>
        <p className="text-sm text-ink/60 mb-3">{job.title}</p>

        <div className="bg-surface border border-border rounded-lg p-4 mb-4 relative">
          <label className="block text-xs text-ink/60 mb-1">Bill to</label>
          <button type="button" onClick={() => setContactPickerOpen((v) => !v)}
            className="w-full text-left border border-border rounded px-3 py-2">
            {job.contacts ? (
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{job.contacts.name}</div>
                  {job.contacts.address && <div className="text-xs text-ink/50">{job.contacts.address}</div>}
                  <div className="text-xs text-ink/50">
                    {job.contacts.phone} {job.contacts.phone && job.contacts.email && "· "} {job.contacts.email}
                  </div>
                </div>
                <span className="text-xs text-steel shrink-0">Change</span>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-ink/40">— select a client —</span>
                <span className="text-xs text-steel">Select</span>
              </div>
            )}
          </button>

          {contactPickerOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg z-40 p-3">
              <input autoFocus placeholder="Search clients..." value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 mb-2" />
              <div className="max-h-48 overflow-y-auto divide-y divide-border mb-2">
                {filteredContacts.map((c) => (
                  <button key={c.id} type="button" onClick={() => selectContact(c.id)}
                    className="w-full text-left px-2 py-2 text-sm hover:bg-paper">
                    {c.name} {c.email && <span className="text-ink/40 text-xs">· {c.email}</span>}
                  </button>
                ))}
                {filteredContacts.length === 0 && <div className="px-2 py-3 text-center text-ink/40 text-sm">No matching clients.</div>}
              </div>
              {!showNewContactForm ? (
                <button type="button" onClick={() => setShowNewContactForm(true)}
                  className="w-full text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3 py-2">
                  + New client
                </button>
              ) : (
                <form onSubmit={saveNewContact} className="space-y-2 border-t border-border pt-2">
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
                  <button type="submit" disabled={savingContact}
                    className="w-full bg-accent hover:bg-accent-dark text-white text-xs font-display uppercase tracking-wide rounded px-3 py-2 disabled:opacity-50">
                    {savingContact ? "Saving..." : "Create & use this client"}
                  </button>
                </form>
              )}
              <button type="button" onClick={() => setContactPickerOpen(false)} className="w-full text-xs text-ink/40 mt-2">Close</button>
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 mb-4 flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs text-ink/60 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-border rounded px-2 py-1.5" />
          </div>
          {kind === "invoice" && (
            <div>
              <label className="block text-xs text-ink/60 mb-1">Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border border-border rounded px-2 py-1.5" />
            </div>
          )}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-ink/60 mb-1">Note (shown to client)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-border rounded px-2 py-1.5" />
          </div>
        </div>

        {editId && kind === "invoice" && (
          <div className="bg-surface border border-steel/40 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-baseline mb-3">
              <h2 className="font-display uppercase text-sm tracking-wide text-ink/60">Record Payment</h2>
              <span className="text-sm">
                Paid <span className="font-mono font-semibold">{money(paidSoFar)}</span> of <span className="font-mono">{money(grandTotal)}</span>
              </span>
            </div>

            {payments.length > 0 && (
              <div className="mb-3 space-y-1">
                {payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs text-ink/50">
                    <span>{p.date} — {p.payment_method?.replace("_", " ")}</span>
                    <span className="font-mono">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-2 mb-3">
              <input type="number" step="0.01" placeholder="0.00" value={paymentAmountValue}
                onChange={(e) => setPaymentAmountValue(e.target.value)}
                disabled={paymentAmountType === "full"}
                className="border border-border rounded px-2 py-2 disabled:bg-paper disabled:text-ink/30" />
              <div className="flex border border-border rounded overflow-hidden col-span-2">
                {[["dollar", "$"], ["percent", "%"], ["full", "Full"]].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setPaymentAmountType(val)}
                    className={`flex-1 py-2 text-sm font-display uppercase ${paymentAmountType === val ? "bg-success text-white" : "bg-white text-ink/60"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs text-ink/60 mb-1">Payment date</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">Payment method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5">
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="e_transfer">E-transfer</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="paypal">PayPal</option>
                  <option value="credit_card">Credit card</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <button type="button" onClick={recordPayment} disabled={recordingPayment}
              className="w-full bg-success hover:opacity-90 text-white rounded px-4 py-2.5 font-display uppercase text-sm disabled:opacity-50">
              {recordingPayment ? "Recording..." : "Record Payment"}
            </button>
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg p-4 mb-4">
          <label className="block text-xs text-ink/60 mb-1">Private notes (internal only — never shown to the client)</label>
          <textarea value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} rows={2}
            className="w-full border border-border rounded px-2 py-1.5 text-sm" />
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 mb-4 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink/60 mb-1">PO Number</label>
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="w-full border border-border rounded px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">Discount ($, optional)</label>
            <input type="number" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-ink/60 mb-1">Request a deposit (optional)</label>
            <div className="flex gap-2">
              <select value={depositType} onChange={(e) => setDepositType(e.target.value)} className="border border-border rounded px-2 py-1.5">
                <option value="fixed">Fixed $</option>
                <option value="percent">% of total</option>
              </select>
              {depositType === "fixed" ? (
                <input type="number" step="0.01" placeholder="Amount $" value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)} className="flex-1 border border-border rounded px-2 py-1.5" />
              ) : (
                <input type="number" step="1" placeholder="Percent %" value={depositPercent}
                  onChange={(e) => setDepositPercent(e.target.value)} className="flex-1 border border-border rounded px-2 py-1.5" />
              )}
            </div>
            {effectiveDeposit != null && <p className="text-xs text-ink/40 mt-1">Deposit requested: {money(effectiveDeposit)}</p>}
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">Overall markup (%, optional — on top of line-item markups)</label>
            <input type="number" step="1" value={docMarkupPct} onChange={(e) => setDocMarkupPct(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5" />
          </div>
          {kind === "estimate" && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={autoGenerateInvoice} onChange={(e) => setAutoGenerateInvoice(e.target.checked)} />
              Automatically create an invoice when the client signs/approves this estimate
            </label>
          )}
          <div className="sm:col-span-2 flex flex-wrap gap-4 border-t border-border pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} disabled={taxExempt} />
              Apply GST
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={taxExempt} onChange={(e) => setTaxExempt(e.target.checked)} />
              Tax exempt (First Nations land)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={applyInsuranceMarkup} onChange={(e) => setApplyInsuranceMarkup(e.target.checked)} />
              Apply insurance markup ({insuranceMarkupPct}%, set in Company)
            </label>
          </div>
          <div className="sm:col-span-2 text-sm border-t border-border pt-2 mt-1 space-y-0.5">
            <div className="flex justify-between text-ink/60"><span>Subtotal</span><span className="font-mono">{money(total)}</span></div>
            {taxExempt ? (
              <div className="text-ink/40 text-xs">Tax exempt — no GST/PST applied</div>
            ) : applicableTaxes.map((t) => (
              <div key={t.id} className="flex justify-between text-ink/60"><span>{t.name} ({t.rate}%)</span><span className="font-mono">{money(afterDiscount * (Number(t.rate) / 100))}</span></div>
            ))}
            <div className="flex justify-between font-medium"><span>Grand total</span><span className="font-mono">{money(grandTotal)}</span></div>
          </div>
        </div>

        {kind === "estimate" && (
          <div className="bg-surface border border-border rounded-lg p-4 mb-4">
            <h2 className="font-display uppercase text-sm tracking-wide text-ink/60 mb-2">Labor hours estimate (internal)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-ink/60 mb-1">Skilled labor (hrs)</label>
                <input type="number" step="0.5" value={skilledHours} onChange={(e) => setSkilledHours(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">Unskilled labor (hrs)</label>
                <input type="number" step="0.5" value={unskilledHours} onChange={(e) => setUnskilledHours(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">Travel time (hrs)</label>
                <input type="number" step="0.5" value={travelHours} onChange={(e) => setTravelHours(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5" />
              </div>
              <div>
                <label className="block text-xs text-ink/60 mb-1">Material pickup (hrs)</label>
                <input type="number" step="0.5" value={pickupHours} onChange={(e) => setPickupHours(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5" />
              </div>
            </div>
          </div>
        )}

        <section className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-display uppercase text-sm tracking-wide text-ink/60">Client-facing line items</h2>
            <div className="flex gap-2">
              <select onChange={(e) => { const pb = priceBook.find((p) => p.id === e.target.value); if (pb) addLine(pb, "client"); e.target.value = ""; }}
                className="text-xs border border-border rounded px-2 py-1" defaultValue="">
                <option value="" disabled>+ From price book</option>
                {priceBook.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => addLine(null, "client")} className="text-xs border border-border rounded px-2 py-1">+ Blank line</button>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3">
            {clientLines.map((l) => (
              <LineRow key={l.id} line={l} kind="client"
                docKind={kind} docId={editId} jobId={jobId}
                onUpdate={(patch) => updateLine("client", l.id, patch)}
                onRemove={() => removeLine("client", l.id)} />
            ))}
            {clientLines.length === 0 && <div className="text-ink/40 text-sm py-2">No line items yet.</div>}
            <div className="flex justify-end pt-2 mt-2 border-t border-border font-medium">
              Total: <span className="font-mono ml-2">{money(total)}</span>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="font-display uppercase text-sm tracking-wide text-ink/60">Internal materials list</h2>
              <p className="text-xs text-ink/40">Never shown to the client. Exportable to send to Rona, and attached to the work order.</p>
            </div>
            <div className="flex gap-2">
              <select onChange={(e) => { const pb = priceBook.find((p) => p.id === e.target.value); if (pb) addLine(pb, "material"); e.target.value = ""; }}
                className="text-xs border border-border rounded px-2 py-1" defaultValue="">
                <option value="" disabled>+ From price book</option>
                {priceBook.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => addLine(null, "material")} className="text-xs border border-border rounded px-2 py-1">+ Blank item</button>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3">
            {materialLines.map((l) => (
              <LineRow key={l.id} line={l} kind="material"
                onUpdate={(patch) => updateLine("material", l.id, patch)}
                onRemove={() => removeLine("material", l.id)} />
            ))}
            {materialLines.length === 0 && <div className="text-ink/40 text-sm py-2">No materials added yet.</div>}
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="font-display uppercase text-sm tracking-wide text-ink/60">Internal tools / equipment list</h2>
              <p className="text-xs text-ink/40">Never shown to the client. Attached to the work order alongside "Tools & rental requirements".</p>
            </div>
            <button onClick={() => addLine(null, "tool")} className="text-xs border border-border rounded px-2 py-1">+ Blank item</button>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3">
            {toolLines.map((l) => (
              <LineRow key={l.id} line={l} kind="tool"
                onUpdate={(patch) => updateLine("tool", l.id, patch)}
                onRemove={() => removeLine("tool", l.id)} />
            ))}
            {toolLines.length === 0 && <div className="text-ink/40 text-sm py-2">No tools/equipment added yet.</div>}
          </div>
        </section>

        <section className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="font-display uppercase text-sm tracking-wide text-ink/60">Internal labour breakdown</h2>
              <p className="text-xs text-ink/40">Never shown to the client. Separate line items for install, prep, scrape, etc. — like an insurance-style cost breakdown.</p>
            </div>
            <button onClick={() => addLine(null, "labour")} className="text-xs border border-border rounded px-2 py-1">+ Blank item</button>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3">
            {laborLines.map((l) => (
              <LineRow key={l.id} line={l} kind="labour"
                onUpdate={(patch) => updateLine("labour", l.id, patch)}
                onRemove={() => removeLine("labour", l.id)} />
            ))}
            {laborLines.length === 0 && <div className="text-ink/40 text-sm py-2">No labour items added yet.</div>}
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-2">
            <h2 className="font-display uppercase text-sm tracking-wide text-ink/60">Attachments</h2>
            <p className="text-xs text-ink/40">
              Photos and PDFs the client can open from their link — completion photos, a WCB
              letter, a spec sheet. These are never sent as email attachments.
            </p>
          </div>
          {editId ? (
            <DocumentAttachments kind={kind} docId={editId} jobId={jobId} />
          ) : (
            <div className="bg-surface border border-border rounded-lg p-3 text-sm text-ink/40">
              Save the {kind} first, then reopen it to attach files.
            </div>
          )}
        </section>

        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border p-3">
          <div className="max-w-3xl mx-auto flex justify-end">
            <button onClick={save} disabled={saving}
              className="bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide px-5 py-2.5 rounded disabled:opacity-50">
              {saving ? "Saving..." : editId ? `Save changes` : `Save ${kind}`}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><Builder /></AuthGate>;
}
