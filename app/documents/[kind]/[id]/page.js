"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import { withBrandDefaults } from "@/lib/brand";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function lineTotal(li) {
  return Number(li.quantity) * Number(li.unit_cost) * (1 + Number(li.markup_pct) / 100);
}

function DocumentView() {
  const { kind, id } = useParams();
  const { isManagement, loading } = useProfile();
  const [doc, setDoc] = useState(null);
  const [job, setJob] = useState(null);
  const [lines, setLines] = useState([]);
  const [toolLines, setToolLines] = useState([]);
  const [laborLines, setLaborLines] = useState([]);
  const [company, setCompany] = useState(null);
  // Resolved letterhead: settings row over instance env defaults.
  const brandCompany = withBrandDefaults(company);
  const [taxRates, setTaxRates] = useState([]);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    const table = kind === "estimate" ? "estimates" : "invoices";
    supabase.from(table).select("*, jobs(*, contacts(name, email, phone, address))").eq("id", id).single()
      .then(({ data }) => { setDoc(data); setJob(data?.jobs || null); });
    supabase.from("line_items").select("*").eq("parent_type", kind).eq("parent_id", id).eq("is_material", false).eq("is_tool", false).eq("is_labour", false)
      .order("sort_order").then(({ data }) => setLines(data || []));
    supabase.from("line_items").select("*").eq("parent_type", kind).eq("parent_id", id).eq("is_tool", true)
      .order("sort_order").then(({ data }) => setToolLines(data || []));
    supabase.from("line_items").select("*").eq("parent_type", kind).eq("parent_id", id).eq("is_labour", true)
      .order("sort_order").then(({ data }) => setLaborLines(data || []));
    supabase.from("company_settings").select("*").maybeSingle().then(({ data }) => setCompany(data));
    supabase.from("tax_rates").select("*").eq("enabled", true).order("sort_order").then(({ data }) => setTaxRates(data || []));
    supabase.from("document_activity").select("*").eq("parent_type", kind).eq("parent_id", id)
      .order("occurred_at", { ascending: false }).then(({ data }) => setActivity(data || []));
  }, [kind, id]);

  if (loading || !doc) return <><Nav /><main className="max-w-3xl mx-auto px-4 py-6 text-ink/40 text-sm">Loading...</main></>;
  if (!isManagement) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  const subtotal = lines.length ? lines.reduce((s, l) => s + lineTotal(l), 0) : Number(doc.amount);
  const afterMarkup = subtotal * (1 + Number(doc.markup_pct || 0) / 100);
  const afterDiscount = afterMarkup - Number(doc.discount_amount || 0);
  const applicableTaxRates = doc.tax_exempt ? [] : taxRates.filter((t) => doc.gst_enabled !== false || t.name.trim().toUpperCase() !== "GST");
  const taxes = applicableTaxRates.map((t) => ({ ...t, amount: afterDiscount * (Number(t.rate) / 100) }));
  const totalTax = taxes.reduce((s, t) => s + t.amount, 0);
  const total = afterDiscount + totalTax;
  const docLabel = kind === "estimate" ? "Estimate" : "Invoice";

  const ACTIVITY_LABEL = { viewed: "Viewed by client", emailed: "Emailed to client", signed: "Signed by client", paid: "Payment received" };

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={() => window.print()}
          className="bg-ink text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded mb-4 print:hidden">
          Print / Save as PDF
        </button>

        <div id="doc-print" className="bg-surface border border-border rounded-lg p-8 sm:p-10">
          <div className="text-center text-ink/30 text-3xl font-light tracking-widest uppercase mb-6">{docLabel}</div>
          {kind === "invoice" && doc.payment_status === "paid" && (
            <div className="text-center mb-6">
              <span className="inline-block border-4 border-red-600 text-red-600 font-display font-black uppercase text-2xl tracking-widest px-6 py-2 -rotate-6">
                Paid in Full
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between gap-6 mb-8">
            <div className="flex gap-3">
              <div className="border border-border rounded p-1 w-24 h-24 flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brandCompany.logoUrl} alt={brandCompany.companyName} className="max-w-full max-h-full object-contain" onError={(e) => { e.target.style.display = "none"; }} />
              </div>
              <div className="text-sm">
                <div className="font-bold">{brandCompany.companyName}</div>
                {company?.address && <div className="text-ink/60">{company.address}</div>}
                {company?.phone && <div className="text-ink/60">Phone: {company.phone}</div>}
                <div className="text-ink/60">Email: {brandCompany.replyTo}</div>
                {company?.website && <div className="text-ink/60">Web: {company.website}</div>}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Bill To</div>
              <div className="font-medium">{job?.contacts?.name}</div>
              {job?.contacts?.address && <div className="text-sm text-ink/60">{job.contacts.address}</div>}
              {job?.contacts?.phone && <div className="text-sm text-ink/60">{job.contacts.phone}</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-8 sm:w-72 sm:ml-auto">
            <span className="text-ink/50">Payment terms</span>
            <span className="text-right">{company?.payment_terms || "Due upon receipt"}</span>
            <span className="text-ink/50">{docLabel} #</span>
            <span className="text-right font-mono">{doc.doc_number}</span>
            <span className="text-ink/50">Date</span>
            <span className="text-right">{doc.date}</span>
            {doc.due_date && (<><span className="text-ink/50">Due</span><span className="text-right">{doc.due_date}</span></>)}
            {doc.po_number && (<><span className="text-ink/50">PO Number</span><span className="text-right">{doc.po_number}</span></>)}
            {company?.business_number && (<><span className="text-ink/50">Business / Tax #</span><span className="text-right">{company.business_number}</span></>)}
          </div>

          <div className="border-b-2 border-ink flex justify-between text-xs uppercase tracking-wide font-bold text-ink/70 pb-1 mb-2">
            <span>Description</span><span>Total</span>
          </div>

          {lines.length > 0 ? (
            <div className="mb-6">
              {lines.map((l) => (
                <div key={l.id} className="py-3 border-b border-border/50">
                  <div className="flex justify-between font-medium"><span>{l.description}</span><span>{money(lineTotal(l))}</span></div>
                  {l.scope_notes && <div className="text-sm text-ink/60 whitespace-pre-line mt-1">{l.scope_notes}</div>}
                </div>
              ))}
            </div>
          ) : doc.note && <p className="text-sm text-ink/70 mb-6">{doc.note}</p>}

          <div className="flex justify-end mb-8">
            <div className="w-64 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-ink/50">Subtotal</span><span>{money(subtotal)}</span></div>
              {Number(doc.markup_pct) > 0 && (
                <div className="flex justify-between"><span className="text-ink/50">Markup ({doc.markup_pct}%)</span><span>{money(afterMarkup - subtotal)}</span></div>
              )}
              {Number(doc.discount_amount) > 0 && (
                <div className="flex justify-between"><span className="text-ink/50">Discount</span><span>-{money(doc.discount_amount)}</span></div>
              )}
              {taxes.map((t) => (
                <div key={t.id} className="flex justify-between"><span className="text-ink/50">{t.name} ({t.rate}%)</span><span>{money(t.amount)}</span></div>
              ))}
              <div className="flex justify-between text-lg font-semibold border-t border-border pt-1"><span>Total</span><span>{money(total)}</span></div>
              {doc.deposit_request_amount > 0 && (
                <div className="flex justify-between text-steel"><span>Deposit requested</span><span>{money(doc.deposit_request_amount)}</span></div>
              )}
            </div>
          </div>

          {doc.note && lines.length > 0 && (
            <div className="mb-8 text-sm">
              <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Notes</div>
              <p className="text-ink/70 whitespace-pre-line">{doc.note}</p>
            </div>
          )}
          {doc.private_notes && (
            <div className="mb-8 text-sm print:hidden">
              <div className="text-xs uppercase tracking-wide text-warn mb-1">Private notes (internal only)</div>
              <p className="text-ink/70 whitespace-pre-line">{doc.private_notes}</p>
            </div>
          )}

          {toolLines.length > 0 && (
            <div className="mb-8 text-sm print:hidden">
              <div className="text-xs uppercase tracking-wide text-warn mb-1">Internal tools/equipment list</div>
              {toolLines.map((t) => (
                <div key={t.id} className="flex justify-between text-ink/70 py-0.5">
                  <span>{t.description}</span><span className="font-mono text-xs">{t.quantity} {t.unit}</span>
                </div>
              ))}
            </div>
          )}

          {laborLines.length > 0 && (
            <div className="mb-8 text-sm print:hidden">
              <div className="text-xs uppercase tracking-wide text-warn mb-1">Internal labour breakdown</div>
              {laborLines.map((l) => (
                <div key={l.id} className="flex justify-between text-ink/70 py-0.5">
                  <span>{l.description}</span>
                  <span className="font-mono text-xs">{l.quantity} × {money(l.unit_cost)} = {money(Number(l.quantity) * Number(l.unit_cost))}</span>
                </div>
              ))}
            </div>
          )}

          {kind === "estimate" && (doc.skilled_labor_hours || doc.unskilled_labor_hours || doc.travel_hours || doc.material_pickup_hours) && (
            <div className="mb-8 text-sm print:hidden">
              <div className="text-xs uppercase tracking-wide text-warn mb-1">Labor hours estimate (internal)</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-ink/70">
                {doc.skilled_labor_hours && <div>Skilled: <span className="font-mono">{doc.skilled_labor_hours}h</span></div>}
                {doc.unskilled_labor_hours && <div>Unskilled: <span className="font-mono">{doc.unskilled_labor_hours}h</span></div>}
                {doc.travel_hours && <div>Travel: <span className="font-mono">{doc.travel_hours}h</span></div>}
                {doc.material_pickup_hours && <div>Pickup: <span className="font-mono">{doc.material_pickup_hours}h</span></div>}
              </div>
            </div>
          )}

          {(doc.tax_exempt || doc.gst_enabled === false) && (
            <div className="mb-8 text-sm print:hidden">
              <div className="text-xs uppercase tracking-wide text-warn mb-1">Tax status (internal)</div>
              <p className="text-ink/70">
                {doc.tax_exempt ? "Tax exempt — no GST/PST applied (First Nations land)" : "GST disabled for this document"}
              </p>
            </div>
          )}

          {kind === "estimate" && doc.referral_source && (
            <div className="mb-8 text-sm print:hidden">
              <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">How they heard about us</div>
              <p className="text-ink/70">{doc.referral_source}</p>
            </div>
          )}

          {company?.terms_and_conditions && (
            <p className="text-xs text-ink/50 border-t border-border pt-4 mb-6">{company.terms_and_conditions}</p>
          )}

          {kind === "estimate" && (
            <div className="border-t border-border pt-4">
              <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Client approval</div>
              {doc.signed_at ? (
                <div>
                  <div className="text-2xl italic" style={{ fontFamily: "cursive" }}>{doc.signature_name}</div>
                  <div className="text-xs text-ink/50 mt-1">Signed on: {doc.signed_at.slice(0, 10)}</div>
                </div>
              ) : <p className="text-sm text-ink/50">Not yet signed by the client.</p>}
            </div>
          )}
        </div>

        {activity.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-4 mt-4 print:hidden">
            <div className="text-xs uppercase tracking-wide text-ink/40 mb-2">Activity</div>
            {activity.map((a) => (
              <div key={a.id} className="text-sm text-ink/60 py-0.5">
                {ACTIVITY_LABEL[a.event_type] || a.event_type} — {new Date(a.occurred_at).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </main>

      <style jsx global>{`
        @media print {
          nav, header, .print\\:hidden { display: none !important; }
          body { background: white; }
          #doc-print { border: none !important; }
        }
      `}</style>
    </>
  );
}

export default function Page() {
  return <AuthGate><DocumentView /></AuthGate>;
}
