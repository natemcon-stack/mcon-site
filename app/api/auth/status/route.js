import { createClient } from "@supabase/supabase-js";

// Reports whether the signed-in account still exists and is still active.
//
// This has to be a server route using the service role. Since the security sweep,
// "read profiles" is gated on is_active(), which means a deactivated person reading
// their own profile row gets nothing back — indistinguishable, from the browser, from
// a brand-new account whose row hasn't been created yet. AuthGate treated that ambiguity
// as "new user, let them in", so deactivating someone left them able to open pages
// (empty ones, since every other policy denied them, but pages nonetheless).
//
// Reading with the service role sidesteps RLS entirely, so the answer is unambiguous.

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return Response.json({ signedIn: false, active: false });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return Response.json({ signedIn: false, active: false });

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active, full_name, company_id").eq("id", user.id).maybeSingle();

  // No row at all is a genuinely new account — a trigger creates one on signup, but a
  // first login racing that trigger shouldn't be thrown out.
  if (!profile) {
    return Response.json({ signedIn: true, active: true, isNew: true, role: "employee" });
  }

  // Subscription state travels with the session check so the app only has to ask once.
  // An expired company keeps its login and its data — it just can't use the app until
  // it's paid for. Locking someone out of their own records over a lapsed card would be
  // a hostage situation, not a paywall.
  let subscription = { status: "active", locked: false };
  if (profile.company_id) {
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name, subscription_status, trial_ends_at, current_period_end, restricted_at")
      .eq("id", profile.company_id)
      .maybeSingle();

    if (company) {
      const trialEnded = company.trial_ends_at && new Date(company.trial_ends_at) < new Date();
      const locked =
        company.subscription_status === "expired" ||
        company.subscription_status === "cancelled" ||
        (company.subscription_status === "trialing" && trialEnded);

      subscription = {
        status: company.subscription_status,
        // Past due: they keep everything they've entered and can still be paid by their
        // own clients — they just can't raise anything new until the invoice is settled.
        restricted: Boolean(company.restricted_at),
        companyName: company.name,
        trialEndsAt: company.trial_ends_at,
        daysLeft: company.trial_ends_at
          ? Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000)
          : null,
        locked,
      };
    }
  }

  return Response.json({
    signedIn: true,
    active: profile.is_active !== false,
    role: profile.role,
    fullName: profile.full_name,
    companyId: profile.company_id,
    // No company means signup didn't finish — there's nothing for them to see.
    needsCompany: !profile.company_id,
    subscription,
  });
}
