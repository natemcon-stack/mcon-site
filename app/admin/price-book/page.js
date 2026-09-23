"use client";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

const CATEGORIES = ["materials", "labor", "equipment", "subcontractor", "other"];

function PriceBookPage() {
  const { isAdmin, isManagement, loading } = useProfile();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", category: "materials", unit: "each", unit_cost: "", markup_pct: "20", rona_search_term: "" });
  const [q, setQ] = useState("");

  async function load() {
    const { data } = await supabase.from("price_book").select("*").order("name");
    setItems(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.name || !form.unit_cost) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("price_book").insert([{
      ...form, unit_cost: Number(form.unit_cost), markup_pct: Number(form.markup_pct), updated_by: user?.id,
    }]);
    setForm({ name: "", category: "materials", unit: "each", unit_cost: "", markup_pct: "20", rona_search_term: "" });
    load();
  }

  async function updateCost(item, newCost) {
    await supabase.from("price_book").update({ unit_cost: Number(newCost), updated_at: new Date().toISOString() }).eq("id", item.id);
    load();
  }

  async function deleteItem(id) {
    if (!confirm("Delete this price book item?")) return;
    await supabase.from("price_book").delete().eq("id", id);
    load();
  }

  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

  if (loading) return null;
  if (!isManagement) {
    return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;
  }

  return (
    <>
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-2">Price Book</h1>
        <p className="text-sm text-ink/60 mb-5">
          Standard items and costs used when building estimates and invoices, so pricing stays
          consistent across estimators. Update unit costs here as prices change — each row
          shows when it was last updated and a shortcut to check the current price at Rona, Home Depot, Timber Mart, or Windsor Plywood.
        </p>

        {isAdmin && (
        <form onSubmit={add} className="bg-surface border border-border rounded-lg p-4 grid sm:grid-cols-6 gap-2 mb-5">
          <input placeholder="Item name" className="border border-border rounded px-2 py-1.5 text-sm sm:col-span-2"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="border border-border rounded px-2 py-1.5 text-sm" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Unit (sqft, each...)" className="border border-border rounded px-2 py-1.5 text-sm"
            value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <input type="number" step="0.01" placeholder="Unit cost $" className="border border-border rounded px-2 py-1.5 text-sm"
            value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
          <input type="number" step="1" placeholder="Markup %" className="border border-border rounded px-2 py-1.5 text-sm"
            value={form.markup_pct} onChange={(e) => setForm({ ...form, markup_pct: e.target.value })} />
          <input placeholder="Product search term (optional)" className="border border-border rounded px-2 py-1.5 text-sm sm:col-span-3"
            value={form.rona_search_term} onChange={(e) => setForm({ ...form, rona_search_term: e.target.value })} />
          <button className="bg-accent hover:bg-accent-dark text-white rounded px-3 py-1.5 font-display uppercase text-sm sm:col-span-3">
            Add item
          </button>
        </form>
        )}

        <input placeholder="Search price book..." value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 mb-3" />

        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {filtered.map((item) => (
            <div key={item.id} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 text-sm">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-ink/40">
                  {item.category} · per {item.unit} · updated {new Date(item.updated_at).toLocaleDateString()}
                </div>
              </div>
              {isAdmin ? (
                <input
                  type="number" step="0.01" defaultValue={item.unit_cost}
                  onBlur={(e) => e.target.value !== String(item.unit_cost) && updateCost(item, e.target.value)}
                  className="w-24 border border-border rounded px-2 py-1 font-mono text-right"
                />
              ) : (
                <span className="w-24 font-mono text-right">${Number(item.unit_cost).toFixed(2)}</span>
              )}
              <span className="text-ink/50 font-mono text-xs w-14 text-right">+{item.markup_pct}%</span>
              {item.rona_search_term ? (
                <div className="flex flex-wrap gap-1">
                  <a
                    href={`https://www.rona.ca/en/search?q=${encodeURIComponent(item.rona_search_term)}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-1 whitespace-nowrap"
                  >
                    Rona →
                  </a>
                  <a
                    href={`https://www.homedepot.ca/en/home/search.html?q=${encodeURIComponent(item.rona_search_term)}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-1 whitespace-nowrap"
                  >
                    Home Depot →
                  </a>
                  <a
                    href={`https://www.timbermart.ca/?s=${encodeURIComponent(item.rona_search_term)}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-1 whitespace-nowrap"
                  >
                    Timber Mart →
                  </a>
                  <a
                    href={`https://www.windsorplywood.com/?s=${encodeURIComponent(item.rona_search_term)}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs font-display uppercase tracking-wide text-steel hover:text-steel-dark border border-steel/40 rounded px-2 py-1 whitespace-nowrap"
                  >
                    Windsor Plywood →
                  </a>
                </div>
              ) : <span />}
              {isAdmin
                ? <button onClick={() => deleteItem(item.id)} className="text-ink/30 hover:text-accent-dark text-xs">✕</button>
                : <span className="w-3" />}
            </div>
          ))}
          {filtered.length === 0 && <div className="px-4 py-8 text-center text-ink/40 text-sm">No items yet.</div>}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><PriceBookPage /></AuthGate>;
}
