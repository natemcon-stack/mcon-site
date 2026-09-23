import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/secrets";

// Resolves the PayPal credentials belonging to a specific company.
//
// These used to come from environment variables — one set per deployment. That was
// correct when the app served one company. It is not correct now: with several
// companies on one deployment, every client payment would have gone to whoever owned
// the environment variables, regardless of which company issued the invoice.
//
// Same shape of mistake as the tax rates that were summed across companies. Anything
// read with the service role has to be scoped by hand, because RLS isn't there to do it.

const LIVE = "https://api-m.paypal.com";
const SANDBOX = "https://api-m.sandbox.paypal.com";

// Returns { clientId, secret, apiBase } or null when the company hasn't set PayPal up.
// Null is a normal state, not an error — the pay page hides the button and offers the
// company's own payment instructions instead.
export async function getPaypalCredentials(companyId) {
  if (!companyId) return null;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data } = await supabaseAdmin
    .from("companies")
    .select("paypal_client_id, paypal_secret_encrypted, paypal_mode")
    .eq("id", companyId)
    .maybeSingle();

  if (!data?.paypal_client_id || !data?.paypal_secret_encrypted) return null;

  const secret = decryptSecret(data.paypal_secret_encrypted);
  // A secret that won't decrypt means the encryption key changed. Treating that as
  // "not configured" is right: better a missing button than a failed charge in front
  // of a client.
  if (!secret) return null;

  return {
    clientId: data.paypal_client_id,
    secret,
    apiBase: data.paypal_mode === "live" ? LIVE : SANDBOX,
  };
}

// A PayPal access token for that company. Returns null rather than throwing so callers
// can fall back cleanly.
export async function getPaypalAccessToken(credentials) {
  try {
    if (!credentials) return null;
    const auth = Buffer.from(`${credentials.clientId}:${credentials.secret}`).toString("base64");
    const res = await fetch(`${credentials.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch (e) {
    return null;
  }
}

// Sandbox and live credentials are not interchangeable, and mixing them fails with an
// unhelpful error at capture time — after the client thinks they've paid. Checked when
// credentials are saved instead.
export async function verifyPaypalCredentials({ clientId, secret, mode }) {
  const apiBase = mode === "live" ? LIVE : SANDBOX;
  const token = await getPaypalAccessToken({ clientId, secret, apiBase });
  if (token) return { ok: true };
  return {
    ok: false,
    error: mode === "live"
      ? "PayPal rejected those live credentials. Check you copied them from a Live app rather than a Sandbox one."
      : "PayPal rejected those sandbox credentials. Check you copied them from a Sandbox app rather than a Live one.",
  };
}
