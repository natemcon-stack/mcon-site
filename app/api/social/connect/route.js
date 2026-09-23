import { createClient } from "@supabase/supabase-js";
import { signOAuthState } from "@/lib/oauthState";

// Starts the Facebook/Instagram OAuth flow. Needs pages + Instagram publishing
// permissions.
//
// Requires an admin session and issues a signed, short-lived state parameter. Without
// that, anyone could walk this flow and store their own Page token against the company
// — which would mean posts going to a stranger's page, or the real connection being
// silently replaced.
export async function GET(request) {
  const origin = new URL(request.url).origin;

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
  if (profile?.role !== "admin" || !profile?.is_active) {
    return new Response("Management only", { status: 403 });
  }

  const redirectUri = `${origin}/api/social/callback`;
  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "instagram_basic",
    "instagram_content_publish",
  ].join(",");

  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code`
    + `&state=${encodeURIComponent(signOAuthState(user.id))}`;

  // Returned rather than redirected, because the caller has to send an Authorization
  // header and a plain browser navigation can't.
  return Response.json({ url: authUrl });
}
