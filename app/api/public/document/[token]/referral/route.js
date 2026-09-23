import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rateLimit";

// Records how a client heard about the business — only meaningful for estimates
// (the first document a new client usually sees).
export async function POST(request, { params }) {
  const limited = rateLimit(request, { name: "referral", limit: 10 });
  if (limited) return limited;

  const { token } = params;
  const { referral_source } = await request.json();
  if (!referral_source) return new Response("Missing referral_source", { status: 400 });

  // Unauthenticated endpoint — anyone holding a link can post here, so cap what gets
  // stored rather than accepting an arbitrarily large body.
  const value = String(referral_source).slice(0, 200);

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: doc } = await supabaseAdmin.from("estimates").select("id, approval_status").eq("public_token", token).maybeSingle();
  if (!doc) return new Response("Not found", { status: 404 });

  // An unapproved document is invisible to the outside world; these endpoints are
  // reachable with nothing but a link, so they need the same rule as the page itself.
  if (doc.approval_status && doc.approval_status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  await supabaseAdmin.from("estimates").update({ referral_source: value }).eq("id", doc.id);
  return Response.json({ saved: true });
}
