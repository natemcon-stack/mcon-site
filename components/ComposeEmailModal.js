"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";

// Shared compose/preview modal for emailing an estimate or invoice — used from
// both a job's Financials tab and the top-level Estimates/Invoices list pages.
export default function ComposeEmailModal({ kind, r, job, companySettings, onClose, onSent }) {
  const label = kind === "estimate" ? "Estimate" : "Invoice";
  const baseSubject = (kind === "estimate" ? companySettings?.estimate_email_subject : companySettings?.invoice_email_subject)
    || `${label} from ${brand.companyName}`;
  const defaultSubject = `${baseSubject} — ${label} #${r.doc_number}`;
  const defaultBody = (kind === "estimate" ? companySettings?.estimate_email_body : companySettings?.invoice_email_body) || "";

  const [emails, setEmails] = useState(job?.contacts?.email ? [job.contacts.email] : []);
  const [newEmail, setNewEmail] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sendCopy, setSendCopy] = useState(false);
  const [sending, setSending] = useState(false);

  function addEmail() {
    const trimmed = newEmail.trim();
    if (trimmed && !emails.includes(trimmed)) setEmails((e) => [...e, trimmed]);
    setNewEmail("");
  }
  function removeEmail(email) {
    setEmails((e) => e.filter((x) => x !== email));
  }

  async function send() {
    if (emails.length === 0) { alert("Add at least one recipient email."); return; }
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/documents/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ kind, id: r.id, to: emails, subject, body, ccSelf: sendCopy }),
    });
    setSending(false);
    if (res.ok) { alert("Sent."); onSent?.(); onClose(); }
    else alert("Couldn't send: " + (await res.text()));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-lg shadow-xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display text-lg font-semibold mb-3">Email {label}</h3>

        <label className="block text-xs text-ink/60 mb-1">To</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {emails.map((email) => (
            <span key={email} className="text-xs bg-paper border border-border rounded-full px-2 py-1 flex items-center gap-1">
              {email}
              <button onClick={() => removeEmail(email)} className="text-ink/40 hover:text-accent-dark">✕</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
            placeholder="Add another email..." className="flex-1 border border-border rounded px-2 py-1.5 text-sm" />
          <button onClick={addEmail} className="text-xs border border-border rounded px-3">Add</button>
        </div>

        <label className="block text-xs text-ink/60 mb-1">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-border rounded px-2 py-1.5 text-sm mb-3" />

        <label className="block text-xs text-ink/60 mb-1">Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
          className="w-full border border-border rounded px-2 py-1.5 text-sm mb-3" />

        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={sendCopy} onChange={(e) => setSendCopy(e.target.checked)} />
          Send me a copy
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded border border-border">Cancel</button>
          <button onClick={send} disabled={sending}
            className="text-sm px-4 py-2 rounded bg-accent hover:bg-accent-dark text-white disabled:opacity-50">
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
