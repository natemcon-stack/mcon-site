"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import { TAX_CATEGORIES } from "@/app/jobs/[id]/page";
import { getSignedUrl } from "@/lib/signedUrl";
import { findDuplicateExpense } from "@/lib/duplicateReceipt";
import { convertUsdToCad } from "@/lib/fxRate";

// Gmail's desktop URL renders badly on a phone. On a touch device, try the Gmail app's
// URL scheme first and fall back to Gmail's mobile web view if the app isn't installed —
// the app either takes over immediately or nothing happens, in which case the timer fires.
function openInGmail(messageId) {
  const desktopUrl = `https://mail.google.com/mail/u/0/#all/${messageId}`;
  const isTouch = typeof navigator !== "undefined"
    && /android|iphone|ipad|ipod/i.test(navigator.userAgent || "");

  if (!isTouch) {
    window.open(desktopUrl, "_blank", "noreferrer");
    return;
  }

  const mobileWebUrl = `https://mail.google.com/mail/mu/?mail=all#tl/search/rfc822msgid`;
  const appUrl = `googlegmail://co?messageid=${messageId}`;
  const start = Date.now();
  const timer = setTimeout(() => {
    // Still here after the timeout means the app didn't open — fall back to Gmail's
    // mobile web view. The elapsed-time check avoids a spurious fallback when the
    // browser was simply backgrounded.
    if (Date.now() - start < 2500) window.open(mobileWebUrl, "_blank", "noreferrer");
  }, 1200);

  window.addEventListener("pagehide", () => clearTimeout(timer), { once: true });
  window.location.href = appUrl;
}

