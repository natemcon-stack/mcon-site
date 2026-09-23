import { createClient } from "@supabase/supabase-js";
import { getCompanySettings } from "@/lib/companySettings";

// Bug reports from inside the app, emailed to whoever maintains it.
//
// Stored as well as emailed: the email is the notification, the table is the record. A
// report that arrives while the mail service is having a bad morning shouldn't vanish.

// Set BUG_REPORT_EMAIL per deployment. With nothing configured the report is still
// saved to the table — better than emailing it to whoever happened to build the app.

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("full_name, role, company_id, is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) return new Response("Unauthorized", { status: 401 });

  const { area, description, pageUrl } = await request.json();
  if (!description?.trim()) return new Response("Describe what happened", { status: 400 });

  // Capped: this is free text from a user and ends up in an email body.
  const safeDescription = String(description).slice(0, 4000);

  const { data: company } = profile.company_id
    ? await supabaseAdmin.from("companies").select("name").eq("id", profile.company_id).maybeSingle()
    : { data: null };

  const { data: saved } = await supabaseAdmin.from("bug_reports").insert([{
    company_id: profile.company_id,
    reported_by: user.id,
    reporter_email: user.email,
    area: (area || "").slice(0, 60) || null,
    description: safeDescription,
    page_url: String(pageUrl || "").slice(0, 300),
    user_agent: (request.headers.get("user-agent") || "").slice(0, 300),
  }]).select().single();

  const to = process.env.BUG_REPORT_EMAIL;
  if (!to) {
    // Stored above regardless, so nothing is lost — there's simply nowhere to send it.
    return Response.json({ ok: true, id: saved?.id, emailed: false });
  }
  const settings = await getCompanySettings(profile.company_id);

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: settings.fromHeader,
        to: [to],
        // Replying reaches the person who reported it, which is usually the next thing
        // you want to do.
        reply_to: user.email,
        subject: `Bug report${company?.name ? ` — ${company.name}` : ""}${area ? ` (${area})` : ""}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:600px;color:#1B2430;">
            <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
              <tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Company</td><td>${escapeHtml(company?.name || "unknown")}</td></tr>
              <tr><td style="padding:3px 12px 3px 0;color:#6b7280;">From</td><td>${escapeHtml(profile.full_name || "")} (${escapeHtml(user.email)}) · ${escapeHtml(profile.role || "")}</td></tr>
              ${area ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Area</td><td>${escapeHtml(area)}</td></tr>` : ""}
              ${pageUrl ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Page</td><td>${escapeHtml(String(pageUrl))}</td></tr>` : ""}
            </table>
            <div style="background:#F4F5F7;border-radius:6px;padding:14px;white-space:pre-wrap;">${escapeHtml(safeDescription)}</div>
            <p style="font-size:12px;color:#9ca3af;margin-top:14px;">${escapeHtml(request.headers.get("user-agent") || "")}</p>
          </div>`,
      }),
    });
  } catch (e) {
    // Saved either way — the report isn't lost because the email didn't go.
  }

  return Response.json({ ok: true, id: saved?.id });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
