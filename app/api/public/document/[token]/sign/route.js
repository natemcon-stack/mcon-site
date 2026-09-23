import { createClient } from "@supabase/supabase-js";
import { createInvoiceFromEstimate } from "@/lib/estimateToInvoice";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(request, { params }) {
  const limited = rateLimit(request, { name: "sign", limit: 10 });
  if (limited) return limited;

  const { token } = params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") === "estimate" ? "estimate" : "invoice";
  const table = kind === "estimate" ? "estimates" : "invoices";

  const { signature_name } = await request.json();
  if (!signature_name || !String(signature_name).trim()) {
    return new Response("Signature name required", { status: 400 });
  }
  // Unauthenticated input from whoever holds the link — cap it rather than storing
  // whatever arrives.
  const signatureName = String(signature_name).trim().slice(0, 120);

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: doc } = await supabaseAdmin.from(table).select("*").eq("public_token", token).maybeSingle();
  if (!doc) return new Response("Not found", { status: 404 });

  // An unapproved document doesn't exist as far as the outside world is concerned.
  // The public GET already 404s it, but this is a separate endpoint and was reachable
  // by anyone who'd been sent the link while the document was still a draft.
  if (doc.approval_status && doc.approval_status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  // Signing twice is the interesting case: with auto_generate_invoice set, every
  // repeat POST used to mint another invoice. There's no legitimate reason to re-sign,
  // so treat an already-signed document as done and return success without doing
  // anything again.
  if (doc.signed_at) {
    return Response.json({ signed: true, alreadySigned: true });
  }

  // Conditional on signed_at still being null: two requests arriving together would
  // otherwise both pass the check above and both proceed to create an invoice.
  const { data: updated } = await supabaseAdmin
    .from(table)
    .update({ signature_name: signatureName, signed_at: new Date().toISOString() })
    .eq("id", doc.id)
    .is("signed_at", null)
    .select("id");

  // Lost the race — another request signed it a moment ago.
  if (!updated || updated.length === 0) {
    return Response.json({ signed: true, alreadySigned: true });
  }

  await supabaseAdmin.from("document_activity").insert([{
    parent_type: kind, parent_id: doc.id, event_type: "signed", meta: { signature_name: signatureName },
  }]);

  // Signing an estimate accepts the work, so it produces the invoice. Shared with the
  // deposit-payment path — both mean acceptance, and the helper refuses to create a
  // second invoice if the other one got there first.
  if (kind === "estimate" && doc.auto_generate_invoice) {
    await createInvoiceFromEstimate(doc.id);
  }

  return Response.json({ signed: true });
}
