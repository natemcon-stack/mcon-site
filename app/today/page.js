"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";
import ClockInOut from "@/components/ClockInOut";
import { safeDate } from "@/lib/safeFilter";
import {
  todayISO, weekStart, weekDays, addDays, dayLabel, dayName, bumpOverdueTasks,
} from "@/lib/weekTasks";

// The crew-facing week view. Route stays /today so existing bookmarks and the installed
// PWA shortcut keep working, even though the page now shows the whole week.
function WeekPage() {
  const { profile, isManagement } = useProfile();
  const [anchor, setAnchor] = useState(todayISO());
  const [jobs, setJobs] = useState([]);
  // Keyed "YYYY-MM-DD|jobId" so a day only shows the work orders actually due that day.
  const [workOrderItems, setWorkOrderItems] = useState({});
  const [emailItems, setEmailItems] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [crew, setCrew] = useState([]);
  const [drafts, setDrafts] = useState({}); // dateISO -> text
  const [assignDrafts, setAssignDrafts] = useState({}); // dateISO -> profile id
  const [bumped, setBumped] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = todayISO();
  const days = weekDays(anchor);
  const isCurrentWeek = weekStart(anchor) === weekStart(today);

  const loadTasks = useCallback(async (weekDaysList) => {
    const { data } = await supabase
      .from("daily_tasks").select("*")
      .gte("date", weekDaysList[0]).lte("date", weekDaysList[6])
      .order("created_at");
    setTasks(data || []);
  }, []);

  const load = useCallback(async () => {
    const weekDaysList = weekDays(anchor);

    // Bump before reading, and only when looking at the current week — moving tasks
    // while paging back through history would rewrite the past.
    if (weekStart(anchor) === weekStart(todayISO())) {
      const moved = await bumpOverdueTasks(supabase);
      setBumped(moved);
    }

    await loadTasks(weekDaysList);

    const { data: pendingEmails } = await supabase
      .from("email_action_items").select("*").eq("dismissed", false).order("received_at", { ascending: false });
    setEmailItems(pendingEmails || []);

    const { data: people } = await supabase.from("profiles").select("id, full_name, role").order("full_name");
    setCrew(people || []);

    // Any job overlapping the visible week, so each day can show what's on.
    const { data: scheduled } = await supabase
      .from("jobs")
      .select("*, contacts(name, phone)")
      .lte("start_date", weekDaysList[6])
      // weekDaysList is derived from the page's own week calculation rather than from
      // input, but this lands inside a PostgREST filter expression, so it's validated
      // anyway — a filter string is the one place a bad value changes meaning instead
      // of just being wrong.
      .or(`end_date.gte.${safeDate(weekDaysList[0], weekDaysList[0])},end_date.is.null`)
      .neq("status", "complete")
      .order("start_date");

    // Work orders appear on the day they're scheduled to go out — not on every day the
    // job happens to be running. An unscheduled work order stays off the week entirely,
    // so creating one is never the same as putting it on someone's day.
    const jobIds = (scheduled || []).map((j) => j.id);
    const ordersByDate = {};
    if (jobIds.length) {
      const { data: workOrders } = await supabase
        .from("work_orders")
        .select("*, work_order_items(*)")
        .in("job_id", jobIds)
        .not("scheduled_date", "is", null)
        .gte("scheduled_date", weekDaysList[0])
        .lte("scheduled_date", weekDaysList[6]);

      (workOrders || []).forEach((wo) => {
        const key = `${wo.scheduled_date}|${wo.job_id}`;
        ordersByDate[key] = ordersByDate[key] || [];
        (wo.work_order_items || []).forEach((item) => ordersByDate[key].push(item));
      });
    }

    setWorkOrderItems(ordersByDate);
    setJobs(scheduled || []);
    setLoading(false);
  }, [anchor, loadTasks]);

  useEffect(() => { load(); }, [load]);

  // Arriving from a notification action. The worker can't clock someone in itself — it
  // has no location permission and no session — so it opens the app here instead, and
  // this makes sure the button is on screen rather than scrolled past.
  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get("action");
    if (action === "clock_in" || action === "clock_out") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const [unscheduled, setUnscheduled] = useState([]);
  const [showScheduler, setShowScheduler] = useState(null); // the day being scheduled

  useEffect(() => {
    if (!isManagement) return;
    supabase.from("jobs")
      .select("id, title, contacts(name)")
      .is("start_date", null)
      .neq("status", "complete")
      .order("created_at", { ascending: false })
      .then(({ data }) => setUnscheduled(data || []));
  }, [isManagement]);

  async function scheduleJob(jobId, dateISO) {
    const { error } = await supabase.from("jobs")
      .update({ start_date: dateISO }).eq("id", jobId);
    if (error) { alert(`Couldn't schedule that: ${error.message}`); return; }
    setUnscheduled((list) => list.filter((j) => j.id !== jobId));
    setShowScheduler(null);
    load();
  }

  // Moving a job off the week entirely, without opening it.
  async function unscheduleJob(jobId) {
    const { error } = await supabase.from("jobs")
      .update({ start_date: null, end_date: null }).eq("id", jobId);
    if (error) { alert(`Couldn't unschedule that: ${error.message}`); return; }
    load();
  }

  async function addTask(dateISO, e) {
    e.preventDefault();
    const text = (drafts[dateISO] || "").trim();
    if (!text) return;
    await supabase.from("daily_tasks").insert([{
      date: dateISO,
      original_date: dateISO,
      description: text,
      created_by: profile?.id,
      assigned_to: assignDrafts[dateISO] || null,
      carried_over_count: 0,
    }]);
    setDrafts((d) => ({ ...d, [dateISO]: "" }));
    loadTasks(days);
  }

  async function toggleTask(task) {
    await supabase.from("daily_tasks")
      .update({ done_at: task.done_at ? null : new Date().toISOString() }).eq("id", task.id);
    loadTasks(days);
  }

  async function removeTask(id) {
    await supabase.from("daily_tasks").delete().eq("id", id);
    loadTasks(days);
  }

  // Manual reschedule, for moving something forward or back without deleting and
  // retyping it. Doesn't touch carried_over_count — that counts automatic slippage.
  async function moveTask(task, dateISO) {
    await supabase.from("daily_tasks").update({ date: dateISO }).eq("id", task.id);
    loadTasks(days);
  }

  async function reassignTask(task, profileId) {
    await supabase.from("daily_tasks").update({ assigned_to: profileId || null }).eq("id", task.id);
    loadTasks(days);
  }

  async function toggleChecklistItem(item, e) {
    e.preventDefault();
    e.stopPropagation();
    const { data: { user } } = await supabase.auth.getUser();
    if (item.checked_at) {
      await supabase.from("work_order_items").update({ checked_at: null, checked_by: null }).eq("id", item.id);
    } else {
      await supabase.from("work_order_items").update({ checked_at: new Date().toISOString(), checked_by: user?.id }).eq("id", item.id);
    }
    load();
  }

  async function dismissEmail(id) {
    await supabase.from("email_action_items").update({ dismissed: true }).eq("id", id);
    setEmailItems((items) => items.filter((i) => i.id !== id));
  }

  function jobsOn(dateISO) {
    return jobs.filter((j) => {
      const start = j.start_date;
      const end = j.end_date || j.start_date;
      if (!start) return false;
      return start <= dateISO && (!end || end >= dateISO);
    });
  }

  function tasksOn(dateISO) {
    return tasks.filter((t) => t.date === dateISO);
  }

  function crewName(id) {
    const person = crew.find((c) => c.id === id);
    return person?.full_name || null;
  }

  const weekRangeLabel = `${dayLabel(days[0])} – ${dayLabel(days[6])}`;

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <h1 className="font-display text-2xl font-semibold tracking-wide">This Week</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setAnchor(addDays(anchor, -7))}
              className="border border-border rounded px-2 py-1 text-xs font-display uppercase text-ink/60 hover:text-ink">
              ← Prev
            </button>
            {!isCurrentWeek && (
              <button onClick={() => setAnchor(todayISO())}
                className="border border-border rounded px-2 py-1 text-xs font-display uppercase text-steel">
                This week
              </button>
            )}
            <button onClick={() => setAnchor(addDays(anchor, 7))}
              className="border border-border rounded px-2 py-1 text-xs font-display uppercase text-ink/60 hover:text-ink">
              Next →
            </button>
          </div>
        </div>
        <p className="text-sm text-ink/60 mb-4">{weekRangeLabel}</p>

        {bumped > 0 && (
          <div className="border border-steel/40 bg-steel/5 rounded px-3 py-2 mb-4 text-sm text-ink/70">
            Moved {bumped} unfinished task{bumped === 1 ? "" : "s"} forward to today.
          </div>
        )}

        {emailItems.length > 0 && (
          <div className="mb-6">
            <h2 className="font-display uppercase text-sm tracking-wide text-ink/60 mb-2">
              Needs a reply ({emailItems.length})
            </h2>
            <div className="bg-surface border border-warn/30 rounded-lg divide-y divide-border">
              {emailItems.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{item.subject}</div>
                    <div className="text-xs text-ink/50 truncate">
                      {item.from_email}
                      {item.flagged_manually && <span className="text-warn ml-1">⚑ flagged</span>}
                    </div>
                    <div className="text-xs text-ink/40 mt-0.5 truncate">{item.snippet}</div>
                  </div>
                  <button onClick={() => dismissEmail(item.id)}
                    className="text-xs text-ink/40 hover:text-accent-dark shrink-0 border border-border rounded px-2 py-1">
                    Done
                  </button>
                </div>
              ))}
            </div>
            {emailItems.some((i) => !i.flagged_manually) && (
              <p className="text-xs text-ink/40 mt-1">
                Keyword-based guess at what needs a reply — not perfect, just a nudge to check.
              </p>
            )}
          </div>
        )}

        {/* First thing on the page, because clocking in is the first thing done on site
            and it has to work with no signal. */}
        <ClockInOut jobs={jobs} />

        {loading ? (
          <p className="text-ink/40 text-sm">Loading...</p>
        ) : (
          <div className="space-y-3">
            {days.map((d) => {
              const isToday = d === today;
              const isPast = d < today;
              const dayJobs = jobsOn(d);
              const dayTasks = tasksOn(d);
              const remaining = dayTasks.filter((t) => !t.done_at).length;
              return (
                <section key={d}
                  className={`bg-surface border rounded-lg ${isToday ? "border-accent shadow-sm" : "border-border"} ${isPast ? "opacity-70" : ""}`}>
                  <div className={`px-4 py-2 flex items-center justify-between gap-2 border-b ${isToday ? "border-accent/30 bg-accent/5" : "border-border"}`}>
                    <div className="font-display uppercase text-sm tracking-wide">
                      {dayName(d)}
                      <span className="text-ink/40 normal-case font-body text-xs ml-2">{dayLabel(d)}</span>
                      {isToday && <span className="text-accent text-xs ml-2">Today</span>}
                    </div>
                    <span className="text-xs text-ink/40 shrink-0">
                      {remaining > 0 ? `${remaining} open` : dayTasks.length > 0 ? "All done" : ""}
                    </span>
                  </div>

                  <div className="px-4 py-3">
                    {/* Scheduling from the week itself. Doing it job by job meant
                        opening each one, which is why the week sat empty. */}
                    {isManagement && (
                      <div className="mb-3">
                        {showScheduler === d ? (
                          <div className="border border-steel/40 rounded p-2">
                            <div className="text-xs text-ink/50 mb-1.5">
                              Put a job on {dayLabel(d)}
                            </div>
                            {unscheduled.length === 0 ? (
                              <p className="text-xs text-ink/40">
                                Every open job already has a date.
                              </p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {unscheduled.map((j) => (
                                  <button key={j.id} onClick={() => scheduleJob(j.id, d)}
                                    className="block w-full text-left text-sm border border-border rounded px-2 py-1.5 hover:border-steel">
                                    {j.title}
                                    {j.contacts?.name && (
                                      <span className="text-xs text-ink/40 ml-2">{j.contacts.name}</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button onClick={() => setShowScheduler(null)}
                              className="text-xs text-ink/40 mt-1.5">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setShowScheduler(d)}
                            className="text-xs text-steel hover:text-steel-dark">
                            + Schedule a job
                            {unscheduled.length > 0 && (
                              <span className="text-ink/35"> ({unscheduled.length} unscheduled)</span>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {dayJobs.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-display uppercase tracking-wide text-ink/40 mb-1">Jobs</div>
                        <div className="space-y-1">
                          {dayJobs.map((job) => (
                            <div key={job.id}>
                              <Link href={`/jobs/${job.id}`} className="text-sm text-steel hover:text-steel-dark">
                                {job.title}
                              </Link>
                              {job.contacts?.name && <span className="text-xs text-ink/40 ml-2">{job.contacts.name}</span>}
                              {isManagement && (
                                <button onClick={() => unscheduleJob(job.id)}
                                  title="Take this job off the schedule"
                                  className="text-xs text-ink/25 hover:text-accent-dark ml-2">✕</button>
                              )}
                              {job.address && (
                                <a
                                  href={job.lat && job.lng
                                    ? `https://www.openstreetmap.org/?mlat=${job.lat}&mlon=${job.lng}#map=16/${job.lat}/${job.lng}`
                                    : `https://maps.google.com/?q=${encodeURIComponent([job.address, job.city, job.province].filter(Boolean).join(", "))}`}
                                  target="_blank" rel="noreferrer"
                                  className="text-xs text-ink/40 hover:text-steel ml-2">
                                  📍 {job.address}
                                </a>
                              )}
                              {/* Only the work orders actually scheduled to go out this day. */}
                              {(workOrderItems[`${d}|${job.id}`] || []).length > 0 && (
                                <ul className="mt-1 mb-2 ml-1 space-y-0.5">
                                  {(workOrderItems[`${d}|${job.id}`] || []).map((item) => (
                                    <li key={item.id} className={`text-sm flex items-center gap-2 ${item.checked_at ? "text-ink/30 line-through" : ""}`}>
                                      <input type="checkbox" checked={!!item.checked_at}
                                        onClick={(e) => toggleChecklistItem(item, e)} onChange={() => {}} />
                                      {item.description}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {dayTasks.length > 0 && (
                      <div className="divide-y divide-border border border-border rounded mb-2">
                        {dayTasks.map((t) => (
                          <div key={t.id} className="px-2 py-1.5 flex items-center gap-2">
                            <input type="checkbox" checked={!!t.done_at} onChange={() => toggleTask(t)} />
                            <span className={`flex-1 text-sm min-w-0 ${t.done_at ? "line-through text-ink/30" : ""}`}>
                              {t.description}
                              {t.carried_over_count > 0 && (
                                <span className="text-xs text-warn ml-2 whitespace-nowrap">
                                  ↷ carried {t.carried_over_count}x{t.original_date ? ` from ${dayLabel(t.original_date)}` : ""}
                                </span>
                              )}
                              {t.assigned_to && crewName(t.assigned_to) && (
                                <span className="text-xs text-steel ml-2">{crewName(t.assigned_to)}</span>
                              )}
                            </span>
                            <select value={t.assigned_to || ""} onChange={(e) => reassignTask(t, e.target.value)}
                              className="border border-border rounded text-xs px-1 py-0.5 text-ink/60 max-w-[7rem]">
                              <option value="">Anyone</option>
                              {crew.map((c) => <option key={c.id} value={c.id}>{c.full_name || "Unnamed"}</option>)}
                            </select>
                            <select value={t.date} onChange={(e) => moveTask(t, e.target.value)}
                              className="border border-border rounded text-xs px-1 py-0.5 text-ink/60">
                              {days.map((dd) => <option key={dd} value={dd}>{dayName(dd).slice(0, 3)}</option>)}
                            </select>
                            <button onClick={() => removeTask(t.id)} className="text-ink/30 hover:text-accent-dark text-xs px-1">✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={(e) => addTask(d, e)} className="flex gap-2">
                      <input value={drafts[d] || ""} onChange={(e) => setDrafts((x) => ({ ...x, [d]: e.target.value }))}
                        placeholder={`Add a task for ${dayName(d)}...`}
                        className="flex-1 border border-border rounded px-2 py-1.5 text-sm min-w-0" />
                      <select value={assignDrafts[d] || ""} onChange={(e) => setAssignDrafts((x) => ({ ...x, [d]: e.target.value }))}
                        className="border border-border rounded px-1 py-1.5 text-xs text-ink/60 max-w-[7rem]">
                        <option value="">Anyone</option>
                        {crew.map((c) => <option key={c.id} value={c.id}>{c.full_name || "Unnamed"}</option>)}
                      </select>
                      <button className="bg-steel hover:bg-steel-dark text-white rounded px-3 py-1.5 font-display uppercase text-xs shrink-0">
                        Add
                      </button>
                    </form>

                    {dayJobs.length === 0 && dayTasks.length === 0 && (
                      <p className="text-xs text-ink/40 mt-2">Nothing scheduled.</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="text-xs text-ink/40 mt-4">
          Anything left unchecked when its day passes moves forward to today automatically,
          with a note showing how many times it&apos;s been carried. Completed tasks stay on the
          day they were finished.
        </p>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><WeekPage /></AuthGate>;
}
