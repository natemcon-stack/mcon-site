import { createClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cronAuth";

// Runs daily (see vercel.json). If today matches a row in stat_holidays, credits every
// full-time employee's standard_daily_hours against a company-wide "Statutory Holidays"
// job, so it shows up on timesheets automatically. Skips anyone already logged for that date.
async function isAuthorized(request, supabaseAdmin) {
  const authHeader = request.headers.get("authorization") || "";
  if (isCronRequest(request)) return true;
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAuthorized(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const { data: holiday } = await supabaseAdmin.from("stat_holidays").select("*").eq("date", date).maybeSingle();
  if (!holiday) {
    return Response.json({ applied: false, reason: "not a stat holiday" });
  }

  // Find or create the non-billable job these hours get logged against.
  const jobTitle = "Statutory Holidays (Non-billable)";
  let { data: job } = await supabaseAdmin.from("jobs").select("id").eq("title", jobTitle).maybeSingle();
  if (!job) {
    const { data: newJob } = await supabaseAdmin
      .from("jobs").insert([{ title: jobTitle, status: "active" }]).select().single();
    job = newJob;
  }

  const { data: fullTimers } = await supabaseAdmin
    .from("profiles").select("id, full_name").eq("employment_type", "full_time");

  let credited = 0;
  for (const person of fullTimers || []) {
    const workerName = person.full_name || "Unknown";
    const { data: existing } = await supabaseAdmin
      .from("job_hours").select("id").eq("job_id", job.id).eq("worker_name", workerName).eq("date", date).maybeSingle();
    if (existing) continue;

    await supabaseAdmin.from("job_hours").insert([{
      job_id: job.id,
      worker_name: workerName,
      date,
      hours: 8,
      note: `Stat holiday: ${holiday.name}`,
    }]);
    credited++;
  }

  return Response.json({ applied: true, holiday: holiday.name, credited });
}
