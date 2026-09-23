import { createClient } from "@supabase/supabase-js";

// Creates a new company and its first admin in one step.
//
// Runs with the service role because it has to write across two tables before the
// person has any identity to authorise with — there's no session yet, and the company
// they're about to belong to doesn't exist. Everything after this is ordinary
// company-scoped access.
//
// Deliberately no email confirmation step: corporate mail security eats single-use
// links, and that lesson cost enough already. The account works immediately and the
// address is confirmed on creation.

const TRIAL_MONTHS = 2;

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { companyName, fullName, email, password, promoCode, billingPeriod } = await request.json();

  if (!companyName?.trim()) return new Response("Company name is required", { status: 400 });
  if (!email?.trim()) return new Response("Email is required", { status: 400 });
  if (!password || String(password).length < 8) {
    return new Response("Password must be at least 8 characters", { status: 400 });
  }

  // Checked before anything is created, so a bad code doesn't leave a half-made company
  // behind. An unrecognised code is rejected rather than ignored — silently downgrading
  // someone to a plain trial when they typed a code is a support call waiting to happen.
  let promo = null;
  const code = (promoCode || "").trim().toUpperCase();
  if (code) {
    const { data } = await supabaseAdmin
      .from("promo_codes").select("*").eq("code", code).maybeSingle();

    if (!data) return new Response("That promo code isn't recognised", { status: 400 });
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return new Response("That promo code has expired", { status: 400 });
    }
    if (data.max_uses != null && data.times_used >= data.max_uses) {
      return new Response("That promo code has already been used its maximum number of times", { status: 400 });
    }
    promo = data;
  }

  // Reject a duplicate address up front. createUser would fail anyway, but its message
  // is opaque and the company would already exist by then.
  const { data: existingList } = await supabaseAdmin.auth.admin.listUsers();
  if ((existingList?.users || []).some((u) => (u.email || "").toLowerCase() === email.toLowerCase())) {
    return new Response("An account already exists for that email address", { status: 400 });
  }

  const trialEnds = new Date();
  trialEnds.setMonth(trialEnds.getMonth() + (promo?.kind === "trial_extension" ? (promo.months || TRIAL_MONTHS) : TRIAL_MONTHS));

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .insert([{
      name: companyName.trim(),
      subscription_status: promo?.kind === "comped" ? "comped" : "trialing",
      trial_ends_at: promo?.kind === "comped" ? null : trialEnds.toISOString(),
      promo_code: promo?.code || null,
      billing_period: billingPeriod === "annual" ? "annual" : "monthly",
      // Price is left null on purpose: it's set per company by the operator, so nobody
      // can pick their own by editing the request.
      next_renewal_at: promo?.kind === "comped" ? null : trialEnds.toISOString().slice(0, 10),
    }])
    .select()
    .single();

  if (companyError) {
    return new Response(`Couldn't create the company: ${companyError.message}`, { status: 500 });
  }

  const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password: String(password),
    email_confirm: true,
    user_metadata: { full_name: fullName || null },
  });

  if (userError) {
    // Don't leave an orphaned company sitting there — the address is now free to retry.
    await supabaseAdmin.from("companies").delete().eq("id", company.id);
    return new Response(`Couldn't create the account: ${userError.message}`, { status: 500 });
  }

  // A trigger creates the profile row when the auth user appears, so this updates
  // rather than inserts — and sets the company and admin role in one go.
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert([{
    id: created.user.id,
    full_name: fullName || null,
    role: "admin",
    is_active: true,
    company_id: company.id,
  }], { onConflict: "id" });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    await supabaseAdmin.from("companies").delete().eq("id", company.id);
    return new Response(`Couldn't set up the account: ${profileError.message}`, { status: 500 });
  }

  // A fresh company starts with nothing but its own name and sensible tax defaults.
  // Every template field is set to null explicitly, not left to the column defaults.
  // Those defaults were originally written with one company's own wording and address,
  // so a new company inherited them — and an unedited template would have sent a client
  // email under the wrong company's name with replies going to the wrong inbox.
  //
  // Null is the right value: the code falls back to this company's own name.
  await supabaseAdmin.from("company_settings").insert([{
    company_id: company.id,
    company_name: companyName.trim(),
    reply_to_email: null,
    estimate_email_subject: null,
    estimate_email_body: null,
    invoice_email_subject: null,
    invoice_email_body: null,
    review_email_subject: null,
    review_email_body: null,
  }]);
  await supabaseAdmin.from("tax_rates").insert([
    { company_id: company.id, name: "GST", rate: 5, enabled: true, sort_order: 0 },
  ]);

  if (promo) {
    await supabaseAdmin.from("promo_codes")
      .update({ times_used: promo.times_used + 1 }).eq("code", promo.code);
  }

  // Tell the operator someone signed up. Best-effort and last — a mail failure must not
  // undo an account that was created successfully.
  const notify = process.env.PLATFORM_ADMIN_EMAILS?.split(",")[0]?.trim();
  if (notify && process.env.RESEND_API_KEY) {
    try {
      const { origin } = new URL(request.url);
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Signups <office@${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "example.com"}>`,
          to: [notify],
          reply_to: email.trim(),
          subject: `New signup — ${companyName.trim()}`,
          html: `<div style="font-family:system-ui,sans-serif;color:#1B2430;">
            <p><strong>${escapeHtml(companyName.trim())}</strong> just signed up.</p>
            <p style="font-size:14px;">
              ${escapeHtml(fullName || "")} &lt;${escapeHtml(email.trim())}&gt;<br/>
              ${promo ? `Code: ${escapeHtml(promo.code)}<br/>` : ""}
              ${company.trial_ends_at ? `Trial ends ${new Date(company.trial_ends_at).toLocaleDateString()}` : "Complimentary access"}
            </p>
            <a href="${origin}/platform" style="display:inline-block;background:#E85D2A;color:#fff;
               text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:bold;">All companies</a>
          </div>`,
        }),
      });
    } catch (e) {
      // The account exists either way.
    }
  }

  return Response.json({
    ok: true,
    companyId: company.id,
    status: company.subscription_status,
    trialEndsAt: company.trial_ends_at,
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
