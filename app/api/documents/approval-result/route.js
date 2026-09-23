import { createClient } from "@supabase/supabase-js";
import { getCompanySettings } from "@/lib/companySettings";

// Tells whoever submitted a document that it's been approved or sent back.
//
// The "sent back" case matters most: an admin's note about what needs changing is
// useless if the foreman never sees it, and the alternative is them re-checking the job
// page on the off chance.

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return new Response("Unauthorized", { status: 401 });

  const { kind, id, approved, note } = await request.json();
  const table = kind === "estimate" ? "estimates" : "invoices";

  const { data: doc } = await supabaseAdmin
    .from(table)
    .select("id, doc_number, submitted_by, job_id, jobs(title)")
    .eq("id", id)
    .single();
  if (!doc?.submitted_by) return Response.json({ notified: 0 });

  const { data: submitter } = await supabaseAdmin.auth.admin.getUserById(doc.submitted_by);
  const email = submitter?.user?.email;
  if (!email) return Response.json({ notified: 0 });

  const settings = await getCompanySettings(doc.company_id);
  const label = kind === "estimate" ? "Estimate" : "Invoice";
  const { origin } = new URL(request.url);
  const jobTitle = doc.jobs?.title || "the job";

  const html = approved
    ? `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#1B2430;">
         <p>${label} #${doc.doc_number} for ${escapeHtml(jobTitle)} has been approved.</p>
         <p>You can send it to the client now.</p>
         <a href="${origin}/jobs/${doc.job_id}" style="display:inline-block;background:#E85D2A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Open the job</a>
       </div>`
    : `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#1B2430;">
         <p>${label} #${doc.doc_number} for ${escapeHtml(jobTitle)} needs changes before it goes out.</p>
         <p style="background:#F4F5F7;border-radius:6px;padding:12px;">${escapeHtml(note || "")}</p>
         <a href="${origin}/jobs/${doc.job_id}" style="display:inline-block;background:#E85D2A;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Open the job</a>
       </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: settings.fromHeader,
      to: [email],
      reply_to: settings.replyTo,
      subject: approved
        ? `Approved — ${label} #${doc.doc_number}`
        : `Changes needed — ${label} #${doc.doc_number}`,
      html,
    }),
  });

  if (!res.ok) return Response.json({ notified: 0, emailError: await res.text() });
  return Response.json({ notified: 1 });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
