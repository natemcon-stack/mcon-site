"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

function ReportsPage() {
  const { isAdmin, loading } = useProfile();
  const [range, setRange] = useState(monthRange());
  const [invoices, setInvoices] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [deposits, setDeposits] = useState([]);

  async function load() {
    const [i, e, d] = await Promise.all([
      supabase.from("invoices")
        .select("id, doc_number, amount, payment_status, date, first_viewed_at, last_viewed_at, view_count, job_id, jobs(title, contacts(name))")
        .gte("date", range.start).lte("date", range.end),
      supabase.from("estimates")
        .select("id, doc_number, amount, date, first_viewed_at, last_viewed_at, view_count, job_id, jobs(title, contacts(name))")
        .gte("date", range.start).lte("date", range.end),
      supabase.from("deposits").select("amount, date").gte("date", range.start).lte("date", range.end),
    ]);
    setInvoices(i.data || []);
    setEstimates(e.data || []);
    setDeposits(d.data || []);
  }
  useEffect(() => { load(); }, [range]);

  const grandTotalInvoices = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const grandTotalEstimates = estimates.reduce((s, e) => s + Number(e.amount), 0);
  const paidInvoices = invoices.filter((i) => i.payment_status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const depositTotal = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const totalRevenue = paidInvoices + depositTotal;

  // Whether clients have opened what they were sent. Unopened is the actionable half:
  // an invoice nobody has looked at is usually a delivery problem, not a payment one.
  const tracked = [
    ...invoices.map((r) => ({ ...r, kind: "invoice" })),
    ...estimates.map((r) => ({ ...r, kind: "estimate" })),
  ];
  const unopened = tracked.filter((r) => !r.last_viewed_at)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const opened = tracked.filter((r) => r.last_viewed_at)
    .sort((a, b) => (a.last_viewed_at > b.last_viewed_at ? -1 : 1));

  if (loading) return null;
  if (!isAdmin) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-4">Reports</h1>

        <div className="bg-surface border border-border rounded-lg p-4 flex gap-3 items-end mb-5">
          <div>
            <label className="block text-xs text-ink/60 mb-1">From</label>
            <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} className="border border-border rounded px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">To</label>
            <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} className="border border-border rounded px-2 py-1.5" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Total Revenue</div>
            <div className="text-3xl font-display font-semibold">{money(totalRevenue)}</div>
            <p className="text-xs text-ink/40 mt-2">Paid invoices + deposits received in this period.</p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Grand Total — Invoices</div>
            <div className="text-3xl font-display font-semibold">{money(grandTotalInvoices)}</div>
            <p className="text-xs text-ink/40 mt-2">Total invoice volume issued this period, paid or not.</p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Grand Total — Estimates</div>
            <div className="text-3xl font-display font-semibold">{money(grandTotalEstimates)}</div>
            <p className="text-xs text-ink/40 mt-2">Total estimate volume issued this period.</p>
          </div>
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="text-xs uppercase tracking-wide text-ink/40 mb-1">Deposits Received</div>
            <div className="text-3xl font-display font-semibold">{money(depositTotal)}</div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 mt-5">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="font-display text-lg font-semibold tracking-wide">Opened by the client</h2>
            <span className="text-xs text-ink/40">{opened.length} of {tracked.length} opened</span>
          </div>
          <p className="text-xs text-ink/40 mb-4">
            Tracks whether the client link was opened. A document that was printed or handed over
            in person won&apos;t register here, and neither will one sent before this was turned on.
          </p>

          {unopened.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-display uppercase tracking-wide text-warn mb-2">
                Not opened yet ({unopened.length})
              </div>
              <div className="divide-y divide-border">
                {unopened.map((r) => (
                  <Link key={`${r.kind}-${r.id}`} href={`/jobs/${r.job_id}`}
                    className="flex justify-between items-center gap-2 py-2 text-sm hover:bg-paper">
                    <span className="truncate">
                      <span className="text-ink/40 uppercase text-xs">{r.kind}</span>{" "}
                      {r.jobs?.title || "Untitled job"}
                      {r.jobs?.contacts?.name && <span className="text-ink/40"> · {r.jobs.contacts.name}</span>}
                    </span>
                    <span className="text-xs text-ink/40 shrink-0 font-mono">{r.date}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {opened.length > 0 && (
            <div>
              <div className="text-xs font-display uppercase tracking-wide text-ink/40 mb-2">Opened</div>
              <div className="divide-y divide-border">
                {opened.map((r) => (
                  <Link key={`${r.kind}-${r.id}`} href={`/jobs/${r.job_id}`}
                    className="flex justify-between items-center gap-2 py-2 text-sm hover:bg-paper">
                    <span className="truncate">
                      <span className="text-ink/40 uppercase text-xs">{r.kind}</span>{" "}
                      {r.jobs?.title || "Untitled job"}
                      {r.jobs?.contacts?.name && <span className="text-ink/40"> · {r.jobs.contacts.name}</span>}
                    </span>
                    <span className="text-xs text-success shrink-0">
                      {new Date(r.last_viewed_at).toLocaleDateString()}
                      {(r.view_count || 1) > 1 && ` · ${r.view_count}×`}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {tracked.length === 0 && (
            <div className="text-sm text-ink/40">No estimates or invoices in this period.</div>
          )}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><ReportsPage /></AuthGate>;
}
