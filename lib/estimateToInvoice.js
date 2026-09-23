import { createClient } from "@supabase/supabase-js";

// Turns an accepted estimate into an invoice, server-side.
//
// Two things trigger this: a client signing the estimate, and a client paying its
// deposit. Both mean the same thing — the work is accepted — and both used to be
// handled separately, with only signing actually implemented.
//
// Returns the new invoice, or the existing one if the estimate has already produced
// it. Paying a deposit after signing shouldn't raise a second invoice for the same
// work.
export async function createInvoiceFromEstimate(estimateId) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: estimate } = await supabaseAdmin
    .from("estimates").select("*").eq("id", estimateId).maybeSingle();
  if (!estimate) return null;

  // Already converted — the link is recorded on the invoice, so this is cheap to check
  // and impossible to get wrong by comparing amounts or dates.
  const { data: existing } = await supabaseAdmin
    .from("invoices").select("*").eq("from_estimate_id", estimate.id).maybeSingle();
  if (existing) return existing;

  const { data: invoice, error } = await supabaseAdmin
    .from("invoices")
    .insert([{
      // Set explicitly rather than left to the trigger: this runs with the service
      // role, which has no session for the trigger to read a company from.
      company_id: estimate.company_id,
      job_id: estimate.job_id,
      from_estimate_id: estimate.id,
      amount: estimate.amount,
      date: new Date().toISOString().slice(0, 10),
      note: estimate.note,
      private_notes: estimate.private_notes,
      po_number: estimate.po_number,
      discount_amount: estimate.discount_amount,
      markup_pct: estimate.markup_pct,
      gst_enabled: estimate.gst_enabled,
      tax_exempt: estimate.tax_exempt,
      payment_status: "unpaid",
      // Generated from an estimate that was already approved, so it doesn't go back
      // through approval — the work and the price have both been agreed.
      approval_status: "approved",
    }])
    .select()
    .single();

  if (error || !invoice) return null;

  const { data: lines } = await supabaseAdmin
    .from("line_items").select("*").eq("parent_type", "estimate").eq("parent_id", estimate.id).order("sort_order");

  if (lines?.length) {
    await supabaseAdmin.from("line_items").insert(
      lines.map((l) => ({
        parent_type: "invoice",
        parent_id: invoice.id,
        company_id: estimate.company_id,
        line_key: l.line_key,
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
      }))
    );
  }

  // Carry any deposit already paid on the estimate across to the invoice. Without this
  // the payment stays attached to the estimate alone, and the invoice shows the full
  // amount as outstanding — which is exactly how a client gets asked to pay twice.
  await supabaseAdmin
    .from("deposits")
    .update({ invoice_id: invoice.id })
    .eq("job_id", estimate.job_id)
    .is("invoice_id", null);

  return invoice;
}
