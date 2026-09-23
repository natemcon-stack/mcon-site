import { createClient } from "@supabase/supabase-js";

// Compares job_photos rows against what's actually in the job-photos bucket.
//
// "image unavailable" means a path couldn't be signed, and the usual reason is that no
// object exists at that path — the database row and the stored file have drifted apart.
// This reports which, so the difference between "wrong path recorded" and "file never
// arrived" is visible instead of inferred.

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

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  // Scoped to the caller's company — a maintenance tool must not walk another
  // company's photos.
  const callerCompanyId = await adminCompany(request, supabaseAdmin);
  if (!callerCompanyId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) return new Response("jobId required", { status: 400 });

  const { data: rows } = await supabaseAdmin
    .from("job_photos")
    .select("id, storage_path, url, created_at")
    .eq("job_id", jobId);

  // Photos are uploaded under a `${jobId}/` prefix, so one listing covers the job.
  // Paginated because list() caps out well below the size of a busy job.
  const stored = new Set();
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const { data: objects, error } = await supabaseAdmin
      .storage.from("job-photos")
      .list(jobId, { limit: 100, offset });
    if (error || !objects || objects.length === 0) break;
    objects.forEach((o) => stored.add(`${jobId}/${o.name}`));
    if (objects.length < 100) break;
    offset += 100;
  }

  const noPath = [];
  const missingFile = [];
  const present = [];

  for (const row of rows || []) {
    if (!row.storage_path) { noPath.push(row); continue; }
    if (stored.has(row.storage_path)) present.push(row);
    else missingFile.push(row);
  }

  // A sign attempt on a few of the missing ones confirms whether the listing and the
  // signer agree, rather than trusting the listing alone.
  const signProbe = [];
  for (const row of missingFile.slice(0, 3)) {
    const { data, error } = await supabaseAdmin
      .storage.from("job-photos").createSignedUrl(row.storage_path, 60);
    signProbe.push({
      path: row.storage_path,
      signed: Boolean(data?.signedUrl),
      error: error?.message || null,
    });
  }

  return Response.json({
    rowsInDatabase: (rows || []).length,
    filesInStorage: stored.size,
    resolvable: present.length,
    missingFile: missingFile.length,
    noStoragePath: noPath.length,
    // Samples make a path-format mismatch obvious at a glance.
    sampleMissingPaths: missingFile.slice(0, 5).map((r) => r.storage_path),
    sampleStoredPaths: [...stored].slice(0, 5),
    sampleNoPathUrls: noPath.slice(0, 3).map((r) => (r.url || "").slice(0, 120)),
    signProbe,
  });
}
