// Pulls the vendor, total, tax and PO number out of a receipt or supplier invoice.
//
// Written against real documents from the suppliers actually used — Rona, Columbia
// Fuels, Relay Rentals, Starlink, Supabase and others. The previous patterns scored
// zero out of nine on those files, for reasons that only show up with real paperwork:
//
//   "GST: 890694706RT0001 0.55"   the registration number sits between the label and
//                                 the amount, and a naive pattern grabs the number
//   "Sub-Total 163.05"            matches a search for "total"
//   "GST on sales 5.00% 42.60"    the rate looks like an amount
//   "Total Due CAD 123.20"        currency written as a prefix word, not a symbol
//   "Amount Due 0.00"             what's still owed after payment, not what was spent
//
// The approach is line-based rather than a flat-text regex. A receipt's meaning lives in
// its rows, and the number that belongs to a label is almost always the last one on that
// label's line.

// Amounts must have cents. Every total on a real invoice does, and requiring them is
// what excludes registration numbers, phone numbers and account numbers.
const AMOUNT = /(?<![\d.])(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)/g;

// Numbers on a line, ignoring anything that is a percentage rather than money.
function amountsOn(line) {
  const found = [];
  let m;
  AMOUNT.lastIndex = 0;
  while ((m = AMOUNT.exec(line)) !== null) {
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 2);
    if (/^\s*%/.test(after)) continue;             // "5.00%" is a rate
    found.push({ value: Number(`${m[1].replace(/,/g, "")}.${m[2]}`), index: m.index });
  }
  return found;
}

// The amount belonging to a label: the FIRST one after the label's position.
//
// First rather than last, because a tax-summary row reads "GST @ 5% 15.75 315.00" —
// tax then net — and the last figure there is the pre-tax amount, not the tax. Taking
// the first still skips registration numbers, since those carry no decimal and so are
// not amounts at all.
function amountForLabel(line, labelIndex) {
  const after = amountsOn(line).filter((a) => a.index > labelIndex);
  return after.length ? after[0].value : null;
}

// A transaction row rather than a summary line. These start with a date and use the tax
// column as a code — "06/20/2026 ... GST 2 157.50 315.00" — where "GST" labels the rate
// applied to that item, not an amount of tax.
const TRANSACTION_ROW = /^\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s/;

// Lines that look like a subtotal, a per-item row, or a running subtotal within a
// multi-page statement — none of which is the document's total.
const NOT_A_TOTAL = /sub\s*-?\s*total|total for|totals\s*:|total\s+(?:qty|hours|volume)/i;

const TOTAL_LABELS = [
  /total\s+amount\s+due/i,
  /balance\s+due/i,
  /amount\s+due/i,
  /total\s+due/i,
  /total\s+charges/i,
  /\btotal\b/i,
  /\bamount\b/i,
];

const TAX_LABELS = [
  /gst\s*\/\s*hst/i,
  /\bgst\b/i,
  /\bhst\b/i,
  /sales\s+tax/i,
];

const PST_LABELS = [/\bpst\b/i, /\bqst\b/i, /provincial\s+sales\s+tax/i];

// Every candidate for a label set, so the caller can decide between them.
function candidates(lines, labels, exclude) {
  const out = [];
  for (const line of lines) {
    if (TRANSACTION_ROW.test(line)) continue;
    if (exclude && exclude.test(line)) continue;
    for (const label of labels) {
      const m = line.match(label);
      if (!m) continue;
      const value = amountForLabel(line, m.index);
      if (value != null) out.push({ value, line: line.trim() });
      break;
    }
  }
  return out;
}

