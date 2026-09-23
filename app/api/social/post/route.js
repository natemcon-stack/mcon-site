import { createClient } from "@supabase/supabase-js";

// Returns the caller's company as well as confirming they're an admin. Every query in
// this route has to be scoped to it by hand — the service role bypasses RLS, so nothing
// else will do it.
async function adminCompany(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, company_id, is_active").eq("id", user.id).single();
  if (!profile?.is_active || profile.role !== "admin") return null;
  return profile.company_id;
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const callerCompanyId = await adminCompany(request, supabaseAdmin);
  if (!callerCompanyId) return new Response("Unauthorized", { status: 401 });

  const { postId } = await request.json();
  const { data: post } = await supabaseAdmin.from("social_posts").select("*").eq("id", postId).single();
  if (!post) return new Response("Not found", { status: 404 });
  // Fetched by id, so it has to be checked against the caller's company by hand.
  if (post.company_id !== callerCompanyId) return new Response("Not found", { status: 404 });

  // A company's own Facebook/Instagram connection. Unscoped, this could post one
  // company's job photos from another company's page.
  const { data: connection } = await supabaseAdmin
    .from("social_connections").select("*").eq("company_id", callerCompanyId).maybeSingle();
  if (!connection) return new Response("No Facebook/Instagram connection set up yet", { status: 400 });

  // Image needs to be reachable by Meta's servers — generate a signed URL with
  // enough lifetime for them to fetch it (they grab it almost immediately).
  let imageUrl = null;
  if (post.image_path) {
    const { data: signed } = await supabaseAdmin.storage.from("documents").createSignedUrl(post.image_path, 3600);
    imageUrl = signed?.signedUrl;
  }

  let fbPostId = null, igPostId = null, errorMessage = null;

  if (post.post_to_facebook) {
    try {
      const endpoint = imageUrl
        ? `https://graph.facebook.com/v21.0/${connection.page_id}/photos`
        : `https://graph.facebook.com/v21.0/${connection.page_id}/feed`;
      const body = new URLSearchParams({
        access_token: connection.page_access_token,
        ...(imageUrl ? { url: imageUrl, caption: post.caption || "" } : { message: post.caption || "" }),
      });
      const res = await fetch(endpoint, { method: "POST", body });
      const data = await res.json();
      if (data.id || data.post_id) fbPostId = data.post_id || data.id;
      else errorMessage = "Facebook: " + JSON.stringify(data.error || data);
    } catch (e) {
      errorMessage = "Facebook: " + e.message;
    }
  }

  if (post.post_to_instagram) {
    if (!connection.ig_business_account_id) {
      errorMessage = (errorMessage ? errorMessage + " | " : "") + "Instagram: no linked Business account found on the connected Page.";
    } else if (!imageUrl) {
      errorMessage = (errorMessage ? errorMessage + " | " : "") + "Instagram: requires a photo — text-only posts aren't supported.";
    } else {
      try {
        // Two-step publish: create a media container, then publish it.
        const containerRes = await fetch(
          `https://graph.facebook.com/v21.0/${connection.ig_business_account_id}/media`,
          {
            method: "POST",
            body: new URLSearchParams({
              image_url: imageUrl,
              caption: post.caption || "",
              access_token: connection.page_access_token,
            }),
          }
        );
        const containerData = await containerRes.json();
        if (containerData.id) {
          const publishRes = await fetch(
            `https://graph.facebook.com/v21.0/${connection.ig_business_account_id}/media_publish`,
            {
              method: "POST",
              body: new URLSearchParams({ creation_id: containerData.id, access_token: connection.page_access_token }),
            }
          );
          const publishData = await publishRes.json();
          if (publishData.id) igPostId = publishData.id;
          else errorMessage = (errorMessage ? errorMessage + " | " : "") + "Instagram: " + JSON.stringify(publishData.error || publishData);
        } else {
          errorMessage = (errorMessage ? errorMessage + " | " : "") + "Instagram: " + JSON.stringify(containerData.error || containerData);
        }
      } catch (e) {
        errorMessage = (errorMessage ? errorMessage + " | " : "") + "Instagram: " + e.message;
      }
    }
  }

  await supabaseAdmin.from("social_posts").update({
    status: errorMessage && !fbPostId && !igPostId ? "failed" : "posted",
    fb_post_id: fbPostId,
    ig_post_id: igPostId,
    error_message: errorMessage,
    posted_at: new Date().toISOString(),
  }).eq("id", postId);

  return Response.json({ fbPostId, igPostId, errorMessage });
}
