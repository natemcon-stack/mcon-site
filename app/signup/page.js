"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";

// Sign-up for a new company. Creates the company, the first admin, and a two-month
// trial — no card, no email confirmation step. Anything that stands between someone
// and trying the thing is a reason not to.

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    companyName: "", fullName: "", email: "", password: "", confirm: "", promoCode: "",
    billingPeriod: "monthly",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (form.password.length < 8) { setError("Use at least 8 characters for the password."); return; }
    if (form.password !== form.confirm) { setError("The two passwords don't match."); return; }

    setBusy(true);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setBusy(false);
      setError(await res.text());
      return;
    }

    // Sign them straight in — making someone type the password they just chose is
    // friction for nothing.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    });
    setBusy(false);

    if (signInError) {
      router.push("/login");
      return;
    }
    router.push("/");
  }

  const inputClass = "w-full border border-border rounded px-3 py-2";
  const labelClass = "block text-xs text-ink/50 mb-1";

  return (
    <div className="min-h-screen bg-paper py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="font-display text-2xl font-semibold tracking-wide text-center mb-1">
          {brand.appName.toUpperCase()}
        </div>
        <p className="text-center text-sm text-ink/50 mb-6">
          Jobs, crew, estimates and invoicing for contractors.
        </p>

        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="font-display uppercase text-sm tracking-wide text-ink/60 mb-1">
            Start your free trial
          </h1>
          <p className="text-xs text-ink/40 mb-5">
            Two months free. No card needed, and nothing is charged when the trial ends —
            you decide then whether to carry on.
          </p>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className={labelClass}>Company name</label>
              <input required value={form.companyName} onChange={(e) => set({ companyName: e.target.value })}
                className={inputClass} placeholder="Your Contracting Ltd." />
            </div>
            <div>
              <label className={labelClass}>Your name</label>
              <input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input required type="email" value={form.email} onChange={(e) => set({ email: e.target.value })}
                className={inputClass} autoComplete="username" />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input required type="password" value={form.password} onChange={(e) => set({ password: e.target.value })}
                className={inputClass} autoComplete="new-password" />
            </div>
            <div>
              <label className={labelClass}>Confirm password</label>
              <input required type="password" value={form.confirm} onChange={(e) => set({ confirm: e.target.value })}
                className={inputClass} autoComplete="new-password" />
            </div>
            <div>
              <label className={labelClass}>After the trial</label>
              <select value={form.billingPeriod} onChange={(e) => set({ billingPeriod: e.target.value })}
                className={inputClass}>
                <option value="monthly">Bill monthly</option>
                <option value="annual">Bill yearly</option>
              </select>
              <p className="text-xs text-ink/40 mt-1">
                Nothing is charged during the trial, and you can change this later.
              </p>
            </div>

            <div>
              <label className={labelClass}>Promo code (optional)</label>
              <input value={form.promoCode} onChange={(e) => set({ promoCode: e.target.value })}
                className={inputClass + " font-mono uppercase"} />
            </div>

            {error && <p className="text-sm text-accent-dark">{error}</p>}

            <button type="submit" disabled={busy}
              className="w-full bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide py-2.5 rounded disabled:opacity-50">
              {busy ? "Setting things up..." : "Create account"}
            </button>
          </form>

          <p className="text-xs text-ink/40 mt-4 text-center">
            Your company&apos;s data is yours alone — no other company on this app can see any
            part of it.
          </p>
        </div>

        <p className="text-center text-sm text-ink/50 mt-4">
          Already set up? <Link href="/login" className="text-steel hover:text-steel-dark">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
