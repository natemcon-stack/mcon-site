"use client";
import { useEffect, useState, useRef } from "react";
import Papa from "papaparse";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import { makeThumbnail, thumbPathFor } from "@/lib/thumbnail";
import { getSignedUrls } from "@/lib/signedUrl";
import { itemsToLines } from "@/lib/pdfLines";
import { parseJoistDocument, matchContact } from "@/lib/joistParser";

const CLIENT_FIELDS = [
  { key: "name", label: "Name (required)" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address line 1" },
  { key: "address_line2", label: "Address line 2 (optional)" },
  { key: "city", label: "City" },
  { key: "province", label: "Province" },
  { key: "postal_code", label: "Postal code" },
];

const INVOICE_FIELDS = [
  { key: "client_name", label: "Client name (required, matched to contacts)" },
  { key: "amount", label: "Amount (required)" },
  { key: "date", label: "Date (required, YYYY-MM-DD)" },
  { key: "note", label: "Note / description" },
];

function CsvImporter({ kind }) {
  const fields = kind === "clients" ? CLIENT_FIELDS : INVOICE_FIELDS;
  const targetTable = kind === "estimates" ? "estimates" : "invoices";
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [status, setStatus] = useState("");
  const [fileNames, setFileNames] = useState([]);

  function parseOneFile(file) {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results),
      });
    });
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setStatus(`Reading ${files.length} file${files.length > 1 ? "s" : ""}...`);

    const results = await Promise.all(files.map(parseOneFile));
    const combinedHeaders = results[0]?.meta.fields || [];
    const combinedRows = results.flatMap((r) => r.data);

    setHeaders(combinedHeaders);
    setRows(combinedRows);
    setFileNames(files.map((f) => f.name));
    setStatus("");

    // best-effort auto-mapping by matching header names
    const auto = {};
    fields.forEach((f) => {
      const guess = combinedHeaders.find((h) =>
        h.toLowerCase().replace(/[^a-z]/g, "").includes(f.key.replace(/[^a-z]/g, ""))
      );
      if (guess) auto[f.key] = guess;
    });
    setMapping(auto);
  }

  async function runImport() {
    setStatus("Importing...");
    if (kind === "clients") {
      const toInsert = rows
        .map((r) => ({
          name: r[mapping.name],
          email: mapping.email ? r[mapping.email] : null,
          phone: mapping.phone ? r[mapping.phone] : null,
          address: mapping.address ? r[mapping.address] : null,
          address_line2: mapping.address_line2 ? r[mapping.address_line2] : null,
          city: mapping.city ? r[mapping.city] : null,
          province: mapping.province ? r[mapping.province] : "BC",
          postal_code: mapping.postal_code ? r[mapping.postal_code] : null,
          source: "joist_import",
        }))
        .filter((c) => c.name);
      const { error } = await supabase.from("contacts").insert(toInsert);
      setStatus(error ? `Error: ${error.message}` : `Imported ${toInsert.length} contacts.`);
    } else {
      const label = kind === "estimates" ? "estimates" : "invoices";
      const jobTitle = kind === "estimates" ? "Imported from Joist (estimates)" : "Imported from Joist";
      const { data: contacts } = await supabase.from("contacts").select("id, name");
      const byName = {};
      (contacts || []).forEach((c) => { byName[c.name.trim().toLowerCase()] = c.id; });

      let matched = 0, unmatched = 0;
      for (const r of rows) {
        const clientName = (r[mapping.client_name] || "").trim();
        const contactId = byName[clientName.toLowerCase()];
        const amount = Number(r[mapping.amount]);
        const date = r[mapping.date];
        if (!amount || !date) continue;

        let jobId = null;
        if (contactId) {
          // find or create a catch-all "Imported (Joist)" job for this contact
          const { data: existingJob } = await supabase
            .from("jobs").select("id").eq("contact_id", contactId).eq("title", jobTitle).maybeSingle();
          if (existingJob) {
            jobId = existingJob.id;
          } else {
            const { data: newJob } = await supabase
              .from("jobs").insert([{ title: jobTitle, contact_id: contactId, status: "complete" }]).select().single();
            jobId = newJob?.id;
          }
          matched++;
        } else {
          unmatched++;
        }
        if (jobId) {
          await supabase.from(targetTable).insert([{
            job_id: jobId, amount, date, note: mapping.note ? r[mapping.note] : clientName,
          }]);
        }
      }
      setStatus(`Imported ${label} for ${matched} matched clients. ${unmatched} rows had no matching contact — import clients first.`);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div>
        <label className="block text-xs font-display uppercase tracking-wide text-ink/60 mb-1">
          {kind === "clients" ? "Joist clients CSV export" : kind === "estimates" ? "Joist estimates CSV export(s)" : "Joist invoices CSV export(s) — pick all months at once"}
        </label>
        <input type="file" accept=".csv" multiple onChange={handleFiles} className="text-sm" />
        {fileNames.length > 0 && (
          <p className="text-xs text-ink/40 mt-1">{fileNames.length} file{fileNames.length > 1 ? "s" : ""}: {fileNames.join(", ")}</p>
        )}
      </div>

      {headers.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-ink/60 mb-1">{f.label}</label>
                <select
                  className="w-full border border-border rounded px-2 py-1.5 text-sm"
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink/40">{rows.length} rows detected. Check the mapping above before importing.</p>
          <button onClick={runImport}
            className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
            Import {rows.length} rows
          </button>
        </>
      )}
      {status && <p className="text-sm">{status}</p>}
    </div>
  );
}

