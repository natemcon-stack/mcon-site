import { createClient } from "@supabase/supabase-js";
import { getCompanySettings } from "@/lib/companySettings";

// Emails every admin when a foreman submits an estimate or invoice for approval.
//
// Without this the queue is only found by going to look at it, which means a document
// can sit unapproved for days while whoever wrote it assumes it went out. The email is
// deliberately internal — recipients are pulled from admin accounts, never from the
// client record — and it carries no pricing beyond the total, since it's a nudge to go
// and review the thing rather than a substitute for reviewing it.

async function requireManagement(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, full_name, is_active").eq("id", user.id).single();
  if (!profile?.is_active || !["admin", "foreman"].includes(profile.role)) return null;
  return { user, profile };
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const caller = await requireManagement(request, supabaseAdmin);
  if (!caller) return new Response("Unauthorized", { status: 401 });

  const { kind, id } = await request.json();
  const table = kind === "estimate" ? "estimates" : "invoices";

  const { data: doc } = await supabaseAdmin
    .from(table)
    .select("id, doc_number, amount, date, job_id, jobs(title, contacts(name))")
    .eq("id", id)
    .single();
  if (!doc) return new Response("Not found", { status: 404 });

  // Admin accounts only. auth.admin.listUsers is the only way to reach the addresses,
  // since profiles doesn't store them.
  const { data: admins } = await supabaseAdmin
    .from("profiles").select("id").eq("role", "admin").eq("is_active", true);
  if (!admins?.length) return Response.json({ notified: 0 });

  const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
  const adminIds = new Set(admins.map((a) => a.id));
  const recipients = (userList?.users || [])
    .filter((u) => adminIds.has(u.id) && u.email)
    // No point emailing the person who just submitted it.
    .filter((u) => u.id !== caller.user.id)
    .map((u) => u.email);

  if (!recipients.length) return Response.json({ notified: 0 });

  const settings = await getCompanySettings(caller.profile.company_id);
  const label = kind === "estimate" ? "Estimate" : "Invoice";
  const submitter = caller.profile.full_name || "A foreman";
  const { origin } = new URL(request.url);
  const amount = `$${Number(doc.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;color:#1B2430;">
      <p style="margin:0 0 12px 0;">${escapeHtml(submitter)} submitted a ${label.toLowerCase()} for approval.</p>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr><td style="padding:3px 12px 3px 0;color:#6b7280;">${label}</td><td>#${escapeHtml(String(doc.doc_number || ""))}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Job</td><td>${escapeHtml(doc.jobs?.title || "Untitled")}</td></tr>
        ${doc.jobs?.contacts?.name ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Client</td><td>${escapeHtml(doc.jobs.contacts.name)}</td></tr>` : ""}
        <tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Total</td><td>${amount}</td></tr>
      </table>
      <a href="${origin}/admin/approvals"
         style="display:inline-block;background:#E85D2A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">
        Review it
      </a>
      <p style="margin:16px 0 0 0;font-size:12px;color:#6b7280;">
        Nothing has gone to the client. It can't be sent until you approve it.
      </p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: settings.fromHeader,
      to: recipients,
      reply_to: settings.replyTo,
      subject: `Approval needed — ${label} #${doc.doc_number} (${doc.jobs?.title || "job"})`,
      html,
    }),
  });

  if (!res.ok) {
    // The submission itself already succeeded; a failed notification shouldn't undo it
    // or surface as an error to the person submitting.
    return Response.json({ notified: 0, emailError: await res.text() });
  }

  return Response.json({ notified: recipients.length });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
