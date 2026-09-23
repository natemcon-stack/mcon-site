import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(request, { params }) {
  const limited = rateLimit(request, { name: "doc-view", limit: 60 });
  if (limited) return limited;

  const { token } = params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") === "estimate" ? "estimate" : "invoice";
  const table = kind === "estimate" ? "estimates" : "invoices";

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: doc } = await supabaseAdmin
    .from(table)
    .select("*, jobs(title, address, contacts(name, email, phone, address))")
    .eq("public_token", token)
    .maybeSingle();

  if (!doc) {
    return new Response("Not found", { status: 404 });
  }

  // A token generated before approval shouldn't become a working link the moment it's
  // shared. Same 404 as a bad token — an unapproved document simply doesn't exist as
  // far as the outside world is concerned.
  if (doc.approval_status && doc.approval_status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  const { data: lines } = await supabaseAdmin
    .from("line_items")
    .select("description, quantity, unit, unit_cost, markup_pct, scope_notes, sort_order, line_key")
    .eq("parent_type", kind)
    .eq("parent_id", doc.id)
    .eq("is_material", false)
    .eq("is_tool", false)
    .eq("is_labour", false)
    .order("sort_order");

  // Record that the client opened it. Deliberately not awaited into the response path
  // beyond what's needed — a tracking failure must never stop a client seeing their own
  // invoice. Bot prefetches (link scanners in email clients) are filtered out, otherwise
  // every send would look like it had been read within seconds.
  const userAgent = request.headers.get("user-agent") || "";
  const isBot = /bot|crawler|spider|preview|scanner|slurp|facebookexternalhit|whatsapp|curl|wget|monitor/i.test(userAgent);
  if (!isBot) {
    try {
      await supabaseAdmin.from("document_views").insert([{
        parent_type: kind,
        parent_id: doc.id,
        user_agent: userAgent.slice(0, 300),
        referrer: (request.headers.get("referer") || "").slice(0, 300),
      }]);
      await supabaseAdmin
        .from(table)
        .update({
          first_viewed_at: doc.first_viewed_at || new Date().toISOString(),
          last_viewed_at: new Date().toISOString(),
          view_count: (doc.view_count || 0) + 1,
        })
        .eq("id", doc.id);
    } catch (e) {
      // Tracking is nice to have; showing the document is not optional.
    }
  }

  // Scoped to this document's company. maybeSingle() returns NULL when more than one
  // row matches, so on a multi-company install this was handing every client pay page
  // generic fallbacks instead of the issuing company's letterhead.
  const { data: settings } = await supabaseAdmin
    .from("company_settings").select("*").eq("company_id", doc.company_id).maybeSingle();
  // Scoped to this document's company. The service role bypasses RLS, so without the
  // filter this returned every company's tax rates and the client was charged the sum
  // of all of them.
  const { data: taxRates } = await supabaseAdmin
    .from("tax_rates").select("*").eq("enabled", true)
    .eq("company_id", doc.company_id).order("sort_order");

  // Attachments the client is meant to see. Signed here with the service role and
  // handed over as short-lived URLs, so the storage buckets themselves stay closed to
  // anonymous access — the link to the document is the only credential involved.
  const { data: attachmentRows } = await supabaseAdmin
    .from("document_attachments")
    .select("id, bucket, storage_path, filename, mime_type, caption, sort_order, line_key")
    .eq("parent_type", kind)
    .eq("parent_id", doc.id)
    .order("sort_order");

  const attachments = [];
  for (const row of attachmentRows || []) {
    const { data: signed } = await supabaseAdmin
      .storage.from(row.bucket).createSignedUrl(row.storage_path, 3600);
    if (signed?.signedUrl) {
      attachments.push({
        id: row.id,
        url: signed.signedUrl,
        filename: row.filename,
        mimeType: row.mime_type,
        caption: row.caption,
        // Null means it belongs to the document; otherwise it renders beside its line.
        lineKey: row.line_key || null,
        isImage: (row.mime_type || "").startsWith("image/"),
      });
    }
  }

  const safeDoc = {
    id: doc.id,
    kind,
    amount: doc.amount,
    date: doc.date,
    note: doc.note,
    due_date: doc.due_date,
    payment_status: doc.payment_status,
    po_number: doc.po_number,
    doc_number: doc.doc_number,
    deposit_type: doc.deposit_type,
    deposit_request_amount: doc.deposit_request_amount,
    deposit_request_percent: doc.deposit_request_percent,
    discount_amount: doc.discount_amount,
    markup_pct: doc.markup_pct,
    gst_enabled: doc.gst_enabled,
    tax_exempt: doc.tax_exempt,
    job_title: doc.jobs?.title,
    job_address: doc.jobs?.address,
    contact: doc.jobs?.contacts,
    signature_name: doc.signature_name,
    signed_at: doc.signed_at,
    referral_source: kind === "estimate" ? doc.referral_source : undefined,
  };

  // What has already been paid towards this document.
  //
  // Deposits taken against an ESTIMATE are credited to the invoice that estimate
  // produced, not just to the job — otherwise a client who paid a deposit is shown the
  // full amount again on the invoice and asked to pay twice.
  const { data: payments } = await supabaseAdmin
    .from("deposits")
    .select("id, amount, date, payment_method, invoice_id")
    .eq("job_id", doc.job_id);

  const relevantPayments = (payments || []).filter((p) => {
    if (kind === "invoice") {
      // Paid directly against this invoice, or against the estimate it came from —
      // an estimate deposit has no invoice_id, so it is matched by the job instead.
      return p.invoice_id === doc.id || p.invoice_id == null;
    }
    // On an estimate, only deposits not yet tied to an invoice.
    return p.invoice_id == null;
  });

  const paidToDate = Math.round(
    relevantPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) * 100
  ) / 100;

  // The client id belonging to this document's company, so the pay page loads that
  // company's PayPal rather than the deployment's. Only the public client id is sent —
  // the secret never leaves the server.
  const { data: payCompany } = await supabaseAdmin
    .from("companies")
    .select("paypal_client_id, paypal_secret_encrypted")
    .eq("id", doc.company_id)
    .maybeSingle();

  const paypalClientId = payCompany?.paypal_client_id && payCompany?.paypal_secret_encrypted
    ? payCompany.paypal_client_id
    : null;

  return Response.json({
    paypalClientId,
    paidToDate,
    payments: relevantPayments.map((p) => ({
      amount: Number(p.amount), date: p.date, method: p.payment_method,
    })),
    doc: safeDoc,
    lines: lines || [],
    taxRates: taxRates || [],
    attachments,
    company: settings
      ? {
          wcb_number: settings.wcb_number,
          insurance_provider: settings.insurance_provider,
          insurance_policy_number: settings.insurance_policy_number,
          insurance_amount: settings.insurance_amount,
          business_number: settings.business_number,
          address: settings.address,
          phone: settings.phone,
          website: settings.website,
          payment_terms: settings.payment_terms,
          terms_and_conditions: settings.terms_and_conditions,
          reply_to_email: settings.reply_to_email,
          // Branding needed by the public letterhead. This route deliberately
          // whitelists fields rather than returning the row, so anything new the
          // pay page renders has to be added here explicitly.
          company_name: settings.company_name,
          logo_url: settings.logo_url,
        }
      : null,
  });
}
