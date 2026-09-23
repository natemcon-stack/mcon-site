"use client";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

function pad(n) { return String(n).padStart(2, "0"); }
function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

// Two pay periods per month:
//   26th (of the prior month) through the 10th — paid on the 15th
//   11th through the 25th — paid on the 1st (of the following month)
// Builds a list of periods (most recent first) for the dropdown, rather than
// having anyone hand-adjust individual start/end dates.
function buildPeriodList(count = 16) {
  const periods = [];
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-indexed, the month whose "phase" we're about to compute
  let phase; // 0 = 26th(prev month)-10th(month), paid 15th(month); 1 = 11th-25th(month), paid 1st(month+1)
  const day = today.getDate();
  if (day <= 10) {
    phase = 0;
  } else if (day <= 25) {
    phase = 1;
  } else {
    phase = 0;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }

  for (let i = 0; i < count; i++) {
    if (phase === 0) {
      const prevMonthDate = new Date(year, month - 1, 1);
      const start = toISODate(new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 26));
      const end = toISODate(new Date(year, month, 10));
      const paidOn = toISODate(new Date(year, month, 15));
      periods.push({ start, end, paidOn, key: `${start}_${end}` });
      // Previous period: 11th–25th of last month.
      phase = 1;
      month -= 1;
      if (month < 0) { month = 11; year -= 1; }
    } else {
      const start = toISODate(new Date(year, month, 11));
      const end = toISODate(new Date(year, month, 25));
      const paidOn = toISODate(new Date(year, month + 1, 1));
      periods.push({ start, end, paidOn, key: `${start}_${end}` });
      // Previous period: 26th(month-1)–10th(month) — same month index.
      phase = 0;
    }
  }
  return periods;
}

function PayrollPage() {
  const { isAdmin, loading } = useProfile();
  const periods = useMemo(() => buildPeriodList(), []);
  const [selectedKey, setSelectedKey] = useState(periods[0]?.key);
  const range = periods.find((p) => p.key === selectedKey) || periods[0];
  const [hours, setHours] = useState([]);
  const [sending, setSending] = useState(false);

  async function load() {
    if (!range) return;
    const { data } = await supabase
      .from("job_hours")
      .select("*, jobs(title, job_number)")
      .gte("date", range.start)
      .lte("date", range.end)
      .order("worker_name")
      .order("date");
    setHours(data || []);
  }
  useEffect(() => { load(); }, [selectedKey]);

  const byWorker = hours.reduce((acc, h) => {
    (acc[h.worker_name] = acc[h.worker_name] || []).push(h);
    return acc;
  }, {});
  const totalHours = hours.reduce((s, h) => s + Number(h.hours), 0);

  // Where it's actually going, shown before you commit — "sent to your bookkeeper" is
  // only reassuring if it names the address.
  const [accountantEmail, setAccountantEmail] = useState(null);
  useEffect(() => {
    supabase.from("company_settings").select("accountant_email").maybeSingle()
      .then(({ data }) => setAccountantEmail(data?.accountant_email || null));
  }, []);

  async function sendToAccountant() {
    if (!accountantEmail) {
      alert("No bookkeeper email is set yet. Add one under Admin > Company, then send this.");
      return;
    }
    if (!confirm(`Send ${totalHours} total hours (${Object.keys(byWorker).length} employees) for ${range.start} → ${range.end}?\n\nGoing to: ${accountantEmail}`)) return;
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/payroll/send-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ start: range.start, end: range.end }),
    });
    setSending(false);
    if (res.ok) alert(`Payroll hours report sent to ${accountantEmail}.`);
    else alert("Failed: " + (await res.text()));
  }

  if (loading) return null;
  if (!isAdmin) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Payroll Review</h1>
        <p className="text-sm text-ink/60 mb-5">
          Review hours before sending — nothing goes to the accountant automatically.
          Employees still get a push reminder on the 11th/26th to log their hours; sending
          the report itself is always this manual step.
        </p>

        <div className="bg-surface border border-border rounded-lg p-4 mb-5">
          <label className="block text-xs text-ink/60 mb-1">Pay period</label>
          <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full border border-border rounded px-3 py-2">
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {shortDate(p.start)} – {shortDate(p.end)} (paid {shortDate(p.paidOn)})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-surface border border-border rounded-lg divide-y divide-border mb-4">
          <div className="px-4 py-2 flex justify-between text-sm font-display uppercase tracking-wide text-ink/50">
            <span>{Object.keys(byWorker).length} employee(s)</span>
            <span>Total: {totalHours} hrs</span>
          </div>
          {Object.entries(byWorker).map(([name, entries]) => (
            <div key={name} className="px-4 py-3">
              <div className="flex justify-between font-medium text-sm mb-1">
                <span>{name}</span>
                <span className="font-mono">{entries.reduce((s, e) => s + Number(e.hours), 0)} hrs</span>
              </div>
              {entries.map((e) => (
                <div key={e.id} className="flex justify-between text-xs text-ink/50 py-0.5">
                  <span>{e.date} — {e.jobs?.title}</span>
                  <span className="font-mono">{e.hours} hrs</span>
                </div>
              ))}
            </div>
          ))}
          {hours.length === 0 && <div className="px-4 py-8 text-center text-ink/40 text-sm">No hours logged in this period.</div>}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border p-3">
          <div className="max-w-2xl mx-auto flex justify-end">
            <button onClick={sendToAccountant} disabled={sending || hours.length === 0}
              className="bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide px-5 py-2.5 rounded disabled:opacity-50">
              {sending ? "Sending..." : "Send to accountant"}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><PayrollPage /></AuthGate>;
}
