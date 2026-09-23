"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import OfflineBar from "@/components/OfflineBar";

// How often to re-check that the account is still active while a page sits open.
// Without this, deactivating someone only takes effect the next time they navigate or
// reload — a crew member with the app already open on their phone could keep using it
// for as long as the tab stayed alive.
const RECHECK_MS = 60_000;

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [trialNotice, setTrialNotice] = useState(null);
  const router = useRouter();
  // Guards against two checks racing (the interval firing while a focus check runs)
  // and signing out twice.
  const endingRef = useRef(false);

  const endSession = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setReady(false);
    await supabase.auth.signOut();
    // Straight to the sign-in screen rather than a message page — a deactivated account
    // should see exactly what a signed-out one sees, and nothing of the app.
    router.replace("/login?deactivated=1");
  }, [router]);

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace("/login");
      return;
    }

    // Asked of the server, not the profiles table: since "read profiles" became
    // is_active()-gated, a deactivated user's own row is invisible to them, which the
    // browser can't tell apart from a new account with no row yet.
    let status;
    try {
      const res = await fetch("/api/auth/status", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      status = res.ok ? await res.json() : null;
    } catch (e) {
      // A network blip shouldn't lock someone out mid-job — leave them as they are and
      // let the next check decide.
      setReady(true);
      return;
    }

    if (!status || !status.signedIn) {
      await endSession();
      return;
    }
    if (!status.active) {
      await endSession();
      return;
    }

    // Signup that stopped halfway leaves an account with no company. There is nothing
    // for them in the app until that's finished.
    if (status.needsCompany) {
      router.replace("/signup?finish=1");
      return;
    }

    // A lapsed subscription blocks the app but never the account — they keep their
    // login, their data, and the billing page. Export and support stay reachable so
    // nobody is held hostage over a card that expired.
    if (status.subscription?.locked && !window.location.pathname.startsWith("/billing")) {
      router.replace("/billing?expired=1");
      return;
    }

    setTrialNotice(
      status.subscription?.status === "trialing" && status.subscription.daysLeft != null
        ? status.subscription
        : null
    );
    setReady(true);
  }, [router, endSession]);

  useEffect(() => {
    check();

    const interval = setInterval(check, RECHECK_MS);
    // Coming back to a backgrounded tab is the most likely moment for the status to
    // have changed since the last check.
    const onFocus = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      listener.subscription.unsubscribe();
    };
  }, [check, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink/50 font-mono text-sm">
        Loading...
      </div>
    );
  }
  return (
    <>
      <OfflineBar />
      {/* Only worth mentioning once the end is actually near — a banner from day one is
          just furniture people stop seeing. */}
      {trialNotice && trialNotice.daysLeft <= 14 && (
        <div className="bg-warn/15 border-b border-warn/30 px-4 py-2 text-center text-sm">
          {trialNotice.daysLeft > 0
            ? `${trialNotice.daysLeft} day${trialNotice.daysLeft === 1 ? "" : "s"} left in your free trial.`
            : "Your free trial has ended."}
          {" "}
          <a href="/billing" className="text-steel hover:text-steel-dark underline">Set up billing</a>
        </div>
      )}
      {children}
    </>
  );
}
