"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/signedUrl";
import { itemsToLines } from "@/lib/pdfLines";
import { parseJoistDocument } from "@/lib/joistParser";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function PdfLibraryPage() {
  const { isAdmin, loading } = useProfile();
  const [docs, setDocs] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]); // files awaiting client/date/status entry

  async function load() {
    const { data } = await supabase.from("invoice_documents").select("*").order("doc_date", { ascending: false });
    setDocs(data || []);
  }
  useEffect(() => { load(); }, []);

  const [reading, setReading] = useState(false);

  // Reads each PDF and fills in the client, date and amount rather than asking for
  // details the document already states. Everything stays editable — a misread figure
  // should be correctable, not silently trusted.
  async function selectFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    setReading(true);
    // Loaded on demand: pdf.js is large and most visits to this page never upload.
    const pdfjsLib = await import("pdfjs-dist/build/pdf");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const parsedFiles = [];
    for (const file of files) {
      let parsed = null;
      try {
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
        parsed = parseJoistDocument(text, file.name);
      } catch (err) {
        // A scanned image with no text layer, or a PDF that won't open. The row still
        // appears so it can be filled in by hand rather than silently dropped.
        parsed = null;
      }

      parsedFiles.push({
        file,
        client_name: parsed?.client?.name || "",
        doc_date: parsed?.date || "",
        // Historical invoices being filed are almost always settled — that's usually
        // why they're being kept.
        status: "paid",
        amount: parsed?.total ?? "",
        doc_number: parsed?.docNumber || "",
        warnings: parsed?.warnings || ["Couldn't read this PDF — fill it in by hand."],
      });
    }

    setPendingFiles(parsedFiles);
    setReading(false);
  }

  function updatePending(i, patch) {
    setPendingFiles((list) => list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function uploadPending() {
    setUploading(true);
    let skipped = 0;
    for (const p of pendingFiles) {
      // Skipped rather than guessed at, but the count is reported below so nothing
      // disappears without the person knowing.
      if (!p.client_name || !p.doc_date) { skipped++; continue; }
      const path = `legacy/${Date.now()}-${p.file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, p.file);
      if (!error) {
        await supabase.from("invoice_documents").insert([{
          client_name: p.client_name, doc_date: p.doc_date, status: p.status,
          amount: p.amount === "" ? null : Number(p.amount),
          doc_number: p.doc_number || null,
          file_path: path, source: "joist_import",
        }]);
      }
    }
    setPendingFiles([]);
    setUploading(false);
    if (skipped > 0) {
      alert(`${skipped} file${skipped === 1 ? " was" : "s were"} skipped — a client name and date are needed for each.`);
    }
    load();
  }

  async function view(doc) {
    const url = await getSignedUrl("documents", doc.file_path);
    if (url) window.open(url, "_blank");
    else alert("Couldn't open this file.");
  }

  async function remove(id) {
    if (!confirm("Delete this PDF from the library?")) return;
    await supabase.from("invoice_documents").delete().eq("id", id);
    load();
  }

  const months = [...new Set(docs.map((d) => d.doc_date?.slice(0, 7)))].filter(Boolean).sort().reverse();
  const filtered = docs
    .filter((d) => statusFilter === "all" || d.status === statusFilter)
    .filter((d) => monthFilter === "all" || d.doc_date?.slice(0, 7) === monthFilter);

  function monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }

  if (loading) return null;
  if (!isAdmin) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">PDF Invoice Library</h1>
        <p className="text-sm text-ink/60 mb-5">
          Every invoice you create in the app is added here automatically, kept up to date
          with its paid status. Old Joist invoices can be uploaded manually below.
        </p>

        <div className="bg-surface border border-border rounded-lg p-4 mb-5">
          <label className="block text-xs font-display uppercase tracking-wide text-ink/60 mb-1">
            Upload old Joist invoice PDFs
          </label>
          <input type="file" accept=".pdf" multiple onChange={selectFiles} className="text-sm mb-1" />
          <p className="text-xs text-ink/40 mb-3">
            The client, date and amount are read from each PDF. Check them and correct
            anything that came out wrong.
          </p>
          {reading && <p className="text-sm text-ink/40 mb-2">Reading PDFs...</p>}

          {pendingFiles.map((p, i) => (
            <div key={i} className="border-t border-border pt-2 mb-2">
              <div className="grid sm:grid-cols-5 gap-2 items-center">
                <span className="text-xs text-ink/50 truncate">
                  {p.file.name}
                  {p.doc_number && <span className="block font-mono">#{p.doc_number}</span>}
                </span>
                <input placeholder="Client name" value={p.client_name}
                  onChange={(e) => updatePending(i, { client_name: e.target.value })}
                  className="border border-border rounded px-2 py-1 text-sm" />
                <input type="date" value={p.doc_date}
                  onChange={(e) => updatePending(i, { doc_date: e.target.value })}
                  className="border border-border rounded px-2 py-1 text-sm" />
                <input type="number" step="0.01" placeholder="Total" value={p.amount}
                  onChange={(e) => updatePending(i, { amount: e.target.value })}
                  className="border border-border rounded px-2 py-1 text-sm font-mono" />
                <select value={p.status} onChange={(e) => updatePending(i, { status: e.target.value })}
                  className="border border-border rounded px-2 py-1 text-sm">
                  <option value="invoiced">Invoiced</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              {/* Only what the parser was unsure about — a clean read says nothing. */}
              {p.warnings?.length > 0 && (
                <p className="text-xs text-warn mt-1">{p.warnings.join(" ")}</p>
              )}
            </div>
          ))}
          {pendingFiles.length > 0 && (
            <button onClick={uploadPending} disabled={uploading}
              className="mt-2 bg-accent hover:bg-accent-dark text-white text-xs font-display uppercase tracking-wide rounded px-4 py-2 disabled:opacity-50">
              {uploading ? "Uploading..." : `Upload ${pendingFiles.length} file(s)`}
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-border rounded px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="invoiced">Invoiced (unpaid)</option>
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="border border-border rounded px-3 py-2 text-sm">
            <option value="all">All months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {filtered.map((d) => (
            <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium text-sm">{d.client_name}</div>
                <div className="text-xs text-ink/50">
                  {d.doc_date} · <span className={d.status === "paid" ? "text-success" : "text-warn"}>{d.status}</span>
                  {d.source === "joist_import" && <span className="text-ink/30"> · Joist</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => view(d)} className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3 py-1.5">
                  View PDF
                </button>
                <button onClick={() => remove(d.id)} className="text-xs text-ink/30 hover:text-accent-dark">Delete</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="px-4 py-8 text-center text-ink/40 text-sm">Nothing here yet.</div>}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><PdfLibraryPage /></AuthGate>;
}