function PdfDocImporter({ kind }) {
  const targetTable = kind === "invoices" ? "invoices" : "estimates";
  const singular = kind === "invoices" ? "invoice" : "estimate";
  // Needed for the storage path — uploads are namespaced by company so the bucket
  // policies can enforce isolation on the path itself.
  const { companyId } = useProfile();
  const [pending, setPending] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    supabase.from("contacts").select("id, name").order("name").then(({ data }) => setContacts(data || []));
  }, []);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setExtracting(true);

    const pdfjsLib = await import("pdfjs-dist/build/pdf");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const items = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Rebuilt into real lines rather than flattened. Joining every item on a page
        // with a space destroys the row structure invoices are read by — that's what
        // made Rona's paintbrush list price look like the invoice total.
        text += itemsToLines(content.items).join("\n") + "\n";
      }
      const parsed = parseJoistDocument(text, file.name);
      const matched = matchContact(parsed.client, contacts);

      items.push({
        id: crypto.randomUUID(),
        fileName: file.name,
        // The original PDF, kept so it can be attached to the invoice it produces.
        // Reading the numbers out is not the same as keeping the record — CRA expects
        // the source document, and an imported figure with nothing behind it is worth
        // very little in an audit.
        file,
        parsed,
        // Pre-filled from the PDF and editable. Nothing saves without being looked at.
        docNumber: parsed.docNumber || "",
        date: parsed.date || "",
        subtotal: parsed.subtotal ?? "",
        tax: parsed.tax ?? "",
        total: parsed.total ?? "",
        note: parsed.docNumber ? `Joist ${singular} #${parsed.docNumber}` : file.name.replace(/\.pdf$/i, ""),
        // An existing client if one matches, otherwise the details to create one.
        contactId: matched?.id || "",
        newClient: matched ? null : parsed.client,
        // Historical invoices are already settled — that's why they're being imported.
        markPaid: kind === "invoices",
      });
    }
    setPending((p) => [...p, ...items]);
    setExtracting(false);
  }

  function updateItem(id, patch) {
    setPending((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function save(item) {
    if (!item.date || item.total === "" || item.total == null) {
      alert("Set the date and total before saving.");
      return;
    }

    // Create the client from the PDF if no existing one was matched. This is why the
    // import is worth doing at all — the history brings its contacts with it.
    let contactId = item.contactId;
    if (!contactId) {
      const c = item.newClient;
      if (!c?.name) {
        alert("Pick an existing client, or check the name read from the PDF.");
        return;
      }
      const { data: created, error } = await supabase.from("contacts").insert([{
        name: c.name, email: c.email || null, phone: c.phone || null, address: c.address || null,
      }]).select().single();
      if (error) { alert(`Couldn't create that client: ${error.message}`); return; }
      contactId = created.id;
      setContacts((list) => [...list, created]);
    }

    // One job per client for their imported history, rather than one job holding
    // everyone's — so the figures sit under the client they belong to.
    const jobTitle = `Historical ${kind} (imported from Joist)`;
    const { data: existingJob } = await supabase
      .from("jobs").select("id").eq("contact_id", contactId).eq("title", jobTitle).maybeSingle();
    let jobId = existingJob?.id;
    if (!jobId) {
      const { data: newJob } = await supabase
        .from("jobs").insert([{ title: jobTitle, contact_id: contactId, status: "complete" }]).select().single();
      jobId = newJob?.id;
    }

    const subtotal = item.subtotal === "" ? null : Number(item.subtotal);
    const tax = item.tax === "" ? null : Number(item.tax);
    const total = Number(item.total);

    const row = {
      job_id: jobId,
      // The amount is the pre-tax figure, because the totals calculation adds tax on
      // top. Falls back to the total when no subtotal was found and none was entered.
      amount: subtotal ?? total,
      date: item.date,
      note: item.note,
      // The tax actually charged at the time, so reports don't restate it at today's
      // rates.
      imported_tax_amount: tax,
      imported_tax_label: item.parsed?.taxRate ? `GST (${item.parsed.taxRate}%)` : "GST",
      source_system: "joist",
      source_ref: item.docNumber || null,
      approval_status: "approved",
    };

    if (targetTable === "invoices") {
      // Historical invoices need to count as paid, with a date — the tax summary works
      // on a cash basis by default, and an invoice with no paid date appears in no
      // period at all.
      row.payment_status = item.markPaid ? "paid" : "unpaid";
      if (item.markPaid) {
        row.paid_date = item.paidDate || item.date;
        row.payment_method = "other";
      }
    }

    const { data: created, error } = await supabase.from(targetTable).insert([row]).select().single();
    if (error) {
      // The unique index on the source reference catches a file imported twice.
      if (/duplicate|unique/i.test(error.message)) {
        alert(`${singular} #${item.docNumber} has already been imported.`);
        setPending((p) => p.filter((it) => it.id !== item.id));
        return;
      }
      alert(`Couldn't save that: ${error.message}`);
      return;
    }

    // Attach the original PDF to what was just created. Best-effort: the figures are
    // already saved, and losing the attachment shouldn't cost the import.
    if (item.file && created?.id) {
      try {
        const safeName = item.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
        const path = `${companyId}/imported/${singular}-${created.id}-${safeName}`;
        const { error: upError } = await supabase.storage
          .from("documents").upload(path, item.file, { contentType: "application/pdf" });

        if (!upError) {
          await supabase.from("document_attachments").insert([{
            parent_type: singular,
            parent_id: created.id,
            bucket: "documents",
            storage_path: path,
            filename: item.fileName,
            mime_type: "application/pdf",
            caption: "Original Joist document",
          }]);
        }
      } catch (e) {
        // Figures saved; the file didn't. Not worth failing the import over.
      }
    }

    setPending((p) => p.filter((it) => it.id !== item.id));
  }

  // Saving twenty PDFs one at a time is the reason imports get abandoned half-done.
  async function saveAll() {
    const ready = pending.filter((i) => i.date && i.total !== "" && (i.contactId || i.newClient?.name));
    if (!ready.length) { alert("Nothing is ready to save yet."); return; }
    if (!confirm(`Save ${ready.length} ${kind}? Anything with a warning is skipped.`)) return;
    for (const item of ready) {
      // Sequential on purpose: each may create a client and a job, and running them at
      // once would create duplicates of both.
      // eslint-disable-next-line no-await-in-loop
      await save(item);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <div>
        <label className="block text-xs font-display uppercase tracking-wide text-ink/60 mb-1">
          Joist {singular} PDFs — select as many as you like
        </label>
        <input type="file" accept=".pdf" multiple onChange={handleFiles} className="text-sm" />
        <p className="text-xs text-ink/40 mt-1">
          Client details, dates, totals and tax are read from each PDF. Everything is
          shown for you to check before anything is saved — the figures end up in your
          tax reports, so a misread total becomes a wrong return.
        </p>
      </div>
      {extracting && <p className="text-sm text-ink/40">Reading PDFs...</p>}

      {pending.length > 1 && (
        <div className="flex items-center justify-between gap-2 bg-paper rounded p-3">
          <span className="text-sm">{pending.length} ready to review</span>
          <button onClick={saveAll}
            className="bg-ink text-white font-display uppercase text-xs tracking-wide px-3 py-1.5 rounded">
            Save all
          </button>
        </div>
      )}

      <div className="space-y-3">
        {pending.map((item) => (
          <div key={item.id} className="border border-border rounded-lg p-4">
            <div className="flex justify-between items-start gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{item.fileName}</div>
                {item.docNumber && (
                  <div className="text-xs text-ink/40 font-mono">#{item.docNumber}</div>
                )}
              </div>
              <button onClick={() => setPending((p) => p.filter((i) => i.id !== item.id))}
                className="text-xs text-ink/30 hover:text-accent-dark shrink-0">Skip</button>
            </div>

            {/* Anything the parser wasn't sure about, said plainly rather than left to
                be noticed. */}
            {item.parsed?.warnings?.length > 0 && (
              <div className="bg-warn/10 border border-warn/30 rounded px-2 py-1.5 mb-2">
                {item.parsed.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-warn">{w}</p>
                ))}
              </div>
            )}

            {/* Client: either matched to someone existing, or created from the PDF. */}
            <div className="mb-2">
              <label className="block text-xs text-ink/50 mb-1">Client</label>
              <select value={item.contactId}
                onChange={(e) => updateItem(item.id, { contactId: e.target.value })}
                className="w-full border border-border rounded px-2 py-1.5 text-sm">
                <option value="">
                  {item.newClient?.name ? `+ Create "${item.newClient.name}"` : "— pick a client —"}
                </option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!item.contactId && item.newClient?.name && (
                <p className="text-xs text-ink/40 mt-1">
                  New client from the PDF
                  {item.newClient.email && ` · ${item.newClient.email}`}
                  {item.newClient.phone && ` · ${item.newClient.phone}`}
                  {item.newClient.address && ` · ${item.newClient.address}`}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <div>
                <label className="block text-xs text-ink/50 mb-1">Date</label>
                <input type="date" value={item.date}
                  onChange={(e) => updateItem(item.id, { date: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-ink/50 mb-1">Before tax</label>
                <input type="number" step="0.01" value={item.subtotal}
                  onChange={(e) => updateItem(item.id, { subtotal: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs text-ink/50 mb-1">Tax</label>
                <input type="number" step="0.01" value={item.tax}
                  onChange={(e) => updateItem(item.id, { tax: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs text-ink/50 mb-1">Total</label>
                <input type="number" step="0.01" value={item.total}
                  onChange={(e) => updateItem(item.id, { total: e.target.value })}
                  className="w-full border border-border rounded px-2 py-1.5 text-sm font-mono" />
              </div>
            </div>

            {kind === "invoices" && (
              <label className="flex items-center gap-2 text-sm mb-2">
                <input type="checkbox" checked={item.markPaid}
                  onChange={(e) => updateItem(item.id, { markPaid: e.target.checked })} />
                Already paid
                {item.markPaid && (
                  <input type="date" value={item.paidDate || item.date}
                    onChange={(e) => updateItem(item.id, { paidDate: e.target.value })}
                    className="border border-border rounded px-2 py-1 text-xs ml-1" />
                )}
              </label>
            )}
            {kind === "invoices" && !item.markPaid && (
              <p className="text-xs text-warn mb-2">
                Unpaid invoices won&apos;t appear in cash-basis tax reports.
              </p>
            )}

            <input placeholder="Note" value={item.note}
              onChange={(e) => updateItem(item.id, { note: e.target.value })}
              className="w-full border border-border rounded px-2 py-1.5 text-sm mb-2" />

            <details className="mb-2">
              <summary className="text-xs text-ink/40 cursor-pointer">
                What was read from the PDF
              </summary>
              <pre className="text-[10px] text-ink/50 bg-paper rounded p-2 mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {item.parsed?.rawText}
              </pre>
            </details>

            <button onClick={() => save(item)}
              className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-xs tracking-wide px-3 py-1.5 rounded">
              Save {singular}
            </button>
          </div>
        ))}
        {pending.length === 0 && !extracting && (
          <div className="text-center text-ink/40 text-sm py-4">No PDFs loaded yet.</div>
        )}
      </div>
    </div>
  );
}

// Recovering EXIF dates on already-uploaded photos. Lives here rather than on a job
// because it's a one-time maintenance pass over the whole library, not something you do
// per job. Batches are driven from the client so a big library can't hit the serverless
// function timeout — each click processes one batch and reports what's left.
function PhotoExifBackfill() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);

  async function run({ dry }) {
    setRunning(true);
    setLog([]);
    const { data: { session } } = await supabase.auth.getSession();
    let totals = { processed: 0, recovered: 0, noExif: 0, failed: 0, remaining: 0, samples: [] };

    // A dry run inspects a single batch and reports; a real run keeps going until the
    // queue is empty, with a pass cap so a bug can't spin forever.
    for (let pass = 0; pass < 60; pass++) {
      const res = await fetch(`/api/photos/backfill-exif?batch=40${dry ? "&dry=1" : ""}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setLog((l) => [...l, `Stopped: server returned ${res.status}`]);
        break;
      }
      const data = await res.json();
      totals = {
        processed: totals.processed + data.processed,
        recovered: totals.recovered + data.recovered,
        noExif: totals.noExif + data.noExif,
        failed: totals.failed + data.failed,
        remaining: data.remaining,
        samples: totals.samples.length ? totals.samples : data.samples,
      };
      setResult({ ...totals, dryRun: dry });
      setLog((l) => [...l, `Batch ${pass + 1}: ${data.recovered} dated, ${data.noExif} without EXIF, ${data.remaining} left`]);
      if (dry || data.processed === 0 || data.remaining === 0) break;
    }

    setRunning(false);
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6 mt-8">
      <h2 className="font-display text-lg font-semibold tracking-wide mb-1">Fix photo dates</h2>
      <p className="text-sm text-ink/60 mb-4">
        Photos uploaded before the app started reading camera metadata are filed under the day
        they were uploaded rather than the day they were taken, which puts them in the wrong
        week on reports. The original files still carry their metadata, so this reads it back
        and corrects them. Photos with no metadata — screenshots, or anything forwarded through
        a text or Messenger — can&apos;t be recovered and are left as they are.
      </p>

      <div className="flex gap-2 mb-3">
        <button onClick={() => run({ dry: true })} disabled={running}
          className="border border-border text-ink/70 font-display uppercase text-xs tracking-wide px-3 py-2 rounded disabled:opacity-50">
          Check first (no changes)
        </button>
        <button onClick={() => run({ dry: false })} disabled={running}
          className="bg-ink text-white font-display uppercase text-xs tracking-wide px-3 py-2 rounded disabled:opacity-50">
          {running ? "Working..." : "Fix photo dates"}
        </button>
      </div>

      {result && (
        <div className="text-sm border-t border-border pt-3">
          <div className="font-medium mb-1">
            {result.dryRun ? "Sample check of one batch" : "Finished"}
          </div>
          <div className="text-ink/70">
            {result.recovered} photo{result.recovered === 1 ? "" : "s"} dated from metadata
            {result.noExif > 0 && `, ${result.noExif} had none`}
            {result.failed > 0 && `, ${result.failed} couldn't be read`}
            {result.remaining > 0 && `, ${result.remaining} still to check`}.
          </div>
          {result.samples?.length > 0 && (
            <div className="text-xs text-ink/50 mt-2">
              <div className="mb-1">Examples of what moved:</div>
              {result.samples.map((sm, i) => (
                <div key={i} className="font-mono">uploaded {sm.uploaded} → taken {sm.taken}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {log.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-ink/40 cursor-pointer">Details</summary>
          <div className="text-xs text-ink/50 font-mono mt-1 space-y-0.5">
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </details>
      )}
    </div>
  );
}

// Generates display copies for photos uploaded before thumbnailing existed.
//
// This runs in the browser because Supabase's server-side image transformation isn't
// enabled on this project and the serverless runtime has no image library available.
// That means the originals are downloaded to whichever device runs it — several hundred
// megabytes for a full library — so it's worth doing once on wifi rather than on a
// phone hotspot.
function PhotoThumbnailBackfill() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  // A ref, not state: the loop below reads this on every iteration, and a state value
  // captured when the function was created would never reflect a later click.
  const stopRef = useRef(false);

  const [testing, setTesting] = useState(false);
  const [testReport, setTestReport] = useState(null);

  // Walks a single photo through every step and reports what happened at each one.
  // Faster than inferring the cause from a whole-library run, and it doesn't mark
  // anything as checked, so nothing is consumed by testing.
  async function testOne() {
    setTesting(true);
    setTestReport(null);
    const steps = [];
    try {
      const { data: rows, error: qError } = await supabase
        .from("job_photos")
        .select("id, storage_path")
        .is("thumb_path", null)
        .eq("thumb_checked", false)
        .not("storage_path", "is", null)
        .limit(1);

      if (qError) {
        steps.push(`Database query failed: ${qError.message}`);
        steps.push("If this mentions a missing column, the SQL migration hasn't been run yet.");
        setTestReport(steps); setTesting(false); return;
      }
      if (!rows || rows.length === 0) {
        steps.push("No photos left to process — every row is already marked as checked.");
        steps.push("To redo them: update job_photos set thumb_checked = false where thumb_path is null;");
        setTestReport(steps); setTesting(false); return;
      }

      const row = rows[0];
      steps.push(`Photo: ${row.storage_path}`);

      const urls = await getSignedUrls("job-photos", [row.storage_path]);
      const url = urls[row.storage_path];
      if (!url) {
        steps.push("Couldn't get a signed URL for it — storage may not have this file.");
        setTestReport(steps); setTesting(false); return;
      }
      steps.push("Signed URL: ok");

      const res = await fetch(url);
      steps.push(`Download: ${res.status} ${res.ok ? "ok" : "failed"}`);
      if (!res.ok) { setTestReport(steps); setTesting(false); return; }

      const blob = await res.blob();
      steps.push(`Original: ${Math.round(blob.size / 1024)} KB, type ${blob.type || "unknown"}`);

      const { blob: thumb, reason } = await makeThumbnail(blob);
      if (thumb) {
        steps.push(`Thumbnail made: ${Math.round(thumb.size / 1024)} KB — that's a ${Math.round((1 - thumb.size / blob.size) * 100)}% saving.`);
        steps.push("Generation works. Run Shrink photos to do the rest.");
      } else {
        steps.push(`No thumbnail made: ${reason}`);
      }
    } catch (e) {
      steps.push(`Unexpected error: ${e?.message || e}`);
    }
    setTestReport(steps);
    setTesting(false);
  }

  async function run() {
    setRunning(true);
    stopRef.current = false;
    setResult(null);

    let made = 0;
    let skipped = 0;
    let failed = 0;
    let savedBytes = 0;
    const reasons = {};
    const note = (r) => { if (r) reasons[r] = (reasons[r] || 0) + 1; };
    let remaining = 0;

    try {
      for (let pass = 0; pass < 200; pass++) {
        if (stopRef.current) break;

        // Small batches: each photo is a full-size download, so a big batch would sit
        // on a slow connection for a long time with nothing to show for it.
        const { data: rows } = await supabase
          .from("job_photos")
          .select("id, storage_path")
          .is("thumb_path", null)
          .eq("thumb_checked", false)
          .not("storage_path", "is", null)
          .limit(25);

        if (!rows || rows.length === 0) break;
        if (failed >= 15 && made === 0) {
          note("stopped early — every attempt failed, so something needs fixing first");
          break;
        }

        const urls = await getSignedUrls("job-photos", rows.map((r) => r.storage_path));

        for (const row of rows) {
          if (stopRef.current) break;
          const url = urls[row.storage_path];
          if (!url) {
            failed++;
            await supabase.from("job_photos").update({ thumb_checked: true }).eq("id", row.id);
            continue;
          }
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`fetch ${res.status}`);
            const original = await res.blob();
            const { blob: thumb, reason } = await makeThumbnail(original);
            note(reason);

            if (thumb) {
              const candidate = thumbPathFor(row.storage_path);
              // Uploaded without upsert: a plain insert needs only the insert policy,
              // whereas upsert is an insert-or-update and requires update permission
              // too. An object left behind by an interrupted run comes back as a
              // duplicate, which means the file is already there — treat that as done
              // rather than an error.
              const { error: upError } = await supabase.storage
                .from("job-photos").upload(candidate, thumb, { contentType: "image/jpeg" });
              const alreadyThere = upError
                && /exists|duplicate|409/i.test(`${upError.message} ${upError.statusCode || ""}`);
              if (upError && !alreadyThere) throw upError;
              await supabase.from("job_photos")
                .update({ thumb_path: candidate, thumb_checked: true }).eq("id", row.id);
              made++;
              savedBytes += Math.max(0, original.size - thumb.size);
            } else {
              // Already small enough to serve as-is.
              await supabase.from("job_photos").update({ thumb_checked: true }).eq("id", row.id);
              skipped++;
            }
          } catch (e) {
            failed++;
            const message = e?.message || "unknown";
            note(`error: ${message}`);
            // A permissions or network failure is fixable and shouldn't exclude the photo
            // from later runs. Only mark it checked when the image itself is the problem.
            const permanent = /decode|dimensions|encoder|canvas/i.test(message);
            if (permanent) {
              await supabase.from("job_photos").update({ thumb_checked: true }).eq("id", row.id);
            }
          }

          setProgress({ made, skipped, failed, remaining, reasons: { ...reasons } });
        }

        // One count per batch rather than per photo — this query was doubling the
        // number of round trips and was the main reason the run crawled.
        const { count } = await supabase
          .from("job_photos")
          .select("id", { count: "exact", head: true })
          .is("thumb_path", null)
          .eq("thumb_checked", false)
          .not("storage_path", "is", null);
        remaining = count || 0;
        setProgress({ made, skipped, failed, remaining, reasons: { ...reasons } });
      }
    } catch (e) {
      // Fall through to the summary — partial progress is saved as it goes, so this can
      // simply be run again.
    }

    setResult({ made, skipped, failed, savedMb: Math.round(savedBytes / 1048576), reasons });
    setProgress(null);
    setRunning(false);
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6 mt-8">
      <h2 className="font-display text-lg font-semibold tracking-wide mb-1">Shrink photos for faster loading</h2>
      <p className="text-sm text-ink/60 mb-4">
        Photos taken on a phone are several megabytes each, and the app has been sending the
        full-size file every time one is displayed — slow on wifi and painful on mobile data.
        This makes a smaller display copy of each older photo. Originals are kept exactly as
        they are. New photos are handled automatically from now on.
      </p>
      <p className="text-sm text-ink/60 mb-4">
        <strong>Run this on wifi.</strong> It downloads every photo once to make the smaller
        copy, which can be a few hundred megabytes. It can be stopped and resumed at any time.
      </p>

      <div className="flex gap-2 mb-3">
        <button onClick={run} disabled={running || testing}
          className="bg-ink text-white font-display uppercase text-xs tracking-wide px-3 py-2 rounded disabled:opacity-50">
          {running ? "Working..." : "Shrink photos"}
        </button>
        <button onClick={testOne} disabled={running || testing}
          className="border border-border text-ink/70 font-display uppercase text-xs tracking-wide px-3 py-2 rounded disabled:opacity-50">
          {testing ? "Testing..." : "Test one photo"}
        </button>
        {running && (
          <button onClick={() => { stopRef.current = true; }}
            className="border border-border text-ink/70 font-display uppercase text-xs tracking-wide px-3 py-2 rounded">
            Stop
          </button>
        )}
      </div>

      {testReport && (
        <div className="text-xs bg-paper rounded p-2 mb-3 space-y-0.5 font-mono">
          {testReport.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      {progress && (
        <div className="text-sm text-ink/70">
          <div>
            {progress.made} shrunk
            {progress.skipped > 0 && `, ${progress.skipped} left alone`}
            {progress.failed > 0 && `, ${progress.failed} failed`}
            {progress.remaining > 0 && ` — about ${progress.remaining} to go`}.
          </div>
          {progress.reasons && Object.keys(progress.reasons).length > 0 && (
            <div className="text-xs text-ink/50 mt-1 font-mono">
              {Object.entries(progress.reasons).map(([reason, count]) => (
                <div key={reason}>{count} × {reason}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="text-sm border-t border-border pt-3">
          <div className="font-medium mb-1">Finished</div>
          <div className="text-ink/70">
            {result.made} photo{result.made === 1 ? "" : "s"} shrunk
            {result.skipped > 0 && `, ${result.skipped} already small enough`}
            {result.failed > 0 && `, ${result.failed} couldn't be processed`}.
            {result.savedMb > 0 && ` About ${result.savedMb} MB less to download per full view.`}
          </div>
          {result.reasons && Object.keys(result.reasons).length > 0 && (
            <div className="text-xs text-ink/50 mt-2">
              <div className="mb-1">Why photos were left alone:</div>
              {Object.entries(result.reasons).map(([reason, count]) => (
                <div key={reason} className="font-mono">{count} × {reason}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImportPage() {
  const { isAdmin, loading } = useProfile();
  const [tab, setTab] = useState("clients");

  if (loading) return null;
  if (!isAdmin) {
    return (
      <>
        <Nav />
        <main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">
          This page is only available to management accounts.
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Import from Joist</h1>
        <p className="text-sm text-ink/60 mb-5">
          Clients import from a CSV export. Estimates and invoices import from PDFs — in Joist,
          open each old document and use Print → Save as PDF, then drop all the files in here at
          once. Import clients first, since estimates/invoices are matched to contacts by name.
        </p>
        <div className="flex gap-2 mb-4">
          {["clients", "estimates", "invoices"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded font-display text-sm uppercase tracking-wide border ${
                tab === t ? "bg-ink text-white border-ink" : "border-border text-ink/60"
              }`}>
              {t}
            </button>
          ))}
        </div>
        {tab === "clients" ? <CsvImporter kind="clients" /> : <PdfDocImporter kind={tab} />}

        <PhotoExifBackfill />
        <PhotoThumbnailBackfill />
      </main>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <ImportPage />
    </AuthGate>
  );
}
