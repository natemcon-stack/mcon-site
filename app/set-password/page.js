"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";

// Where an invite link and a password-reset link both land.
//
// Until this existed there was no way to choose a password at all: Supabase's invite
// link signs the person in once, and the app had nothing to catch them. They'd get a
// working session that first time, then be locked out afterwards with no password and
// no reset option on the login screen.
//
// The Supabase client reads the token out of the URL fragment automatically and
// establishes a session, so by the time this page mounts there is usually one — and
// having a session is exactly what permits updateUser to set a password.
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("checking"); // checking | ready | nosession | saved
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Supabase has shipped several link formats over the years and which one arrives
      // depends on the project's email templates. Rather than assume, try each:
      //
      //   1. an existing session (implicit flow already consumed the URL fragment)
      //   2. ?token_hash=...&type=recovery — the current template format
      //   3. ?code=... — PKCE, which only works in the browser that requested the link
      //
      // Handling all three is what stops a link that looks fine from silently failing.
      const params = new URLSearchParams(window.location.search);

      const { data: existing } = await supabase.auth.getSession();
      if (cancelled) return;
      if (existing.session) { setStatus("ready"); return; }

      const tokenHash = params.get("token_hash");
      const type = params.get("type") || "recovery";
      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (cancelled) return;
        if (!otpError) { setStatus("ready"); return; }
        setError(otpError.message);
      }

      const code = params.get("code");
      if (code) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!codeError) { setStatus("ready"); return; }
        setError(codeError.message);
      }

      // An error described in the URL is more specific than anything we can infer.
      const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
      const urlError = hash.get("error_description") || params.get("error_description");
      if (urlError) setError(decodeURIComponent(urlError.replace(/\+/g, " ")));

      setStatus("nosession");
    }

    // The session can also arrive a moment after mount while the fragment is consumed.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setStatus("ready");
    });

    check();
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, []);

  async function save(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus("saved");
    setTimeout(() => router.push("/"), 1200);
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="font-display text-2xl font-semibold tracking-wide text-center mb-6">
          {brand.shortName} <span className="text-accent">{brand.appName.toUpperCase()}</span>
        </div>

        {status === "checking" && (
          <p className="text-center text-ink/50 text-sm">Checking your link...</p>
        )}

        {status === "nosession" && (
          <div className="bg-surface border border-border rounded-lg p-6 text-center">
            <p className="text-sm text-ink/70 mb-3">
              This link has expired or has already been used.
            </p>
            <p className="text-sm text-ink/50">
              Ask for a new one from the sign-in page, or have your administrator resend your invite.
            </p>
            {error && <p className="text-xs text-ink/40 mt-3 font-mono break-words">{error}</p>}
            <button onClick={() => router.push("/login")}
              className="mt-4 text-sm text-steel hover:text-steel-dark">
              Back to sign in
            </button>
          </div>
        )}

        {status === "saved" && (
          <div className="bg-surface border border-border rounded-lg p-6 text-center">
            <p className="text-success font-medium">Password set.</p>
            <p className="text-sm text-ink/50 mt-1">Taking you in...</p>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={save} className="bg-surface border border-border rounded-lg p-6">
            <h1 className="font-display uppercase text-sm tracking-wide text-ink/60 mb-1">
              Choose a password
            </h1>
            <p className="text-xs text-ink/40 mb-4">
              You&apos;ll use this with your email address every time you sign in.
            </p>

            <label className="block text-xs text-ink/50 mb-1">New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full border border-border rounded px-3 py-2 mb-3" />

            <label className="block text-xs text-ink/50 mb-1">Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full border border-border rounded px-3 py-2 mb-4" />

            {error && <p className="text-sm text-accent-dark mb-3">{error}</p>}

            <button type="submit" disabled={saving}
              className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-2.5 rounded disabled:opacity-50">
              {saving ? "Saving..." : "Set password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
