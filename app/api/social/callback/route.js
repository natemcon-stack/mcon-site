import { createClient } from "@supabase/supabase-js";
import { verifyOAuthState } from "@/lib/oauthState";

// Exchanges the OAuth code for a user token, finds the Page(s) that user manages,
// grabs a long-lived Page access token (these don't expire as long as the app has
// the page connected), and finds the linked Instagram Business Account ID.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/social/callback`;

  if (!code) return new Response("Missing code", { status: 400 });

  // The state was signed by the connect route for a specific admin. Without verifying
  // it, this endpoint would accept a Facebook token from anyone who walked the flow
  // themselves and store it as the company's connection.
  if (!verifyOAuthState(searchParams.get("state"))) {
    return new Response(
      "That connection link is invalid or has expired. Start the connection again from the app.",
      { status: 400 }
    );
  }

  // Step 1: exchange code for a short-lived user access token.
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.FACEBOOK_APP_SECRET}&code=${code}`
  );
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return new Response("Facebook sign-in failed. Try connecting again.", { status: 400 });
  }

  // Step 2: exchange for a long-lived user token (~60 days).
  const longLivedRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
  );
  const longLivedData = await longLivedRes.json();
  const userToken = longLivedData.access_token || tokenData.access_token;

  // Step 3: find the Page(s) this user manages — Page tokens derived from a
  // long-lived user token don't expire on their own.
  const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`);
  const pagesData = await pagesRes.json();
  const page = pagesData.data?.[0];
  if (!page) {
    return new Response("No Facebook Page found for this account — make sure you're an admin on the Page you want to post to.", { status: 400 });
  }

  // Step 4: find the Instagram Business Account linked to that Page.
  const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
  const igData = await igRes.json();

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  await supabaseAdmin.from("social_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabaseAdmin.from("social_connections").insert([{
    page_id: page.id,
    page_name: page.name,
    page_access_token: page.access_token,
    ig_business_account_id: igData.instagram_business_account?.id || null,
  }]);

  return Response.redirect(`${origin}/admin/social?connected=1`);
}
