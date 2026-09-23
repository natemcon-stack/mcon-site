"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";

// Operator view: every company using the app. Not linked in the nav — it's for whoever
// runs the platform, and it isn't a feature of the product itself.

const STATUS_TONE = {
  trialing: "text-steel",
  active: "text-success",
  comped: "text-success",
  past_due: "text-warn",
  expired: "text-accent-dark",
  cancelled: "text-accent-dark",
};

function PlatformPage() {
  const [companies, setCompanies] = useState(null);
  const [denied, setDenied] = useState(false);

  async function reload() {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/platform/companies", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    if (!res.ok) { setDenied(true); return; }
    const data = await res.json();
    setCompanies(data.companies || []);
  }

  useEffect(() => { reload(); }, []);

  async function savePlan(companyId, patch) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/platform/set-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ companyId, ...patch }),
    });
    if (!res.ok) { alert(await res.text()); return; }
    reload();
  }

  if (denied) {
    return (
      <>
        <Nav />
        <main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">
          Not available on this account.
        </main>
      </>
    );
  }

  if (!companies) {
    return <><Nav /><main className="max-w-3xl mx-auto px-4 py-10 text-ink/50">Loading...</main></>;
  }

  const trialing = companies.filter((c) => c.subscription_status === "trialing");
  const paying = companies.filter((c) => ["active", "comped"].includes(c.subscription_status));

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Companies</h1>
        <p className="text-sm text-ink/60 mb-5">
          {companies.length} signed up · {trialing.length} on trial · {paying.length} active
        </p>

        <div className="space-y-2">
          {companies.map((c) => (
            <div key={c.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex justify-between items-start gap-3 mb-1">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-ink/50">
                    Joined {new Date(c.created_at).toLocaleDateString()}
                    {c.promo_code && <span className="font-mono"> · {c.promo_code}</span>}
                  </div>
                </div>
                <div className={`text-sm shrink-0 ${STATUS_TONE[c.subscription_status] || "text-ink/60"}`}>
                  {c.subscription_status}
                  {c.trialDaysLeft != null && c.subscription_status === "trialing" && (
                    <span className="text-ink/40"> · {c.trialDaysLeft}d</span>
                  )}
                </div>
              </div>

              {c.owners.length > 0 && (
                <div className="text-xs text-ink/50 mb-2">
                  {c.owners.map((o) => `${o.name || "?"} <${o.email || "no email"}>`).join(", ")}
                </div>
              )}

              {/* Usage, not just signups — a company with no jobs hasn't really started. */}
              <div className="flex gap-4 text-xs text-ink/50 font-mono mb-2">
                <span>{c.activePeople}/{c.people} people</span>
                <span>{c.jobs} jobs</span>
                <span>{c.invoices} invoices</span>
                {c.jobs === 0 && <span className="text-warn">not started</span>}
                {c.restricted_at && <span className="text-accent-dark">restricted</span>}
              </div>

              <div className="flex gap-2 items-center flex-wrap border-t border-border pt-2">
                <input type="number" step="0.01" placeholder="Price"
                  defaultValue={c.price ?? ""}
                  onBlur={(e) => savePlan(c.id, { price: e.target.value })}
                  className="w-24 border border-border rounded px-2 py-1 text-sm font-mono" />
                <select defaultValue={c.billing_period || "monthly"}
                  onChange={(e) => savePlan(c.id, { billingPeriod: e.target.value })}
                  className="border border-border rounded px-2 py-1 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="annual">Yearly</option>
                </select>
                <input type="date" defaultValue={c.next_renewal_at || ""}
                  onBlur={(e) => savePlan(c.id, { nextRenewal: e.target.value })}
                  className="border border-border rounded px-2 py-1 text-sm" />
                <select value="" onChange={(e) => e.target.value && savePlan(c.id, { status: e.target.value })}
                  className="border border-border rounded px-2 py-1 text-sm">
                  <option value="">Set status…</option>
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="past_due">Past due</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              {!c.price && (
                <p className="text-xs text-warn mt-1">
                  No price set — they won&apos;t be invoiced at renewal.
                </p>
              )}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><PlatformPage /></AuthGate>;
}
