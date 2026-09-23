import { createClient } from "@supabase/supabase-js";

// Batch version of /api/storage/signed-url.
//
// The single-path route is fine for one image, but a job photo tab mounts one component
// per photo and each fired its own request — 40 photos meant 40 concurrent POSTs, each
// doing an auth lookup and a profile query. Supabase rate-limits that; the requests that
// lost fell back to the pre-private-bucket public URL, which now returns 400 and renders
// as a broken image. Signing every path in one call removes the race entirely.

const ALLOWED_BUCKETS = ["job-photos", "documents"];
const EXPIRY_SECONDS = 3600; // 1 hour
// Supabase accepts a large array, but keeping batches bounded avoids a single oversized
// request when a long-running job has hundreds of photos.
const MAX_PATHS = 200;

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

  const { bucket, paths, width } = await request.json();
  if (!ALLOWED_BUCKETS.includes(bucket) || !Array.isArray(paths)) {
    return new Response("Invalid bucket/paths", { status: 400 });
  }
  if (bucket === "documents" && !isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const clean = [...new Set(paths.filter(Boolean))].slice(0, MAX_PATHS);
  if (clean.length === 0) return Response.json({ urls: {} });

  // A resized rendition when a width is asked for. Phone photos are 3-5 MB each, and a
  // grid or a print run of a hundred of them is what makes the browser stall — a 400px
  // thumbnail or a 1200px print copy is a fraction of the bytes and visually identical
  // at the size it's displayed. Image transformation isn't available on every Supabase
  // plan, so a failure here falls back to the untransformed original rather than
  // leaving the caller with nothing.
  let data = null;
  let error = null;

  if (width) {
    const attempt = await supabaseAdmin.storage.from(bucket).createSignedUrls(clean, EXPIRY_SECONDS, {
      transform: { width: Number(width), resize: "contain", quality: 75 },
    });
    if (!attempt.error && attempt.data?.some((d) => d?.signedUrl)) {
      data = attempt.data;
    }
  }

  if (!data) {
    const plain = await supabaseAdmin.storage.from(bucket).createSignedUrls(clean, EXPIRY_SECONDS);
    data = plain.data;
    error = plain.error;
  }

  if (error) return new Response(error.message, { status: 500 });

  // Returned as a path -> url map so the caller can look up by path without matching
  // array positions. A path that failed to sign is simply absent, which the caller
  // renders as unavailable rather than as a broken image.
  const urls = {};
  for (const entry of data || []) {
    if (entry?.signedUrl && !entry.error) urls[entry.path] = entry.signedUrl;
  }

  return Response.json({ urls, expiresIn: EXPIRY_SECONDS });
}
