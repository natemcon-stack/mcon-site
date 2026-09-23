"use client";
import { useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";

const AREAS = [
  "Jobs", "This Week", "Hours / clock in", "Photos", "Estimates", "Invoices",
  "Receipts", "Payroll", "Contacts", "Signing in", "Something else",
];

function ReportBugPage() {
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/bug-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        area,
        description,
        // Sent automatically — asking someone to describe where they were is asking
        // them to do the diagnosis.
        pageUrl: document.referrer || window.location.href,
      }),
    });
    setSending(false);
    if (!res.ok) { setError(await res.text()); return; }
    setSent(true);
    setDescription("");
    setArea("");
  }

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Report a problem</h1>
        <p className="text-sm text-ink/60 mb-5">
          Something not working, or not working the way it should? Send it over.
        </p>

        {sent ? (
          <div className="bg-surface border border-success/40 rounded-lg p-5">
            <div className="font-medium text-success mb-1">Sent — thanks.</div>
            <p className="text-sm text-ink/60">
              It&apos;s gone through with the page you were on and your details, so there&apos;s no
              need to follow up with those.
            </p>
            <button onClick={() => setSent(false)} className="text-sm text-steel hover:text-steel-dark mt-3">
              Report something else
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-surface border border-border rounded-lg p-5 space-y-3">
            <div>
              <label className="block text-xs text-ink/50 mb-1">Where in the app?</label>
              <select value={area} onChange={(e) => setArea(e.target.value)}
                className="w-full border border-border rounded px-3 py-2">
                <option value="">Choose one</option>
                {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-ink/50 mb-1">What happened?</label>
              <p className="text-xs text-ink/40 mb-1">
                What you were doing, what you expected, and what happened instead. Exact wording
                of any error message helps more than anything.
              </p>
              <textarea required value={description} onChange={(e) => setDescription(e.target.value)}
                rows={7} className="w-full border border-border rounded px-3 py-2"
                placeholder="I tried to email an invoice to a client and got a message saying..." />
            </div>

            {error && <p className="text-sm text-accent-dark">{error}</p>}

            <button type="submit" disabled={sending || !description.trim()}
              className="bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide px-4 py-2 rounded disabled:opacity-50">
              {sending ? "Sending..." : "Send report"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><ReportBugPage /></AuthGate>;
}
