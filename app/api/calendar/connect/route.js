import { createClient } from "@supabase/supabase-js";
import { signOAuthState } from "@/lib/oauthState";

// Starts a SEPARATE Google connection for the calendar.
//
// Deliberately not folded into the Gmail connection. Receipts arrive at one Google
// account and the calendar lives on another, which is normal — a business address for
// mail and a personal or older account holding the diary. Bundling the scopes would
// force both onto one login and break whichever one lost.
//
// Read-only scope. The app never creates or deletes calendar events: booking a quote
// produces a prefilled link that the person saves themselves, so nothing is written to
// a calendar on their behalf.
export async function GET(request) {
  const { origin } = new URL(request.url);

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Sign in first", { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return new Response("Sign in first", { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active").eq("id", user.id).single();
  if (!profile?.is_active || !["admin", "foreman"].includes(profile.role)) {
    return new Response("Management only", { status: 403 });
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/calendar/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    state: signOAuthState(user.id),
  });

  return Response.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
}
