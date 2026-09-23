"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

function TeamPage() {
  const { isAdmin, loading } = useProfile();
  const [people, setPeople] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" });
  const [applying, setApplying] = useState(false);

  async function load() {
    const { data: p } = await supabase.from("profiles").select("*").order("full_name");
    setPeople(p || []);
    const { data: h } = await supabase.from("stat_holidays").select("*").order("date");
    setHolidays(h || []);
  }
  useEffect(() => { load(); }, []);

  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", role: "employee" });
  const [inviting, setInviting] = useState(false);

  // Shown after an invite or a password-link request. Held here because email delivery
  // is the unreliable part — the link itself is what actually gets someone in.
  const [passwordLink, setPasswordLink] = useState(null);

  async function sendInvite(e) {
    e.preventDefault();
    if (!inviteForm.email) return;
    setInviting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        email: inviteForm.email,
        fullName: inviteForm.fullName,
        role: inviteForm.role,
        password: inviteForm.password || undefined,
      }),
    });
    setInviting(false);
    if (res.ok) {
      const data = await res.json();
      if (data.created) {
        // Created with a password — show the credentials rather than a link.
        setTempPassword({ name: inviteForm.fullName || data.email, email: data.email, password: data.password });
        setInviteForm({ email: "", fullName: "", role: "employee", password: "" });
        load();
        return;
      }
      // Show the link rather than just claiming an email was sent — email delivery is
      // the unreliable step, and this is what actually gets someone in.
      setPasswordLink({
        name: inviteForm.fullName || inviteForm.email,
        email: inviteForm.email,
        link: data.link,
        existing: data.existing,
      });
      setInviteForm({ email: "", fullName: "", role: "employee", password: "" });
      load();
    } else {
      alert("Couldn't invite: " + (await res.text()));
    }
  }

  // The reliable path when email links keep getting consumed by mail security: set the
  // password here and pass it on directly.
  const [tempPassword, setTempPassword] = useState(null);

  async function setPasswordFor(person) {
    // Readable rather than random-looking: this gets read out over the phone or texted,
    // and it's temporary anyway.
    const words = ["cedar", "gravel", "hammer", "shingle", "ladder", "timber", "anchor", "rafter"];
    const suggested = `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;

    const entered = prompt(
      `Set a password for ${person.full_name || "this person"}.\n\n`
      + `They sign in with their email and this password, and can change it later.`,
      suggested
    );
    if (entered === null) return;
    const password = entered.trim();
    if (password.length < 8) {
      alert("Use at least 8 characters.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/team/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId: person.id, password }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const data = await res.json();
    setTempPassword({ name: person.full_name || data.email, email: data.email, password });
  }

  async function sendPasswordLink(person) {
    setPasswordLink(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/team/password-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId: person.id }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const data = await res.json();
    setPasswordLink({ name: person.full_name || data.email, ...data });
  }

  // Goes through the server rather than writing profiles directly, because deactivating
  // has to ban the login at the auth service too — a profile flag alone still lets the
  // person sign in.
  async function setActive(person, active) {
    if (!active && !confirm(`Turn off access for ${person.full_name || "this person"}? They'll be signed out and won't be able to log back in.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/team/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId: person.id, active }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    load();
  }

  async function updatePerson(id, patch) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) alert("Couldn't update: " + error.message);
    load();
  }

  async function removeCompletely(person) {
    if (!confirm(`Permanently remove ${person.full_name || "this person"}? This deletes their login entirely — they will not be able to sign in again, and this can't be undone. If you just want to temporarily cut off access, use Deactivate instead.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/team/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId: person.id }),
    });
    if (res.ok) load();
    else alert("Couldn't remove: " + (await res.text()));
  }

  async function addHoliday(e) {
    e.preventDefault();
    if (!newHoliday.date || !newHoliday.name) return;
    await supabase.from("stat_holidays").insert([newHoliday]);
    setNewHoliday({ date: "", name: "" });
    load();
  }

  async function removeHoliday(id) {
    await supabase.from("stat_holidays").delete().eq("id", id);
    load();
  }

  async function applyNow(date) {
    setApplying(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/stat-holidays/apply?date=${date}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await res.json();
    setApplying(false);
    alert(result.applied ? `Credited ${result.credited} full-time employee(s) for ${result.holiday}.` : "That date isn't in the stat holidays list.");
  }

  if (loading) return null;
  if (!isAdmin) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Team</h1>
        <p className="text-sm text-ink/60 mb-5">
          Mark who's full-time so stat holiday hours get credited to their timesheet
          automatically — 8 hours, flat, for every full-time employee. This isn't a full ESA
          average-day's-pay calculation, so double check newer or unusual pay setups yourself.
          <br /><br />
          <strong>Deactivate</strong> cuts off someone's access instantly and can be reversed —
          use this for someone leaving temporarily or if you're unsure. <strong>Remove</strong>{" "}
          permanently deletes their login entirely and can't be undone — only use it when you're
          certain.
        </p>

        <h2 className="font-display text-lg font-semibold tracking-wide mb-2">Invite Someone New</h2>
        <form onSubmit={sendInvite} className="bg-surface border border-border rounded-lg p-4 grid sm:grid-cols-4 gap-2 mb-6">
          <input type="email" required placeholder="Email" value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            className="border border-border rounded px-2 py-1.5 text-sm" />
          <input placeholder="Name (optional)" value={inviteForm.fullName}
            onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
            className="border border-border rounded px-2 py-1.5 text-sm" />
          <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
            className="border border-border rounded px-2 py-1.5 text-sm">
            <option value="employee">Employee</option>
            <option value="foreman">Foreman</option>
            <option value="admin">Admin</option>
          </select>
          <input placeholder="Password (optional)" value={inviteForm.password || ""}
            onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
            className="border border-border rounded px-2 py-1.5 text-sm" />
          <button disabled={inviting} className="bg-accent hover:bg-accent-dark text-white rounded px-3 py-1.5 font-display uppercase text-sm disabled:opacity-50 sm:col-span-3">
            {inviting ? "Working..." : (inviteForm.password ? "Create account" : "Send email invite")}
          </button>
        </form>
        <p className="text-xs text-ink/40 -mt-5 mb-6">
          Set a password to create the account straight away — nothing gets emailed and they can
          sign in immediately. Leave it blank to send an email invite instead, which some company
          mail systems break by opening the link before the recipient does.
        </p>

        {tempPassword && (
          <div className="bg-surface border border-success/50 rounded-lg p-4 mb-4">
            <div className="text-sm mb-2">
              <strong>{tempPassword.name}</strong> can sign in now — no email needed.
            </div>
            <div className="font-mono text-sm bg-paper rounded p-2 space-y-1">
              <div>Email: {tempPassword.email}</div>
              <div>Password: {tempPassword.password}</div>
            </div>
            <button onClick={() => navigator.clipboard.writeText(`Email: ${tempPassword.email}\nPassword: ${tempPassword.password}`)}
              className="text-xs border border-border rounded px-2 py-1 mt-2">Copy both</button>
            <div className="text-xs text-ink/40 mt-2">
              Send it however you like, then have them change it once they&apos;re in. This is the
              only time it&apos;s shown.
            </div>
            <button onClick={() => setTempPassword(null)} className="text-xs text-ink/40 mt-2 block">Dismiss</button>
          </div>
        )}

        {passwordLink && (
          <div className="bg-surface border border-steel/40 rounded-lg p-4 mb-4">
            <div className="text-sm mb-2">
              {passwordLink.existing
                ? <>That address already had an account, so this is a reset link for <strong>{passwordLink.name}</strong> ({passwordLink.email}).</>
                : <>Set-password link for <strong>{passwordLink.name}</strong> ({passwordLink.email}).</>}
              {" "}It was emailed too — send it directly if the email doesn&apos;t arrive.
            </div>
            {passwordLink.link && (
              <div className="flex gap-2 items-start">
                <code className="text-[11px] bg-paper rounded p-2 break-all flex-1">{passwordLink.link}</code>
                <button onClick={() => { navigator.clipboard.writeText(passwordLink.link); }}
                  className="text-xs border border-border rounded px-2 py-1 shrink-0">Copy</button>
              </div>
            )}
            <div className="text-xs text-ink/40 mt-2">
              Treat it like a password — anyone with it can set this account&apos;s login. It expires on its own.
            </div>
            <button onClick={() => setPasswordLink(null)} className="text-xs text-ink/40 mt-2">Dismiss</button>
          </div>
        )}

        <h2 className="font-display text-lg font-semibold tracking-wide mb-2">Team</h2>
        <div className="bg-surface border border-border rounded-lg divide-y divide-border mb-6">
          {people.map((p) => (
            <div key={p.id} className={`px-4 py-3 flex items-center justify-between gap-2 flex-wrap ${p.is_active === false ? "opacity-50" : ""}`}>
              <div>
                <input defaultValue={p.full_name || ""} placeholder="(no name set — often shows their email)"
                  onBlur={(e) => { if (e.target.value !== p.full_name) updatePerson(p.id, { full_name: e.target.value }); }}
                  className="font-medium bg-transparent border-b border-transparent hover:border-border focus:border-steel outline-none" />
                {p.is_active === false && <span className="ml-2 text-[10px] font-display uppercase text-accent-dark border border-accent-dark/40 rounded px-1.5 py-0.5">Deactivated</span>}
                <div className="text-xs text-ink/40 uppercase">{p.role}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => setPasswordFor(p)}
                  className="text-xs border border-border rounded px-2 py-1.5 hover:text-steel">
                  Set password
                </button>
                <button type="button" onClick={() => sendPasswordLink(p)}
                  className="text-xs border border-border rounded px-2 py-1.5 hover:text-steel">
                  Email link
                </button>
                <select value={p.role || "employee"}
                  onChange={(e) => updatePerson(p.id, { role: e.target.value })}
                  className="border border-border rounded px-2 py-1.5 text-sm">
                  <option value="employee">Employee</option>
                  <option value="foreman">Foreman</option>
                  <option value="admin">Admin</option>
                </select>
                <select value={p.employment_type || "part_time"}
                  onChange={(e) => updatePerson(p.id, { employment_type: e.target.value })}
                  className="border border-border rounded px-2 py-1.5 text-sm">
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                </select>
                <button onClick={() => setActive(p, p.is_active === false)}
                  className={`text-xs font-display uppercase tracking-wide border rounded px-2 py-1.5 ${p.is_active === false ? "text-success border-success/40" : "text-warn border-warn/40"}`}>
                  {p.is_active === false ? "Reactivate" : "Deactivate"}
                </button>
                <button onClick={() => removeCompletely(p)}
                  className="text-xs font-display uppercase tracking-wide text-accent-dark border border-accent-dark/40 rounded px-2 py-1.5">
                  Remove
                </button>
              </div>
            </div>
          ))}
          {people.length === 0 && <div className="px-4 py-6 text-center text-ink/40 text-sm">No team members yet.</div>}
        </div>

        <h2 className="font-display text-lg font-semibold tracking-wide mb-2">BC Statutory Holidays</h2>
        <form onSubmit={addHoliday} className="bg-surface border border-border rounded-lg p-4 flex gap-2 mb-3">
          <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
            className="border border-border rounded px-2 py-1.5 text-sm" />
          <input placeholder="Holiday name" value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
            className="border border-border rounded px-2 py-1.5 text-sm flex-1" />
          <button className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3">Add</button>
        </form>

        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {holidays.map((h) => (
            <div key={h.id} className="px-4 py-2 flex items-center justify-between text-sm">
              <span>{h.date} — {h.name}</span>
              <span className="flex items-center gap-2">
                <button onClick={() => applyNow(h.date)} disabled={applying}
                  className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-2 py-0.5 disabled:opacity-50">
                  Apply now
                </button>
                <button onClick={() => removeHoliday(h.id)} className="text-ink/30 hover:text-accent-dark text-xs">✕</button>
              </span>
            </div>
          ))}
          {holidays.length === 0 && <div className="px-4 py-6 text-center text-ink/40 text-sm">No holidays listed yet.</div>}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><TeamPage /></AuthGate>;
}
