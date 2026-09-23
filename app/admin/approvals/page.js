"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

// Where a foreman's estimates and invoices wait before anything reaches a client.
//
// Approving is admin-only and enforced by a database trigger as well as this page —
// a foreman who can write to the table could otherwise approve their own work.

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL = {
  draft: "Draft",
  pending_approval: "Waiting on you",
  changes_requested: "Changes requested",
};

function ApprovalsPage() {
  const { isAdmin, loading } = useProfile();
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const columns = "id, doc_number, amount, date, approval_status, submitted_at, review_note, job_id, jobs(title, contacts(name)), submitted_by, profiles:submitted_by(full_name)";
    const [e, i] = await Promise.all([
      supabase.from("estimates").select(columns).neq("approval_status", "approved").order("submitted_at", { ascending: true }),
      supabase.from("invoices").select(columns).neq("approval_status", "approved").order("submitted_at", { ascending: true }),
    ]);
    setRows([
      ...(e.data || []).map((r) => ({ ...r, kind: "estimate" })),
      ...(i.data || []).map((r) => ({ ...r, kind: "invoice" })),
    ]);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(row, approve) {
    // A rejection without a reason leaves the foreman guessing at what to change.
    let note = null;
    if (!approve) {
      note = prompt("What needs changing? This goes back to whoever submitted it.");
      if (note === null) return;
      if (!note.trim()) {
        alert("Add a short note so they know what to fix.");
        return;
      }
    }

    setBusyId(row.id);
    const { data: { user } } = await supabase.auth.getUser();
    const table = row.kind === "estimate" ? "estimates" : "invoices";
    const { error } = await supabase.from(table).update({
      approval_status: approve ? "approved" : "changes_requested",
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_note: approve ? null : note.trim(),
    }).eq("id", row.id);
    setBusyId(null);

    if (error) {
      alert(`Couldn't update that: ${error.message}`);
      return;
    }

    // Let whoever submitted it know the outcome, especially when it's been sent back —
    // a note nobody reads is the same as no note.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/documents/approval-result", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind: row.kind, id: row.id, approved: approve, note }),
      });
    } catch (e) {
      // The decision is recorded regardless.
    }

    load();
  }

  if (loading) return null;
  if (!isAdmin) {
    return (
      <>
        <Nav />
        <main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">
          Only an administrator can approve documents.
        </main>
      </>
    );
  }

  const waiting = rows.filter((r) => r.approval_status === "pending_approval");
  const other = rows.filter((r) => r.approval_status !== "pending_approval");

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Approvals</h1>
        <p className="text-sm text-ink/60 mb-5">
          Estimates and invoices written by a foreman. Nothing here can be emailed or opened by a
          client until it&apos;s approved.
        </p>

        {rows.length === 0 && (
          <div className="bg-surface border border-border rounded-lg p-6 text-center text-ink/50 text-sm">
            Nothing waiting.
          </div>
        )}

        {waiting.length > 0 && (
          <div className="mb-6">
            <h2 className="font-display uppercase text-sm tracking-wide text-warn mb-2">
              Waiting on you ({waiting.length})
            </h2>
            <div className="space-y-2">
              {waiting.map((r) => (
                <Card key={`${r.kind}-${r.id}`} row={r} onDecide={decide} busy={busyId === r.id} />
              ))}
            </div>
          </div>
        )}

        {other.length > 0 && (
          <div>
            <h2 className="font-display uppercase text-sm tracking-wide text-ink/40 mb-2">
              Not submitted yet
            </h2>
            <div className="space-y-2">
              {other.map((r) => (
                <Card key={`${r.kind}-${r.id}`} row={r} onDecide={decide} busy={busyId === r.id} />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Card({ row, onDecide, busy }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex justify-between items-start gap-3 mb-1">
        <div className="min-w-0">
          <div className="font-medium truncate">
            <span className="text-ink/40 uppercase text-xs mr-1">{row.kind}</span>
            #{row.doc_number} — {row.jobs?.title || "Untitled job"}
          </div>
          <div className="text-xs text-ink/50">
            {row.jobs?.contacts?.name && `${row.jobs.contacts.name} · `}
            {row.date}
            {row.profiles?.full_name && ` · by ${row.profiles.full_name}`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono">{money(row.amount)}</div>
          <div className="text-xs text-ink/40">{STATUS_LABEL[row.approval_status] || row.approval_status}</div>
        </div>
      </div>

      {row.review_note && (
        <div className="text-xs text-ink/60 bg-paper rounded p-2 my-2">
          Sent back: {row.review_note}
        </div>
      )}

      <div className="flex gap-2 mt-2 flex-wrap">
        <Link href={`/jobs/${row.job_id}/new-document?kind=${row.kind}&edit=${row.id}`}
          className="text-xs font-display uppercase tracking-wide border border-border rounded px-2 py-1">
          Open
        </Link>
        <button onClick={() => onDecide(row, true)} disabled={busy}
          className="text-xs font-display uppercase tracking-wide bg-success text-white rounded px-3 py-1 disabled:opacity-50">
          {busy ? "..." : "Approve"}
        </button>
        <button onClick={() => onDecide(row, false)} disabled={busy}
          className="text-xs font-display uppercase tracking-wide border border-accent/50 text-accent-dark rounded px-3 py-1 disabled:opacity-50">
          Send back
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  return <AuthGate><ApprovalsPage /></AuthGate>;
}
