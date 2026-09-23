"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

const STATUS_STYLES = {
  active: "bg-success/10 text-success border-success/30",
  estimate: "bg-warn/10 text-warn border-warn/30",
  complete: "bg-ink/10 text-ink/60 border-ink/20",
};

function JobsList() {
  const { isAdmin } = useProfile();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("jobs")
      .select("*, contacts(name)")
      .order("created_at", { ascending: false });
    setJobs(data || []);
    setLoading(false);
  }

  const filtered = jobs
    .filter((j) => filter === "all" || j.status === filter)
    .filter((j) => !q || j.title.toLowerCase().includes(q.toLowerCase()));

  function toggleSelect(id, e) {
    e.preventDefault();
    e.stopPropagation();
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteOne(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this job and everything under it (hours, expenses, photos, estimates, invoices, work orders)? This can't be undone.")) return;
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) alert(error.message);
    else load();
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected job(s) and everything under them? This can't be undone.`)) return;
    const { error } = await supabase.from("jobs").delete().in("id", Array.from(selected));
    if (error) alert(error.message);
    else {
      setSelected(new Set());
      load();
    }
  }

  return (
    <AuthGate>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-wide">Jobs</h1>
            <p className="text-ink/50 text-sm font-mono">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          <Link
            href="/jobs/new"
            className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded"
          >
            + New Job
          </Link>
        </div>

        <input placeholder="Search jobs by title..." value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 mb-3" />

        {isAdmin && selected.size > 0 && (
          <div className="flex items-center justify-between bg-accent/10 border border-accent/30 rounded-lg px-4 py-2 mb-3">
            <span className="text-sm">{selected.size} selected</span>
            <button onClick={deleteSelected}
              className="text-xs font-display uppercase tracking-wide text-accent-dark border border-accent-dark/40 rounded px-3 py-1">
              Delete selected
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-5 font-display text-xs uppercase tracking-wide">
          {[["active", "Active"], ["estimate", "Estimates"], ["complete", "Completed"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 rounded border ${
                filter === val ? "bg-ink text-white border-ink" : "border-border text-ink/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-ink/40 font-mono text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-10 text-center text-ink/50">
            No jobs yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-6">
            {groupByMonth(filtered).map(([monthLabel, monthJobs]) => (
              <div key={monthLabel}>
                <div className="flex items-baseline justify-between mb-2 sticky top-14 bg-paper py-1 z-10">
                  <h2 className="font-display uppercase text-sm tracking-wide text-ink/60">{monthLabel}</h2>
                  <span className="text-xs text-ink/35 font-mono">{monthJobs.length}</span>
                </div>
                <div className="space-y-2">
            {monthJobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="tag-notch bg-surface border border-border rounded-md px-4 py-3 hover:border-steel transition-colors block relative"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    {isAdmin && (
                      <input type="checkbox" checked={selected.has(job.id)}
                        onClick={(e) => toggleSelect(job.id, e)} onChange={() => {}}
                        className="mt-1.5" />
                    )}
                    <div>
                      <div className="font-mono text-xs text-ink/40">#{job.job_number}</div>
                      <div className="font-display font-semibold text-lg leading-tight">{job.title}</div>
                      <div className="text-sm text-ink/60">{job.contacts?.name || "No contact linked"}</div>
                      {job.address && <div className="text-xs text-ink/40 mt-1">{job.address}</div>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`stamp text-[10px] font-display font-bold uppercase border rounded px-2 py-0.5 whitespace-nowrap ${
                        STATUS_STYLES[job.status] || STATUS_STYLES.active
                      }`}
                    >
                      {job.status?.replace("_", " ")}
                    </span>
                    {isAdmin && (
                      <button onClick={(e) => deleteOne(job.id, e)} className="text-ink/30 hover:text-accent-dark text-xs">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AuthGate>
  );
}

// Groups jobs into the month they started, newest first. A job with no start date
// falls back to when it was created — every job has one of the two, and burying
// undated jobs in a separate pile at the bottom would hide them.
function groupByMonth(jobs) {
  const groups = new Map();

  for (const job of jobs) {
    const raw = job.start_date || job.created_at;
    const date = raw ? new Date(raw) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);

  }

  const label = (key) => {
    if (key === "unknown") return "No date";
    // Jobs grouped by created_at rather than a real start date aren't scheduled, so
    // they never appear on the crew's week. Worth naming rather than hiding.
    const [year, month] = key.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    const thisYear = new Date().getFullYear();
    // The year is only worth showing when it isn't the current one — "August" reads
    // better than "August 2026" when everything is 2026.
    return d.toLocaleDateString(undefined, {
      month: "long",
      ...(Number(year) === thisYear ? {} : { year: "numeric" }),
    });
  };

  return [...groups.entries()]
    .sort((a, b) => (a[0] === "unknown" ? 1 : b[0] === "unknown" ? -1 : b[0].localeCompare(a[0])))
    .map(([key, list]) => [label(key), list]);
}

export default function Page() {
  return <JobsList />;
}
