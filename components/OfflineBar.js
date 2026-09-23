"use client";
import { useEffect, useState } from "react";
import { listQueue, flushQueue, startAutoFlush } from "@/lib/offlineQueue";

// Tells the crew what hasn't been sent yet.
//
// The point of an offline queue is that work isn't lost. That only holds if people can
// see what's still on their phone — a silent queue is indistinguishable from a lost
// clock-in until payroll, which is far too late to fix it.

export default function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();

    const refresh = async () => {
      try { setPending((await listQueue()).length); } catch (e) { /* no IndexedDB */ }
    };
    refresh();

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("offline-queue-changed", refresh);
    const stop = startAutoFlush();

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("offline-queue-changed", refresh);
      stop();
    };
  }, []);

  async function sendNow() {
    setSending(true);
    await flushQueue();
    setPending((await listQueue()).length);
    setSending(false);
  }

  if (online && pending === 0) return null;

  return (
    <div className={`px-4 py-2 text-sm text-center ${online ? "bg-warn/15 border-b border-warn/30" : "bg-ink text-white"}`}>
      {!online && "No signal — you can keep working. "}
      {pending > 0 && (
        <>
          {pending} item{pending === 1 ? "" : "s"} waiting to send
          {online && (
            <button onClick={sendNow} disabled={sending}
              className="underline ml-2 disabled:opacity-50">
              {sending ? "Sending..." : "Send now"}
            </button>
          )}
        </>
      )}
      {!online && pending === 0 && "Anything you do will be saved and sent later."}
    </div>
  );
}