function ReceiptsPage() {
  const { profile, isManagement, loading } = useProfile();
  const [connection, setConnection] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [drafts, setDrafts] = useState({}); // receiptId -> { job_id, tax_category, amount }

  async function load() {
    if (!profile) return;
    const { data: conn } = await supabase.from("gmail_connections").select("*").eq("user_id", profile.id).maybeSingle();
    setConnection(conn);
    const { data: r } = await supabase.from("gmail_receipts").select("*").eq("status", "pending").order("received_at", { ascending: false });
    setReceipts(r || []);
    // Pre-fill the job dropdown for anything already matched by PO number.
    const preset = {};
    (r || []).forEach((receipt) => {
      if (receipt.linked_job_id) preset[receipt.id] = { job_id: receipt.linked_job_id };
    });
    setDrafts((d) => ({ ...preset, ...d }));
    const { data: j } = await supabase.from("jobs").select("id, title, job_number").order("created_at", { ascending: false });
    setJobs(j || []);
  }
  useEffect(() => { load(); }, [profile]);

  async function connectGmail() {
    // The route identifies the account from this session rather than a URL parameter,
    // so it needs the access token — which means fetching the consent URL and then
    // navigating, instead of linking straight at the route.
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/gmail/connect", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      alert("Couldn't start the Gmail connection. Try signing out and back in.");
      return;
    }
    const { url } = await res.json();
    window.location.href = url;
  }

  const [syncSummary, setSyncSummary] = useState(null);
  const [scanDays, setScanDays] = useState(7);
  async function syncNow() {
    setSyncing(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/gmail/sync?days=${scanDays}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    // Surface the duplicate count from the sync itself — otherwise a flagged receipt
    // is only noticeable by scrolling the queue looking for the banner.
    setSyncSummary(res.ok ? await res.json().catch(() => null) : null);
    setSyncing(false);
    load();
  }

  function updateDraft(id, patch) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  // Rate lookups are cached per receipt-date so flipping the currency toggle back and
  // forth doesn't re-hit the Bank of Canada each time.
  const [rates, setRates] = useState({}); // "YYYY-MM-DD" -> { rate, rateDate, source, error }
  const [ratesLoading, setRatesLoading] = useState({});

  async function ensureRate(dateStr) {
    if (!dateStr || rates[dateStr]) return rates[dateStr];
    setRatesLoading((l) => ({ ...l, [dateStr]: true }));
    const { data: { session } } = await supabase.auth.getSession();
    let result = { rate: null, error: "Lookup failed" };
    try {
      const res = await fetch(`/api/fx/usd-cad?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) result = await res.json();
    } catch (e) { /* keep the null-rate result */ }
    setRates((r) => ({ ...r, [dateStr]: result }));
    setRatesLoading((l) => ({ ...l, [dateStr]: false }));
    return result;
  }

  function receiptDate(receipt) {
    return (receipt.received_at || new Date().toISOString()).slice(0, 10);
  }

  // Currency is per receipt: the detected value unless the user has overridden it.
  function currencyFor(receipt) {
    const draft = drafts[receipt.id] || {};
    return draft.currency || receipt.extracted_currency || "CAD";
  }

  async function setCurrency(receipt, currency) {
    updateDraft(receipt.id, { currency });
    if (currency === "USD") await ensureRate(receiptDate(receipt));
  }

  // Pre-fetch a rate for anything the scanner already flagged as USD, so the converted
  // figure is on screen before the user touches anything.
  useEffect(() => {
    receipts
      .filter((r) => (r.extracted_currency || "").toUpperCase() === "USD")
      .forEach((r) => { ensureRate(receiptDate(r)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts]);

  async function confirmReceipt(receipt) {
    const draft = drafts[receipt.id] || {};
    const enteredAmount = Number(draft.amount ?? receipt.extracted_amount);
    if (!enteredAmount || !draft.job_id || !draft.tax_category) {
      alert("Pick a job, tax category, and confirm an amount before saving.");
      return;
    }
    const expenseDate = (receipt.received_at || new Date().toISOString()).slice(0, 10);
    const currency = currencyFor(receipt);

    // The amount typed in is whatever the receipt says. For a USD receipt that gets
    // converted here, and only the CAD figure goes into `amount` — the books are in one
    // currency, with the original preserved beside it.
    let amount = enteredAmount;
    let gst = Number(draft.gst ?? receipt.extracted_gst) || null;
    let fx = { original_currency: null, original_amount: null, fx_rate: null, fx_rate_date: null, fx_rate_source: null };

    if (currency === "USD") {
      const dateKey = receiptDate(receipt);
      const rateInfo = rates[dateKey] || await ensureRate(dateKey);
      const rate = Number(draft.fx_rate ?? rateInfo?.rate);
      if (!rate || !Number.isFinite(rate)) {
        alert("No exchange rate available for this date. Enter one manually in the rate box, or switch the receipt to CAD.");
        return;
      }
      amount = convertUsdToCad(enteredAmount, rate);
      if (gst != null) gst = convertUsdToCad(gst, rate);
      fx = {
        original_currency: "USD",
        original_amount: enteredAmount,
        fx_rate: rate,
        fx_rate_date: rateInfo?.rateDate || dateKey,
        fx_rate_source: draft.fx_rate ? "Manual entry" : (rateInfo?.source || null),
      };
      const ok = confirm(
        `US$${enteredAmount.toFixed(2)} x ${rate} = CA$${amount.toFixed(2)}\n\n`
        + `Rate from ${fx.fx_rate_source || "unknown source"}${fx.fx_rate_date ? ` for ${fx.fx_rate_date}` : ""}.\n\n`
        + `The expense will be recorded as CA$${amount.toFixed(2)}. Save it?`
      );
      if (!ok) return;
    }

    // Re-check at save time against the amount as edited. Scan-time detection can't
    // see an expense keyed in since the sync ran, and this is the last point before
    // the money lands in the books and the accountant export.
    const clash = await findDuplicateExpense({ supabase, amount, date: expenseDate });
    if (clash) {
      const proceed = confirm(
        `Possible duplicate.\n\nAn expense of $${Number(clash.amount).toFixed(2)} is already recorded on ${clash.date}`
        + `${clash.description ? ` — ${clash.description}` : ""}`
        + `${clash.source === "gmail_import" ? " (from a scanned receipt)" : " (entered manually)"}.`
        + `\n\nSave this as a separate expense anyway?`
      );
      if (!proceed) return;
    }

    const { data: expense } = await supabase.from("job_expenses").insert([{
      job_id: draft.job_id,
      description: draft.vendor ?? receipt.extracted_vendor ?? receipt.subject,
      category: "other",
      tax_category: draft.tax_category,
      amount,
      gst_amount: gst,
      ...fx,
      receipt_pdf_path: receipt.attachment_path || null,
      date: expenseDate,
      source: "gmail_import",
    }]).select().single();
    await supabase.from("gmail_receipts").update({ status: "categorized", linked_expense_id: expense?.id }).eq("id", receipt.id);

    // Move the email out of the inbox into a label now that it's recorded —
    // best-effort, the expense is already saved either way.
    const { data: { session } } = await supabase.auth.getSession();
    fetch("/api/gmail/archive-processed", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ receiptId: receipt.id }),
    }).catch(() => {});

    load();
  }

  async function viewAttachment(path) {
    const url = await getSignedUrl("documents", path);
    if (url) window.open(url, "_blank");
    else alert("Couldn't open this file.");
  }

  const [rescanningId, setRescanningId] = useState(null);
  async function rescan(receiptId) {
    setRescanningId(receiptId);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/gmail/rescan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ receiptId }),
    });
    setRescanningId(null);
    if (res.ok) {
      const result = await res.json();
      alert(`Rescanned via ${result.usedMethod}.`
        + (result.duplicateReason ? `\n\n⚠ Possible duplicate: ${result.duplicateReason}` : ""));
      load();
    }
    else alert("Rescan failed: " + (await res.text()));
  }

  const [flaggingId, setFlaggingId] = useState(null);

  // Writes into the same table the actionable-email scan uses, so a hand-flagged
  // receipt shows up under "Needs a reply" on the week page instead of in a second
  // list. Upserted on gmail_message_id: flagging something the scanner already caught,
  // or re-flagging something previously marked done, revives that one row rather than
  // stacking duplicates.
  async function flagForFollowUp(r) {
    setFlaggingId(r.id);
    const { error } = await supabase.from("email_action_items").upsert([{
      gmail_message_id: r.gmail_message_id,
      from_email: r.from_email,
      subject: r.subject,
      snippet: r.extracted_vendor || "",
      reason: "Flagged from Receipts",
      received_at: r.received_at,
      dismissed: false,
      flagged_manually: true,
    }], { onConflict: "gmail_message_id" });
    setFlaggingId(null);
    alert(error
      ? `Couldn't flag that: ${error.message}`
      : "Flagged — it'll show under Needs a reply on the This Week page.");
  }

  async function dismiss(receipt) {
    if (!confirm("Remove this from the queue? It stays completely untouched in your Gmail inbox — this only removes it from this list.")) return;
    await supabase.from("gmail_receipts").update({ status: "dismissed" }).eq("id", receipt.id);
    load();
  }

  if (loading) return null;
  if (!isManagement) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Email Receipts</h1>

        {!connection ? (
          <div className="bg-surface border border-border rounded-lg p-5 mb-5">
            <p className="text-sm text-ink/60 mb-3">Connect Gmail to automatically pull in receipt-like emails for review.</p>
            <button onClick={connectGmail} className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
              Connect Gmail
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-4 mb-5 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-ink/60">Connected: {connection.email}</span>
            <div className="flex gap-2">
              <button onClick={connectGmail}
                className="text-xs text-ink/50 hover:text-ink border border-border font-display uppercase tracking-wide px-3 py-1.5 rounded">
                Reconnect
              </button>
              <select value={scanDays} onChange={(e) => setScanDays(Number(e.target.value))}
                className="border border-border rounded px-2 py-1.5 text-xs"
                title="How far back to search the mailbox">
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 3 months</option>
                <option value={365}>Last year</option>
                <option value={730}>Last 2 years</option>
              </select>
              <button onClick={syncNow} disabled={syncing}
                className="bg-steel hover:bg-steel-dark text-white font-display uppercase text-xs tracking-wide px-3 py-1.5 rounded disabled:opacity-50">
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            </div>
          </div>
        )}

        {syncSummary && (
          <p className="text-sm text-ink/70 mb-3">
            Pulled in {syncSummary.found} new receipt{syncSummary.found === 1 ? "" : "s"}
            {syncSummary.matchedByPo ? `, ${syncSummary.matchedByPo} matched to a job by PO number` : ""}
            {syncSummary.flaggedDuplicates
              ? `. ${syncSummary.flaggedDuplicates} flagged as a possible duplicate — check the amber notes below before confirming those.`
              : "."}
          </p>
        )}
        {/* A run that stopped at the time limit must not look like a finished one, or
            receipts sit unscanned with nobody aware of it. */}
        {syncSummary?.incomplete && (
          <div className="border border-warn/40 bg-warn/10 rounded px-3 py-2 mb-3">
            <p className="text-sm text-warn">{syncSummary.message}</p>
          </div>
        )}
        {scanDays > 30 && (
          <p className="text-xs text-ink/40 mb-3">
            A deep scan reads up to 500 messages and can take a minute or two. Already-scanned
            emails are skipped, so running it again costs nothing but time.
          </p>
        )}

        <p className="text-sm text-ink/60 mb-3">
          Nothing here becomes an expense automatically — every item still needs a tax
          category confirmed by you before it's saved. If a receipt's email references a
          PO number that matches one on a job's estimate or invoice, the job is
          pre-selected automatically — just double-check it and confirm.
        </p>

        <div className="space-y-3">
          {receipts.map((r) => {
            const draft = drafts[r.id] || {};
            return (
              <div key={`${r.id}-${r.extracted_amount}-${r.extracted_gst}-${r.attachment_path}`} className="bg-surface border border-border rounded-lg p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.subject || "(no subject)"}</div>
                    <div className="text-xs text-ink/40 mb-1">{r.from_email} · {r.received_at && new Date(r.received_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => flagForFollowUp(r)} disabled={flaggingId === r.id}
                      className="text-xs text-ink/40 hover:text-warn border border-border rounded px-2 py-1 disabled:opacity-50"
                      title="Add this email to Needs a reply on the This Week page">
                      {flaggingId === r.id ? "Flagging..." : "⚑ Follow up"}
                    </button>
                    <button onClick={() => rescan(r.id)} disabled={rescanningId === r.id}
                      className="text-xs text-ink/40 hover:text-steel border border-border rounded px-2 py-1 disabled:opacity-50">
                      {rescanningId === r.id ? "Rescanning..." : "Rescan"}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => openInGmail(r.gmail_message_id)}
                  className="text-xs text-steel hover:text-steel-dark block mb-2 text-left">
                  ↗ Open email in Gmail
                </button>
                {(r.extracted_currency || "").toUpperCase() === "USD" && (
                  <div className="text-xs text-steel mb-2">$ This receipt looks like it&apos;s in USD — check the rate below before saving.</div>
                )}
                {/* What the parser couldn't read with confidence. Shown at review time,
                    because the alternative is finding it in a tax return. */}
                {r.parse_warnings?.length > 0 && (
                  <div className="border border-warn/40 bg-warn/10 rounded px-2 py-1.5 mb-2">
                    {r.parse_warnings.map((w, i) => (
                      <div key={i} className="text-xs text-warn">{w}</div>
                    ))}
                  </div>
                )}
                {r.duplicate_reason && (
                  <div className="border border-warn/40 bg-warn/10 rounded px-2 py-1.5 mb-2">
                    <div className="text-xs font-medium text-warn">⚠ Possible duplicate</div>
                    <div className="text-xs text-ink/60 mt-0.5">{r.duplicate_reason}</div>
                    <div className="text-xs text-ink/40 mt-0.5">
                      Nothing has been recorded. Confirm it if it&apos;s a genuine second purchase, or dismiss it.
                    </div>
                  </div>
                )}
                {r.linked_job_id && r.matched_po_number && (
                  <div className="text-xs text-success mb-2">✓ Matched to job via PO #{r.matched_po_number}</div>
                )}
                {r.attachment_path && (
                  <button onClick={() => viewAttachment(r.attachment_path)} className="text-xs text-steel hover:text-steel-dark block mb-2">
                    📄 View receipt PDF (opened for amount/GST)
                  </button>
                )}
                <div className="grid sm:grid-cols-5 gap-2 mb-2">
                  <select value={currencyFor(r)} onChange={(e) => setCurrency(r, e.target.value)}
                    className={`border rounded px-2 py-1.5 text-sm ${currencyFor(r) === "USD" ? "border-steel bg-steel/5" : "border-border"}`}>
                    <option value="CAD">CAD</option>
                    <option value="USD">USD</option>
                  </select>
                  <input type="number" step="0.01" placeholder={currencyFor(r) === "USD" ? "Amount (USD)" : "Amount"}
                    defaultValue={r.extracted_amount || ""}
                    onChange={(e) => updateDraft(r.id, { amount: e.target.value })}
                    className="border border-border rounded px-2 py-1.5 text-sm font-mono" />
                  <input type="number" step="0.01" placeholder="GST"
                    defaultValue={r.extracted_gst || ""}
                    onChange={(e) => updateDraft(r.id, { gst: e.target.value })}
                    className="border border-border rounded px-2 py-1.5 text-sm font-mono" />
                  <select value={draft.job_id || ""} onChange={(e) => updateDraft(r.id, { job_id: e.target.value })}
                    className={`border rounded px-2 py-1.5 text-sm ${r.linked_job_id ? "border-success/50 bg-success/5" : "border-border"}`}>
                    <option value="" disabled>Assign to job</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                  <select onChange={(e) => updateDraft(r.id, { tax_category: e.target.value })} defaultValue=""
                    className="border border-border rounded px-2 py-1.5 text-sm">
                    <option value="" disabled>Tax category</option>
                    {TAX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {currencyFor(r) === "USD" && (() => {
                  const dateKey = receiptDate(r);
                  const info = rates[dateKey];
                  const draftAmount = Number(draft.amount ?? r.extracted_amount) || 0;
                  const rate = Number(draft.fx_rate ?? info?.rate) || null;
                  const converted = rate ? convertUsdToCad(draftAmount, rate) : null;
                  return (
                    <div className="border border-steel/40 bg-steel/5 rounded px-2 py-2 mb-2">
                      {ratesLoading[dateKey] ? (
                        <div className="text-xs text-ink/50">Looking up the exchange rate...</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-ink/60">USD → CAD rate</span>
                            <input type="number" step="0.0001"
                              value={draft.fx_rate ?? info?.rate ?? ""}
                              placeholder="e.g. 1.3712"
                              onChange={(e) => updateDraft(r.id, { fx_rate: e.target.value })}
                              className="border border-border rounded px-2 py-1 text-sm font-mono w-28" />
                            {converted != null && (
                              <span className="text-xs font-mono text-ink">
                                US${draftAmount.toFixed(2)} → CA${converted.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink/40 mt-1">
                            {info?.rate
                              ? `${info.source} rate for ${info.rateDate}${info.rateDate !== dateKey ? " (most recent business day on or before the receipt date)" : ""}. Overwrite it if your card was charged at a different rate.`
                              : `No published rate found${info?.error ? ` — ${info.error}` : ""}. Enter the rate your card was charged at.`}
                          </div>
                          <div className="text-xs text-ink/40 mt-1">
                            Saved as CAD. The USD amount, rate, and rate date are stored with the expense.
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
                <div className="flex gap-2">
                  <button onClick={() => confirmReceipt(r)}
                    className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-xs tracking-wide px-3 py-1.5 rounded">
                    Save as expense
                  </button>
                  <button onClick={() => dismiss(r)}
                    className="text-ink/50 hover:text-ink border border-border font-display uppercase text-xs tracking-wide px-3 py-1.5 rounded">
                    Not a receipt
                  </button>
                </div>
              </div>
            );
          })}
          {receipts.length === 0 && (
            <div className="border border-dashed border-border rounded-lg p-8 text-center text-ink/50 text-sm">
              No pending receipts.
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><ReceiptsPage /></AuthGate>;
}
