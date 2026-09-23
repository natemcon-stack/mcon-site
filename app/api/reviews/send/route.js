import { createClient } from "@supabase/supabase-js";
import { contactEmails } from "@/lib/contactEmails";
import { getCompanySettings } from "@/lib/companySettings";

// Sends a review-request email for one specific paid invoice. Only ever called when
// an admin explicitly clicks "Send" on the Reviews page — nothing here runs on its
// own or gets triggered automatically by an invoice being marked paid.
async function isAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAdmin(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { invoiceId } = await request.json();
  const { data: invoice } = await supabaseAdmin
    .from("invoices").select("*, jobs(title, contacts(name, email, additional_emails))").eq("id", invoiceId).single();
  if (!invoice) return new Response("Not found", { status: 404 });

  // Every address on the contact, not just the first — some clients are two people.
  const clientEmails = contactEmails(invoice.jobs?.contacts);
  if (!clientEmails.length) return new Response("This contact has no email address on file", { status: 400 });

  const settings = await getCompanySettings(invoice?.company_id);
  if (!settings?.google_review_url) {
    return new Response("Set a Google review link on the Company page first", { status: 400 });
  }
  const replyTo = settings.replyTo;
  const subject = settings.review_email_subject || "How did we do?";
  const bodyMessage = settings.review_email_body || "";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: settings.fromHeader,
      to: clientEmails,
      reply_to: replyTo,
      subject,
      html: `
        <p>Hi ${invoice.jobs?.contacts?.name || ""},</p>
        <p>${bodyMessage}</p>
        <p><a href="${settings.google_review_url}" style="background:#E85D2A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;">Leave a review</a></p>
        <p>Thanks,<br/>${settings.companyName}</p>
      `,
    }),
  });

  if (!res.ok) {
    return new Response(`Email failed to send: ${await res.text()}`, { status: 500 });
  }

  await supabaseAdmin.from("invoices").update({ review_request_sent_at: new Date().toISOString() }).eq("id", invoiceId);

  return Response.json({ sent: true });
}
