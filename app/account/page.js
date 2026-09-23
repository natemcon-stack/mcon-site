"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";

// Somewhere for a person to change their own password without leaving the app.
//
// Until this existed the only route was signing out and using the emailed reset link —
// which is exactly the mechanism that keeps getting eaten by corporate mail scanners.
// Anyone handed a temporary password by an admin needs a way to replace it that doesn't
// depend on email working.

const ROLE_LABEL = {
  admin: "Administrator — full access",
  foreman: "Foreman — jobs, pricing and billing; work is approved before it goes out",
  employee: "Crew — schedule, hours and job details",
};

function AccountPage() {
  const { profile, role, loading } = useProfile();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, []);

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile?.full_name]);

  async function saveName(e) {
    e.preventDefault();
    setSavingName(true);
    // Only the display name — role and is_active are blocked by a database trigger, so
    // there's no way to escalate from here even by editing the request.
    const { error: nameError } = await supabase
      .from("profiles").update({ full_name: fullName.trim() || null }).eq("id", profile.id);
    setSavingName(false);
    setMessage(nameError ? null : "Name updated.");
    if (nameError) setError(nameError.message);
  }

  async function changePassword(e) {
    e.preventDefault();
    setError("");
    setMessage(null);

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
    setPassword("");
    setConfirm("");
    setMessage("Password changed. It takes effect the next time you sign in.");
  }

  if (loading) return null;

  return (
    <>
      <Nav />
      <main className="max-w-lg mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-5">Your account</h1>

        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <div className="text-xs font-display uppercase tracking-wide text-ink/50 mb-2">Signed in as</div>
          <div className="font-mono text-sm">{email}</div>
          <div className="text-xs text-ink/50 mt-2">{ROLE_LABEL[role] || role}</div>
        </div>

        <form onSubmit={saveName} className="bg-surface border border-border rounded-lg p-5 mb-4">
          <label className="block text-xs font-display uppercase tracking-wide text-ink/50 mb-1">
            Display name
          </label>
          <p className="text-xs text-ink/40 mb-2">
            How you appear on the schedule, hours and team chat.
          </p>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 mb-3" />
          <button type="submit" disabled={savingName}
            className="border border-border rounded px-3 py-1.5 text-sm font-display uppercase tracking-wide disabled:opacity-50">
            {savingName ? "Saving..." : "Save name"}
          </button>
        </form>

        <form onSubmit={changePassword} className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-xs font-display uppercase tracking-wide text-ink/50 mb-1">Change password</h2>
          <p className="text-xs text-ink/40 mb-3">
            If an administrator set a temporary password for you, replace it here.
          </p>

          <label className="block text-xs text-ink/50 mb-1">New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-border rounded px-3 py-2 mb-3" />

          <label className="block text-xs text-ink/50 mb-1">Confirm new password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-border rounded px-3 py-2 mb-3" />

          {error && <p className="text-sm text-accent-dark mb-3">{error}</p>}
          {message && <p className="text-sm text-success mb-3">{message}</p>}

          <button type="submit" disabled={saving}
            className="bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide px-4 py-2 rounded disabled:opacity-50">
            {saving ? "Saving..." : "Change password"}
          </button>
        </form>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><AccountPage /></AuthGate>;
}
