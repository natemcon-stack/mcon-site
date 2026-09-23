"use client";
import { useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";

// What you hand your accountant at the end of a period: tax collected, tax paid, the
// difference, and expenses grouped the way a return wants them.
//
// Not a filing, and it doesn't pretend to be. It reports what's in the app, so the
// number that matters most is often the count of expenses with no GST recorded — that
// tells you whether the input-tax figure is complete before you rely on it.

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Calendar quarters, since that's how most small businesses file.
function quarters(year) {
  return [
    { label: `Q1 ${year}`, start: `${year}-01-01`, end: `${year}-03-31` },
    { label: `Q2 ${year}`, start: `${year}-04-01`, end: `${year}-06-30` },
    { label: `Q3 ${year}`, start: `${year}-07-01`, end: `${year}-09-30` },
    { label: `Q4 ${year}`, start: `${year}-10-01`, end: `${year}-12-31` },
    { label: `All of ${year}`, start: `${year}-01-01`, end: `${year}-12-31` },
  ];
}

function TaxSummaryPage() {
  const { isAdmin, loading } = useProfile();
  const year = new Date().getFullYear();
  const [range, setRange] = useState(quarters(year)[Math.floor(new Date().getMonth() / 3)]);
  const [basis, setBasis] = useState("cash");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(next = range, nextBasis = basis) {
    setBusy(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `/api/reports/tax-summary?start=${next.start}&end=${next.end}&basis=${nextBasis}`,
      { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }
    );
    setBusy(false);
    if (!res.ok) { setError(await res.text()); return; }
    setData(await res.json());
  }

  function downloadCsv() {
    if (!data) return;
    const rows = [];

    rows.push(["TAX SUMMARY"]);
    rows.push(["Period", data.period.start, "to", data.period.end]);
    rows.push(["Basis", data.period.basis === "cash" ? "Cash (when paid)" : "Accrual (when invoiced)"]);
    rows.push([]);

    rows.push(["SALES"]);
    rows.push(["Invoices", data.sales.invoiceCount]);
    rows.push(["Subtotal (before tax)", data.sales.subtotal]);
    data.sales.taxCollected.forEach((t) => rows.push([`${t.name} collected`, t.amount]));
    rows.push(["Total billed", data.sales.total]);
    rows.push([]);

    rows.push(["PURCHASES"]);
    rows.push(["Expenses", data.purchases.expenseCount]);
    rows.push(["Total", data.purchases.total]);
    rows.push(["GST paid (input tax credits)", data.purchases.gstPaid]);
    rows.push(["Expenses with no GST recorded", data.purchases.missingGstCount]);
    rows.push([]);

    rows.push(["GST POSITION"]);
    rows.push(["Collected on sales", data.gstSummary.collected]);
    rows.push(["Paid on purchases", data.gstSummary.paid]);
    rows.push([data.gstSummary.net >= 0 ? "Owing to CRA" : "Refund due", Math.abs(data.gstSummary.net)]);
    rows.push([]);

    rows.push(["EXPENSES BY CATEGORY"]);
    rows.push(["Category", "Count", "Total", "GST"]);
    data.purchases.byCategory.forEach((c) => rows.push([c.category, c.count, c.total, c.gst]));
    rows.push([]);

    // The detail behind every figure above, so an accountant can check rather than
    // take the summary on trust.
    rows.push(["INVOICE DETAIL"]);
    rows.push(["Date", "Invoice #", "Job", "Subtotal", "Tax", "Total"]);
    data.invoices.forEach((i) => rows.push([
      i.date, i.docNumber, i.job || "", i.subtotal,
      i.taxes.reduce((s, t) => s + t.amount, 0), i.total,
    ]));
    rows.push([]);

    rows.push(["EXPENSE DETAIL"]);
    rows.push(["Date", "Description", "Job", "Category", "Amount", "GST", "Original currency", "Original amount", "FX rate"]);
    data.expenses.forEach((e) => rows.push([
      e.date, e.description || "", e.job || "", e.category, e.amount,
      e.gst == null ? "" : e.gst,
      e.originalCurrency || "", e.originalAmount || "", e.fxRate || "",
    ]));

    const csv = rows.map((r) => r.map((cell) => {
      const s = String(cell ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-summary-${data.period.start}-to-${data.period.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return null;
  if (!isAdmin) {
    return (
      <>
        <Nav />
        <main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">
          Management only.
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Tax summary</h1>
        <p className="text-sm text-ink/60 mb-5">
          Tax collected, tax paid, and expenses by category for a period. A summary to hand
          your accountant — not a filing.
        </p>

        <div className="bg-surface border border-border rounded-lg p-4 mb-5">
          <div className="flex gap-1.5 flex-wrap mb-3">
            {[...quarters(year), ...quarters(year - 1)].map((q) => (
              <button key={q.label}
                onClick={() => { setRange(q); run(q); }}
                className={`text-xs font-display uppercase tracking-wide border rounded px-2 py-1 ${
                  range.label === q.label ? "bg-ink text-white border-ink" : "border-border text-ink/60"
                }`}>
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" value={range.start}
              onChange={(e) => setRange({ ...range, label: "Custom", start: e.target.value })}
              className="border border-border rounded px-2 py-1.5 text-sm" />
            <span className="text-ink/40 text-sm">to</span>
            <input type="date" value={range.end}
              onChange={(e) => setRange({ ...range, label: "Custom", end: e.target.value })}
              className="border border-border rounded px-2 py-1.5 text-sm" />

            <select value={basis} onChange={(e) => { setBasis(e.target.value); run(range, e.target.value); }}
              className="border border-border rounded px-2 py-1.5 text-sm">
              <option value="cash">Cash — when paid</option>
              <option value="accrual">Accrual — when invoiced</option>
            </select>

            <button onClick={() => run()} disabled={busy}
              className="bg-ink text-white font-display uppercase text-xs tracking-wide px-3 py-1.5 rounded disabled:opacity-50">
              {busy ? "Working..." : "Run"}
            </button>
          </div>
          <p className="text-xs text-ink/40 mt-2">
            Most small contractors file cash-basis, but it&apos;s your accountant&apos;s call.
          </p>
        </div>

        {error && <p className="text-sm text-accent-dark mb-4">{error}</p>}

        {data && (
          <>
            <div className="bg-surface border border-border rounded-lg p-5 mb-4">
              <div className="text-xs font-display uppercase tracking-wide text-ink/50 mb-3">
                GST position
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink/60">Collected on sales</span>
                  <span className="font-mono">{money(data.gstSummary.collected)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/60">Paid on purchases</span>
                  <span className="font-mono">−{money(data.gstSummary.paid)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1 font-medium">
                  <span>{data.gstSummary.net >= 0 ? "Owing" : "Refund due"}</span>
                  <span className="font-mono">{money(Math.abs(data.gstSummary.net))}</span>
                </div>
              </div>

              {data.purchases.missingGstCount > 0 && (
                <p className="text-xs text-warn mt-3">
                  {data.purchases.missingGstCount} expense{data.purchases.missingGstCount === 1 ? " has" : "s have"} no
                  GST recorded. If any of those were taxable purchases, the amount you can
                  claim back is higher than shown here.
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-surface border border-border rounded-lg p-5">
                <div className="text-xs font-display uppercase tracking-wide text-ink/50 mb-2">
                  Sales · {data.sales.invoiceCount} invoice{data.sales.invoiceCount === 1 ? "" : "s"}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink/60">Before tax</span>
                  <span className="font-mono">{money(data.sales.subtotal)}</span>
                </div>
                {data.sales.taxCollected.map((t) => (
                  <div key={t.name} className="flex justify-between text-sm">
                    <span className="text-ink/60">{t.name}</span>
                    <span className="font-mono">{money(t.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t border-border pt-1 mt-1 font-medium">
                  <span>Total billed</span>
                  <span className="font-mono">{money(data.sales.total)}</span>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-lg p-5">
                <div className="text-xs font-display uppercase tracking-wide text-ink/50 mb-2">
                  Purchases · {data.purchases.expenseCount} expense{data.purchases.expenseCount === 1 ? "" : "s"}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink/60">Total spent</span>
                  <span className="font-mono">{money(data.purchases.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-ink/60">GST paid</span>
                  <span className="font-mono">{money(data.purchases.gstPaid)}</span>
                </div>
              </div>
            </div>

            {data.purchases.byCategory.length > 0 && (
              <div className="bg-surface border border-border rounded-lg overflow-hidden mb-4">
                <div className="px-4 py-3 text-xs font-display uppercase tracking-wide text-ink/50 border-b border-border">
                  Expenses by category
                </div>
                <div className="divide-y divide-border">
                  {data.purchases.byCategory.map((c) => (
                    <div key={c.category} className="px-4 py-2 flex justify-between items-center text-sm gap-3">
                      <span className="min-w-0">
                        <span className="block truncate">{c.category}</span>
                        <span className="text-xs text-ink/40">{c.count} item{c.count === 1 ? "" : "s"}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block font-mono">{money(c.total)}</span>
                        {c.gst > 0 && <span className="block text-xs text-ink/40 font-mono">GST {money(c.gst)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={downloadCsv}
              className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
              Download for accountant
            </button>
            <p className="text-xs text-ink/40 mt-2">
              The CSV includes every invoice and expense behind these totals, so the figures
              can be checked rather than taken on trust.
            </p>
          </>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><TaxSummaryPage /></AuthGate>;
}
