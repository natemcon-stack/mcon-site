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

function EstimatesPage() {
  const { isManagement, loading } = useProfile();
  const [estimates, setEstimates] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [companySettings, setCompanySettings] = useState(null);
  const [composeDoc, setComposeDoc] = useState(null);

  useEffect(() => {
    supabase
      .from("estimates")
      .select("*, jobs(title, contacts(name, email))")
      .order("date", { ascending: false })
      .then(async ({ data }) => setEstimates(await withDisplayTotals(data || [], "estimate")));
    supabase.from("company_settings").select("*").maybeSingle().then(({ data }) => setCompanySettings(data));
  }, []);

  const filtered = estimates.filter((e) => {
    // Filtering on outcome rather than signature: most work is won verbally, so
    // "signed" was only ever a subset of "accepted".
    const outcome = e.outcome || "open";
    if (statusFilter === "open") return outcome === "open";
    if (statusFilter === "accepted") return outcome === "accepted";
    if (statusFilter === "declined") return outcome === "declined" || outcome === "expired";
    return true;
  });

  // Worth seeing at a glance: what's still live, and what proportion you're winning.
  const openCount = estimates.filter((e) => (e.outcome || "open") === "open").length;
  const acceptedCount = estimates.filter((e) => e.outcome === "accepted").length;
  const decidedCount = estimates.filter((e) => ["accepted", "declined", "expired"].includes(e.outcome)).length;
  const winRate = decidedCount > 0 ? Math.round((acceptedCount / decidedCount) * 100) : null;
  const openValue = estimates
    .filter((e) => (e.outcome || "open") === "open")
    .reduce((sum, e) => sum + Number(e.display_total ?? e.amount ?? 0), 0);

  const groups = {};
  filtered.forEach((e) => {
    const ym = (e.date || "").slice(0, 7) || "unknown";
    (groups[ym] = groups[ym] || []).push(e);
  });
  const months = Object.keys(groups).sort().reverse();

  if (loading) return null;
  if (!isManagement) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Estimates</h1>
        <p className="text-sm text-ink/60 mb-4">
          {openCount} still out
          {openValue > 0 && ` · $${openValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} in play`}
          {winRate != null && ` · winning ${winRate}% of decided quotes`}
        </p>

        <div className="flex gap-2 mb-5 font-display text-xs uppercase tracking-wide">
          {[["all", "All"], ["open", "Still out"], ["accepted", "Accepted"], ["declined", "Lost"]].map(([val, label]) => (
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
              <span className="font-mono text-sm text-ink/50">{money(groups[ym].reduce((s, e) => s + Number(e.display_total ?? e.amount), 0))}</span>
            </div>
            <div className="bg-surface border border-border rounded-lg divide-y divide-border">
              {groups[ym].map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-center justify-between hover:bg-paper gap-2">
                  <Link href={`/documents/estimate/${e.id}`} target="_blank" className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{e.jobs?.contacts?.name || "Unknown client"}</div>
                    <div className="text-xs text-ink/50">{e.jobs?.title} — {e.date}</div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm">{money(e.display_total ?? e.amount)}</div>
                    {(() => {
                      // Signed is worth distinguishing from accepted-by-phone — one has
                      // the client's name on it, the other is your word for it.
                      const outcome = e.outcome || "open";
                      const style = {
                        open: ["bg-warn/10 text-warn border-warn/30", "Still out"],
                        accepted: ["bg-success/10 text-success border-success/30", e.signed_at ? "Signed" : "Accepted"],
                        declined: ["bg-accent/10 text-accent-dark border-accent-dark/30", "Lost"],
                        expired: ["bg-ink/5 text-ink/40 border-border", "Expired"],
                      }[outcome] || ["bg-ink/5 text-ink/40 border-border", outcome];
                      return (
                        <span className={`text-[10px] font-display uppercase border rounded px-1.5 py-0.5 ${style[0]}`}>
                          {style[1]}
                        </span>
                      );
                    })()}
                  </div>
                  {e.job_id && (
                    <Link href={`/jobs/${e.job_id}/new-document?kind=estimate&edit=${e.id}`}
                      className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-2 py-1 shrink-0">
                      Edit
                    </Link>
                  )}
                  <button onClick={() => setComposeDoc(e)}
                    className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-2 py-1 shrink-0">
                    Email
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="border border-dashed border-border rounded-lg p-10 text-center text-ink/50">No estimates found.</div>}

        {composeDoc && (
          <ComposeEmailModal
            kind="estimate"
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
  return <AuthGate><EstimatesPage /></AuthGate>;
}
