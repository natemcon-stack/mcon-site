import { createClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cronAuth";
import { periodEndingOn } from "@/lib/payrollPeriods";
import webpush from "web-push";
import { getCompanySettings } from "@/lib/companySettings";

// Runs daily (see vercel.json). Pay periods: 26th(prev month)–10th, paid on the
// 15th; 11th–25th, paid on the 1st. Reminders fire on the 11th and 26th — right
// after each period closes, giving a few days before that period's pay date —
// to push a "submit your hours" notice to every crew member. Does NOT email
// anyone — sending the actual hours report to the accountant is a separate,
// manual step an admin does from the Payroll Review page after checking the numbers.
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
  const overrideDate = searchParams.get("date");
  const today = overrideDate ? new Date(overrideDate + "T00:00:00") : new Date();

  // No company id: this is only read for the VAPID contact address, which is a
  // property of the deployment rather than of any one company. Passing nothing returns
  // the env-var defaults on a multi-company install, which is the right answer here.
  const settings = await getCompanySettings();

  // Which period just closed, according to this company's own schedule. Null means
  // today isn't one of their run days — the job runs daily and does nothing most days.
  const period = periodEndingOn(today, settings);
  if (!period) {
    return Response.json({ ran: false, reason: "not a payroll run day for this company" });
  }
  webpush.setVapidDetails(
    `mailto:${settings.pushContactEmail}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("*");
  const payload = JSON.stringify({
    title: "Submit your hours",
    body: "Payroll is coming up — make sure all your hours are logged.",
  });
  let pushed = 0;
  for (const row of subs || []) {
    try {
      await webpush.sendNotification(row.subscription, payload);
      pushed++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", row.id);
      }
    }
  }

  return Response.json({ ran: true, pushed });
}
