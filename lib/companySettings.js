import { createClient } from "@supabase/supabase-js";
import { withBrandDefaults } from "@/lib/brand";

// Loads one company's settings with the service-role key and layers the env-var brand
// defaults underneath, so every API route resolves the same company name, sender
// address and reply-to without repeating the fallback chain.
//
// The companyId argument is not optional in practice. This used to select the single
// company_settings row with maybeSingle(), which returns null the moment a second
// company exists — so from the day the app went multi-company, every server route
// silently fell back to generic defaults: wrong sender name on client emails, no
// bookkeeper address, no reply-to. It failed quietly, which is why it went unnoticed.
//
// Never throws: a missing row returns defaults rather than breaking a send outright.
export async function getCompanySettings(companyId) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let query = supabaseAdmin.from("company_settings").select("*");
    if (companyId) {
      query = query.eq("company_id", companyId);
    } else {
      // No company given. Rather than return whichever row comes first — which on a
      // multi-company install could be somebody else's letterhead on your invoice —
      // take the oldest, which is the original install, and only when it's alone.
      const { count } = await supabaseAdmin
        .from("company_settings").select("id", { count: "exact", head: true });
      if (count !== 1) return withBrandDefaults(null);
    }

    const { data } = await query.limit(1).maybeSingle();
    return withBrandDefaults(data);
  } catch (e) {
    return withBrandDefaults(null);
  }
}

// The company a signed-in caller belongs to. Saves each route repeating the lookup.
export async function companyIdForToken(token) {
  try {
    if (!token) return null;
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return null;
    const { data } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    return data?.company_id || null;
  } catch (e) {
    return null;
  }
}
