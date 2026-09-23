"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ReviewsPage() {
  const { isAdmin, loading } = useProfile();
  const [invoices, setInvoices] = useState([]);
  const [sendingId, setSendingId] = useState(null);
  const [hasReviewUrl, setHasReviewUrl] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("invoices")
      .select("*, jobs(title, contacts(name, email))")
      .eq("payment_status", "paid")
      .is("review_request_sent_at", null)
      .eq("review_request_skipped", false)
      .order("paid_date", { ascending: false });
    setInvoices(data || []);

    const { data: settings } = await supabase.from("company_settings").select("google_review_url").maybeSingle();
    setHasReviewUrl(!!settings?.google_review_url);
  }
  useEffect(() => { load(); }, []);

  async function send(invoiceId) {
    if (!confirm("Send a review request to this client now?")) return;
    setSendingId(invoiceId);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/reviews/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ invoiceId }),
    });
    setSendingId(null);
    if (res.ok) { alert("Sent."); load(); }
    else alert("Couldn't send: " + (await res.text()));
  }

  async function skip(invoiceId) {
    await supabase.from("invoices").update({ review_request_skipped: true }).eq("id", invoiceId);
    load();
  }

  if (loading) return null;
  if (!isAdmin) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Review Requests</h1>
        <p className="text-sm text-ink/60 mb-5">
          Every invoice marked paid shows up here — nothing gets emailed automatically.
          Send a request for the clients you're happy to ask, or Skip the ones you'd
          rather not (once skipped, it won't show up here again).
        </p>

        {!hasReviewUrl && (
          <div className="bg-warn/10 border border-warn/30 rounded-lg p-3 text-sm text-warn mb-4">
            Set your Google review link on the <a href="/admin/company" className="underline">Company</a> page before sending any of these.
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {invoices.map((inv) => (
            <div key={inv.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium text-sm">{inv.jobs?.contacts?.name || "Unknown client"}</div>
                <div className="text-xs text-ink/50">{inv.jobs?.title} — {money(inv.amount)} — paid {inv.paid_date}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => send(inv.id)} disabled={sendingId === inv.id || !hasReviewUrl}
                  className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3 py-1.5 disabled:opacity-50">
                  {sendingId === inv.id ? "Sending..." : "Send request"}
                </button>
                <button onClick={() => skip(inv.id)} className="text-xs font-display uppercase tracking-wide text-ink/40 hover:text-accent-dark border border-border rounded px-3 py-1.5">
                  Skip
                </button>
              </div>
            </div>
          ))}
          {invoices.length === 0 && <div className="px-4 py-8 text-center text-ink/40 text-sm">Nothing waiting — paid invoices show up here.</div>}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><ReviewsPage /></AuthGate>;
}
