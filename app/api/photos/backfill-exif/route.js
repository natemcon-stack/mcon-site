import { createClient } from "@supabase/supabase-js";
import exifr from "exifr";

// One-time (re-runnable) backfill for job_photos.taken_at.
//
// EXIF is read in the browser at upload time, so any photo uploaded before that code
// existed has a null taken_at and falls back to its upload date — which is why a batch
// uploaded on Friday all lands in Friday's week regardless of when the work happened.
//
// The original files are still in storage with their metadata intact, so the date is
// recoverable: download each one, re-read its EXIF, and write the real date back.
// Photos that genuinely have no EXIF (screenshots, anything forwarded through a
// messaging app, which strips it) stay null and keep falling back to upload time.
//
// Runs in batches so a large library doesn't hit the function timeout. Call repeatedly
// until `remaining` comes back 0.

export const maxDuration = 60;

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

  // Scoped to the caller's company — a maintenance tool must not walk another
  // company's photos.
  const callerCompanyId = await adminCompany(request, supabaseAdmin);
  if (!callerCompanyId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(Number(searchParams.get("batch")) || 40, 100);
  // A dry run reports what would change without writing, so the scale of the fix can be
  // seen before committing to it.
  const dryRun = searchParams.get("dry") === "1";

  // exif_checked marks photos we've already downloaded and found nothing in, so repeat
  // runs don't keep re-downloading the same files forever.
  const { data: photos, error } = await supabaseAdmin
    .from("job_photos")
    .select("id, storage_path, created_at")
    .eq("company_id", callerCompanyId)
    .is("taken_at", null)
    .eq("exif_checked", false)
    .not("storage_path", "is", null)
    .limit(batchSize);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let recovered = 0;
  let noExif = 0;
  let failed = 0;
  const samples = [];

  for (const photo of photos || []) {
    try {
      const { data: file, error: dlError } = await supabaseAdmin
        .storage.from("job-photos").download(photo.storage_path);
      if (dlError || !file) { failed++; continue; }

      const buffer = Buffer.from(await file.arrayBuffer());
      const exif = await exifr.parse(buffer, ["DateTimeOriginal", "CreateDate"]);
      const taken = exif?.DateTimeOriginal || exif?.CreateDate || null;

      if (taken) {
        const takenAt = new Date(taken).toISOString();
        recovered++;
        if (samples.length < 5) {
          samples.push({
            uploaded: photo.created_at?.slice(0, 10),
            taken: takenAt.slice(0, 10),
          });
        }
        if (!dryRun) {
          await supabaseAdmin.from("job_photos")
            .update({ taken_at: takenAt, exif_checked: true })
            .eq("id", photo.id);
        }
      } else {
        noExif++;
        // Mark it checked either way — without this, photos with no EXIF would be
        // re-downloaded on every run and the backfill would never finish.
        if (!dryRun) {
          await supabaseAdmin.from("job_photos")
            .update({ exif_checked: true })
            .eq("id", photo.id);
        }
      }
    } catch (e) {
      failed++;
    }
  }

  const { count: remaining } = await supabaseAdmin
    .from("job_photos")
    .select("id", { count: "exact", head: true })
    .is("taken_at", null)
    .eq("exif_checked", false)
    .not("storage_path", "is", null);

  return Response.json({
    processed: (photos || []).length,
    recovered,
    noExif,
    failed,
    remaining: remaining || 0,
    dryRun,
    samples,
  });
}
