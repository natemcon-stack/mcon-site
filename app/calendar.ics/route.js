import { createClient } from "@supabase/supabase-js";
import { brand } from "@/lib/brand";

// Public-ish read-only calendar feed of jobs (start_date -> end_date).
// Subscribe to this URL in Google Calendar: Other calendars > From URL.
// Protected by a simple feed token so it's not fully public.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== process.env.CALENDAR_FEED_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("*, contacts(name)")
    .not("start_date", "is", null);

  const escapeText = (s) => (s || "").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  const toICSDate = (d) => d.replaceAll("-", "");

  const events = (jobs || [])
    .map((j) => {
      const start = toICSDate(j.start_date);
      const end = toICSDate(j.end_date || j.start_date);
      return [
        "BEGIN:VEVENT",
        `UID:${j.id}@${brand.domain}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeText(j.title)}${j.contacts?.name ? " - " + escapeText(j.contacts.name) : ""}`,
        `LOCATION:${escapeText(j.address)}`,
        `STATUS:${j.status === "complete" ? "CONFIRMED" : "TENTATIVE"}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${brand.shortName} ${brand.appName}//EN`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${brand.shortName} Jobs`,
    events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
}
