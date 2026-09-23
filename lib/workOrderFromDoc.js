"use client";
import { supabase } from "@/lib/supabase/client";

// Builds a work order from an estimate/invoice, breaking every client-facing line
// item — and each line of its scope notes — into its own checkable checklist item,
// rather than lumping the whole thing into one blob. Also carries over the materials
// and tools lists.
//
// Only ever called deliberately, from the "→ Work order" button. It used to run
// automatically on every invoice save, which put the crew's checklist on the calendar
// the moment an invoice existed. scheduledDate is the day it goes out; left null, the
// work order stays off the week view until a date is set.
// Throws on failure rather than returning null. Every insert here used to discard its
// error, so a work order that failed to save looked identical to one the user cancelled
// — nothing happened and nothing was said.
export async function createWorkOrderFromDocument({ jobId, kind, doc, amount, date, scheduledDate }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .insert([{
      job_id: jobId,
      // The title is visible to every crew member — the Work Orders tab isn't restricted
      // the way Financials is — so the dollar figure is stored separately and shown only
      // to admins rather than being baked into the name.
      title: `${kind === "estimate" ? "Estimate" : "Invoice"} ${date}`,
      source_amount: amount ?? null,
      source_type: kind,
      source_id: doc.id,
      scheduled_date: scheduledDate || null,
      created_by: user?.id,
    }])
    .select()
    .single();
  if (woError) throw new Error(`Couldn't create the work order: ${woError.message}`);
  if (!wo) throw new Error("The work order didn't save, and no reason was given.");

  const { data: clientLines } = await supabase
    .from("line_items").select("*").eq("parent_type", kind).eq("parent_id", doc.id)
    .eq("is_material", false).eq("is_tool", false).eq("is_labour", false).order("sort_order");

  const checklistItems = [];
  for (const line of clientLines || []) {
    checklistItems.push(line.description);
    if (line.scope_notes) {
      for (const noteLine of line.scope_notes.split("\n").map((s) => s.trim()).filter(Boolean)) {
        checklistItems.push(noteLine);
      }
    }
  }
  if (checklistItems.length === 0 && doc.note) checklistItems.push(doc.note);

  if (checklistItems.length) {
    const { error } = await supabase.from("work_order_items").insert(
      checklistItems.map((description, i) => ({ work_order_id: wo.id, description, sort_order: i }))
    );
    // The work order itself exists at this point, so this is worth reporting but not
    // worth throwing away what was created — the items can be added by hand.
    if (error) throw new Error(`Work order created, but its checklist didn't save: ${error.message}`);
  }

  const { data: materials } = await supabase.from("line_items").select("*").eq("parent_type", kind).eq("parent_id", doc.id).eq("is_material", true);
  if (materials && materials.length) {
    const { error } = await supabase.from("work_order_materials").insert(
      materials.map((m, i) => ({ work_order_id: wo.id, description: m.description, quantity: m.quantity, unit: m.unit, sort_order: i }))
    );
    if (error) throw new Error(`Work order created, but the materials list didn't save: ${error.message}`);
  }

  const { data: tools } = await supabase.from("line_items").select("*").eq("parent_type", kind).eq("parent_id", doc.id).eq("is_tool", true);
  if (tools && tools.length) {
    const { error } = await supabase.from("work_order_resources").insert(
      tools.map((t) => ({ work_order_id: wo.id, description: `${t.description}${t.quantity > 1 ? ` (x${t.quantity})` : ""}` }))
    );
    if (error) throw new Error(`Work order created, but the tools list didn't save: ${error.message}`);
  }

  return wo;
}
