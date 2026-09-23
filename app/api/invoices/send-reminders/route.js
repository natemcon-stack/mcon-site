import { createClient } from "@supabase/supabase-js";
import { contactEmails } from "@/lib/contactEmails";
import { isCronRequest } from "@/lib/cronAuth";
import { buildDocumentEmailHtml } from "@/lib/emailTemplate";
import { getCompanySettings } from "@/lib/companySettings";

// Runs daily (see vercel.json). Sends a reminder for any invoice that's overdue,
// unpaid, and has reminders toggled on — at most once every 7 days per invoice.
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

function lineTotal(l) {
  return Number(l.quantity) * Number(l.unit_cost) * (1 + Number(l.markup_pct) / 100);
}

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAuthorized(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: overdue } = await supabaseAdmin
    .from("invoices")
    .select("*, jobs(title, contacts(name, email, additional_emails))")
    .eq("send_reminders", true)
    .neq("payment_status", "paid")
    .lt("due_date", today)
    // sevenDaysAgo is computed here from the clock and never touched by a request, so
    // there is nothing user-controlled in this filter expression.
    .or(`last_reminder_sent.is.null,last_reminder_sent.lte.${sevenDaysAgo}`);

  // Settings are per company, so they're looked up inside the loop and cached — this
  // cron runs across every company on the platform, and one shared "the settings" would
  // put one company's letterhead and reply-to on another's reminder.
  const settingsCache = new Map();
  async function settingsFor(companyId) {
    if (!settingsCache.has(companyId)) {
      settingsCache.set(companyId, await getCompanySettings(companyId));
    }
    return settingsCache.get(companyId);
  }

  const origin = new URL(request.url).origin;
  const logoUrl = `${origin}/logo.png`;

  let sent = 0;
  for (const inv of overdue || []) {
    const clientEmails = contactEmails(inv.jobs?.contacts);
    const clientEmail = clientEmails[0];
    if (!clientEmail) continue;

    const settings = await settingsFor(inv.company_id);
    const replyTo = settings.replyTo;
    // Tax rates are per company too — a reminder that restates a total has to use the
    // rates the invoice was raised under.
    const { data: taxRates } = await supabaseAdmin
      .from("tax_rates").select("*").eq("enabled", true).eq("company_id", inv.company_id).order("sort_order");

    const link = `${origin}/pay/${inv.public_token}?kind=invoice`;

    const { data: lines } = await supabaseAdmin
      .from("line_items").select("*").eq("parent_type", "invoice").eq("parent_id", inv.id)
      .eq("is_material", false).eq("is_tool", false).eq("is_labour", false).order("sort_order");

    const subtotal = (lines && lines.length) ? lines.reduce((s, l) => s + lineTotal(l), 0) : Number(inv.amount);
    const afterMarkup = subtotal * (1 + Number(inv.markup_pct || 0) / 100);
    const afterDiscount = afterMarkup - Number(inv.discount_amount || 0);
    const applicableTaxes = inv.tax_exempt ? [] : (taxRates || []).filter((t) => inv.gst_enabled !== false || t.name.trim().toUpperCase() !== "GST");
    const taxes = applicableTaxes.map((t) => ({ name: t.name, rate: t.rate, amount: afterDiscount * (Number(t.rate) / 100) }));
    const total = afterDiscount + taxes.reduce((s, t) => s + t.amount, 0);

    const html = buildDocumentEmailHtml({
      logoUrl,
      companyName: settings.companyName,
      companyPhone: settings?.phone,
      companyEmail: replyTo,
      companyAddress: settings?.address,
      label: "Invoice",
      docNumber: inv.doc_number,
      clientName: inv.jobs?.contacts?.name,
      introMessage: `This is a friendly reminder that your invoice (due ${inv.due_date}) hasn't been paid yet. If you've already sent payment another way, no action needed — thanks!`,
      lineItems: (lines || []).map((l) => ({ description: l.description, amount: lineTotal(l) })),
      subtotal,
      taxes,
      total,
      depositAmount: inv.payment_status === "unpaid" ? inv.deposit_request_amount : null,
      ctaLabel: "View Invoice",
      ctaUrl: link,
      serviceDate: inv.date,
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: settings.fromHeader,
        to: clientEmails,
        reply_to: replyTo,
        subject: `Payment reminder — Invoice #${inv.doc_number} from ${settings.companyName} (${inv.jobs?.title || ""})`,
        html,
      }),
    });

    if (res.ok) {
      await supabaseAdmin.from("invoices").update({ last_reminder_sent: today }).eq("id", inv.id);
      sent++;
    }
  }

  return Response.json({ sent });
}
