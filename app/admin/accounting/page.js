"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";
import { TAX_CATEGORIES } from "@/app/jobs/[id]/page";
import { getSignedUrl } from "@/lib/signedUrl";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function monthBounds(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start, end };
}

function AccountingPage() {
  const { isAdmin, loading } = useProfile();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [expenses, setExpenses] = useState([]);
  const [receipts, setReceipts] = useState([]);

  async function load() {
    const { start, end } = monthBounds(month);
    const { data } = await supabase
      .from("job_expenses").select("*, jobs(title, job_number)")
      .gte("date", start).lte("date", end).order("date");
    setExpenses(data || []);
    const { data: r } = await supabase.from("gmail_receipts").select("*").eq("status", "pending").order("received_at", { ascending: false });
    setReceipts(r || []);
  }
  useEffect(() => { load(); }, [month]);

  async function setCategory(expenseId, tax_category) {
    await supabase.from("job_expenses").update({ tax_category }).eq("id", expenseId);
    load();
  }

  const uncategorized = expenses.filter((e) => !e.tax_category);
  const byCategory = expenses.reduce((acc, e) => {
    const key = e.tax_category || "Uncategorized";
    acc[key] = (acc[key] || 0) + Number(e.amount);
    return acc;
  }, {});

  const [bundling, setBundling] = useState(false);

  async function downloadReceiptsBundle() {
    const withReceipts = expenses.filter((e) => e.receipt_pdf_path);
    if (withReceipts.length === 0) {
      alert("No receipt PDFs on file for this month — only expenses confirmed from a scanned email with a PDF attachment get one.");
      return;
    }
    setBundling(true);
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const e of withReceipts) {
      try {
        const url = await getSignedUrl("documents", e.receipt_pdf_path);
        if (!url) continue;
        const res = await fetch(url);
        const blob = await res.blob();
        const safeDesc = (e.description || "receipt").replace(/[^a-z0-9]/gi, "-").slice(0, 40);
        zip.file(`${e.date}-${safeDesc}.pdf`, blob);
      } catch (err) {
        // skip anything that fails to fetch — bundle still completes with the rest
      }
    }
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.slug}-receipts-${month}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setBundling(false);
  }

  function downloadCsv() {
    // amount/gst are always CAD. The original_* and fx_* columns are only populated on
    // foreign-currency receipts, and are what an accountant needs to verify the
    // conversion rather than take the CAD figure on trust.
    const rows = [
      "date,job,description,amount_cad,gst_cad,job_cost_category,tax_category,original_currency,original_amount,fx_rate,fx_rate_date,fx_rate_source",
    ];
    expenses.forEach((e) => {
      rows.push([
        e.date, `"${(e.jobs?.job_number || "") + " " + (e.jobs?.title || "")}"`,
        `"${e.description.replace(/"/g, '""')}"`, e.amount, e.gst_amount || "", e.category, e.tax_category || "UNCATEGORIZED",
        e.original_currency || "CAD", e.original_amount || "", e.fx_rate || "", e.fx_rate_date || "",
        `"${e.fx_rate_source || ""}"`,
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.slug}-expenses-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return null;
  if (!isAdmin) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Accounting Export</h1>
        <p className="text-sm text-ink/60 mb-5">
          Monthly expense export for your accountant. Categories below are a starting point based
          on common contractor expense lines — not tax advice; have your accountant confirm
          categorization (especially tools vs. capital equipment) before filing.
        </p>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border border-border rounded px-3 py-2" />
          <button onClick={downloadCsv} className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
            Download CSV
          </button>
          <button onClick={downloadReceiptsBundle} disabled={bundling}
            className="bg-steel hover:bg-steel-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded disabled:opacity-50">
            {bundling ? "Building ZIP..." : "Download Receipts (ZIP)"}
          </button>
        </div>

        {uncategorized.length > 0 && (
          <div className="bg-warn/10 border border-warn/30 rounded-lg p-4 mb-5">
            <div className="font-display uppercase text-xs tracking-wide text-warn mb-2">
              {uncategorized.length} expense{uncategorized.length !== 1 ? "s" : ""} need a tax category before export
            </div>
            {uncategorized.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="truncate">{e.date} — {e.description} ({e.jobs?.title})</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono">
                    {money(e.amount)}
                    {e.original_currency && e.original_currency !== "CAD" && (
                      <span className="text-ink/40 text-xs ml-1">
                        (US${Number(e.original_amount).toFixed(2)} @ {e.fx_rate})
                      </span>
                    )}
                  </span>
                  <select onChange={(ev) => setCategory(e.id, ev.target.value)} defaultValue=""
                    className="border border-border rounded px-2 py-1 text-xs">
                    <option value="" disabled>Set category</option>
                    {TAX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </span>
              </div>
            ))}
          </div>
        )}

        {receipts.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-4 mb-5">
            <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-2">
              {receipts.length} email receipt{receipts.length !== 1 ? "s" : ""} awaiting review
            </div>
            <p className="text-xs text-ink/40 mb-2">Go to Import → Email Receipts to review and turn these into expenses.</p>
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          <div className="px-4 py-2 text-sm font-display uppercase tracking-wide text-ink/50 flex justify-between">
            <span>By tax category</span><span>Total: {money(expenses.reduce((s, e) => s + Number(e.amount), 0))}</span>
          </div>
          {Object.entries(byCategory).map(([cat, amt]) => (
            <div key={cat} className="px-4 py-2 flex justify-between text-sm">
              <span className={cat === "Uncategorized" ? "text-warn" : ""}>{cat}</span>
              <span className="font-mono">{money(amt)}</span>
            </div>
          ))}
          {expenses.length === 0 && <div className="px-4 py-8 text-center text-ink/40 text-sm">No expenses this month.</div>}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><AccountingPage /></AuthGate>;
}
