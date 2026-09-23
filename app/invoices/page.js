"use client";
import { useEffect, useState } from "react";
import { withDisplayTotals } from "@/lib/documentDisplayTotals";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import ComposeEmailModal from "@/components/ComposeEmailModal";
import { supabase } from "@/lib/supabase/client";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
const STATUS_STYLE = {
  unpaid: "bg-warn/10 text-warn border-warn/30",
  partial: "bg-steel/10 text-steel border-steel/30",
  paid: "bg-success/10 text-success border-success/30",
};

function InvoicesPage() {
  const { isManagement, loading } = useProfile();
  const [invoices, setInvoices] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [companySettings, setCompanySettings] = useState(null);
  const [composeDoc, setComposeDoc] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("*, jobs(title, contacts(name, email))")
        .order("date", { ascending: false });
      const { data: deposits } = await supabase.from("deposits").select("invoice_id, amount").not("invoice_id", "is", null);
      const paidByInvoice = {};
      (deposits || []).forEach((d) => {
        paidByInvoice[d.invoice_id] = (paidByInvoice[d.invoice_id] || 0) + Number(d.amount);
      });
      // Totals include tax, so the figure here matches the invoice the client was sent.
      const withTotals = await withDisplayTotals(invoiceData || [], "invoice");
      setInvoices(withTotals.map((i) => ({ ...i, paid_amount: paidByInvoice[i.id] || 0 })));
    }
    load();
    supabase.from("company_settings").select("*").maybeSingle().then(({ data }) => setCompanySettings(data));
  }, []);

  const filtered = invoices.filter((i) => statusFilter === "all" || (i.payment_status || "unpaid") === statusFilter);

  const groups = {};
  filtered.forEach((i) => {
    const ym = (i.date || "").slice(0, 7) || "unknown";
    (groups[ym] = groups[ym] || []).push(i);
  });
  const months = Object.keys(groups).sort().reverse();

  if (loading) return null;
  if (!isManagement) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-4">Invoices</h1>

        <div className="flex gap-2 mb-5 font-display text-xs uppercase tracking-wide flex-wrap">
          {[["all", "All"], ["unpaid", "Unpaid"], ["partial", "Partial"], ["paid", "Paid"]].map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val)}
              className={`px-3 py-1.5 rounded border ${statusFilter === val ? "bg-ink text-white border-ink" : "border-border text-ink/60"}`}>
              {label}
            </button>
          ))}
        </div>

        {months.map((ym) => (
          <div key={ym} className="mb-5">
            <div className="flex justify-between items-baseline mb-2">
              <h2 className="font-display font-semibold text-lg">{ym === "unknown" ? "No date" : monthLabel(ym)}</h2>
              <span className="font-mono text-sm text-ink/50">{money(groups[ym].reduce((s, i) => s + Number(i.display_total ?? i.amount), 0))}</span>
            </div>
            <div className="bg-surface border border-border rounded-lg divide-y divide-border">
              {groups[ym].map((i) => (
                <div key={i.id} className="px-4 py-3 flex items-center justify-between hover:bg-paper gap-2">
                  <Link href={`/documents/invoice/${i.id}`} target="_blank" className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{i.jobs?.contacts?.name || "Unknown client"}</div>
                    <div className="text-xs text-ink/50">{i.jobs?.title} — {i.date}{i.due_date ? ` · due ${i.due_date}` : ""}</div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm">{money(i.display_total ?? i.amount)}</div>
                    <span className={`text-[10px] font-display uppercase border rounded px-1.5 py-0.5 ${STATUS_STYLE[i.payment_status || "unpaid"]}`}>
                      {i.payment_status || "unpaid"}
                    </span>
                    {i.payment_status !== "paid" && (
                      <div className="text-[10px] text-accent-dark mt-0.5">
                        {money(Number(i.display_total ?? i.amount) - Number(i.paid_amount || 0))} outstanding
                      </div>
                    )}
                  </div>
                  {i.job_id && (
                    <Link href={`/jobs/${i.job_id}/new-document?kind=invoice&edit=${i.id}`}
                      className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-2 py-1 shrink-0">
                      Edit
                    </Link>
                  )}
                  <button onClick={() => setComposeDoc(i)}
                    className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-2 py-1 shrink-0">
                    Email
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="border border-dashed border-border rounded-lg p-10 text-center text-ink/50">No invoices found.</div>}

        {composeDoc && (
          <ComposeEmailModal
            kind="invoice"
            r={composeDoc}
            job={composeDoc.jobs}
            companySettings={companySettings}
            onClose={() => setComposeDoc(null)}
          />
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><InvoicesPage /></AuthGate>;
}
