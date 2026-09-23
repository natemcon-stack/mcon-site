import { createClient } from "@supabase/supabase-js";
import { refreshAccessToken, processGmailMessage } from "@/lib/gmailReceiptProcessor";
import { findDuplicate } from "@/lib/duplicateReceipt";

// A rescan downloads and parses one PDF; 60s was tight when the attachment is large.
export const maxDuration = 120;

async function isAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  // A foreman needs this for receipt scanning.
  return ["admin", "foreman"].includes(profile?.role);
}

// Re-runs the full extraction pipeline (PDF/OCR/link) on a receipt already sitting
// in the database — for receipts that were scanned before those features existed,
// or that came up empty the first time and might do better on a second pass.
export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAdmin(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { receiptId } = await request.json();
  const { data: receipt } = await supabaseAdmin.from("gmail_receipts").select("*").eq("id", receiptId).single();
  if (!receipt) return new Response("Not found", { status: 404 });

  const { data: connection } = await supabaseAdmin.from("gmail_connections").select("*").eq("user_id", receipt.user_id).maybeSingle();
  if (!connection) return new Response("No Gmail connection found for this receipt", { status: 400 });

  const accessToken = await refreshAccessToken(connection.refresh_token);
  if (!accessToken) return new Response("Couldn't refresh Gmail access", { status: 500 });

  const [{ data: estimatesWithPo }, { data: invoicesWithPo }] = await Promise.all([
    // Scoped to the receipt's own company — two companies can use the same PO number.
    supabaseAdmin.from("estimates").select("po_number, job_id")
      .eq("company_id", receipt.company_id).not("po_number", "is", null),
    supabaseAdmin.from("invoices").select("po_number, job_id")
      .eq("company_id", receipt.company_id).not("po_number", "is", null),
  ]);
  const jobByPo = {};
  [...(estimatesWithPo || []), ...(invoicesWithPo || [])].forEach((d) => {
    if (d.po_number) jobByPo[d.po_number.trim().toLowerCase()] = d.job_id;
  });

  const result = await processGmailMessage({ accessToken, msgId: receipt.gmail_message_id, supabaseAdmin });
  const matchedJobId = result.matched_po_number ? jobByPo[result.matched_po_number.toLowerCase()] : null;

  // A rescan is usually what finally produces an amount, so the duplicate check is
  // worth redoing here — the first pass may have had nothing to compare on.
  const duplicate = await findDuplicate({
    supabaseAdmin,
    candidate: {
      id: receipt.id,
      gmail_message_id: receipt.gmail_message_id,
      from_email: receipt.from_email,
      subject: receipt.subject,
      extracted_amount: result.extracted_amount,
      matched_po_number: result.matched_po_number,
      received_at: receipt.received_at,
      linked_expense_id: receipt.linked_expense_id,
    },
  });

  await supabaseAdmin.from("gmail_receipts").update({
    extracted_amount: result.extracted_amount,
    extracted_gst: result.extracted_gst,
    extracted_pst: result.extracted_pst,
    extracted_date: result.extracted_date,
    parse_warnings: result.parse_warnings?.length ? result.parse_warnings : null,
    extracted_currency: result.extracted_currency,
    matched_po_number: result.matched_po_number,
    linked_job_id: matchedJobId || receipt.linked_job_id,
    attachment_path: result.attachment_path || receipt.attachment_path,
    ...duplicate,
  }).eq("id", receiptId);

  return Response.json({
    usedMethod: result.usedMethod,
    amount: result.extracted_amount,
    gst: result.extracted_gst,
    duplicateReason: duplicate.duplicate_reason,
  });
}
