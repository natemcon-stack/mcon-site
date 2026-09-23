import { createClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cronAuth";
import webpush from "web-push";
import { bumpOverdueTasks } from "@/lib/weekTasks";
import { getCompanySettings } from "@/lib/companySettings";

// Triggered twice a day by Vercel Cron (see vercel.json) to remind the crew
// to clock in / clock out. Vercel automatically sends "Authorization: Bearer
// <CRON_SECRET>" on requests it triggers itself, so nothing sensitive needs to
// live in vercel.json or the URL — this checks that header instead.
// The morning run also checks for a BC stat holiday and credits full-time employees'
// hours automatically — folded in here rather than a separate cron job, since Vercel's
// free plan caps a project at 2 scheduled cron jobs.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // "start" or "end"
  const authHeader = request.headers.get("authorization") || "";

  if (!isCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let statHoliday = null;
  if (type !== "end") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: holiday } = await supabaseAdmin.from("stat_holidays").select("*").eq("date", today).maybeSingle();
    if (holiday) {
      const jobTitle = "Statutory Holidays (Non-billable)";
      let { data: job } = await supabaseAdmin.from("jobs").select("id").eq("title", jobTitle).maybeSingle();
      if (!job) {
        const { data: newJob } = await supabaseAdmin.from("jobs").insert([{ title: jobTitle, status: "active" }]).select().single();
        job = newJob;
      }
      const { data: fullTimers } = await supabaseAdmin.from("profiles").select("id, full_name").eq("employment_type", "full_time");
      let credited = 0;
      for (const person of fullTimers || []) {
        const workerName = person.full_name || "Unknown";
        const { data: existing } = await supabaseAdmin
          .from("job_hours").select("id").eq("job_id", job.id).eq("worker_name", workerName).eq("date", today).maybeSingle();
        if (existing) continue;
        await supabaseAdmin.from("job_hours").insert([{
          job_id: job.id, worker_name: workerName, date: today, hours: 8, note: `Stat holiday: ${holiday.name}`,
        }]);
        credited++;
      }
      statHoliday = { name: holiday.name, credited };
    }
  }

  // Carry unfinished tasks forward before the morning push, so what the crew sees
  // when they open the app matches what they were just notified about.
  if (type === "start") await bumpOverdueTasks(supabaseAdmin);

  // No company id: this is only read for the VAPID contact address, which is a
  // property of the deployment rather than of any one company. Passing nothing returns
  // the env-var defaults on a multi-company install, which is the right answer here.
  const settings = await getCompanySettings();
  webpush.setVapidDetails(
    `mailto:${settings.pushContactEmail}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("*");

  // Actions turn a reminder into one tap. A notification that only says "don't forget"
  // relies on someone opening the app, finding the page and pressing a button — which
  // is exactly what they were already forgetting to do.
  //
  // The action opens the app at the right place rather than acting in the background:
  // clocking in needs the phone's location and the person's session, and a silent
  // failure would leave someone believing they were on the clock when they weren't.
  const payload = JSON.stringify(
    type === "end"
      ? {
          title: "End of day",
          body: "Clock out and put today's hours against a job.",
          url: "/today",
          tag: "clock-out",
          actions: [{ action: "clock_out", title: "Clock out" }],
          // Stays on screen until dealt with — the whole problem is that it gets
          // dismissed and forgotten.
          requireInteraction: true,
        }
      : statHoliday
      ? {
          title: `Happy ${statHoliday.name}!`,
          body: "Today's a stat holiday — hours have been credited automatically for full-time crew.",
          url: "/today",
        }
      : {
          title: "Start of day",
          body: "Clock in when you're on site.",
          url: "/today",
          tag: "clock-in",
          actions: [{ action: "clock_in", title: "Clock in" }],
          requireInteraction: true,
        }
  );

  let sent = 0;
  for (const row of subs || []) {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent++;
    } catch (err) {
      // subscription likely expired; remove it
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", row.id);
      }
    }
  }

  return Response.json({ sent, statHoliday });
}
