import { createClient } from "@supabase/supabase-js";
import { getCompanySettings } from "@/lib/companySettings";

// Admin-triggered only — compiles hours for a given date range and emails the
// accountant. Nothing about this route runs automatically; the review page calls
// it only when an admin clicks "Send to accountant" after checking the numbers.
// Returns the caller's company as well as their role — the settings this report needs
// are that company's, and on a multi-company install "the settings" is not a thing.
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
  if (!callerCompanyId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { start, end } = await request.json();
  if (!start || !end) return new Response("Missing start/end date", { status: 400 });

  // Scoped to the caller's company. This runs with the service role, which bypasses
  // RLS, so without the filter it returned every company's hours — and sent another
  // company's employee names and hours to this company's accountant.
  const { data: hours } = await supabaseAdmin
    .from("job_hours")
    .select("worker_name, date, hours, jobs(title, job_number)")
    .eq("company_id", callerCompanyId)
    .gte("date", start)
    .lte("date", end)
    .order("worker_name");

  const csvRows = ["worker,date,job,hours"];
  const totalsByWorker = {};
  for (const h of hours || []) {
    csvRows.push(`"${h.worker_name}",${h.date},"${(h.jobs?.job_number || "") + " " + (h.jobs?.title || "")}",${h.hours}`);
    totalsByWorker[h.worker_name] = (totalsByWorker[h.worker_name] || 0) + Number(h.hours);
  }
  const csvBase64 = Buffer.from(csvRows.join("\n")).toString("base64");
  const totalsHtml = Object.entries(totalsByWorker).map(([name, total]) => `<tr><td>${name}</td><td>${total}</td></tr>`).join("");

  const settings = await getCompanySettings(callerCompanyId);
  const replyTo = settings.replyTo;

  // Refuse rather than quietly redirect. This used to fall back to the reply-to address
  // when no bookkeeper was configured, which meant the report went to the sender's own
  // inbox and the interface said it had gone to the bookkeeper — so nobody noticed for
  // a whole pay period.
  const accountantEmail = settings.accountantEmail;
  if (!accountantEmail) {
    return new Response(
      "No bookkeeper email is set. Add one under Admin > Company before sending the payroll report.",
      { status: 400 }
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: settings.fromHeader,
      to: [accountantEmail],
      reply_to: replyTo,
      subject: `${settings.companyName} Payroll Hours — ${start} to ${end}`,
      html: `
        <p>Hours report for the pay period ${start} to ${end}.</p>
        <table border="1" cellpadding="6" style="border-collapse:collapse">
          <tr><th>Employee</th><th>Total hours</th></tr>
          ${totalsHtml}
        </table>
        <p>Full detail attached as CSV.</p>
      `,
      attachments: [{ filename: `hours-${start}-to-${end}.csv`, content: csvBase64 }],
    }),
  });

  if (!res.ok) {
    return new Response(`Email failed: ${await res.text()}`, { status: 500 });
  }
  return Response.json({ sent: true, workers: Object.keys(totalsByWorker).length });
}
