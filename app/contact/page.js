"use client";
import { useState } from "react";
import { QUOTE_FEES, PHONE, PHONE_HREF, EMAIL } from "@/lib/services";

export default function Page() {
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", message: "", honey: "",
  });
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setState("sending");
    setError("");

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setState("error");
      setError(await res.text());
      return;
    }
    setState("sent");
  }

  const field =
    "w-full border border-rule bg-paper px-3 py-2.5 text-base focus:border-red";
  const label = "mb-1.5 block text-sm text-cedar";

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="font-display text-4xl font-700 sm:text-5xl">Get in touch</h1>

      <div className="mt-8 grid gap-14 sm:grid-cols-[1fr_20rem]">
        <div>
          {state === "sent" ? (
            <div className="border border-rule bg-concrete p-6">
              <p className="font-display text-xl font-600">Thanks — that&apos;s come through.</p>
              <p className="mt-2 text-base leading-relaxed">
                We&apos;ll get back to you shortly. If it&apos;s urgent, call{" "}
                <a href={PHONE_HREF} className="text-red underline">{PHONE}</a>.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="max-w-md">
              <div className="mb-4">
                <label className={label} htmlFor="name">Your name</label>
                <input id="name" required value={form.name}
                  onChange={(e) => set({ name: e.target.value })} className={field} />
              </div>

              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="phone">Phone</label>
                  <input id="phone" type="tel" value={form.phone}
                    onChange={(e) => set({ phone: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="email">Email</label>
                  <input id="email" type="email" value={form.email}
                    onChange={(e) => set({ email: e.target.value })} className={field} />
                </div>
              </div>

              <div className="mb-4">
                <label className={label} htmlFor="address">Where&apos;s the property?</label>
                <input id="address" value={form.address}
                  onChange={(e) => set({ address: e.target.value })} className={field} />
              </div>

              <div className="mb-4">
                <label className={label} htmlFor="message">What do you need?</label>
                <textarea id="message" required rows={6} value={form.message}
                  onChange={(e) => set({ message: e.target.value })} className={field} />
              </div>

              {/* Hidden from people, visible to bots. */}
              <input
                type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
                value={form.honey} onChange={(e) => set({ honey: e.target.value })}
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />

              {error && <p className="mb-4 text-base text-red">{error}</p>}

              <button type="submit" disabled={state === "sending"}
                className="bg-red px-6 py-3 font-display text-lg font-600 text-paper hover:bg-red-dark disabled:opacity-60">
                {state === "sending" ? "Sending…" : "Send enquiry"}
              </button>
            </form>
          )}
        </div>

        <div>
          <p className="font-display text-2xl font-700">
            <a href={PHONE_HREF} className="text-red hover:text-red-dark">{PHONE}</a>
          </p>
          <p className="mt-2">
            <a href={`mailto:${EMAIL}`} className="hover:text-red">{EMAIL}</a>
          </p>

          <p className="mt-6 max-w-prose text-base leading-relaxed">
            Powell River, BC. We serve the qathet region, Texada Island and the
            surrounding islands, with remote and rollout work throughout British Columbia.
          </p>

          <h2 className="mt-10 font-display text-sm font-600 text-cedar">
            Out-of-town quote fees
          </h2>
          <dl className="mt-3">
            {QUOTE_FEES.map((q) => (
              <div key={q.label} className="rule-item flex items-baseline justify-between gap-6 py-2.5">
                <dt className="text-base">{q.label}</dt>
                <dd className="figures font-display font-600">{q.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
