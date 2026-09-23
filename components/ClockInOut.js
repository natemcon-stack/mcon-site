"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { enqueue, registerHandler } from "@/lib/offlineQueue";

// Clock in and out, working with or without signal.
//
// The whole point is that it works where the work is. A crew member standing in a
// basement with no bars still needs to clock in, and telling them to remember and do it
// later means the hours are wrong.
//
// Location is captured at each end of the shift, not continuously. It answers "was this
// person on site when they said they were" and nothing else — no tracking between the
// two points, and nothing recorded when they're off the clock.

// How long to wait for a GPS fix before recording the shift without one. A fix indoors
// can take a long time or never arrive, and a clock-in without a location is far better
// than one that never happened because someone gave up waiting.
const LOCATION_TIMEOUT_MS = 8000;

async function currentPosition() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: 60000 }
    );
  });
}

export default function ClockInOut({ jobs = [], onChange }) {
  const [openShift, setOpenShift] = useState(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState("");
  const [pendingLocal, setPendingLocal] = useState(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("shifts").select("*, jobs(title)")
      .eq("user_id", user.id).is("clock_out_at", null)
      .order("clock_in_at", { ascending: false }).limit(1).maybeSingle();
    setOpenShift(data || null);
    if (data?.job_id) setJobId(data.job_id);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Registered once so anything queued while offline can be sent later, from whichever
  // page happens to be open when signal returns.
  useEffect(() => {
    registerHandler("clock_in", async (payload) => {
      const { error } = await supabase.from("shifts").insert([payload]);
      // A duplicate means a previous attempt actually succeeded — treat as done rather
      // than retrying forever.
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    });

    registerHandler("clock_out", async (payload) => {
      const { clientId, ...patch } = payload;
      const { error } = await supabase.from("shifts").update(patch).eq("client_id", clientId);
      if (error) throw new Error(error.message);
    });
  }, []);

  async function clockIn() {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const location = await currentPosition();

    const record = {
      client_id: crypto.randomUUID(),
      user_id: user?.id,
      job_id: jobId || null,
      clock_in_at: new Date().toISOString(),
      clock_in_lat: location?.lat ?? null,
      clock_in_lng: location?.lng ?? null,
      recorded_offline: !navigator.onLine,
    };

    if (!navigator.onLine) {
      // Queued and shown as pending. The time recorded is now, not when it eventually
      // sends — otherwise a shift queued at 7am and sent at 4pm would be nine hours out.
      await enqueue("clock_in", record);
      setPendingLocal(record);
      setBusy(false);
      onChange?.();
      return;
    }

    const { error } = await supabase.from("shifts").insert([record]);
    setBusy(false);
    if (error) { alert(`Couldn't clock in: ${error.message}`); return; }
    load();
    onChange?.();
  }

  async function clockOut() {
    setBusy(true);
    const location = await currentPosition();
    const shift = openShift || pendingLocal;
    if (!shift) { setBusy(false); return; }

    const patch = {
      clock_out_at: new Date().toISOString(),
      clock_out_lat: location?.lat ?? null,
      clock_out_lng: location?.lng ?? null,
      // Assigned at clock-out because that's when it's known — a day often starts on one
      // job and ends on another.
      job_id: jobId || shift.job_id || null,
    };

    if (!navigator.onLine) {
      await enqueue("clock_out", { ...patch, clientId: shift.client_id });
      setPendingLocal(null);
      setOpenShift(null);
      setBusy(false);
      onChange?.();
      return;
    }

    const query = shift.id
      ? supabase.from("shifts").update(patch).eq("id", shift.id)
      : supabase.from("shifts").update(patch).eq("client_id", shift.client_id);
    const { error } = await query;
    setBusy(false);
    if (error) { alert(`Couldn't clock out: ${error.message}`); return; }
    setPendingLocal(null);
    load();
    onChange?.();
  }

  const active = openShift || pendingLocal;
  const startedAt = active ? new Date(active.clock_in_at) : null;
  const elapsed = startedAt
    ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60000))
    : 0;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 mb-4">
      {!online && (
        <div className="text-xs text-warn mb-2">
          No signal — this will be saved on your phone and sent when you&apos;re back in range.
        </div>
      )}

      {active ? (
        <>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <span className="font-display uppercase text-sm tracking-wide text-success">
              On the clock
            </span>
            <span className="text-sm text-ink/50 font-mono">
              {Math.floor(elapsed / 60)}h {elapsed % 60}m
            </span>
          </div>
          <div className="text-xs text-ink/50 mb-3">
            Since {startedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {active.jobs?.title && ` · ${active.jobs.title}`}
            {pendingLocal && " · waiting to send"}
          </div>

          {/* Asked at clock-out as well as clock-in, because the job often isn't known
              until the day is done. */}
          <label className="block text-xs text-ink/50 mb-1">Which job were you on?</label>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}
            className="w-full border border-border rounded px-2 py-2 text-sm mb-3">
            <option value="">— not assigned —</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>

          <button onClick={clockOut} disabled={busy}
            className="w-full bg-ink text-white font-display uppercase tracking-wide py-3 rounded disabled:opacity-50">
            {busy ? "Getting your location..." : "Clock out"}
          </button>
        </>
      ) : (
        <>
          <div className="font-display uppercase text-sm tracking-wide text-ink/60 mb-2">
            Not clocked in
          </div>
          <label className="block text-xs text-ink/50 mb-1">Job (optional — can be set later)</label>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}
            className="w-full border border-border rounded px-2 py-2 text-sm mb-3">
            <option value="">— pick later —</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>

          <button onClick={clockIn} disabled={busy}
            className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-3 rounded disabled:opacity-50">
            {busy ? "Getting your location..." : "Clock in"}
          </button>
          <p className="text-xs text-ink/40 mt-2">
            Your location is recorded when you clock in and out — not in between.
          </p>
        </>
      )}
    </div>
  );
}
