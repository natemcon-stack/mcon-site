import { createClient } from "@supabase/supabase-js";
import { brand } from "@/lib/brand";
import { verifyOAuthState } from "@/lib/oauthState";

// Exchanges the OAuth code for tokens and stores the refresh token against the user.
//
// The user id comes from a signed, time-limited state parameter issued by the connect
// route. It used to be whatever the state string said, unverified — so a crafted link
// could store the person's Gmail tokens against someone else's account.
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
      redirect_uri: `${origin}/api/gmail/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    return new Response(
      "Google didn't return a refresh token. This usually means you've connected before — " +
      `remove ${brand.shortName} ${brand.appName} from your Google Account's third-party access list and try again.`,
      { status: 400 }
    );
  }

  // Look up the connected email address for display purposes.
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json();

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  await supabaseAdmin.from("gmail_connections").upsert(
    [{ user_id: uid, email: profile.email, refresh_token: tokens.refresh_token, connected_at: new Date().toISOString() }],
    { onConflict: "user_id" }
  );

  return Response.redirect(`${origin}/admin/receipts?connected=1`);
}
