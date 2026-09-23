import { createClient } from "@supabase/supabase-js";

// Sets a company's price, billing period and status. Operator only.
//
// Price deliberately isn't chosen at signup — it's set here, per company, so it can be
// negotiated and so nobody can pick their own by editing the request.

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !allowed.includes(user.email.toLowerCase())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { companyId, price, billingPeriod, status, nextRenewal } = await request.json();
  if (!companyId) return new Response("Missing companyId", { status: 400 });

  const patch = {};
  if (price !== undefined) patch.price = price === null || price === "" ? null : Number(price);
  if (billingPeriod) patch.billing_period = billingPeriod === "annual" ? "annual" : "monthly";
  if (nextRenewal !== undefined) patch.next_renewal_at = nextRenewal || null;
  if (status) {
    patch.subscription_status = status;
    // Marking someone active by hand should clear a restriction too — otherwise they'd
    // stay blocked from raising invoices despite being marked paid.
    if (status === "active" || status === "comped") patch.restricted_at = null;
  }

  const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", companyId);
  if (error) return new Response(error.message, { status: 500 });

  return Response.json({ ok: true });
}
