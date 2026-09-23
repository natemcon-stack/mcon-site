import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rateLimit";
import { createInvoiceFromEstimate } from "@/lib/estimateToInvoice";
import { getPaypalCredentials, getPaypalAccessToken } from "@/lib/paypalCredentials";

// Captures the PayPal payment, then — only once PayPal itself confirms the money
// actually moved — records a deposit against the job. The client never gets to
// just "tell" the app a payment succeeded.
export async function POST(request) {
  const limited = rateLimit(request, { name: "paypal-capture", limit: 15 });
  if (limited) return limited;

  const { orderId, token, kind: requestedKind } = await request.json();
  if (!orderId || !token) return new Response("Missing orderId/token", { status: 400 });

  const kind = requestedKind === "estimate" ? "estimate" : "invoice";
  const table = kind === "estimate" ? "estimates" : "invoices";

  const supabaseAdminEarly = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Confirm the document exists and is approved before touching PayPal at all. An
  // unapproved document shouldn't be collectable, and there's no reason to capture
  // money against one.
  const { data: target } = await supabaseAdminEarly
    .from(table).select("id, job_id, approval_status, company_id").eq("public_token", token).maybeSingle();
  if (!target) return new Response("Not found", { status: 404 });
  if (target.approval_status && target.approval_status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  // Captured with the same company's credentials the order was created under. Using a
  // different account's token here would fail, and failing after the client has
  // authorised the payment is the worst place to discover a misconfiguration.
  const credentials = await getPaypalCredentials(target.company_id);
  if (!credentials) return new Response("This company hasn't set up online payments", { status: 400 });

  const accessToken = await getPaypalAccessToken(credentials);
  if (!accessToken) {
    return new Response("Online payment is temporarily unavailable — please contact us", { status: 502 });
  }

  // Read the order before capturing so its custom_id can be checked against the
  // document being paid. Without this, an order created for one document could be
  // captured and recorded against another — the payment is real either way, but it
  // would land on the wrong job's ledger.
  const orderRes = await fetch(`${credentials.apiBase}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const order = await orderRes.json();
  const orderDocId = order?.purchase_units?.[0]?.custom_id;
  if (orderDocId && orderDocId !== target.id) {
    return new Response("That payment doesn't belong to this document", { status: 400 });
  }

  const captureRes = await fetch(`${credentials.apiBase}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const capture = await captureRes.json();

  const status = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.status;
  const amount = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
  if (status !== "COMPLETED") {
    return Response.json({ success: false, status }, { status: 400 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const captureId = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderId;

  // PayPal rejects a second capture of the same order, but a retried request can still
  // reach the recording step twice. Matched on a dedicated column rather than searching
  // the free-text note: % and _ are wildcards in a like pattern, so a capture id
  // carrying either would match an unrelated row and skip recording a real payment.
  const { data: existing } = await supabaseAdmin
    .from("deposits").select("id").eq("paypal_capture_id", captureId).maybeSingle();
  if (existing) {
    return Response.json({ success: true, alreadyRecorded: true, amount });
  }

  const doc = target;
  if (doc) {
    // Company set here as well as by the trigger. This route runs with the service
    // role, so there's no session for the trigger to read a company from — and a row
    // with no company satisfies no policy, which means the payment is recorded and
    // then invisible to everyone.
    const { data: parentJob } = await supabaseAdmin
      .from("jobs").select("company_id").eq("id", doc.job_id).maybeSingle();

    await supabaseAdmin.from("deposits").insert([{
      company_id: parentJob?.company_id || null,
      job_id: doc.job_id,
      // Recorded against the invoice it settled, not just the job. Without this a job
      // with two invoices gives no way to tell which one the money was for.
      invoice_id: kind === "invoice" ? doc.id : null,
      amount: Number(amount),
      date: new Date().toISOString().slice(0, 10),
      payment_method: "paypal",
      // A unique index on this column is the actual guard — two requests arriving at
      // once would both pass the check above, and the second insert fails instead of
      // double-recording the payment.
      paypal_capture_id: captureId,
      // Worth distinguishing on the job's ledger: a deposit paid against an estimate is
      // money in before the work is invoiced.
      note: kind === "estimate"
        ? `PayPal deposit on estimate — order ${orderId}`
        : `PayPal capture ${captureId}`,
    }]);
    await supabaseAdmin.from("document_activity").insert([{
      company_id: parentJob?.company_id || null,
      parent_type: kind, parent_id: doc.id,
      event_type: kind === "estimate" ? "deposit_paid" : "paid",
      meta: { amount, orderId },
    }]);

    // Paying the deposit on an estimate is an acceptance of the work, so it produces
    // the invoice — the same as signing does. Previously only signing did, which left
    // a paid deposit with nothing to bill against.
    if (kind === "estimate") {
      await createInvoiceFromEstimate(doc.id);
    }

    // Marking the invoice itself paid. Previously only a deposit row was written, so
    // an invoice paid in full still showed as unpaid on the job.
    if (kind === "invoice") {
      const { data: inv } = await supabaseAdmin
        .from("invoices").select("amount, payment_status").eq("id", doc.id).maybeSingle();
      // Only when it covers the whole amount — a part payment leaves it outstanding,
      // which is what the deposit row records.
      if (inv && inv.payment_status !== "paid" && Number(amount) >= Number(inv.amount) - 0.01) {
        await supabaseAdmin.from("invoices").update({
          payment_status: "paid",
          paid_date: new Date().toISOString().slice(0, 10),
          payment_method: "paypal",
        }).eq("id", doc.id);
      }
    }

    // A paid subscription invoice means that company's access continues. Done here
    // rather than on a schedule so it resumes the moment the payment lands, not
    // whenever the nightly job next runs.
    if (kind === "invoice") {
      const { data: full } = await supabaseAdmin
        .from("invoices").select("subscription_company_id").eq("id", doc.id).maybeSingle();
      if (full?.subscription_company_id) {
        await supabaseAdmin.from("invoices").update({
          payment_status: "paid",
          paid_date: new Date().toISOString().slice(0, 10),
          payment_method: "paypal",
        }).eq("id", doc.id);
        await supabaseAdmin.from("companies").update({
          subscription_status: "active",
          restricted_at: null,
          trial_ends_at: null,
        }).eq("id", full.subscription_company_id);
      }
    }
  }

  return Response.json({ success: true });
}
