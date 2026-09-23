import { createClient } from "@supabase/supabase-js";
import { contactEmails } from "@/lib/contactEmails";
import { buildDocumentEmailHtml } from "@/lib/emailTemplate";
import { getCompanySettings } from "@/lib/companySettings";

// A foreman may send a document that has already been approved — the approval check
// below is what actually protects the client from unfinished work, so the role check
// here only needs to keep this out of an employee's hands.
async function isManagement(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role, is_active").eq("id", user.id).single();
  return Boolean(profile?.is_active) && ["admin", "foreman"].includes(profile?.role);
}

function lineTotal(l) {
  return Number(l.quantity) * Number(l.unit_cost) * (1 + Number(l.markup_pct) / 100);
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isManagement(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { kind, id, to, subject: subjectOverride, body: bodyOverride, ccSelf } = await request.json();
  const table = kind === "estimate" ? "estimates" : "invoices";
  const { data: doc } = await supabaseAdmin
    .from(table).select("*, jobs(title, contacts(name, email, additional_emails))").eq("id", id).single();
  if (!doc) return new Response("Not found", { status: 404 });

  // Nothing unapproved reaches a client. Enforced here rather than only in the UI,
  // because this route is the single point every send goes through — hiding the button
  // would leave the endpoint itself open.
  if (doc.approval_status && doc.approval_status !== "approved") {
    return new Response(
      "This document is waiting on approval and can't be sent yet.",
      { status: 403 }
    );
  }

  const settings = await getCompanySettings(doc.company_id);
  const { data: lines } = await supabaseAdmin
    .from("line_items").select("*").eq("parent_type", kind).eq("parent_id", id)
    .eq("is_material", false).eq("is_tool", false).eq("is_labour", false).order("sort_order");
  const { data: taxRates } = await supabaseAdmin
    .from("tax_rates").select("*").eq("enabled", true)
    .eq("company_id", doc.company_id).order("sort_order");

  const replyTo = settings.replyTo;

  // Never copy in the address we're sending from.
  //
  // A sending address often has no mailbox behind it — it exists to send, not receive.
  // Copying it in means every client email carries a recipient that hard-bounces, and
  // once a provider suppresses that address it suppresses the whole message, taking the
  // actual client with it. The send still reports success, so the failure is invisible:
  // the client simply never hears from you.
  const fromAddress = (settings.fromEmail || "").toLowerCase();
  const ccAddress = (replyTo || "").toLowerCase();
  const canCopySelf = Boolean(ccAddress) && ccAddress !== fromAddress;
  const label = kind === "estimate" ? "Estimate" : "Invoice";

  // An explicit "to" from the sender wins; otherwise every address on the contact.
  const recipients = (to && to.length ? to : contactEmails(doc.jobs?.contacts)).filter(Boolean);
  if (!recipients.length) return new Response("No recipient email address given", { status: 400 });

  const baseSubject = subjectOverride
    || (kind === "estimate" ? settings?.estimate_email_subject : settings?.invoice_email_subject)
    || `${label} from ${settings.companyName}`;
  // Always append the real doc number pulled from the document itself — never typed
  // manually — so the subject line can never drift out of sync with the actual number.
  const subject = subjectOverride ? subjectOverride : `${baseSubject} — ${label} #${doc.doc_number}`;
  const bodyMessage = bodyOverride ?? ((kind === "estimate" ? settings?.estimate_email_body : settings?.invoice_email_body) || "");

  const origin = new URL(request.url).origin;
  const link = `${origin}/pay/${doc.public_token}?kind=${kind}`;
  const logoUrl = settings.logoUrl.startsWith("http") ? settings.logoUrl : `${origin}${settings.logoUrl}`;

  const subtotal = (lines && lines.length) ? lines.reduce((s, l) => s + lineTotal(l), 0) : Number(doc.amount);
  const afterMarkup = subtotal * (1 + Number(doc.markup_pct || 0) / 100);
  const afterDiscount = afterMarkup - Number(doc.discount_amount || 0);
  const applicableTaxes = doc.tax_exempt ? [] : (taxRates || []).filter((t) => doc.gst_enabled !== false || t.name.trim().toUpperCase() !== "GST");
  const taxes = applicableTaxes.map((t) => ({ name: t.name, rate: t.rate, amount: afterDiscount * (Number(t.rate) / 100) }));
  const total = afterDiscount + taxes.reduce((s, t) => s + t.amount, 0);

  // The button invites the client to look at the document, not to pay. Payment options
  // are on the page they land on, where they've had a chance to read what they're paying
  // for — telling someone to "complete" a payment they haven't seen yet is presumptuous
  // and reads as pressure.
  const ctaLabel = kind === "estimate" ? "View Estimate" : "View Invoice";

  const html = buildDocumentEmailHtml({
    logoUrl,
    companyName: settings.companyName,
    companyPhone: settings?.phone,
    companyEmail: replyTo,
    companyAddress: settings?.address,
    label,
    docNumber: doc.doc_number,
    clientName: doc.jobs?.contacts?.name,
    introMessage: bodyMessage,
    lineItems: (lines || []).map((l) => ({ description: l.description, amount: lineTotal(l) })),
    subtotal,
    taxes,
    total,
    depositAmount: doc.deposit_request_amount,
    ctaLabel,
    ctaUrl: link,
    serviceDate: doc.date,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: settings.fromHeader,
      to: recipients,
      cc: ccSelf && canCopySelf ? [replyTo] : undefined,
      reply_to: replyTo,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    return new Response(`Email failed to send: ${await res.text()}`, { status: 500 });
  }

  // Keep Resend's message id against the document. Delivery, opens and bounces all
  // arrive later by webhook and reference this id — without it there's no way to tie a
  // bounce back to the invoice it came from.
  const sent = await res.json().catch(() => ({}));
  await supabaseAdmin.from(table).update({
    last_email_id: sent?.id || null,
    last_emailed_at: new Date().toISOString(),
    last_email_to: recipients[0] || null,
    // Overwritten by the webhook as the message progresses.
    email_status: "sent",
    email_opened_at: null,
  }).eq("id", doc.id);

  await supabaseAdmin.from("document_activity").insert([{ parent_type: kind, parent_id: doc.id, event_type: "emailed" }]);

  return Response.json({ sent: true });
}
