import { supabase } from "@/lib/supabase/client";
import { calculateDocumentTotals } from "@/lib/documentTotals";

// Tax-inclusive totals for a list of documents.
//
// `invoices.amount` and `estimates.amount` store the PRE-TAX subtotal, not the amount
// the client owes. Every list and preview that printed money(doc.amount) was therefore
// showing a figure 5% light — which is the number a client then queries against the
// invoice they were actually emailed.
//
// Rather than fix each page separately, this loads the line items and tax rates once
// for a whole list and runs them through calculateDocumentTotals — the same function
// the emailed document and the pay page use, so all three agree by construction.
export async function withDisplayTotals(docs, kind) {
  if (!docs || docs.length === 0) return [];

  const ids = docs.map((d) => d.id);

  // One query for all the lines rather than one per document.
  const { data: lines } = await supabase
    .from("line_items")
    .select("*")
    .eq("parent_type", kind)
    .in("parent_id", ids)
    .eq("is_material", false)
    .eq("is_tool", false)
    .eq("is_labour", false)
    .order("sort_order");

  const { data: taxRates } = await supabase
    .from("tax_rates").select("*").eq("enabled", true).order("sort_order");

  const linesByDoc = {};
  for (const l of lines || []) {
    (linesByDoc[l.parent_id] = linesByDoc[l.parent_id] || []).push(l);
  }

  return docs.map((doc) => {
    const docLines = linesByDoc[doc.id] || [];
    try {
      const totals = calculateDocumentTotals({ doc, lines: docLines, taxRates: taxRates || [] });
      return { ...doc, display_total: totals.total, tax_total: totals.taxTotal };
    } catch (e) {
      // A document with no lines, or odd data, still has to show something sensible —
      // falling back to the stored subtotal is wrong but visible, where a crash would
      // take out the whole list.
      return { ...doc, display_total: Number(doc.amount || 0), tax_total: 0 };
    }
  });
}
