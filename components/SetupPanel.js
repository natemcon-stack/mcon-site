"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { GUIDES } from "@/lib/setupGuides";

// The outside accounts a company connects for themselves: PayPal for card payments,
// Resend for sending from their own domain, forwarding so replies reach them.
//
// Each one shows what it does and why it matters before asking for anything, because
// "paste your Client ID here" means nothing to someone who hasn't opened a PayPal
// developer account yet. The steps are on screen and can also be emailed — connecting
// these means moving between sites and often devices, and a guide you can't take with
// you gets abandoned halfway.

function GuidePanel({ guide, onSend, sending, sentTo }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  return (
    <div className="border border-border rounded-lg p-4 mb-3 bg-surface">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="font-medium">{guide.title}</div>
          <p className="text-sm text-ink/60 mt-0.5">{guide.summary}</p>
          <p className="text-xs text-ink/40 mt-1">{guide.time} · {guide.needed}</p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="text-xs font-display uppercase tracking-wide border border-border rounded px-2 py-1 shrink-0">
          {open ? "Hide" : "How to"}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <ol className="space-y-3">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-xs text-ink/35 shrink-0 pt-0.5">{i + 1}</span>
                <span>
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-sm text-ink/60">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          {guide.notes?.length > 0 && (
            <div className="bg-paper rounded p-3 mt-3">
              <div className="text-xs font-display uppercase tracking-wide text-ink/50 mb-1">
                Worth knowing
              </div>
              {guide.notes.map((n, i) => (
                <p key={i} className="text-xs text-ink/60 mb-1 last:mb-0">{n}</p>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-center mt-3 flex-wrap">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Send these steps to (optional)"
              className="flex-1 min-w-[12rem] border border-border rounded px-2 py-1.5 text-sm" />
            <button type="button" onClick={() => onSend(guide.key, email)} disabled={sending === guide.key}
              className="text-xs font-display uppercase tracking-wide border border-border rounded px-3 py-1.5 disabled:opacity-50">
              {sending === guide.key ? "Sending..." : "Email these steps"}
            </button>
          </div>
          {sentTo?.[guide.key] && (
            <p className="text-xs text-success mt-1">Sent to {sentTo[guide.key]}.</p>
          )}
          <p className="text-xs text-ink/40 mt-1">
            Leave blank to send to yourself, or enter whoever looks after this for you.
          </p>
        </div>
      )}
    </div>
  );
}

export default function SetupPanel({ company, onSaved }) {
  const [sending, setSending] = useState(null);
  const [sentTo, setSentTo] = useState({});

  // PayPal is the one with fields to fill in; the other two are guides only, because
  // what they produce is entered elsewhere or is pure DNS.
  const [form, setForm] = useState({ clientId: "", secret: "", mode: "live" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const connected = Boolean(company?.paypal_connected);

  async function sendGuide(key, to) {
    setSending(key);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/company/send-guide", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ guide: key, to }),
    });
    setSending(null);
    if (!res.ok) { alert(await res.text()); return; }
    const data = await res.json();
    setSentTo((s) => ({ ...s, [key]: data.sentTo }));
  }

  async function savePaypal(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/company/paypal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) { setError(await res.text()); return; }
    setForm({ clientId: "", secret: "", mode: form.mode });
    onSaved?.();
  }

  async function disconnectPaypal() {
    if (!confirm("Disconnect PayPal? Clients won't be able to pay online until you connect it again.")) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/company/paypal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ disconnect: true }),
    });
    onSaved?.();
  }

  const input = "w-full border border-border rounded px-3 py-2";

  return (
    <div className="mt-6">
      <h2 className="font-display text-lg font-semibold tracking-wide mb-1">Connecting your accounts</h2>
      <p className="text-sm text-ink/60 mb-4">
        These are yours, not ours — your clients pay into your PayPal, and your invoices
        send from your domain. None of it is required to use the app, but each one makes
        it work better.
      </p>

      <GuidePanel guide={GUIDES.paypal} onSend={sendGuide} sending={sending} sentTo={sentTo} />

      <form onSubmit={savePaypal} className="bg-surface border border-border rounded-lg p-4 mb-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-display uppercase tracking-wide text-ink/50">Online payments</h3>
          {connected ? (
            <span className="text-xs text-success">
              Connected · {company.paypal_mode === "live" ? "Live" : "Sandbox"}
            </span>
          ) : (
            <span className="text-xs text-ink/40">Not connected</span>
          )}
        </div>

        {connected && (
          <p className="text-sm text-ink/60 mb-3">
            Clients can pay your invoices online. To change accounts, enter new details below —
            your existing secret can&apos;t be shown again, only replaced.
          </p>
        )}

        <label className="block text-xs text-ink/50 mb-1">Client ID</label>
        <input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          className={input + " mb-3 font-mono text-sm"} placeholder="AY6…" />

        <label className="block text-xs text-ink/50 mb-1">Secret</label>
        <input type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })}
          className={input + " mb-1 font-mono text-sm"} placeholder="EL9…" autoComplete="new-password" />
        <p className="text-xs text-ink/40 mb-3">
          Stored encrypted. Nobody, including us, can read it back out of the app.
        </p>

        <label className="block text-xs text-ink/50 mb-1">Mode</label>
        <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
          className={input + " mb-1"}>
          <option value="live">Live — real payments</option>
          <option value="sandbox">Sandbox — testing only, no real money</option>
        </select>
        <p className="text-xs text-ink/40 mb-3">
          Live and sandbox credentials are different. Copying one into the other is the
          usual mistake, so we check with PayPal before saving.
        </p>

        {error && <p className="text-sm text-accent-dark mb-3">{error}</p>}

        <div className="flex gap-2 items-center">
          <button type="submit" disabled={saving}
            className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded disabled:opacity-50">
            {saving ? "Checking with PayPal..." : connected ? "Replace credentials" : "Connect PayPal"}
          </button>
          {connected && (
            <button type="button" onClick={disconnectPaypal}
              className="text-xs text-ink/40 hover:text-accent-dark">Disconnect</button>
          )}
        </div>
      </form>

      <GuidePanel guide={GUIDES.resend} onSend={sendGuide} sending={sending} sentTo={sentTo} />
      <GuidePanel guide={GUIDES.forwarding} onSend={sendGuide} sending={sending} sentTo={sentTo} />
    </div>
  );
}
