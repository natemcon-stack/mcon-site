"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";

// Subscription state for a company, and the place an expired one lands.
//
// Deliberately reachable while locked out: an expired company keeps its login, its
// data, and this page. A paywall that also takes away someone's own records isn't a
// paywall, and it's the kind of thing people warn each other about.

const STATUS_COPY = {
  trialing: { title: "Free trial", tone: "text-steel" },
  active: { title: "Subscribed", tone: "text-success" },
  comped: { title: "Complimentary access", tone: "text-success" },
  past_due: { title: "Payment overdue", tone: "text-warn" },
  expired: { title: "Trial ended", tone: "text-accent-dark" },
  cancelled: { title: "Cancelled", tone: "text-accent-dark" },
};

export default function BillingPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "/login"; return; }
    const res = await fetch("/api/auth/status", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    setStatus(res.ok ? await res.json() : null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function applyCode(e) {
    e.preventDefault();
    setError(""); setMessage("");
    setApplying(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/billing/promo", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ code }),
    });
    setApplying(false);
    if (!res.ok) { setError(await res.text()); return; }
    const data = await res.json();
    setMessage(data.message);
    setCode("");
    load();
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-ink/50">Loading...</div>;

  const sub = status?.subscription || {};
  const copy = STATUS_COPY[sub.status] || { title: sub.status, tone: "text-ink/60" };
  const locked = sub.locked;

  return (
    <>
      {!locked && <Nav />}
      <main className="max-w-lg mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-5">Billing</h1>

        {locked && (
          <div className="bg-surface border border-accent-dark/40 rounded-lg p-5 mb-4">
            <div className="font-medium mb-1">Your access has paused</div>
            <p className="text-sm text-ink/60">
              Everything you&apos;ve entered is still here and nothing has been deleted. Set up a
              subscription or enter a code below and it all comes straight back.
            </p>
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <div className="text-xs font-display uppercase tracking-wide text-ink/50 mb-1">
            {sub.companyName || "Your company"}
          </div>
          <div className={`text-lg font-medium ${copy.tone}`}>{copy.title}</div>

          {sub.status === "trialing" && sub.daysLeft != null && (
            <p className="text-sm text-ink/60 mt-1">
              {sub.daysLeft > 0
                ? `${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"} remaining.`
                : "Your trial has ended."}
            </p>
          )}
          {sub.status === "comped" && (
            <p className="text-sm text-ink/60 mt-1">No charge, no end date.</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <h2 className="text-xs font-display uppercase tracking-wide text-ink/50 mb-2">Subscribe</h2>
          <p className="text-sm text-ink/60 mb-3">
            Card payment isn&apos;t switched on yet. Get in touch and it can be arranged directly
            in the meantime.
          </p>
          <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com"}?subject=Subscription`}
            className="inline-block bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
            Get in touch
          </a>
        </div>

        <form onSubmit={applyCode} className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-xs font-display uppercase tracking-wide text-ink/50 mb-2">Have a code?</h2>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="CODE" className="flex-1 border border-border rounded px-3 py-2 font-mono uppercase" />
            <button type="submit" disabled={applying || !code.trim()}
              className="border border-border rounded px-3 py-2 text-sm font-display uppercase tracking-wide disabled:opacity-50">
              {applying ? "..." : "Apply"}
            </button>
          </div>
          {error && <p className="text-sm text-accent-dark mt-2">{error}</p>}
          {message && <p className="text-sm text-success mt-2">{message}</p>}
        </form>

        {locked && (
          <p className="text-center text-sm text-ink/40 mt-5">
            <button onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/login"; })}
              className="hover:text-ink">Sign out</button>
          </p>
        )}
      </main>
    </>
  );
}
