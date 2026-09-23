import { createClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cronAuth";
import { refreshAccessToken, processGmailMessage } from "@/lib/gmailReceiptProcessor";
import { findDuplicate } from "@/lib/duplicateReceipt";

// Vercel Pro allows up to 300s. Sixty wasn't enough once PDFs were actually being
// downloaded and parsed — the run hit the limit and died with a 504, losing everything
// it had found rather than saving the receipts it had already read.
export const maxDuration = 300;

// Stop well before the platform kills the function, so whatever has been processed is
// saved and reported. A run that ends early with 40 receipts filed is useful; one that
// is killed at 60 seconds with nothing saved is not.
const TIME_BUDGET_MS = 260_000;

async function isAuthorized(request, supabaseAdmin) {
  const authHeader = request.headers.get("authorization") || "";
  if (isCronRequest(request)) return true;
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  // A foreman needs this for receipt scanning.
  return ["admin", "foreman"].includes(profile?.role);
}

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!(await isAuthorized(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  // PO numbers are looked up per company, not across the platform. Two companies can
  // easily use the same PO number, and matching one company's receipt to another's job
  // would file the expense against the wrong business entirely.
  const poCache = new Map();
  async function jobsByPoFor(companyId) {
    if (!poCache.has(companyId)) {
      const [{ data: estimatesWithPo }, { data: invoicesWithPo }] = await Promise.all([
        supabaseAdmin.from("estimates").select("po_number, job_id")
          .eq("company_id", companyId).not("po_number", "is", null),
        supabaseAdmin.from("invoices").select("po_number, job_id")
          .eq("company_id", companyId).not("po_number", "is", null),
      ]);
      const map = {};
      [...(estimatesWithPo || []), ...(invoicesWithPo || [])].forEach((d) => {
        if (d.po_number) map[d.po_number.trim().toLowerCase()] = d.job_id;
      });
      poCache.set(companyId, map);
    }
    return poCache.get(companyId);
  }

  // How far back to look. The scheduled run only needs to cover the gap since the last
  // sync, but a manual run can be pointed further back to pull in history that predates
  // the Gmail connection — that older mail was never scanned at all.
  const { searchParams } = new URL(request.url);
  const requestedDays = Number(searchParams.get("days"));
  const lookbackDays = Number.isFinite(requestedDays) && requestedDays > 0
    ? Math.min(requestedDays, 730)
    : 7;

  const startedAt = Date.now();
  let ranOutOfTime = false;

  const { data: connections } = await supabaseAdmin.from("gmail_connections").select("*");
  let totalFound = 0, totalMatched = 0, totalDuplicates = 0;

  for (const conn of connections || []) {
    const accessToken = await refreshAccessToken(conn.refresh_token);
    if (!accessToken) continue;

    // This connection's own company. Everything below is scoped to it.
    const jobByPo = await jobsByPoFor(conn.company_id);

    // Gmail caps a single page at 500. Deep scans page through; the routine 7-day run
    // almost never needs a second page.
    const pageCap = lookbackDays > 30 ? 200 : 25;

    const query = encodeURIComponent(
      `(receipt OR invoice OR "order confirmation") newer_than:${lookbackDays}d`
    );

    // Collect message ids across pages before processing, so a slow scan doesn't hold a
    // page token long enough for it to expire.
    const messages = [];
    let pageToken = null;
    do {
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${pageCap}`
        + (pageToken ? `&pageToken=${pageToken}` : ""),
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const list = await listRes.json();
      messages.push(...(list.messages || []));
      pageToken = list.nextPageToken || null;
      // A deep scan of a busy mailbox could otherwise run past the function timeout.
      if (messages.length >= 500) break;
    } while (pageToken);

    for (const msg of messages) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        ranOutOfTime = true;
        break;
      }
      const { data: existing } = await supabaseAdmin
        .from("gmail_receipts").select("id").eq("gmail_message_id", msg.id).maybeSingle();
      if (existing) continue; // already scanned — use Rescan on the Receipts page to redo one

      const result = await processGmailMessage({ accessToken, msgId: msg.id, supabaseAdmin });
      const matchedJobId = result.matched_po_number ? jobByPo[result.matched_po_number.toLowerCase()] : null;
      if (matchedJobId) totalMatched++;

      const receivedAt = result.headers.Date ? new Date(result.headers.Date).toISOString() : new Date().toISOString();

      // Flag anything that looks like money already accounted for — either another
      // scanned receipt or an expense already on the books. Stays "pending" either
      // way; the review queue shows the reason and the user decides.
      const duplicate = await findDuplicate({
        supabaseAdmin,
        candidate: {
          gmail_message_id: msg.id,
          from_email: result.headers.From || "",
          subject: result.headers.Subject || "",
          extracted_amount: result.extracted_amount,
          matched_po_number: result.matched_po_number,
          received_at: receivedAt,
        },
      });
      if (duplicate.duplicate_reason) totalDuplicates++;

      await supabaseAdmin.from("gmail_receipts").insert([{
        user_id: conn.user_id,
        gmail_message_id: msg.id,
        from_email: result.headers.From || "",
        subject: result.headers.Subject || "",
        received_at: receivedAt,
        extracted_amount: result.extracted_amount,
        extracted_gst: result.extracted_gst,
        extracted_pst: result.extracted_pst,
        // The date on the document, not the date the email arrived — a supplier
        // statement often lands days after the period it covers.
        extracted_date: result.extracted_date,
        parse_warnings: result.parse_warnings?.length ? result.parse_warnings : null,
        extracted_vendor: result.extracted_vendor,
        extracted_currency: result.extracted_currency,
        matched_po_number: result.matched_po_number,
        linked_job_id: matchedJobId || null,
        attachment_path: result.attachment_path,
        status: "pending",
        ...duplicate,
      }]);
      totalFound++;
    }
  }

  return Response.json({
    found: totalFound,
    matchedByPo: totalMatched,
    flaggedDuplicates: totalDuplicates,
    // Said plainly so a partial run doesn't look like a complete one. Running the sync
    // again picks up where it stopped, since anything already filed is skipped.
    incomplete: ranOutOfTime,
    message: ranOutOfTime
      ? `Stopped early after ${totalFound} receipts to stay inside the time limit — run it again to continue.`
      : null,
  });
}
