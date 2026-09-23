// The one place a document's totals are worked out.
//
// This calculation previously lived in five places — the pay page, the invoice email,
// the PayPal order route, the PDF, and the document view — each with its own copy. That
// is exactly how the triple-GST bug happened: the same mistake had to be found and
// fixed three separate times, and any of them could have drifted again.
//
// Everything that needs a total now calls this. If the arithmetic is wrong it is wrong
// once, visibly, in a file short enough to read.

// One client-facing line. Material, tool and labour lines are internal and never
// contribute to what the client is charged — they exist for costing, not billing.
function lineTotal(line) {
  const quantity = Number(line.quantity ?? 1);
  const unitCost = Number(line.unit_cost ?? 0);
  const markup = Number(line.markup_pct ?? 0);
  const waste = Number(line.waste_pct ?? 0);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 0;

  const base = quantity * unitCost * (1 + waste / 100);
  return base * (1 + markup / 100);
}

export function isClientFacing(line) {
  return !line.is_material && !line.is_tool && !line.is_labour;
}

// Rounds to cents at each stage rather than only at the end. Without this a total can
// disagree with the sum of its own visible parts by a cent, which looks like an error
// to a client even when the underlying figure is right.
const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

// The full breakdown for one estimate or invoice.
//
//   doc       the estimate/invoice row (markup_pct, discount_amount, tax_exempt, gst_enabled)
//   lines     its line_items — internal ones are filtered out here, so callers can pass
//             everything without having to remember
//   taxRates  the enabled tax rates FOR THAT DOCUMENT'S COMPANY. Passing another
//             company's rates is the bug this signature is trying to make obvious.
export function calculateDocumentTotals({ doc = {}, lines = [], taxRates = [] }) {
  const clientLines = (lines || []).filter(isClientFacing);

  // Falls back to the document's own amount when it has no line items — some documents
  // are a single figure with a note rather than an itemised breakdown.
  const subtotal = clientLines.length
    ? cents(clientLines.reduce((sum, l) => sum + lineTotal(l), 0))
    : cents(doc.amount);

  const afterMarkup = cents(subtotal * (1 + Number(doc.markup_pct || 0) / 100));
  const discount = cents(doc.discount_amount);
  const taxable = cents(afterMarkup - discount);

  // An imported historical document carries the tax that was actually charged at the
  // time. Recalculating it at today's rates would silently restate a filed return —
  // and rates do change, so a 2025 invoice must keep its 2025 figures.
  if (doc.imported_tax_amount != null) {
    const importedTax = cents(doc.imported_tax_amount);
    return {
      lineTotals: clientLines.map((l) => ({ line: l, amount: cents(lineTotal(l)) })),
      subtotal,
      markupAmount: cents(afterMarkup - subtotal),
      discount,
      taxable,
      taxes: importedTax > 0
        ? [{ id: "imported", name: doc.imported_tax_label || "Tax", rate: null, amount: importedTax }]
        : [],
      taxTotal: importedTax,
      total: cents(taxable + importedTax),
      imported: true,
    };
  }

  // A tax-exempt document is charged none. Otherwise GST can be switched off on its own
  // — some clients are GST-exempt while still paying provincial tax.
  const applicable = doc.tax_exempt
    ? []
    : (taxRates || []).filter(
        (t) => doc.gst_enabled !== false || String(t.name).trim().toUpperCase() !== "GST"
      );

  const taxes = applicable.map((t) => ({
    id: t.id,
    name: t.name,
    rate: Number(t.rate),
    amount: cents(taxable * (Number(t.rate) / 100)),
  }));

  const taxTotal = cents(taxes.reduce((sum, t) => sum + t.amount, 0));
  const total = cents(taxable + taxTotal);

  // What the client still owes, given payments recorded against this document.
  return {
    lineTotals: clientLines.map((l) => ({ line: l, amount: cents(lineTotal(l)) })),
    subtotal,
    markupAmount: cents(afterMarkup - subtotal),
    discount,
    taxable,
    taxes,
    taxTotal,
    total,
  };
}

// Kept separate because payments are recorded against a document rather than being part
// of it — an invoice's total doesn't change when someone pays it.
export function outstandingBalance(total, payments = []) {
  const paid = cents((payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0));
  return { paid, owing: cents(Number(total || 0) - paid) };
}

export { lineTotal };
