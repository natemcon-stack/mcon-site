"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

const STATUS_STYLE = {
  pending: "bg-warn/10 text-warn border-warn/30",
  approved: "bg-success/10 text-success border-success/30",
  denied: "bg-accent/10 text-accent-dark border-accent/30",
};

function TimeOffPage() {
  const { profile, isAdmin } = useProfile();
  const [requests, setRequests] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [form, setForm] = useState({ start_date: "", end_date: "", reason: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    let query = supabase.from("time_off_requests").select("*").order("requested_at", { ascending: false });
    if (!isAdmin) query = query.eq("user_id", profile?.id);
    const { data } = await query;
    setRequests(data || []);

    if (isAdmin) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name");
      const map = {};
      (profs || []).forEach((p) => { map[p.id] = p.full_name; });
      setProfiles(map);
    }
  }
  useEffect(() => { if (profile) load(); }, [profile, isAdmin]);

  async function submit(e) {
    e.preventDefault();
    if (!form.start_date || !form.end_date) return;
    setSaving(true);
    await supabase.from("time_off_requests").insert([{ user_id: profile.id, ...form }]);
    setForm({ start_date: "", end_date: "", reason: "" });
    setSaving(false);
    load();
  }

  async function decide(id, status) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("time_off_requests")
      .update({ status, decided_at: new Date().toISOString(), decided_by: user?.id })
      .eq("id", id);
    load();
  }

  async function cancel(id) {
    if (!confirm("Cancel this request?")) return;
    await supabase.from("time_off_requests").delete().eq("id", id);
    load();
  }

  if (!profile) return null;

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Time Off</h1>
        <p className="text-sm text-ink/60 mb-5">
          {isAdmin ? "Review and decide on everyone's time-off requests." : "Request time off — your admin will approve or deny it here."}
        </p>

        {!isAdmin && (
          <form onSubmit={submit} className="bg-surface border border-border rounded-lg p-4 grid sm:grid-cols-4 gap-2 mb-6">
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="border border-border rounded px-3 py-2" />
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="border border-border rounded px-3 py-2" />
            <input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="border border-border rounded px-3 py-2" />
            <button disabled={saving} className="bg-accent hover:bg-accent-dark text-white rounded px-3 py-2 font-display uppercase text-sm disabled:opacity-50">
              {saving ? "Sending..." : "Request"}
            </button>
          </form>
        )}

        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {requests.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                {isAdmin && <div className="font-medium text-sm">{profiles[r.user_id] || "Unknown"}</div>}
                <div className="text-sm">{r.start_date} → {r.end_date}</div>
                {r.reason && <div className="text-xs text-ink/50">{r.reason}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-display uppercase border rounded px-2 py-0.5 ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
                {isAdmin && r.status === "pending" && (
                  <>
                    <button onClick={() => decide(r.id, "approved")} className="text-xs text-success hover:underline">Approve</button>
                    <button onClick={() => decide(r.id, "denied")} className="text-xs text-accent-dark hover:underline">Deny</button>
                  </>
                )}
                {(!isAdmin || r.user_id === profile.id) && r.status === "pending" && (
                  <button onClick={() => cancel(r.id)} className="text-xs text-ink/40 hover:text-accent-dark">Cancel</button>
                )}
              </div>
            </div>
          ))}
          {requests.length === 0 && <div className="px-4 py-8 text-center text-ink/40 text-sm">No requests yet.</div>}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><TimeOffPage /></AuthGate>;
}
