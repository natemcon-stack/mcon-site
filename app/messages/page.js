"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

function MessagesPage() {
  const { profile, isAdmin } = useProfile();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("team_messages").select("*").order("created_at").limit(200);
    setMessages(data || []);
  }, []);

  useEffect(() => {
    load();
    // Live updates — a new message from anyone else shows up without a manual refresh.
    const channel = supabase
      .channel("team_messages_feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_messages" }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    await supabase.from("team_messages").insert([{
      author_id: profile?.id, author_name: profile?.full_name || "Unknown", message: text.trim(),
    }]);
    setText("");
    setSending(false);
  }

  async function remove(id) {
    if (!confirm("Delete this message for everyone?")) return;
    await supabase.from("team_messages").delete().eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col" style={{ minHeight: "calc(100vh - 80px)" }}>
        <h1 className="font-display text-2xl font-semibold tracking-wide mb-1">Team Chat</h1>
        <p className="text-sm text-ink/60 mb-4">Shared with the whole crew — everyone sees every message.</p>

        <div className="flex-1 bg-surface border border-border rounded-lg p-4 mb-4 overflow-y-auto space-y-3" style={{ maxHeight: "60vh" }}>
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.author_id === profile?.id ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 ${m.author_id === profile?.id ? "bg-accent text-white" : "bg-paper text-ink"}`}>
                {m.author_id !== profile?.id && <div className="text-xs opacity-60 mb-0.5">{m.author_name}</div>}
                <div className="text-sm whitespace-pre-wrap">{m.message}</div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[10px] opacity-50">{new Date(m.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  {isAdmin && (
                    <button onClick={() => remove(m.id)} className="text-[10px] opacity-50 hover:opacity-100">Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {messages.length === 0 && <p className="text-center text-ink/40 text-sm py-8">No messages yet — say hi.</p>}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the crew..."
            className="flex-1 border border-border rounded px-3 py-2" />
          <button disabled={sending} className="bg-accent hover:bg-accent-dark text-white rounded px-4 py-2 font-display uppercase text-sm disabled:opacity-50">
            Send
          </button>
        </form>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><MessagesPage /></AuthGate>;
}
