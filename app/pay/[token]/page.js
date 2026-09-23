"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Script from "next/script";
import { withBrandDefaults } from "@/lib/brand";
import { calculateDocumentTotals } from "@/lib/documentTotals";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function lineTotal(l) {
  return Number(l.quantity) * Number(l.unit_cost) * (1 + Number(l.markup_pct) / 100);
}

export default function PublicDocumentPage() {
  const { token } = useParams();
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind") === "estimate" ? "estimate" : "invoice";
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [depositPaid, setDepositPaid] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [signatureInput, setSignatureInput] = useState("");
  const [signing, setSigning] = useState(false);
  const [justSigned, setJustSigned] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralChoice, setReferralChoice] = useState("");
  const [referralOther, setReferralOther] = useState("");
  const [submittingReferral, setSubmittingReferral] = useState(false);

  function load() {
    fetch(`/api/public/document/${token}?kind=${kind}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d) => {
        setData(d);
        if (kind === "estimate" && !d.doc.referral_source) setShowReferralModal(true);
        fetch(`/api/public/document/${token}/activity?kind=${kind}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: "viewed" }),
        }).catch(() => {});
      })
      .catch(() => setError(true));
  }
  useEffect(() => { load(); }, [token, kind]);

  async function submitReferral(source) {
    setSubmittingReferral(true);
    await fetch(`/api/public/document/${token}/referral`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_source: source }),
    }).catch(() => {});
    setSubmittingReferral(false);
    setShowReferralModal(false);
  }

  useEffect(() => {
    if (!sdkReady || !data) return;
    if (!window.paypal) return;

    // An estimate offers only its deposit; an invoice offers the full amount and,
    // separately, the deposit if one was requested and nothing has been paid yet.
    // Nothing left owing means no payment button, even if the invoice hasn't been
    // formally marked paid yet — offering to charge someone who has already settled is
    // how a double payment happens.
    // Computed here from the same data rather than reusing the render-time `total`,
    // which is declared further down and isn't in scope during this effect.
    const docTotals = calculateDocumentTotals({
      doc: data.doc,
      lines: data.lines || [],
      taxRates: data.taxRates || [],
    });
    const outstanding = Math.round((docTotals.total - (data.paidToDate || 0)) * 100) / 100;
    const fullDue = kind === "invoice"
      && data.doc.payment_status !== "paid"
      && !paid
      && outstanding > 0.009;
    const depositDue = kind === "estimate"
      ? Boolean(data.doc.deposit_request_amount) && !depositPaid && (data.paidToDate || 0) <= 0.009
      : Boolean(data.doc.deposit_request_amount) && !depositPaid && data.doc.payment_status === "unpaid";

    if (fullDue) {
      const el = document.getElementById("paypal-button-container");
      if (el) {
        el.innerHTML = "";
        window.paypal.Buttons({
          createOrder: async () => {
            const res = await fetch("/api/paypal/create-order", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, kind }),
            });
            return (await res.json()).id;
          },
          onApprove: async (paypalData) => {
            setPaying(true);
            const res = await fetch("/api/paypal/capture-order", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: paypalData.orderID, token, kind }),
            });
            const result = await res.json();
            setPaying(false);
            if (result.success) setPaid(true);
            else alert("Payment didn't go through — please try again or contact us.");
          },
        }).render("#paypal-button-container");
      }
    }

    if (depositDue) {
      const el = document.getElementById("paypal-deposit-button-container");
      if (el) {
        el.innerHTML = "";
        window.paypal.Buttons({
          createOrder: async () => {
            const res = await fetch("/api/paypal/create-order", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, kind, depositOnly: true }),
            });
            return (await res.json()).id;
          },
          onApprove: async (paypalData) => {
            setPaying(true);
            const res = await fetch("/api/paypal/capture-order", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: paypalData.orderID, token, kind }),
            });
            const result = await res.json();
            setPaying(false);
            if (result.success) setDepositPaid(true);
            else alert("Payment didn't go through — please try again or contact us.");
          },
        }).render("#paypal-deposit-button-container");
      }
    }
  }, [sdkReady, data, paid, depositPaid, kind]);

  async function submitSignature(e) {
    e.preventDefault();
    if (!signatureInput.trim()) return;
    setSigning(true);
    const res = await fetch(`/api/public/document/${token}/sign?kind=${kind}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature_name: signatureInput }),
    });
    setSigning(false);
    if (res.ok) { setJustSigned(true); load(); }
    else alert("Something went wrong — please try again.");
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">This link isn't valid or has expired.</div>;
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  }

  const { doc, lines, company, taxRates, attachments = [], paidToDate = 0, payments = [] } = data;
  // Letterhead values resolved once: settings row first, then instance env defaults.
  const brandCompany = withBrandDefaults(company);
  const docLabel = kind === "estimate" ? "Estimate" : "Invoice";
  const subtotal = lines.length ? lines.reduce((s, l) => s + lineTotal(l), 0) : Number(doc.amount);
  const afterMarkup = subtotal * (1 + Number(doc.markup_pct || 0) / 100);
  const afterDiscount = afterMarkup - Number(doc.discount_amount || 0);
  const applicableTaxRates = doc.tax_exempt ? [] : (taxRates || []).filter((t) => doc.gst_enabled !== false || t.name.trim().toUpperCase() !== "GST");
  const taxes = applicableTaxRates.map((t) => ({ ...t, amount: afterDiscount * (Number(t.rate) / 100) }));
  const totalTax = taxes.reduce((s, t) => s + t.amount, 0);
  const total = afterDiscount + totalTax;
  const isSigned = !!doc.signed_at || justSigned;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      {/* The SDK is loaded with this company's own client id, delivered with the
          document. A company that hasn't connected PayPal gets no id, so the script
          never loads and no payment button appears — which is the intended behaviour,
          not a failure. */}
      {data.paypalClientId && (kind === "invoice" || (kind === "estimate" && doc.deposit_request_amount)) && (
        <Script
          src={`https://www.paypal.com/sdk/js?client-id=${data.paypalClientId}&currency=CAD`}
          onLoad={() => setSdkReady(true)}
        />
      )}
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-8 sm:p-10">
        <div className="text-center text-gray-300 text-3xl font-light tracking-widest uppercase mb-6">
          {docLabel}
        </div>
        {kind === "invoice" && doc.payment_status === "paid" && (
          <div className="text-center mb-6">
            <span className="inline-block border-4 border-red-600 text-red-600 font-bold uppercase text-2xl tracking-widest px-6 py-2" style={{ transform: "rotate(-6deg)" }}>
              Paid in Full
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between gap-6 mb-8">
          <div className="flex gap-3">
            <div className="border border-gray-300 rounded p-1 w-24 h-24 flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brandCompany.logoUrl} alt={brandCompany.companyName} className="max-w-full max-h-full object-contain" onError={(e) => { e.target.style.display = "none"; }} />
            </div>
            <div className="text-sm">
              <div className="font-bold">{brandCompany.companyName}</div>
              {company?.address && <div className="text-gray-600">{company.address}</div>}
              {company?.phone && <div className="text-gray-600">Phone: {company.phone}</div>}
              <div className="text-gray-600">Email: {brandCompany.replyTo}</div>
              {company?.website && <div className="text-gray-600">Web: {company.website}</div>}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Bill To</div>
            <div className="font-medium">{doc.contact?.name}</div>
            {doc.contact?.address && <div className="text-sm text-gray-600">{doc.contact.address}</div>}
            {doc.contact?.phone && <div className="text-sm text-gray-600">{doc.contact.phone}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-8 sm:w-72 sm:ml-auto">
          <span className="text-gray-500">Payment terms</span>
          <span className="text-right">{company?.payment_terms || "Due upon receipt"}</span>
          <span className="text-gray-500">{docLabel} #</span>
          <span className="text-right font-mono">{doc.doc_number}</span>
          <span className="text-gray-500">Date</span>
          <span className="text-right">{doc.date}</span>
          {doc.due_date && (
            <>
              <span className="text-gray-500">Due</span>
              <span className="text-right">{doc.due_date}</span>
            </>
          )}
          {doc.po_number && (
            <>
              <span className="text-gray-500">PO Number</span>
              <span className="text-right">{doc.po_number}</span>
            </>
          )}
          {company?.business_number && (
            <>
              <span className="text-gray-500">Business / Tax #</span>
              <span className="text-right">{company.business_number}</span>
            </>
          )}
        </div>

        <div className="border-b-2 border-gray-800 flex justify-between text-xs uppercase tracking-wide font-bold text-gray-700 pb-1 mb-2">
          <span>Description</span>
          <span>Total</span>
        </div>

        {lines.length > 0 ? (
          <div className="mb-6">
            {lines.map((l, i) => {
              // Photos attached to this specific line, shown right under it so the client
              // sees the work described rather than hunting through one big gallery.
              const linePhotos = attachments.filter((a) => a.lineKey && a.lineKey === l.line_key);
              return (
                <div key={i} className="py-3 border-b border-gray-100">
                  <div className="flex justify-between font-medium">
                    <span>{l.description}</span>
                    <span>{money(lineTotal(l))}</span>
                  </div>
                  {l.scope_notes && <div className="text-sm text-gray-600 whitespace-pre-line mt-1">{l.scope_notes}</div>}
                  {linePhotos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                      {linePhotos.map((a) => (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url} alt={a.caption || ""} loading="lazy"
                            className="w-full h-20 object-cover rounded border border-gray-200" />
                          {a.caption && <div className="text-xs text-gray-500 mt-0.5">{a.caption}</div>}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : doc.note && <p className="text-sm text-gray-700 mb-6">{doc.note}</p>}

        <div className="flex justify-end mb-8">
          <div className="w-64 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(subtotal)}</span></div>
            {Number(doc.markup_pct) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Markup ({doc.markup_pct}%)</span><span>{money(afterMarkup - subtotal)}</span></div>
            )}
            {Number(doc.discount_amount) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{money(doc.discount_amount)}</span></div>
            )}
            {taxes.map((t) => (
              <div key={t.id} className="flex justify-between"><span className="text-gray-500">{t.name} ({t.rate}%)</span><span>{money(t.amount)}</span></div>
            ))}
            <div className="flex justify-between text-lg font-semibold border-t pt-1"><span>Total</span><span>{money(total)}</span></div>

            {/* Payments already received, itemised. A client who paid a deposit needs to
                see it credited — being shown the full amount again reads as being asked
                to pay twice, whatever the button actually charges. */}
            {payments.map((p, i) => (
              <div key={i} className="flex justify-between text-green-700">
                <span>
                  Paid {new Date(`${p.date}T00:00:00`).toLocaleDateString()}
                  {p.method && ` · ${String(p.method).replace("_", " ")}`}
                </span>
                <span>−{money(p.amount)}</span>
              </div>
            ))}
            {paidToDate > 0 && (
              <div className="flex justify-between text-lg font-semibold border-t pt-1">
                <span>{total - paidToDate > 0.009 ? "Balance due" : "Paid in full"}</span>
                <span>{money(Math.max(0, total - paidToDate))}</span>
              </div>
            )}

            {doc.deposit_request_amount > 0 && paidToDate === 0 && (
              <div className="flex justify-between text-steel">
                <span>Deposit requested{doc.deposit_type === "percent" && doc.deposit_request_percent ? ` (${doc.deposit_request_percent}%)` : ""}</span>
                <span>{money(doc.deposit_request_amount)}</span>
              </div>
            )}
          </div>
        </div>

        {doc.note && lines.length > 0 && (
          <div className="mb-8 text-sm">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Notes</div>
            <p className="text-gray-700 whitespace-pre-line">{doc.note}</p>
          </div>
        )}

        {company?.terms_and_conditions && (
          <p className="text-xs text-gray-500 border-t pt-4 mb-8">{company.terms_and_conditions}</p>
        )}

        {kind === "estimate" && (
          <div className="border-t pt-6 mb-6">
            <p className="text-sm text-gray-700 mb-4">By signing below, you agree to the services and conditions outlined in this document.</p>
            {isSigned ? (
              <div>
                <div className="text-2xl italic" style={{ fontFamily: "cursive" }}>{doc.signature_name || signatureInput}</div>
                <div className="border-t border-gray-300 mt-1 pt-1 text-xs text-gray-500 max-w-xs">
                  Signed on: {(doc.signed_at || new Date().toISOString()).slice(0, 10)}<br />
                  {doc.contact?.address} — {doc.contact?.name}
                </div>
              </div>
            ) : (
              <form onSubmit={submitSignature} className="flex gap-2 max-w-sm">
                <input placeholder="Type your full name to sign" value={signatureInput} onChange={(e) => setSignatureInput(e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 italic" style={{ fontFamily: "cursive" }} />
                <button type="submit" disabled={signing} className="bg-gray-800 text-white px-4 py-2 rounded text-sm disabled:opacity-50">
                  {signing ? "Signing..." : "Sign & approve"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Estimates can take their requested deposit — that's how a job gets booked in.
            Only the deposit, never the full amount, since the work hasn't happened. */}
        {attachments.filter((a) => !a.lineKey).length > 0 && (
          <div className="border-t pt-6">
            <h2 className="font-semibold mb-1">Attachments</h2>
            <p className="text-sm text-gray-500 mb-3">
              Photos and documents included with this {docLabel.toLowerCase()}.
            </p>

            {attachments.some((a) => a.isImage && !a.lineKey) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {attachments.filter((a) => a.isImage && !a.lineKey).map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.caption || ""} loading="lazy"
                      className="w-full h-28 object-cover rounded border border-gray-200" />
                    {a.caption && <div className="text-xs text-gray-500 mt-1">{a.caption}</div>}
                  </a>
                ))}
              </div>
            )}

            {attachments.some((a) => !a.isImage && !a.lineKey) && (
              <ul className="space-y-2">
                {attachments.filter((a) => !a.isImage && !a.lineKey).map((a) => (
                  <li key={a.id}>
                    <a href={a.url} target="_blank" rel="noreferrer"
                      className="text-sm text-blue-700 hover:underline break-all">
                      {a.filename || "Attachment"}
                    </a>
                    {a.caption && <div className="text-xs text-gray-500">{a.caption}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {kind === "estimate" && doc.deposit_request_amount > 0 && (
          <div className="border-t pt-6">
            {depositPaid ? (
              <p className="text-green-700 font-medium text-center">Deposit received — thank you!</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-2 text-center">
                  Pay deposit of {money(doc.deposit_request_amount)} via PayPal to book the work in
                </p>
                {paying && <p className="text-center text-sm text-gray-500 mb-2">Processing...</p>}
                <div id="paypal-deposit-button-container" />
                <p className="text-xs text-gray-400 mt-3 text-center">
                  The balance is invoiced once the work is complete.
                </p>
              </>
            )}
          </div>
        )}

        {kind === "invoice" && (
          <div className="border-t pt-6 space-y-6">
            {doc.deposit_request_amount > 0 && doc.payment_status === "unpaid" && (
              <div>
                {depositPaid ? (
                  <p className="text-green-700 font-medium text-center">Deposit received — thank you!</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-2 text-center">Pay deposit of {money(doc.deposit_request_amount)} via PayPal</p>
                    <div id="paypal-deposit-button-container" />
                  </>
                )}
              </div>
            )}
            {paid || doc.payment_status === "paid" ? (
              <p className="text-green-700 font-medium text-center">Payment received — thank you!</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3 text-center">Pay full amount via PayPal</p>
                {paying && <p className="text-center text-sm text-gray-500 mb-2">Processing...</p>}
                <div id="paypal-button-container" />
              </>
            )}
          </div>
        )}

        {shareUrl && (
          <div className="flex justify-center mt-10 pt-6 border-t print:block hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(shareUrl)}`} alt="Scan to view online" />
          </div>
        )}
      </div>

      {showReferralModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="font-semibold text-lg mb-1">Quick question</h3>
            <p className="text-sm text-gray-600 mb-4">How did you hear about {brandCompany.companyName}?</p>
            <div className="space-y-2 mb-3">
              {["Facebook", "Google", "Our website", "Qathet Living Magazine", "Referral from someone", "Other"].map((opt) => (
                <button key={opt} disabled={submittingReferral}
                  onClick={() => opt === "Other" ? setReferralChoice("Other") : submitReferral(opt)}
                  className={`w-full text-left px-3 py-2 rounded border text-sm ${referralChoice === "Other" && opt === "Other" ? "border-gray-800" : "border-gray-300 hover:border-gray-500"}`}>
                  {opt}
                </button>
              ))}
            </div>
            {referralChoice === "Other" && (
              <div className="flex gap-2">
                <input autoFocus placeholder="Tell us where..." value={referralOther} onChange={(e) => setReferralOther(e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm" />
                <button disabled={submittingReferral || !referralOther.trim()} onClick={() => submitReferral(referralOther.trim())}
                  className="bg-gray-800 text-white px-3 py-2 rounded text-sm disabled:opacity-50">Send</button>
              </div>
            )}
            <button onClick={() => setShowReferralModal(false)} className="w-full text-xs text-gray-400 mt-3">Skip</button>
          </div>
        </div>
      )}
    </div>
  );
}
