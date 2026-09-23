"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Nav from "@/components/Nav";
import { useProfile } from "@/lib/useProfile";
import { supabase } from "@/lib/supabase/client";

const CATEGORY_LABELS = {
  bollard_removal: "Bollard removal",
  bollard_painting: "Bollard painting",
  rollout: "Roll-out work",
  deck_build: "Deck build",
  insurance_rebuild: "Insurance rebuild",
  other: "Other",
};

// No open API for these — saved searches you check periodically instead.
const SAVED_SEARCHES = [
  { label: "BC Bid — bollard", url: "https://www.bcbid.gov.bc.ca/page.aspx/en/rfp/search?text=bollard" },
  { label: "BC Bid — rollout / multi-site", url: "https://www.bcbid.gov.bc.ca/page.aspx/en/rfp/search?text=rollout" },
  { label: "MERX — bollard", url: "https://www.merx.com/search?keywords=bollard" },
  { label: "Biddingo — bollard", url: "https://www.biddingo.com/search?q=bollard" },
];


// Builds a Google Calendar "add event" link with the quote visit prefilled.
//
// The CRM already publishes an .ics feed of jobs, but Google refreshes a subscribed
// calendar on its own schedule — often hours later. For an appointment booked while the
// client is still on the phone, that's too slow, so this puts it in the calendar now.
function googleCalendarUrl({ title, startISO, minutes = 60, details, location }) {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + minutes * 60000);
  // Google wants UTC in a compact form: 20260920T160000Z
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
  });
  if (details) params.set("details", details);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function LeadsPage() {
  const router = useRouter();
  const { isManagement, loading } = useProfile();
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState("new");
  const [scanning, setScanning] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [newVendor, setNewVendor] = useState({ company_name: "", website: "" });

  async function load() {
    let query = supabase.from("leads").select("*").order("found_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setLeads(data || []);
    const { data: v } = await supabase.from("vendor_targets").select("*").order("created_at");
    setVendors(v || []);
  }
  useEffect(() => { load(); }, [filter]);

  async function addVendor(e) {
    e.preventDefault();
    if (!newVendor.company_name) return;
    await supabase.from("vendor_targets").insert([newVendor]);
    setNewVendor({ company_name: "", website: "" });
    load();
  }

  async function setVendorStatus(id, status) {
    await supabase.from("vendor_targets").update({ status, applied_date: status === "applied" ? new Date().toISOString().slice(0, 10) : undefined }).eq("id", id);
    load();
  }

  async function deleteVendor(id) {
    if (!confirm("Remove this vendor target?")) return;
    await supabase.from("vendor_targets").delete().eq("id", id);
    load();
  }

  async function scanNow() {
    setScanning(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/leads/scan-tenders", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await res.json();
    setScanning(false);
    alert(`Scan complete — ${result.found ?? 0} new lead(s) found.`);
    load();
  }

  const [openLead, setOpenLead] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [booking, setBooking] = useState({ date: "", time: "09:00" });
  const [booked, setBooked] = useState(null);

  function openDetail(lead) {
    setOpenLead(lead);
    setNoteDraft(lead.notes || "");
    setBooking({
      date: lead.quote_at ? lead.quote_at.slice(0, 10) : "",
      time: lead.quote_at ? new Date(lead.quote_at).toTimeString().slice(0, 5) : "09:00",
    });
  }

  // The day's existing appointments, fetched when a date is picked. Without this,
  // booking is guesswork — you double-book, or you tell the client you'll confirm later
  // and the moment on the phone is gone.
  const [dayEvents, setDayEvents] = useState(null);
  const [loadingDay, setLoadingDay] = useState(false);

  useEffect(() => {
    if (!openLead || !booking.date) { setDayEvents(null); return; }
    let cancelled = false;

    (async () => {
      setLoadingDay(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/calendar/day?date=${booking.date}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (cancelled) return;
      setLoadingDay(false);
      if (!res.ok) { setDayEvents({ error: await res.text() }); return; }
      setDayEvents(await res.json());
    })();

    return () => { cancelled = true; };
  }, [openLead, booking.date]);

  async function connectCalendar() {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/calendar/connect", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) { alert(await res.text()); return; }
    const { url } = await res.json();
    window.location.href = url;
  }

  async function saveNotes() {
    setSavingNote(true);
    const { error } = await supabase.from("leads")
      .update({ notes: noteDraft }).eq("id", openLead.id);
    setSavingNote(false);
    if (error) { alert(`Couldn't save that: ${error.message}`); return; }
    setOpenLead((l) => ({ ...l, notes: noteDraft }));
    load();
  }

  // Booking a quote creates the real thing — a contact and a job on the calendar —
  // rather than just noting a date against the lead. An enquiry that stays a lead is an
  // enquiry nobody is scheduled to attend.
  async function bookQuote() {
    if (!booking.date) { alert("Pick a date for the quote visit first."); return; }

    // BC is permanent UTC-7, so the offset is fixed and the stored time is the time you
    // actually meant.
    const quoteAt = new Date(`${booking.date}T${booking.time}:00-07:00`).toISOString();

    let contactId = openLead.converted_contact_id;
    if (!contactId) {
      const { data: contact, error: contactError } = await supabase.from("contacts").insert([{
        name: openLead.contact_name || openLead.title,
        phone: openLead.contact_phone || null,
        email: openLead.contact_email || null,
        address: openLead.region || null,
      }]).select().single();
      if (contactError) { alert(`Couldn't create the contact: ${contactError.message}`); return; }
      contactId = contact.id;
    }

    let jobId = openLead.converted_job_id;
    if (!jobId) {
      const { data: job, error: jobError } = await supabase.from("jobs").insert([{
        title: `Quote — ${openLead.contact_name || openLead.title}`,
        contact_id: contactId,
        address: openLead.region || null,
        start_date: booking.date,
        // A quote visit isn't work won yet, so the job starts as an estimate rather
        // than active.
        status: "estimate",
        // The enquiry carried across, so whoever attends knows what was asked for
        // without going back to the lead to find out.
        notes: openLead.snippet || null,
      }]).select().single();
      if (jobError) { alert(`Couldn't create the job: ${jobError.message}`); return; }
      jobId = job.id;
    } else {
      await supabase.from("jobs").update({ start_date: booking.date }).eq("id", jobId);
    }

    await supabase.from("leads").update({
      quote_at: quoteAt,
      status: "pursuing",
      converted_contact_id: contactId,
      converted_job_id: jobId,
    }).eq("id", openLead.id);

    // Shown as a confirmation with an explicit button rather than opening the calendar
    // automatically: a window opened after an await is treated as a popup and blocked.
    setBooked({
      jobId,
      calendarUrl: googleCalendarUrl({
        title: `Quote — ${openLead.contact_name || openLead.title}`,
        startISO: quoteAt,
        minutes: 60,
        details: [
          openLead.snippet,
          openLead.contact_phone && `Phone: ${openLead.contact_phone}`,
          openLead.contact_email && `Email: ${openLead.contact_email}`,
        ].filter(Boolean).join("\n\n"),
        location: openLead.region || "",
      }),
    });
    setOpenLead(null);
    load();
  }

  async function setStatus(id, status) {
    await supabase.from("leads").update({ status }).eq("id", id);
    load();
  }

  async function deleteLead(id) {
    if (!confirm("Delete this lead?")) return;
    await supabase.from("leads").delete().eq("id", id);
    load();
  }

  if (loading) return null;
  if (!isManagement) return <><Nav /><main className="max-w-lg mx-auto px-4 py-10 text-center text-ink/50">Management only.</main></>;

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-display text-2xl font-semibold tracking-wide">Leads</h1>
          <button onClick={scanNow} disabled={scanning}
            className="bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2 rounded disabled:opacity-50">
            {scanning ? "Scanning..." : "Scan CanadaBuys now"}
          </button>
        </div>
        <p className="text-sm text-ink/60 mb-5">
          Automated: federal tenders from CanadaBuys' official open data, scanned twice daily for
          bollard removal, bollard painting, and roll-out-style multi-site work. Deck builds and
          insurance rebuilds aren't tendered publicly — those come from permits and referral
          relationships, which is a separate piece I haven't built yet.
        </p>

        <div className="bg-surface border border-border rounded-lg p-4 mb-5">
          <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-1">
            Vendor network targets
          </div>
          <p className="text-xs text-ink/40 mb-3">
            Companies like these source rollout/maintenance work through a direct subcontractor
            application, not public bids — track outreach status here.
          </p>
          <div className="space-y-2 mb-3">
            {vendors.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{v.company_name}</div>
                  {v.website && <a href={v.website} target="_blank" rel="noreferrer" className="text-xs text-steel">{v.website}</a>}
                </div>
                <select value={v.status} onChange={(e) => setVendorStatus(v.id, e.target.value)}
                  className="border border-border rounded px-2 py-1 text-xs">
                  {["not_applied", "applied", "in_review", "approved", "declined"].map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
                <button onClick={() => deleteVendor(v.id)} className="text-ink/30 hover:text-accent-dark text-xs">✕</button>
              </div>
            ))}
          </div>
          <form onSubmit={addVendor} className="flex gap-2">
            <input placeholder="Company name" className="border border-border rounded px-2 py-1.5 text-sm flex-1"
              value={newVendor.company_name} onChange={(e) => setNewVendor({ ...newVendor, company_name: e.target.value })} />
            <input placeholder="Website" className="border border-border rounded px-2 py-1.5 text-sm flex-1"
              value={newVendor.website} onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })} />
            <button className="text-xs font-display uppercase tracking-wide text-steel border border-steel/40 rounded px-3">Add</button>
          </form>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 mb-5">
          <div className="font-display uppercase text-xs tracking-wide text-ink/50 mb-2">
            Manual — no public API for these, check periodically
          </div>
          <div className="flex flex-wrap gap-2">
            {SAVED_SEARCHES.map((s) => (
              <a key={s.label} href={s.url} target="_blank" rel="noreferrer"
                className="text-xs border border-border rounded px-2 py-1 text-steel hover:text-steel-dark">
                {s.label} →
              </a>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-4 font-display text-xs uppercase tracking-wide">
          {["new", "reviewing", "pursuing", "dismissed", "all"].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded border ${filter === s ? "bg-ink text-white border-ink" : "border-border text-ink/60"}`}>
              {s}
            </button>
          ))}
        </div>

        {/* Booked. The calendar button is the point of this step — the .ics feed will
            catch up on its own schedule, which is no use for tomorrow morning. */}
        {booked && (
          <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 p-4"
            onClick={() => setBooked(null)}>
            <div className="bg-surface border border-border rounded-lg p-5 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}>
              <h2 className="font-display text-lg font-semibold tracking-wide">Quote booked</h2>
              <p className="text-sm text-ink/60 mt-1 mb-4">
                The client and the job are created. Add it to your calendar so it&apos;s on
                your phone.
              </p>

              <a href={booked.calendarUrl} target="_blank" rel="noreferrer"
                onClick={() => setBooked(null)}
                className="block text-center bg-accent hover:bg-accent-dark text-white font-display uppercase text-sm tracking-wide px-4 py-2.5 rounded">
                Add to Google Calendar
              </a>

              <button onClick={() => { const id = booked.jobId; setBooked(null); router.push(`/jobs/${id}`); }}
                className="block w-full text-center border border-border rounded px-4 py-2 text-sm mt-2">
                Open the job
              </button>

              <button onClick={() => setBooked(null)}
                className="block w-full text-center text-xs text-ink/40 mt-3">
                Done
              </button>
            </div>
          </div>
        )}

        {/* Working panel for a single lead: the whole enquiry, somewhere to write what
            was said on the phone, and a date that turns it into a real job. */}
        {openLead && (
          <div className="fixed inset-0 bg-ink/40 flex items-end sm:items-center justify-center z-50 p-4"
            onClick={() => setOpenLead(null)}>
            <div className="bg-surface border border-border rounded-lg w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <div className="p-5">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold tracking-wide">
                      {openLead.contact_name || openLead.title}
                    </h2>
                    <p className="text-sm text-ink/50 mt-0.5">
                      {openLead.organization}
                      {openLead.region && ` · ${openLead.region}`}
                    </p>
                  </div>
                  <button onClick={() => setOpenLead(null)} className="text-ink/30 hover:text-ink shrink-0">✕</button>
                </div>

                {/* Tap-to-call and tap-to-email, since the next action on an enquiry is
                    almost always one of the two. */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {openLead.contact_phone && (
                    <a href={`tel:${openLead.contact_phone.replace(/[^\d+]/g, "")}`}
                      className="text-sm bg-accent hover:bg-accent-dark text-white font-display uppercase tracking-wide px-3 py-1.5 rounded">
                      Call {openLead.contact_phone}
                    </a>
                  )}
                  {openLead.contact_email && (
                    <a href={`mailto:${openLead.contact_email}`}
                      className="text-sm border border-border rounded px-3 py-1.5 hover:border-steel">
                      Email
                    </a>
                  )}
                </div>

                {openLead.snippet && (
                  <div className="bg-paper rounded p-3 mt-4">
                    <div className="text-xs font-display uppercase tracking-wide text-ink/40 mb-1">
                      What they asked for
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{openLead.snippet}</p>
                  </div>
                )}

                <label className="block text-xs font-display uppercase tracking-wide text-ink/40 mt-4 mb-1">
                  Notes
                </label>
                <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                  rows={5} placeholder="What was said on the phone, what they need, anything to remember"
                  className="w-full border border-border rounded px-3 py-2 text-sm" />
                <button onClick={saveNotes} disabled={savingNote}
                  className="text-xs font-display uppercase tracking-wide border border-border rounded px-3 py-1.5 mt-2 disabled:opacity-50">
                  {savingNote ? "Saving..." : "Save notes"}
                </button>

                <div className="border-t border-border mt-5 pt-4">
                  <div className="text-xs font-display uppercase tracking-wide text-ink/40 mb-2">
                    Book a quote visit
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input type="date" value={booking.date}
                      onChange={(e) => setBooking({ ...booking, date: e.target.value })}
                      className="border border-border rounded px-2 py-1.5 text-sm" />
                    <input type="time" value={booking.time}
                      onChange={(e) => setBooking({ ...booking, time: e.target.value })}
                      className="border border-border rounded px-2 py-1.5 text-sm" />
                    <button onClick={bookQuote}
                      className="bg-ink text-white font-display uppercase text-xs tracking-wide px-3 py-1.5 rounded">
                      {openLead.converted_job_id ? "Update booking" : "Book quote"}
                    </button>
                  </div>
                  {/* What's already booked that day, so the answer on the phone is
                      "yes, 9am works" rather than "let me check and call you back". */}
                  {booking.date && (
                    <div className="mt-3 bg-paper rounded p-3">
                      {loadingDay && <p className="text-xs text-ink/40">Checking your calendar...</p>}

                      {!loadingDay && dayEvents?.error && (
                        <p className="text-xs text-warn">{dayEvents.error}</p>
                      )}

                      {!loadingDay && dayEvents && !dayEvents.connected && (
                        <div>
                          <p className="text-xs text-ink/60">
                            {dayEvents.message ||
                              "Connect the Google account your calendar is on to see what's already booked."}
                          </p>
                          <button onClick={connectCalendar}
                            className="text-xs font-display uppercase tracking-wide border border-border rounded px-2 py-1 mt-2">
                            Connect calendar
                          </button>
                        </div>
                      )}

                      {!loadingDay && dayEvents?.connected && (
                        <>
                          <div className="text-xs font-display uppercase tracking-wide text-ink/40 mb-1.5">
                            Already on {new Date(`${booking.date}T12:00:00`).toLocaleDateString([], {
                              weekday: "long", month: "short", day: "numeric",
                            })}
                          </div>
                          {dayEvents.events.length === 0 ? (
                            <p className="text-xs text-success">Nothing booked — the day is clear.</p>
                          ) : (
                            <ul className="space-y-1">
                              {dayEvents.events.map((ev) => (
                                <li key={ev.id} className="text-xs flex gap-2">
                                  <span className="font-mono text-ink/50 shrink-0 w-20">
                                    {ev.allDay
                                      ? "all day"
                                      : new Date(ev.start).toLocaleTimeString([], {
                                          hour: "numeric", minute: "2-digit",
                                        })}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate">{ev.summary}</span>
                                    {ev.location && (
                                      <span className="block text-ink/40 truncate">{ev.location}</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-ink/40 mt-2">
                    {openLead.converted_job_id
                      ? "This lead already has a job. Changing the date moves it."
                      : "Creates the client and a job on that day, so it lands on the crew's week and the calendar feed."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {leads.map((l) => (
            <div key={l.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="text-xs font-display uppercase tracking-wide text-steel">{CATEGORY_LABELS[l.category] || l.category}</div>
                  <div className="font-medium text-sm">{l.title}</div>
                  <div className="text-xs text-ink/40">{l.organization} {l.region && `· ${l.region}`} {l.closing_date && `· closes ${l.closing_date}`}</div>
                </div>
                {l.url && <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-steel shrink-0">View →</a>}
              </div>

              {/* The enquiry itself. It was being stored and never shown, so a website
                  lead arrived as a name with no way to see what the person asked for. */}
              {l.snippet && (
                <p className="text-sm text-ink/70 mt-2 whitespace-pre-wrap line-clamp-3">{l.snippet}</p>
              )}

              {l.quote_at && (
                <p className="text-xs text-success mt-2">
                  Quote booked {new Date(l.quote_at).toLocaleString([], {
                    weekday: "short", month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                  })}
                </p>
              )}
              {l.notes && !l.quote_at && (
                <p className="text-xs text-ink/40 mt-2">Has notes</p>
              )}
              <div className="flex gap-1.5 mt-2">
                {["new", "reviewing", "pursuing", "dismissed"].map((s) => (
                  <button key={s} onClick={() => setStatus(l.id, s)}
                    className={`text-xs font-display uppercase tracking-wide px-2 py-0.5 rounded border ${
                      l.status === s ? "bg-ink text-white border-ink" : "border-border text-ink/50"
                    }`}>
                    {s}
                  </button>
                ))}
                <button onClick={() => openDetail(l)}
                  className="text-xs font-display uppercase tracking-wide px-2 py-0.5 rounded border border-steel/40 text-steel hover:border-steel">
                  Open
                </button>
                <button onClick={() => deleteLead(l.id)} className="text-xs text-ink/40 hover:text-accent-dark ml-auto">✕</button>
              </div>
            </div>
          ))}
          {leads.length === 0 && (
            <div className="border border-dashed border-border rounded-lg p-8 text-center text-ink/50 text-sm">
              No leads in this view yet.
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return <AuthGate><LeadsPage /></AuthGate>;
}
