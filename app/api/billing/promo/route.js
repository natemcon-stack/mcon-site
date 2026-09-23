import { createClient } from "@supabase/supabase-js";

// Applies a promo code to an existing company.
//
// Checked entirely server-side with the service role. The promo_codes table has no
// client-readable policy at all, so a wrong guess reveals nothing about which codes
// exist or how many uses are left — the response says only whether this one worked.

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
    .from("profiles").select("role, company_id, is_active").eq("id", user.id).maybeSingle();
  // Deliberately allowed while the company is locked out — this page is how they get
  // back in. Being an active admin of the company is the requirement, not the
  // subscription being current.
  if (!profile?.is_active || profile.role !== "admin" || !profile.company_id) {
    return new Response("Only a company administrator can apply a code", { status: 403 });
  }

  const code = String((await request.json())?.code || "").trim().toUpperCase();
  if (!code) return new Response("Enter a code", { status: 400 });

  const { data: promo } = await supabaseAdmin
    .from("promo_codes").select("*").eq("code", code).maybeSingle();

  if (!promo) return new Response("That code isn't recognised", { status: 400 });
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return new Response("That code has expired", { status: 400 });
  }
  if (promo.max_uses != null && promo.times_used >= promo.max_uses) {
    return new Response("That code has already been used its maximum number of times", { status: 400 });
  }

  const { data: company } = await supabaseAdmin
    .from("companies").select("*").eq("id", profile.company_id).single();

  // Using the same code twice shouldn't stack months or burn another use.
  if (company.promo_code === promo.code) {
    return new Response("That code is already applied to your account", { status: 400 });
  }

  let patch;
  let message;
  if (promo.kind === "comped") {
    patch = { subscription_status: "comped", trial_ends_at: null, promo_code: promo.code };
    message = "Applied — your account has complimentary access with no end date.";
  } else {
    // Extend from whichever is later: an unexpired trial keeps its remaining time
    // rather than being reset to a shorter window.
    const base = company.trial_ends_at && new Date(company.trial_ends_at) > new Date()
      ? new Date(company.trial_ends_at)
      : new Date();
    base.setMonth(base.getMonth() + (promo.months || 1));
    patch = {
      subscription_status: "trialing",
      trial_ends_at: base.toISOString(),
      promo_code: promo.code,
    };
    message = `Applied — your trial now runs to ${base.toLocaleDateString()}.`;
  }

  const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", company.id);
  if (error) return new Response(`Couldn't apply that: ${error.message}`, { status: 500 });

  await supabaseAdmin.from("promo_codes")
    .update({ times_used: promo.times_used + 1 }).eq("code", promo.code);

  return Response.json({ ok: true, message });
}
