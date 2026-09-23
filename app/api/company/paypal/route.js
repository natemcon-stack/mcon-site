import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/secrets";
import { verifyPaypalCredentials } from "@/lib/paypalCredentials";

// Saves a company's own PayPal credentials, after checking PayPal accepts them.
//
// Verified before saving on purpose: bad credentials otherwise fail at capture time,
// after a client has authorised a payment. That's the worst possible moment to find
// out, and the most common cause is copying a Sandbox app's keys into Live mode.
//
// The secret is encrypted at rest and never sent back to the browser. An admin can
// replace it but not read it.

async function requireCompanyAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active, company_id").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || profile.role !== "admin" || !profile.company_id) return null;
  return profile.company_id;
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const companyId = await requireCompanyAdmin(request, supabaseAdmin);
  if (!companyId) return new Response("Unauthorized", { status: 401 });

  const { clientId, secret, mode, disconnect } = await request.json();

  if (disconnect) {
    await supabaseAdmin.from("companies").update({
      paypal_client_id: null,
      paypal_secret_encrypted: null,
    }).eq("id", companyId);
    return Response.json({ ok: true, connected: false });
  }

  if (!clientId?.trim()) return new Response("Enter your PayPal Client ID", { status: 400 });
  if (!secret?.trim()) return new Response("Enter your PayPal Secret", { status: 400 });

  const check = await verifyPaypalCredentials({
    clientId: clientId.trim(),
    secret: secret.trim(),
    mode: mode === "live" ? "live" : "sandbox",
  });
  if (!check.ok) return new Response(check.error, { status: 400 });

  let encrypted;
  try {
    encrypted = encryptSecret(secret.trim());
  } catch (e) {
    // Missing or malformed encryption key. Refuse rather than store a secret in the
    // clear, and say what's wrong so it can be fixed.
    return new Response(
      "The app isn't configured to store secrets securely yet (SECRET_ENCRYPTION_KEY). Nothing was saved.",
      { status: 500 }
    );
  }

  const { error } = await supabaseAdmin.from("companies").update({
    paypal_client_id: clientId.trim(),
    paypal_secret_encrypted: encrypted,
    paypal_mode: mode === "live" ? "live" : "sandbox",
  }).eq("id", companyId);

  if (error) return new Response(`Couldn't save that: ${error.message}`, { status: 500 });

  return Response.json({ ok: true, connected: true, mode: mode === "live" ? "live" : "sandbox" });
}
