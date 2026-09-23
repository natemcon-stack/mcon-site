import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rateLimit";
import { getPaypalCredentials, getPaypalAccessToken } from "@/lib/paypalCredentials";

// Creates a PayPal order server-side. Critically, the amount is looked up from the
// invoice itself using the token — never trusted from the request body — so nothing
// in the browser (including editing the network request directly) can change what
// gets charged.

export async function POST(request) {
  const limited = rateLimit(request, { name: "paypal-create", limit: 15 });
  if (limited) return limited;

  const { token, depositOnly, kind: requestedKind } = await request.json();
  if (!token) return new Response("Missing token", { status: 400 });

  const kind = requestedKind === "estimate" ? "estimate" : "invoice";
  const table = kind === "estimate" ? "estimates" : "invoices";

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: doc } = await supabaseAdmin
    .from(table).select("*").eq("public_token", token).maybeSingle();
  if (!doc) return new Response("Not found", { status: 404 });

  // Same rule as everywhere else a client can reach: an unapproved document is
  // invisible, and certainly not collectable.
  if (doc.approval_status && doc.approval_status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  const { data: lines } = await supabaseAdmin
    .from("line_items").select("*").eq("parent_type", kind).eq("parent_id", doc.id)
    .eq("is_material", false).eq("is_tool", false).eq("is_labour", false);
  // Same scoping as the pay page — this calculates the amount actually charged, so an
  // unscoped query here overcharges the client.
  const { data: taxRates } = await supabaseAdmin
    .from("tax_rates").select("*").eq("enabled", true).eq("company_id", doc.company_id);

  const lineTotal = (l) => Number(l.quantity) * Number(l.unit_cost) * (1 + Number(l.markup_pct) / 100);
  const subtotal = (lines && lines.length) ? lines.reduce((s, l) => s + lineTotal(l), 0) : Number(doc.amount);
  const afterMarkup = subtotal * (1 + Number(doc.markup_pct || 0) / 100);
  const afterDiscount = afterMarkup - Number(doc.discount_amount || 0);
  const applicableTaxes = doc.tax_exempt ? [] : (taxRates || []).filter((t) => doc.gst_enabled !== false || t.name.trim().toUpperCase() !== "GST");
  const total = afterDiscount + applicableTaxes.reduce((s, t) => s + afterDiscount * (Number(t.rate) / 100), 0);

  // An estimate can only ever collect its requested deposit. Charging the full amount
  // for work that hasn't been done — and for a document the client may still be
  // negotiating — isn't something the pay page should be able to do.
  // What has already been paid. A deposit taken against the estimate this invoice came
  // from counts — the client paid it, and charging the full total again is asking them
  // to pay twice.
  const { data: payments } = await supabaseAdmin
    .from("deposits").select("amount, invoice_id").eq("job_id", doc.job_id);

  const paidToDate = Math.round(
    (payments || [])
      .filter((p) => (kind === "invoice" ? (p.invoice_id === doc.id || p.invoice_id == null) : p.invoice_id == null))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0) * 100
  ) / 100;

  let amount;
  if (kind === "estimate") {
    amount = Number(doc.deposit_request_amount || 0);
    if (!amount) return new Response("This estimate has no deposit to pay", { status: 400 });
    // Don't take the same deposit twice if they return to the link.
    amount = Math.round((amount - paidToDate) * 100) / 100;
  } else {
    const gross = depositOnly && doc.deposit_request_amount
      ? Number(doc.deposit_request_amount)
      : total;
    amount = Math.round((gross - paidToDate) * 100) / 100;
  }

  if (amount <= 0.009) {
    // Fully covered already. Refusing is the right answer — a zero or negative charge
    // would fail at PayPal with something far less clear.
    return new Response("This has already been paid in full", { status: 400 });
  }
  if (!Number.isFinite(amount)) return new Response("Invalid amount", { status: 400 });

  // The credentials belonging to the company that issued this document — not the
  // deployment's. Without this, every company's client payments landed in whichever
  // PayPal account the environment variables pointed at.
  const credentials = await getPaypalCredentials(doc.company_id);
  if (!credentials) {
    return new Response("This company hasn't set up online payments", { status: 400 });
  }

  const accessToken = await getPaypalAccessToken(credentials);
  if (!accessToken) {
    // Their credentials are wrong or revoked. Say so plainly rather than letting the
    // PayPal button fail in a way the client can't act on.
    return new Response("Online payment is temporarily unavailable — please contact us", { status: 502 });
  }

  const res = await fetch(`${credentials.apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      // custom_id ties the order to the document it was created for, so the capture
      // step can refuse to record a payment against a different one.
      purchase_units: [{
        custom_id: doc.id,
        amount: { currency_code: "CAD", value: amount.toFixed(2) },
      }],
    }),
  });
  const order = await res.json();
  return Response.json({ id: order.id });
}
