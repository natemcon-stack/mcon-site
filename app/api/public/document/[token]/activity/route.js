import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rateLimit";

// Logs "viewed" events (and anything else the public page reports) against a
// document, purely for the admin-facing Activity feed — never exposes anything back.
export async function POST(request, { params }) {
  const limited = rateLimit(request, { name: "activity", limit: 60 });
  if (limited) return limited;

  const { token } = params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") === "estimate" ? "estimate" : "invoice";
  const table = kind === "estimate" ? "estimates" : "invoices";
  const { event_type } = await request.json();

  // Anyone with a document link can call this, so only the events the public page is
  // supposed to report are accepted. Without this, an arbitrary string — including
  // "paid" or "signed" — could be written straight into the admin activity feed and
  // make an unpaid invoice look settled.
  const ALLOWED_EVENTS = ["viewed", "downloaded", "printed"];
  const event = ALLOWED_EVENTS.includes(event_type) ? event_type : "viewed";

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: doc } = await supabaseAdmin.from(table).select("id, approval_status").eq("public_token", token).maybeSingle();
  if (!doc) return new Response("Not found", { status: 404 });

  // An unapproved document is invisible to the outside world; these endpoints are
  // reachable with nothing but a link, so they need the same rule as the page itself.
  if (doc.approval_status && doc.approval_status !== "approved") {
    return new Response("Not found", { status: 404 });
  }

  await supabaseAdmin.from("document_activity").insert([{
    parent_type: kind, parent_id: doc.id, event_type: event,
  }]);

  return Response.json({ logged: true });
}
