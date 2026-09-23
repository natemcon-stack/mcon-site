"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

function ContactsList() {
  const { isAdmin } = useProfile();
  const [contacts, setContacts] = useState([]);
  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());

  async function load() {
    const { data } = await supabase.from("contacts").select("*").order("name");
    setContacts(data || []);
  }
  useEffect(() => { load(); }, []);

  const sources = [...new Set(contacts.map((c) => c.source).filter(Boolean))];

  const filtered = contacts
    .filter((c) =>
      (c.name || "").toLowerCase().includes(q.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(q.toLowerCase())
    )
    .filter((c) => sourceFilter === "all" || c.source === sourceFilter);

  function toggleSelect(id, e) {
    e.preventDefault();
    e.stopPropagation();
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} contact(s)? Any jobs linked to them will stay — they'll just show "No contact linked" instead of being deleted. This can't be undone.`)) return;
    const { error } = await supabase.from("contacts").delete().in("id", Array.from(selected));
    if (error) alert(error.message);
    else { setSelected(new Set()); load(); }
  }

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-2xl font-semibold tracking-wide">Contacts</h1>
          <Link href="/contacts/new"
            className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded">
            + New Contact
          </Link>
        </div>

        <input placeholder="Search contacts..." value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 mb-3" />

        {isAdmin && sources.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
              className="border border-border rounded px-3 py-2 text-sm">
              <option value="all">All sources</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {sourceFilter !== "all" && (
              <button onClick={selectAllFiltered} className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3 py-2">
                Select all {filtered.length} shown
              </button>
            )}
          </div>
        )}

        {isAdmin && selected.size > 0 && (
          <div className="flex items-center justify-between bg-accent/10 border border-accent/30 rounded-lg px-4 py-2 mb-3">
            <span className="text-sm">{selected.size} selected</span>
            <button onClick={deleteSelected}
              className="text-xs font-display uppercase tracking-wide text-accent-dark border border-accent-dark/40 rounded px-3 py-1">
              Delete selected
            </button>
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-2">
              {isAdmin && (
                <input type="checkbox" checked={selected.has(c.id)}
                  onClick={(e) => toggleSelect(c.id, e)} onChange={() => {}} />
              )}
              <Link href={`/contacts/${c.id}`} className="flex-1 px-2 py-3 flex justify-between items-center hover:bg-paper">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-ink/50">{c.email} {c.phone && `· ${c.phone}`}</div>
                </div>
                {c.source && (
                  <span className="text-xs font-mono text-ink/40 uppercase">{c.source}</span>
                )}
              </Link>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-ink/40 text-sm">No contacts found.</div>
          )}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <ContactsList />
    </AuthGate>
  );
}
