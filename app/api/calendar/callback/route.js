import { createClient } from "@supabase/supabase-js";
import { brand } from "@/lib/brand";
import { verifyOAuthState } from "@/lib/oauthState";

// Stores the calendar connection. Separate from the Gmail one, because the calendar is
// on a different Google account.
//
// The user id comes from a signed, time-limited state parameter issued by the connect
// route — never from whatever the state string happens to say.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const uid = verifyOAuthState(searchParams.get("state"));
  if (!code) return new Response("Missing code", { status: 400 });
  if (!uid) {
    return new Response(
      "That connection link is invalid or has expired. Start the connection again from the app.",
      { status: 400 }
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/calendar/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    return new Response(
      "Google didn't return a refresh token. This usually means this account has connected before — " +
      `remove ${brand.shortName} ${brand.appName} from that Google Account's third-party access list and try again.`,
      { status: 400 }
    );
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const googleProfile = await profileRes.json();

  // Which calendar to read. An account often has several — a work diary, a shared family
  // one, subscribed holidays — so the writable primary is the sensible default and the
  // rest are offered as a choice afterwards.
  let calendarId = "primary";
  try {
    const listRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (listRes.ok) {
      const list = await listRes.json();
      const primary = (list.items || []).find((c) => c.primary);
      if (primary?.id) calendarId = primary.id;
    }
  } catch (e) {
    // Falls back to "primary", which Google accepts as an alias.
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  await supabaseAdmin.from("calendar_connections").upsert(
    [{
      user_id: uid,
      email: googleProfile.email,
      refresh_token: tokens.refresh_token,
      calendar_id: calendarId,
      connected_at: new Date().toISOString(),
    }],
    { onConflict: "user_id" }
  );

  return Response.redirect(`${origin}/admin/leads?calendar=1`);
}