export function parseReceipt(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());

  // --- total ---------------------------------------------------------------
  // The largest candidate wins. "Amount Due 0.00" on an already-paid receipt is a real
  // line, but it isn't what was spent; the largest labelled figure is. And on a fuel
  // statement with per-card subtotals, the largest is the one being billed.
  const totalCandidates = candidates(lines, TOTAL_LABELS, NOT_A_TOTAL);
  let total = totalCandidates.length
    ? Math.max(...totalCandidates.map((c) => c.value))
    : null;

  // Some layouts put labels and figures in separate blocks, so no line carries both.
  // The largest amount on the document is then the best available guess.
  let totalIsGuess = false;
  if (total == null) {
    const all = lines.flatMap((l) => amountsOn(l).map((a) => a.value));
    if (all.length) {
      total = Math.max(...all);
      totalIsGuess = true;
    }
  }

  // --- tax -----------------------------------------------------------------
  // Largest again: a statement that lists tax per card and then a combined figure
  // should report the combined one.
  // Excluding provincial lines: "Provincial Sales Tax (PST) (7%)" contains the words
  // "sales tax", and counting it as GST overstates the input tax credit.
  const taxCandidates = candidates(lines, TAX_LABELS, /\bpst\b|\bqst\b|provincial\s+sales/i);
  let gst = taxCandidates.length ? Math.max(...taxCandidates.map((c) => c.value)) : null;

  const pstCandidates = candidates(lines, PST_LABELS);
  const pst = pstCandidates.length ? Math.max(...pstCandidates.map((c) => c.value)) : null;

  // --- subtotal, for filling gaps -----------------------------------------
  const subtotalCandidates = [];
  for (const line of lines) {
    const m = line.match(/sub\s*-?\s*total/i);
    if (!m) continue;
    const v = amountForLabel(line, m.index);
    if (v != null) subtotalCandidates.push(v);
  }
  const subtotal = subtotalCandidates.length ? Math.max(...subtotalCandidates) : null;

  // Some vendors label the tax line by province rather than by tax — Supabase writes
  // "BC (5%)". Derived rather than left blank, since the input tax credit is real money.
  let gstDerived = false;
  if (gst == null && total != null && subtotal != null) {
    const difference = Math.round((total - subtotal - (pst || 0)) * 100) / 100;
    if (difference > 0 && difference < total * 0.2) {
      gst = difference;
      gstDerived = true;
    }
  }

  // --- vendor --------------------------------------------------------------
  const vendor = guessVendor(lines);

  // --- PO number, for matching to a job -----------------------------------
  const poNumber = guessPo(raw);

  const date = guessDate(raw);

  // Anything worth a second look before it lands in the books.
  const warnings = [];
  if (total == null) warnings.push("No total found.");
  else if (totalIsGuess) warnings.push("The total was guessed from the largest figure on the page — check it.");
  if (gst == null) warnings.push("No GST found — if this was a taxable purchase, the credit will be understated.");
  else if (gstDerived) warnings.push("GST was worked out from the subtotal rather than read directly.");
  if (gst != null && total != null && gst > total * 0.3) {
    warnings.push("The tax looks too large for the total — check both.");
  }

  return { vendor, total, gst, pst, subtotal, poNumber, date, warnings };
}

// Suppliers seen often enough to name directly. Recognising a vendor by a distinctive
// string is far more reliable than inferring it from layout — the top of an invoice is
// a logo, an address block and a buyer's name in an order that differs every time.
//
// Add to this list as new suppliers appear; it costs one line each.
const KNOWN_VENDORS = [
  [/\brona\b|powell river building supply/i, "RONA Powell River"],
  [/columbia fuels|parkland corporation/i, "Columbia Fuels"],
  [/relay rentals/i, "Relay Rentals & Sales"],
  [/starlink|spacex/i, "Starlink"],
  [/supabase/i, "Supabase"],
  [/linknow/i, "LinkNow Media"],
  [/clear\s?view accounting/i, "Clear View Accounting"],
  [/sbc plumbing|sunshinecoastplumbing/i, "SBC Plumbing & Gas"],
  [/home depot/i, "Home Depot"],
  [/canadian tire/i, "Canadian Tire"],
  [/home hardware/i, "Home Hardware"],
  [/windsor plywood/i, "Windsor Plywood"],
  [/lordco/i, "Lordco"],
  [/\bnapa\b/i, "NAPA Auto Parts"],
  [/acklands|grainger/i, "Acklands-Grainger"],
  [/ministry of transportation|national safety code/i, "BC Ministry of Transportation"],
  [/\bvercel\b/i, "Vercel"],
  [/\bresend\b/i, "Resend"],
  [/\bpaypal\b/i, "PayPal"],
  [/telus|shaw|rogers|bell canada/i, "Telecom"],
  [/worksafe\s?bc/i, "WorkSafeBC"],
  [/\bicbc\b/i, "ICBC"],
];

