"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { TAX_CATEGORIES } from "@/app/jobs/[id]/page";

// Every filed expense in one table — to find duplicates that slipped through, and to
// correct anything filed under the wrong category.
//
// The one-receipt-at-a-time review screen is right for deciding on a new receipt, but
// wrong for the two jobs this page exists for. Spotting that the same Rona invoice went
// in twice means seeing them next to each other; re-categorising a quarter's fuel means
// changing twenty rows without twenty page loads.

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Two expenses that look like the same purchase entered twice.
//
// Deliberately loose: this flags for a human rather than deciding. A contractor buying
// the same $40 of screws twice in a week is normal, so nothing is ever auto-removed —
// but the same vendor and the exact same amount within a few days is worth a look.
function findDuplicates(expenses) {
  const flagged = new Map();
  const key = (e) => `${(e.description || "").trim().toLowerCase()}|${Number(e.amount).toFixed(2)}`;

  const byKey = {};
  for (const e of expenses) {
    (byKey[key(e)] = byKey[key(e)] || []).push(e);
  }

  for (const group of Object.values(byKey)) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.abs(
        (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / 86400000
      );
      if (days <= 7) {
        flagged.set(sorted[i].id, `Same description and amount as ${sorted[i - 1].date}`);
        flagged.set(sorted[i - 1].id, `Same description and amount as ${sorted[i].date}`);
      }
    }
  }
  return flagged;
}

