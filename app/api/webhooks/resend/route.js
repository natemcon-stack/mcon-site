import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Receives delivery events from Resend: delivered, opened, bounced, complained.
//
// This is what turns "the email was accepted for sending" into something you can act
// on. A bounce is the useful one — an invoice sent to a dead address looks identical to
// one being ignored, and the difference is a phone call versus a wasted fortnight.
//
// Opens are recorded but treated as soft evidence, not proof. Mail clients that proxy
// images (Gmail) can register an open the recipient never made, and Apple Mail Privacy
// Protection deliberately opens everything on the recipient's behalf. An open means
// "possibly read"; no open means very little either way. The pay-page view tracking
// already in place is the stronger signal, because that's a deliberate click.
//
// Setup: Resend dashboard > Webhooks > add this URL, subscribe to email.delivered,
// email.opened, email.bounced and email.complained, then put the signing secret in
// RESEND_WEBHOOK_SECRET. Open tracking also has to be switched on in Resend for
// email.opened to ever fire.

export async function POST(request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await request.text();

  // Without a configured secret this endpoint would accept anything from anyone —
  // including forged bounces that mark real invoices undeliverable. Fail closed.
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  if (!verifySignature(request, body, secret)) {
    return new Response("Bad signature", { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch (e) {
    return new Response("Bad payload", { status: 400 });
  }

  const messageId = event?.data?.email_id || event?.data?.id;
  if (!messageId) return Response.json({ ignored: true });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let status = {
    "email.delivered": "delivered",
    "email.opened": "opened",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.delivery_delayed": "delayed",
    "email.failed": "failed",
  }[event?.type];

  // Suppression is the quiet one. Resend blocks sending to an address that previously
  // hard-bounced or was marked as spam, and the send reports success — so without this
  // the document sits on "Emailed" forever and nobody knows the client never got it.
  const message = String(event?.data?.message || event?.data?.reason || "");
  if (/suppress/i.test(message) || event?.type === "email.suppressed") {
    status = "suppressed";
  }

  if (!status) return Response.json({ ignored: true });

  // The message id could belong to either table, so try both. Only one will match.
  for (const table of ["estimates", "invoices"]) {
    const patch = { email_status: status };
    if (status === "opened") patch.email_opened_at = new Date().toISOString();

    // A later delivered event shouldn't overwrite an earlier opened one — delivery and
    // open can arrive out of order, and "opened" is the more informative state.
    // Failure states are never overwritten by anything: a bounce or suppression is the
    // thing that needs acting on, and burying it under a later event defeats the point.
    const { data: existing } = await supabaseAdmin
      .from(table).select("id, email_status").eq("last_email_id", messageId).maybeSingle();
    if (!existing) continue;
    if (existing.email_status === "opened" && status === "delivered") {
      return Response.json({ ok: true, skipped: "already opened" });
    }
    if (["bounced", "suppressed", "complained"].includes(existing.email_status)
        && !["bounced", "suppressed", "complained"].includes(status)) {
      return Response.json({ ok: true, skipped: "failure state is sticky" });
    }

    await supabaseAdmin.from(table).update(patch).eq("id", existing.id);
    await supabaseAdmin.from("document_activity").insert([{
      parent_type: table === "estimates" ? "estimate" : "invoice",
      parent_id: existing.id,
      event_type: `email_${status}`,
      meta: { messageId },
    }]);
    return Response.json({ ok: true, table, status });
  }

  return Response.json({ ignored: true, reason: "no matching document" });
}

// Resend signs webhooks with the Svix scheme: HMAC-SHA256 over "<id>.<timestamp>.<body>"
// using the secret after its "whsec_" prefix, base64-encoded. Verified manually rather
// than pulling in the svix package for one function.
function verifySignature(request, body, secret) {
  try {
    const id = request.headers.get("svix-id");
    const timestamp = request.headers.get("svix-timestamp");
    const signatureHeader = request.headers.get("svix-signature");
    if (!id || !timestamp || !signatureHeader) return false;

    // Reject anything older than five minutes so a captured request can't be replayed.
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) return false;

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = crypto
      .createHmac("sha256", key)
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");

    // The header can carry several space-separated "v1,<sig>" values during a secret
    // rotation, so any match counts.
    return signatureHeader.split(" ").some((part) => {
      const value = part.split(",")[1];
      if (!value) return false;
      const a = Buffer.from(value);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
  } catch (e) {
    return false;
  }
}