// The supplier's name, not the buyer's. Both appear on every invoice.
function guessVendor(lines) {
  const whole = lines.join("\n");
  for (const [pattern, name] of KNOWN_VENDORS) {
    if (pattern.test(whole)) return name;
  }
  return guessVendorFromLayout(lines);
}

function guessVendorFromLayout(lines) {
  const BUYER = /m-?con|nate\s+muth|nathanael\s+muth/i;
  const NOISE = /^(page|invoice|receipt|bill to|sold to|ship to|attn|tel|fax|phone|www\.|http|date|terms|customer|unit\s+\d|suite|#|description|item)\b/i;
  // An address line, not a name — "Powell River BC V8A 0R3", "3870 Highway 101".
  const ADDRESS = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|^\d+\s|\b(street|st\.|ave|avenue|road|rd\.|highway|hwy|blvd|drive|dr\.)\b/i;

  // A company suffix is the strongest signal.
  for (const line of lines.slice(0, 25)) {
    const t = line.trim();
    if (BUYER.test(t) || NOISE.test(t) || ADDRESS.test(t)) continue;
    if (/\b(ltd|inc|corp|corporation|limited|llc|co\.|company)\b/i.test(t) && t.length < 70) {
      return t.replace(/\s{2,}/g, " ").slice(0, 80);
    }
  }

  // Otherwise the first line that reads like a name rather than an address or a number.
  for (const line of lines.slice(0, 12)) {
    const t = line.trim();
    if (BUYER.test(t) || NOISE.test(t) || ADDRESS.test(t)) continue;
    if (t.length < 4 || t.length > 60) continue;
    if (/^[\d\s().+-]+$/.test(t)) continue;         // phone number
    return t.replace(/\s{2,}/g, " ");
  }
  return null;
}

// The PO or job reference, which is how a receipt finds its job. Suppliers write it
// several ways — "PO # 3801 ONTARIO", "PO / Job Name 3801 ONTARIO",
// "PURCHASE ORDER: 3801 ONTARIO".
function guessPo(text) {
  const patterns = [
    /p\.?o\.?\s*(?:#|number|no\.?)\s*:?\s*([A-Z0-9][A-Z0-9 \-\/]{1,28})/i,
    /p\.?o\.?\s*\/\s*job\s*name\s*:?\s*([A-Z0-9][A-Z0-9 \-\/]{1,28})/i,
    /purchase\s*order\s*#?\s*:?\s*([A-Z0-9][A-Z0-9 \-\/]{1,28})/i,
    /job\s*(?:name|#|number|no\.?)\s*:?\s*([A-Z0-9][A-Z0-9 \-\/]{1,28})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const value = m[1].trim()
      .replace(/\s{2,}/g, " ")
      // Trim anything that's clearly the next column rather than part of the reference.
      .replace(/\s+(net|terms|clerk|date|reference|bon)\b.*$/i, "")
      .trim();
    // A real reference contains a digit and isn't a sentence. Without this, a blank
    // "Purchase Order #:" box picks up whatever text follows it on the page.
    if (!value || !/\d/.test(value)) continue;
    if (value.split(/\s+/).length > 4) continue;
    if (/^(box|number|no)$/i.test(value)) continue;
    return value.slice(0, 30);
  }
  return null;
}

function guessDate(text) {
  const patterns = [
    /(\d{4}-[A-Z][a-z]{2}-\d{1,2})/,                      // 2026-Jul-09
    /(\d{4}[-\/]\d{2}[-\/]\d{2})/,                        // 2026-08-24
    /(?:invoice\s*date|date\s*of\s*invoice|date)\s*:?\s*([A-Z][a-z]{2,9}\s+\d{1,2},?\s+\d{4})/i,
    /(?:invoice\s*date|date\s*of\s*invoice|date)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/,                 // Aug 11, 2026
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const parsed = new Date(m[1].replace(/-/g, " "));
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
        .toISOString().slice(0, 10);
    }
  }
  return null;
}