function ExpenseSheet() {
  const { isManagement, loading } = useProfile();
  const [expenses, setExpenses] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [onlyUncategorised, setOnlyUncategorised] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  // Rows ticked for a bulk change. The reason this page exists is fixing many at once.
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const [{ data: rows }, { data: jobRows }] = await Promise.all([
      supabase
        .from("job_expenses")
        .select("id, date, description, amount, gst_amount, pst_amount, tax_category, category, job_id, original_currency, original_amount, fx_rate, receipt_path, jobs(title)")
        .order("date", { ascending: false })
        .limit(2000),
      supabase.from("jobs").select("id, title").order("created_at", { ascending: false }),
    ]);
    setExpenses(rows || []);
    setJobs(jobRows || []);
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const duplicates = useMemo(() => findDuplicates(expenses), [expenses]);

  const rows = useMemo(() => {
    let list = expenses;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) =>
        (e.description || "").toLowerCase().includes(q) ||
        (e.jobs?.title || "").toLowerCase().includes(q) ||
        String(e.amount).includes(q)
      );
    }
    if (categoryFilter) list = list.filter((e) => (e.tax_category || "") === categoryFilter);
    if (onlyDuplicates) list = list.filter((e) => duplicates.has(e.id));
    if (onlyUncategorised) list = list.filter((e) => !e.tax_category);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === "amount") return (Number(a.amount) - Number(b.amount)) * dir;
      if (sortBy === "vendor") return (a.description || "").localeCompare(b.description || "") * dir;
      if (sortBy === "category") return (a.tax_category || "").localeCompare(b.tax_category || "") * dir;
      return (a.date || "").localeCompare(b.date || "") * dir;
    });
  }, [expenses, search, categoryFilter, onlyDuplicates, onlyUncategorised, duplicates, sortBy, sortDir]);

  const totals = useMemo(() => ({
    count: rows.length,
    amount: rows.reduce((s, e) => s + Number(e.amount || 0), 0),
    gst: rows.reduce((s, e) => s + Number(e.gst_amount || 0), 0),
  }), [rows]);

  function toggleSort(column) {
    if (sortBy === column) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(column); setSortDir("desc"); }
  }

  async function updateOne(id, patch) {
    const { error } = await supabase.from("job_expenses").update(patch).eq("id", id);
    if (error) { alert(`Couldn't save that: ${error.message}`); return; }
    setExpenses((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function applyToSelected(patch) {
    if (!selected.size) return;
    setSaving(true);
    const ids = [...selected];
    const { error } = await supabase.from("job_expenses").update(patch).in("id", ids);
    setSaving(false);
    if (error) { alert(`Couldn't save those: ${error.message}`); return; }
    setExpenses((list) => list.map((e) => (selected.has(e.id) ? { ...e, ...patch } : e)));
    setSelected(new Set());
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} expense${selected.size === 1 ? "" : "s"}? This can't be undone, and it changes your tax figures.`)) return;
    setSaving(true);
    const { error } = await supabase.from("job_expenses").delete().in("id", [...selected]);
    setSaving(false);
    if (error) { alert(`Couldn't delete those: ${error.message}`); return; }
    setExpenses((list) => list.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
  }

  function downloadCsv() {
    const header = ["Date", "Vendor / description", "Job", "Category", "Amount", "GST", "PST", "Currency", "Original", "FX rate", "Possible duplicate"];
    const body = rows.map((e) => [
      e.date, e.description || "", e.jobs?.title || "", e.tax_category || "",
      e.amount, e.gst_amount ?? "", e.pst_amount ?? "",
      e.original_currency || "", e.original_amount ?? "", e.fx_rate ?? "",
      duplicates.get(e.id) || "",
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => {
        const s = String(c ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return null;
  if (!isManagement) {
    return (
      <>
        <Nav />
        <main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main>
      </>
    );
  }

  const th = "text-left text-[10px] font-display uppercase tracking-wide text-ink/40 px-2 py-1.5 cursor-pointer select-none";
  const td = "px-2 py-1.5 align-top";

  return (
    <>
      <Nav />
      <main className="max-w-full mx-auto px-3 py-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">All expenses</h1>
        <p className="text-sm text-ink/60 mb-4">
          Every filed receipt in one place — to catch anything entered twice and to fix
          categories in bulk.
        </p>

        <div className="bg-surface border border-border rounded-lg p-3 mb-3">
          <div className="flex gap-2 flex-wrap items-center">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, job or amount"
              className="flex-1 min-w-[12rem] border border-border rounded px-2 py-1.5 text-sm" />

            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-border rounded px-2 py-1.5 text-sm">
              <option value="">All categories</option>
              {TAX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={onlyDuplicates}
                onChange={(e) => setOnlyDuplicates(e.target.checked)} />
              Possible duplicates
              {duplicates.size > 0 && (
                <span className="text-xs text-warn">({duplicates.size})</span>
              )}
            </label>

            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={onlyUncategorised}
                onChange={(e) => setOnlyUncategorised(e.target.checked)} />
              Uncategorised
            </label>

            <button onClick={downloadCsv}
              className="text-xs font-display uppercase tracking-wide border border-border rounded px-3 py-1.5">
              Export CSV
            </button>
          </div>

          <div className="text-xs text-ink/50 mt-2 font-mono">
            {totals.count} rows · {money(totals.amount)} · GST {money(totals.gst)}
          </div>
        </div>

        {/* Bulk actions appear only when something is ticked, so they're not clutter the
            rest of the time. */}
        {selected.size > 0 && (
          <div className="bg-ink text-white rounded-lg p-3 mb-3 flex gap-2 items-center flex-wrap sticky top-14 z-10">
            <span className="text-sm">{selected.size} selected</span>
            <select defaultValue="" disabled={saving}
              onChange={(e) => { if (e.target.value) { applyToSelected({ tax_category: e.target.value }); e.target.value = ""; } }}
              className="border border-white/30 bg-ink rounded px-2 py-1.5 text-sm">
              <option value="">Set category…</option>
              {TAX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select defaultValue="" disabled={saving}
              onChange={(e) => { if (e.target.value) { applyToSelected({ job_id: e.target.value === "none" ? null : e.target.value }); e.target.value = ""; } }}
              className="border border-white/30 bg-ink rounded px-2 py-1.5 text-sm">
              <option value="">Move to job…</option>
              <option value="none">No job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <button onClick={deleteSelected} disabled={saving}
              className="text-xs font-display uppercase tracking-wide border border-white/30 rounded px-3 py-1.5">
              Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-white/60 ml-auto">
              Clear
            </button>
          </div>
        )}

        {busy ? (
          <p className="text-sm text-ink/40">Loading...</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-2 py-1.5 w-8">
                    <input type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                  </th>
                  <th className={th} onClick={() => toggleSort("date")}>Date</th>
                  <th className={th} onClick={() => toggleSort("vendor")}>Vendor / description</th>
                  <th className={th}>Job</th>
                  <th className={th} onClick={() => toggleSort("category")}>Category</th>
                  <th className={th + " text-right"} onClick={() => toggleSort("amount")}>Amount</th>
                  <th className={th + " text-right"}>GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => {
                  const dup = duplicates.get(e.id);
                  return (
                    <tr key={e.id} className={dup ? "bg-warn/5" : ""}>
                      <td className={td}>
                        <input type="checkbox" checked={selected.has(e.id)}
                          onChange={(ev) => {
                            const next = new Set(selected);
                            ev.target.checked ? next.add(e.id) : next.delete(e.id);
                            setSelected(next);
                          }} />
                      </td>
                      <td className={td + " whitespace-nowrap font-mono text-xs"}>{e.date}</td>
                      <td className={td}>
                        <span className="block">{e.description || <span className="text-ink/30">—</span>}</span>
                        {dup && <span className="block text-[11px] text-warn">⚠ {dup}</span>}
                        {e.original_currency && e.original_currency !== "CAD" && (
                          <span className="block text-[11px] text-ink/40 font-mono">
                            {e.original_currency} {e.original_amount} @ {e.fx_rate}
                          </span>
                        )}
                      </td>
                      <td className={td}>
                        {e.job_id ? (
                          <Link href={`/jobs/${e.job_id}`} className="text-steel hover:text-steel-dark text-xs">
                            {e.jobs?.title || "job"}
                          </Link>
                        ) : <span className="text-ink/30 text-xs">—</span>}
                      </td>
                      <td className={td}>
                        {/* Edited in place. Correcting a category shouldn't cost a page load. */}
                        <select value={e.tax_category || ""}
                          onChange={(ev) => updateOne(e.id, { tax_category: ev.target.value || null })}
                          className={`border rounded px-1.5 py-1 text-xs w-full ${e.tax_category ? "border-border" : "border-warn/50 bg-warn/5"}`}>
                          <option value="">— none —</option>
                          {TAX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className={td + " text-right font-mono whitespace-nowrap"}>{money(e.amount)}</td>
                      <td className={td + " text-right font-mono whitespace-nowrap text-ink/50"}>
                        {e.gst_amount == null
                          ? <span className="text-warn" title="No GST recorded — the credit will be understated">—</span>
                          : money(e.gst_amount)}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-ink/40 text-sm">
                    Nothing matches those filters.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><ExpenseSheet /></AuthGate>;
}
