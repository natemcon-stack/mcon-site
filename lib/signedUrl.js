"use client";
import { supabase } from "@/lib/supabase/client";

// Fetches a fresh, short-lived signed URL for a file in a private bucket. Call this
// right before displaying something — never store the result long-term, since it
// expires (by design).
export async function getSignedUrl(bucket, path) {
  if (!path) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const res = await fetch("/api/storage/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ bucket, path }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.url;
}

// Signs many paths in one request. Prefer this anywhere a list of images is rendered —
// mounting one signing request per image overwhelms the auth endpoint and the failures
// surface as broken images.
//
// Returns a { path: url } map. Paths that couldn't be signed are absent rather than
// null, so callers can distinguish "not signable" from "not yet loaded".
export async function getSignedUrls(bucket, paths, width) {
  const wanted = [...new Set((paths || []).filter(Boolean))];
  if (wanted.length === 0) return {};

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};

  const out = {};
  // Chunked to stay under the route's per-request cap on very long jobs.
  for (let i = 0; i < wanted.length; i += 200) {
    const chunk = wanted.slice(i, i + 200);
    try {
      const res = await fetch("/api/storage/signed-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ bucket, paths: chunk, width }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      Object.assign(out, data.urls || {});
    } catch (e) {
      // Leave this chunk unsigned; the caller shows those as unavailable.
    }
  }
  return out;
}
