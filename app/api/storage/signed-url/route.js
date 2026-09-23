import { createClient } from "@supabase/supabase-js";

// Generates a short-lived signed URL for a file in a private bucket. Nothing about
// these files is reachable without going through this route (and being logged in) —
// there is no longer a permanent public URL for anyone who happens to have the link.
const ALLOWED_BUCKETS = ["job-photos", "documents"];
const EXPIRY_SECONDS = 3600; // 1 hour

async function isAuthenticated(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return { ok: false };
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return { ok: false };
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  // "documents" holds client-facing PDFs and attachments, which a foreman works with.
  return { ok: true, isAdmin: ["admin", "foreman"].includes(profile?.role) };
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { ok, isAdmin } = await isAuthenticated(request, supabaseAdmin);
  if (!ok) return new Response("Unauthorized", { status: 401 });

  const { bucket, path } = await request.json();
  if (!ALLOWED_BUCKETS.includes(bucket) || !path) {
    return new Response("Invalid bucket/path", { status: 400 });
  }
  // The insurance certificate is admin-only info; job photos are visible to any crew member.
  if (bucket === "documents" && !isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, EXPIRY_SECONDS);
  if (error) return new Response(error.message, { status: 500 });

  return Response.json({ url: data.signedUrl, expiresIn: EXPIRY_SECONDS });
}
