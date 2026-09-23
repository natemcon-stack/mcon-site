import { createClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "@/lib/gmailReceiptProcessor";

// What's already on the calendar for a given day.
//
// Booking a quote without seeing this is guesswork — you end up double-booked, or you
// tell a client you'll call them back to confirm and the moment is gone. This answers
// "am I free Tuesday at 9?" while they're still on the phone.
//
// Read-only. The app never writes to the calendar: booking produces a prefilled link
// the person saves themselves, so nothing can be created or deleted on their behalf.

export const maxDuration = 30;

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || !["admin", "foreman"].includes(profile.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("Pass a date as YYYY-MM-DD", { status: 400 });
  }

  // The caller's own calendar connection — a separate Google account from the one
  // receipts arrive at, which is why this doesn't reuse gmail_connections.
  const { data: connection } = await supabaseAdmin
    .from("calendar_connections")
    .select("refresh_token, calendar_id, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection?.refresh_token) {
    return Response.json({ connected: false, events: [] });
  }

  const accessToken = await refreshAccessToken(connection.refresh_token);
  if (!accessToken) return Response.json({ connected: false, events: [] });

  // BC is permanent UTC-7, so the day's bounds are fixed with no daylight saving to
  // account for.
  const timeMin = `${date}T00:00:00-07:00`;
  const timeMax = `${date}T23:59:59-07:00`;

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id || "primary")}/events?` +
        new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "50",
        }),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const body = await res.text();
      // A missing calendar scope looks exactly like this, and it's the likely cause
      // until the person reconnects — so say so rather than reporting an empty day.
      if (res.status === 403 || res.status === 401) {
        return Response.json({
          connected: false,
          needsReconnect: true,
          events: [],
          message: "Reconnect Google under Admin > Receipts to allow calendar access.",
        });
      }
      return new Response(`Couldn't read the calendar: ${body}`, { status: 502 });
    }

    const data = await res.json();
    const events = (data.items || [])
      // Anything declined isn't really on the calendar.
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        id: e.id,
        summary: e.summary || "(no title)",
        allDay: Boolean(e.start?.date),
        start: e.start?.dateTime || e.start?.date || null,
        end: e.end?.dateTime || e.end?.date || null,
        location: e.location || null,
      }));

    return Response.json({ connected: true, date, events, email: connection.email });
  } catch (e) {
    return new Response(`Couldn't read the calendar: ${e.message}`, { status: 502 });
  }
}
