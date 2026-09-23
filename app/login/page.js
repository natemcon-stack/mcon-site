"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Set when AuthGate turns someone away because their account was switched off, so the
  // sign-in screen says why rather than silently refusing a correct password.
  const [deactivated, setDeactivated] = useState(false);
  useEffect(() => {
    setDeactivated(new URLSearchParams(window.location.search).get("deactivated") === "1");
  }, []);

  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Sends a link that lands on /set-password. Needed for anyone whose invite link has
  // expired, and for the ordinary forgotten-password case — neither had any route back
  // in before this.
  async function sendReset() {
    setError("");
    if (!email) {
      setError("Enter your email address first, then tap Forgot password.");
      return;
    }
    setResetting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setResetting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    // Deliberately not confirming whether the address exists — that would let anyone
    // test which emails have accounts.
    setResetSent(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      // Supabase reports a banned account as a generic credentials or user-banned
      // error. Say plainly what happened rather than leaving someone retrying a
      // password that was never the problem.
      if (/banned|disabled/i.test(error.message)) {
        setDeactivated(true);
        setError("");
      } else {
        setError(error.message);
      }
      return;
    }

    // Supabase authenticates on credentials alone and knows nothing about is_active, so
    // a deactivated person can still sign in successfully. Check before letting them
    // through, otherwise they land on a page for a moment before being bounced.
    try {
      const res = await fetch("/api/auth/status", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const status = res.ok ? await res.json() : null;
      if (status && !status.active) {
        await supabase.auth.signOut();
        setLoading(false);
        setDeactivated(true);
        setError("");
        return;
      }
    } catch (e) {
      // If the check can't run, fall through — AuthGate checks again on the next page.
    }

    setLoading(false);
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display font-semibold text-2xl tracking-wide">
            {brand.shortName} <span className="text-accent">{brand.appName.toUpperCase()}</span>
          </div>
          <p className="text-ink/50 text-sm mt-1 font-mono">crew &amp; job management</p>
        </div>
        {deactivated && (
          <div className="bg-surface border border-warn/40 rounded-lg p-4 mb-4 text-center">
            <p className="text-sm text-ink">Your access has been turned off.</p>
            <p className="text-xs text-ink/50 mt-1">
              Speak to your administrator if you think that&apos;s a mistake.
            </p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-xs font-display uppercase tracking-wide text-ink/60 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-steel"
            />
          </div>
          <div>
            <label className="block text-xs font-display uppercase tracking-wide text-ink/60 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-steel"
            />
          </div>
          {error && <p className="text-sm text-accent-dark">{error}</p>}
          {resetSent && (
            <p className="text-sm text-success">
              If that address has an account, a link to set a new password is on its way.
              Check spam if it doesn&apos;t arrive.
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-2.5 rounded disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <button type="button" onClick={sendReset} disabled={resetting}
            className="w-full text-xs text-steel hover:text-steel-dark disabled:opacity-50">
            {resetting ? "Sending..." : "Forgot password?"}
          </button>
        </form>
        {/* Two distinct paths, and conflating them is the usual confusion: a crew member
            is added by their own admin and should never start a company, while a new
            contractor needs somewhere obvious to begin. */}
        <div className="mt-5 pt-4 border-t border-border text-center">
          <p className="text-sm text-ink/60">New to {brand.appName}?</p>
          <Link href="/signup"
            className="inline-block mt-2 border border-accent text-accent-dark hover:bg-accent/5 font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
            Start a free trial
          </Link>
          <p className="text-xs text-ink/40 mt-2">
            Two months free, no card needed.
          </p>
        </div>

        <p className="text-center text-xs text-ink/40 mt-4">
          Joining a company that already uses this? Your administrator sets up your account.
        </p>
      </div>
    </div>
  );
}
