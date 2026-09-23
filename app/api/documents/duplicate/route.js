import { createClient } from "@supabase/supabase-js";

// Duplicates an estimate or invoice, with its line items and per-line photos.
//
// Most useful for work that repeats — a monthly service call, a second unit in the same
// building, an estimate that becomes the template for the next one. Retyping twenty
// line items is where mistakes come from.
//
// What is deliberately NOT copied, because a copy is a new document rather than a clone
// of a moment in time:
//   doc_number       — the sequence assigns a fresh one
//   public_token     — the old link must never open the new document
//   payment_status   — a copy of a paid invoice is not itself paid
//   approval status  — it goes through approval on its own merits
//   signatures       — a client signed the original, not this
//   email/view state — nobody has seen this one yet

async function requireManagement(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active, company_id").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || !["admin", "foreman"].includes(profile.role)) return null;
  return { user, profile };
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const caller = await requireManagement(request, supabaseAdmin);
  if (!caller) return new Response("Unauthorized", { status: 401 });

  const { kind, id, targetJobId, asKind } = await request.json();
  if (!kind || !id) return new Response("Missing kind or id", { status: 400 });

  const sourceTable = kind === "estimate" ? "estimates" : "invoices";
  // Copying an estimate into an invoice is the other common case — the work was quoted,
  // now it's being billed.
  const newKind = asKind === "estimate" || asKind === "invoice" ? asKind : kind;
  const targetTable = newKind === "estimate" ? "estimates" : "invoices";

  const { data: source } = await supabaseAdmin
    .from(sourceTable).select("*").eq("id", id).maybeSingle();
  if (!source) return new Response("Not found", { status: 404 });

  // Scoped explicitly: this route uses the service role, which bypasses RLS, so the
  // company check that would normally be automatic has to be made by hand.
  if (source.company_id !== caller.profile.company_id) {
    return new Response("Not found", { status: 404 });
  }

  // A target job has to be checked against the caller's company by hand. This route
  // runs with the service role, so RLS isn't there to stop a job id from another
  // company being passed in — which would move a document across the boundary.
  if (targetJobId) {
    const { data: targetJob } = await supabaseAdmin
      .from("jobs").select("id, company_id").eq("id", targetJobId).maybeSingle();
    if (!targetJob || targetJob.company_id !== caller.profile.company_id) {
      return new Response("That job wasn't found", { status: 404 });
    }
  }

  // Fields that carry over. Listed rather than spread, so a column added later doesn't
  // silently start copying itself — several of them would be actively wrong to copy.
  const copy = {
    company_id: source.company_id,
    // The client comes from the job, not the document — there is no contact_id here.
    job_id: targetJobId || source.job_id,
    date: new Date().toISOString().slice(0, 10),
    amount: source.amount,
    note: source.note,
    private_notes: source.private_notes,
    po_number: source.po_number,
    deposit_type: source.deposit_type,
    deposit_request_amount: source.deposit_request_amount,
    deposit_request_percent: source.deposit_request_percent,
    discount_amount: source.discount_amount,
    markup_pct: source.markup_pct,
    gst_enabled: source.gst_enabled,
    tax_exempt: source.tax_exempt,
  };

  if (targetTable === "invoices") {
    copy.payment_status = "unpaid";
    copy.send_reminders = source.send_reminders ?? true;
  } else {
    copy.auto_generate_invoice = source.auto_generate_invoice;
    copy.skilled_labor_hours = source.skilled_labor_hours;
    copy.unskilled_labor_hours = source.unskilled_labor_hours;
    copy.travel_hours = source.travel_hours;
    copy.material_pickup_hours = source.material_pickup_hours;
  }

  const { data: created, error } = await supabaseAdmin
    .from(targetTable).insert([copy]).select().single();
  if (error) return new Response(`Couldn't duplicate that: ${error.message}`, { status: 500 });

  // Line items, with fresh line_keys so the two documents' per-line photos stay
  // independent — editing one shouldn't move the other's pictures.
  const { data: lines } = await supabaseAdmin
    .from("line_items").select("*").eq("parent_type", kind).eq("parent_id", id).order("sort_order");

  const keyMap = new Map();
  if (lines?.length) {
    const copied = lines.map((l) => {
      const newKey = crypto.randomUUID();
      if (l.line_key) keyMap.set(l.line_key, newKey);
      return {
        parent_type: newKind,
        parent_id: created.id,
        company_id: source.company_id,
        line_key: newKey,
        price_book_id: l.price_book_id,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_cost: l.unit_cost,
        markup_pct: l.markup_pct,
        is_material: l.is_material,
        is_tool: l.is_tool,
        is_labour: l.is_labour,
        scope_notes: l.scope_notes,
        waste_pct: l.waste_pct,
        manufacturer: l.manufacturer,
        color: l.color,
        sort_order: l.sort_order,
      };
    });
    await supabaseAdmin.from("line_items").insert(copied);
  }

  // Attachments point at the same stored files rather than duplicating them — the same
  // photo appearing on two documents shouldn't cost twice the storage, and deleting one
  // document's copy must not remove the other's file.
  const { data: attachments } = await supabaseAdmin
    .from("document_attachments").select("*").eq("parent_type", kind).eq("parent_id", id);

  if (attachments?.length) {
    await supabaseAdmin.from("document_attachments").insert(
      attachments.map((a) => ({
        parent_type: newKind,
        parent_id: created.id,
        company_id: source.company_id,
        bucket: a.bucket,
        storage_path: a.storage_path,
        filename: a.filename,
        mime_type: a.mime_type,
        caption: a.caption,
        sort_order: a.sort_order,
        job_photo_id: a.job_photo_id,
        // A referenced file, not an owned one — so removing this attachment later
        // won't delete a file the original still shows.
        line_key: a.line_key ? keyMap.get(a.line_key) || null : null,
      }))
    );
  }

  return Response.json({
    ok: true,
    id: created.id,
    kind: newKind,
    docNumber: created.doc_number,
    jobId: created.job_id,
  });
}
