import { createClient } from "@supabase/supabase-js";
import { signOAuthState } from "@/lib/oauthState";

// Starts the Gmail OAuth flow. Requires a Google Cloud OAuth client (see README) with
// this route's full URL registered as an authorized redirect URI.
//
// Uses gmail.modify (not just readonly) so a confirmed receipt can be moved out of the
// inbox into a label. That scope allows labelling and archiving but NOT permanent
// deletion — nothing this app does can erase an email.
//
// The account being connected is taken from the caller's own session, never from a
// query parameter. Previously it came from ?uid=, which meant a crafted link could bind
// whoever clicked it to somebody else's account: the victim consents with Google, and
// their mailbox tokens land against the attacker's user id.
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

  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return new Response("Management only", { status: 403 });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/gmail/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/gmail.modify",
    state: signOAuthState(user.id),
  });

  // Returned as a URL rather than a redirect, because the caller has to send an
  // Authorization header — which a plain browser navigation can't do. The client opens
  // this itself.
  return Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}
