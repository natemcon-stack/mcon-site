// Pulls structured data out of the text of a Joist invoice or estimate PDF.
//
// PDF text extraction gives you the words in roughly reading order but loses the layout,
// so this works by locating labels and reading what follows rather than by position.
// Joist's own wording has changed across versions, so most patterns accept several
// spellings.
//
// Everything returned is a best guess presented for confirmation, never saved silently.
// A wrong total imported without review becomes a wrong tax return, and the person
// importing is the only one who can tell a subtotal from a deposit at a glance.

// Cents are required. Without them "5601 Pare St." reads as a $5,601 total, which is
// exactly what happened once the extraction started producing real lines: the address
// sat close enough to a label to match. Every real invoice total shows cents.
const MONEY = "\\$?\\s*([0-9][0-9,]*\\.[0-9]{2})(?![0-9])";

function toNumber(raw) {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Finds the amount following a label. Tries each label in order and takes the first hit,
// so more specific labels should come first — "Balance Due" before "Total".
function amountAfter(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}[^0-9$]{0,40}${MONEY}`, "i");
    const m = text.match(re);
    if (m) {
      const n = toNumber(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

// Dates appear in several formats depending on Joist version and locale settings.
function parseDate(text) {
  const patterns = [
    // "Invoice Date: January 15, 2025" / "Date: Jan 15 2025"
    /(?:invoice date|estimate date|date issued|date)\s*:?\s*([A-Z][a-z]{2,9}\.?\s+\d{1,2},?\s+\d{4})/i,
    // ISO, and the slash form some systems print
    /(\d{4}[-\/]\d{2}[-\/]\d{2})/,
    // "15/01/2025" or "01/15/2025"
    /(?:invoice date|estimate date|date)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const parsed = new Date(m[1]);
    if (!Number.isNaN(parsed.getTime())) {
      // Built as UTC to avoid a timezone shifting the date back a day.
      return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
        .toISOString().slice(0, 10);
    }
  }
  return null;
}

function parseDocNumber(text) {
  // The "#" is required. Without it "INVOICE Invoice Date: ..." matches with the word
  // after "INVOICE" as the number, which is how this first went wrong.
  const withHash = text.match(/(?:invoice|estimate|quote)\s*#\s*:?\s*([A-Z0-9][A-Z0-9-]{0,19})/i);
  if (withHash) return withHash[1].trim();

  // Fall back to "Invoice No. 1042" and similar, still requiring a digit so a stray
  // word can't be mistaken for a number.
  const withWord = text.match(/(?:invoice|estimate|quote)\s*(?:no|num|number)\.?\s*:?\s*([A-Z0-9-]*\d[A-Z0-9-]*)/i);
  return withWord ? withWord[1].trim() : null;
}

// The client block. Joist puts it under a "Bill To" / "Prepared For" heading, and the
// first line after that is the name.
function parseClient(text) {
  const headings = [
    "bill\\s*to", "billed\\s*to", "prepared\\s*for", "customer", "client", "sold\\s*to",
  ];

  for (const heading of headings) {
    const re = new RegExp(`${heading}\\s*:?\\s*([\\s\\S]{0,220})`, "i");
    const m = text.match(re);
    if (!m) continue;

    const block = m[1];
    // Stop at the next section — anything money-shaped or a known following label.
    const stop = block.search(/\b(invoice|estimate|date|description|qty|quantity|amount|subtotal|item)\b/i);
    const useful = (stop > 20 ? block.slice(0, stop) : block).trim();

    // PDF text extraction often collapses a multi-line address block onto one line, so
    // split on double spaces AND on the boundaries that reliably start a new field:
    // a street number, a postal code, an email, or a phone number.
    const withBreaks = useful
      .replace(/([a-z),.])\s+(\d{1,6}\s+[A-Z])/g, "$1\n$2")           // "Tire 4480 Joyce"
      .replace(/\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)/g, "\n$1")               // postal code
      .replace(/\s+([\w.+-]+@[\w-]+\.[\w.-]+)/g, "\n$1")               // email
      .replace(/\s+(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g, "\n$1");  // phone

    const lines = withBreaks.split(/\s{2,}|\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const email = useful.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || null;
    // North American formats, with or without punctuation.
    const phone = useful.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || null;

    // The name is the first line that isn't the email or phone.
    const name = lines.find((l) =>
      l !== email && l !== phone
      && !/^[\d\s().+-]+$/.test(l)          // not just digits
      && !/^\d{1,6}\s+[A-Z]/i.test(l)       // not "4480 Joyce Ave"
      && l.length > 1
    ) || null;

    // Address: the remaining lines, minus contact details.
    const address = lines
      .filter((l) => l !== name && l !== email && l !== phone)
      .join(", ")
      .replace(/,\s*,/g, ",")
      .trim() || null;

    if (name) return { name: name.slice(0, 120), email, phone, address: address?.slice(0, 200) || null };
  }

  return { name: null, email: null, phone: null, address: null };
}

// Joist labels its tax line with whatever the user configured — GST, HST, Tax, Sales Tax.
function parseTax(text) {
  const labelled = amountAfter(text, [
    "gst\\s*\\(?[0-9.]*%?\\)?", "hst\\s*\\(?[0-9.]*%?\\)?", "pst\\s*\\(?[0-9.]*%?\\)?",
    "sales\\s*tax", "tax",
  ]);
  const rate = text.match(/(?:gst|hst|pst|tax)\s*\(?\s*([0-9.]+)\s*%/i);
  return { amount: labelled, rate: rate ? Number(rate[1]) : null };
}


// --- line-based extraction ------------------------------------------------
//
// Added after testing against real Joist invoices. Searching the flat text found the
// first plausible number after a label, which on a multi-page invoice meant the first
// line item's price rather than the document total — invoice 102061 reported $250
// instead of $12,168.78. A label's own row is the only place its value can be.

const CENTS = /(?<![\d.])(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)/g;

function amountsOnLine(line) {
  const out = [];
  let m;
  CENTS.lastIndex = 0;
  while ((m = CENTS.exec(line)) !== null) {
    out.push(Number(`${m[1].replace(/,/g, "")}.${m[2]}`));
  }
  return out;
}

// The value on the row whose label matches. Returns the last match in the document, so
// a summary at the end wins over a repeated column header.
function lineValue(lines, labelRe, excludeRe) {
  let found = null;
  for (const line of lines) {
    if (excludeRe && excludeRe.test(line)) continue;
    if (!labelRe.test(line)) continue;
    const amounts = amountsOnLine(line);
    if (amounts.length) found = amounts[amounts.length - 1];
  }
  return found;
}

// Joist writes dates day-first (01/08/2025 is 1 August). Read as month-first, every
// invoice lands in the wrong month and so in the wrong tax period.
//
// Rather than assume, the document is checked: any slash date whose first part is over
// 12 can only be day-first, and settles it for the whole file. With nothing to go on,
// day-first is still the right default here — this parser reads Joist exports.
function parseSlashDate(value, dayFirst) {
  const m = String(value).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!m) return null;
  let [, a, b, year] = m;
  const day = dayFirst ? Number(a) : Number(b);
  const month = dayFirst ? Number(b) : Number(a);
  if (year.length === 2) year = `20${year}`;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(Number(year), month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function documentIsDayFirst(text) {
  const dates = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-]\d{2,4}\b/g) || [];
  for (const d of dates) {
    const first = Number(d.split(/[\/-]/)[0]);
    if (first > 12) return true;
  }
  return true;
}


// The text after a label on its own row — for an invoice number rather than an amount.
function lineValueText(lines, labelRe) {
  for (const line of lines) {
    const m = line.match(labelRe);
    if (!m) continue;
    const after = line.slice(m.index + m[0].length).trim();
    const value = after.match(/^[:#\s]*([A-Za-z0-9-]{1,20})/)?.[1];
    if (value && /\d/.test(value)) return value;
  }
  return null;
}

// The client block sits under "Bill To". Taken from the rows between that heading and
// the seller's own details, which is the only reliable boundary — both parties' names
// and addresses appear on every invoice, and on a Joist layout they sit side by side.
function parseClientFromLines(lines) {
  const start = lines.findIndex((l) => /^bill\s*to\b/i.test(l));
  if (start === -1) return null;

  const block = [];
  for (let i = start + 1; i < Math.min(start + 6, lines.length); i++) {
    const line = lines[i];
    // The seller's block, or a label column, means the client's details have ended.
    if (/m-?con|payment\s+terms|invoice\s*#|^date\b|business\s*\/\s*tax|^description\b/i.test(line)) break;
    block.push(line);
  }
  if (!block.length) return null;

  const text = block.join(" ");
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || null;
  const phone = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] || null;

  // The first row is the name; the rest is address. A row that is only a phone number
  // or an email is neither.
  const name = block.find((l) => l !== email && l !== phone && !/^[\d\s().+-]+$/.test(l));
  if (!name) return null;

  const address = block
    .filter((l) => l !== name && l !== email && l !== phone)
    .join(", ")
    .trim() || null;

  return { name: name.slice(0, 120), email, phone, address: address?.slice(0, 200) || null };
}

function parseDateFromLines(lines, raw) {
  const dayFirst = documentIsDayFirst(raw);
  for (const line of lines) {
    // The labelled date row, not a date buried in a description.
    const m = line.match(/^date\b\s*:?\s*(.+)$/i) || line.match(/invoice\s*date\s*:?\s*(.+)$/i);
    if (!m) continue;
    const value = m[1].trim().split(/\s{2,}/)[0].trim();

    const slash = parseSlashDate(value, dayFirst);
    if (slash) return slash;

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
        .toISOString().slice(0, 10);
    }
  }
  return null;
}

export function parseJoistDocument(text, fileName = "") {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const flat = raw.replace(/\r/g, " ").replace(/[ \t]+/g, " ");

  // Row-based first, because that is where a label and its value actually sit together.
  // "Paid Total" and "Description Total" are excluded: the first is what has been
  // received, the second a repeated column header on every page.
  const NOT_TOTAL = /sub\s*-?\s*total|paid\s+total|description\s+total|remaining/i;

  const total =
    lineValue(lines, /^total\b/i, NOT_TOTAL) ??
    lineValue(lines, /\b(balance|amount)\s+due\b/i, /remaining/i) ??
    lineValue(lines, /\btotal\b/i, NOT_TOTAL) ??
    amountAfter(flat, ["balance\\s*due", "total\\s*due", "grand\\s*total"]);

  const subtotal =
    lineValue(lines, /sub\s*-?\s*total/i) ??
    amountAfter(flat, ["sub\\s*-?\\s*total"]);

  const lineTax = lineValue(lines, /^(gst|hst|tax|sales\s+tax)\b/i, /registration|business\s*\/\s*tax/i);

  // No tax row means no tax charged, which is a real and common case — a
  // reimbursement at cost, or an insurance deductible. The old flat-text fallback
  // instead found the business number on "Business / Tax # 795032960" and reported the
  // invoice total as GST, which would have overstated tax collected on every one.
  let taxAmount = lineTax;
  if (taxAmount == null && total != null && subtotal != null) {
    const difference = Math.round((total - subtotal) * 100) / 100;
    taxAmount = difference > 0.009 ? difference : null;
  }
  const tax = { amount: taxAmount, rate: taxAmount != null ? parseTax(flat).rate : null };

  // What the client has already paid, which is not part of the invoice total.
  const deposit =
    lineValue(lines, /paid\s+total|amount\s+paid|paid\s+to\s+date/i) ??
    amountAfter(flat, ["deposit", "paid\\s*to\\s*date", "amount\\s*paid"]);

  const client = parseClientFromLines(lines) || parseClient(flat);
  const date = parseDateFromLines(lines, raw) || parseDate(flat);
  const docNumber = lineValueText(lines, /invoice\s*#/i) || parseDocNumber(flat);

  // Cross-check what was found. A subtotal plus tax that doesn't reach the total means
  // something was misread — better to say so than to import a wrong figure quietly.
  const warnings = [];
  if (subtotal != null && tax.amount != null && total != null) {
    const expected = Math.round((subtotal + tax.amount) * 100) / 100;
    if (Math.abs(expected - total) > 0.02) {
      warnings.push(`Subtotal plus tax is ${expected.toFixed(2)} but the total reads ${total.toFixed(2)} — check the figures.`);
    }
  }
  if (total == null) warnings.push("No total found — enter it by hand.");
  if (!client.name) warnings.push("No client name found — pick or type one.");
  if (!date) warnings.push("No date found — set it by hand.");

  // Fill in whichever of the three is missing, when the other two are known.
  let resolvedSubtotal = subtotal;
  let resolvedTax = tax.amount;
  if (resolvedSubtotal == null && total != null && resolvedTax != null) {
    resolvedSubtotal = Math.round((total - resolvedTax) * 100) / 100;
  }
  if (resolvedTax == null && total != null && resolvedSubtotal != null) {
    const difference = Math.round((total - resolvedSubtotal) * 100) / 100;
    // Zero means no tax was charged, not that tax of zero was charged. Recording a 0
    // reads as "checked and none applies"; null reads as "nothing here", which is the
    // truth for a reimbursement at cost or an insurance deductible.
    resolvedTax = difference > 0.009 ? difference : null;
  }

  return {
    fileName,
    docNumber,
    date,
    client,
    subtotal: resolvedSubtotal,
    tax: resolvedTax,
    taxRate: tax.rate,
    total,
    deposit,
    warnings,
    // Kept so anything the parser missed can still be read on screen.
    rawText: flat.slice(0, 4000),
  };
}

// Matches a parsed client against existing contacts before creating a duplicate.
// Deliberately conservative: an exact email match, or a normalised name match. Fuzzy
// matching on names merges two different people called "J Smith", which is worse than
// creating one duplicate contact.
export function matchContact(parsedClient, contacts = []) {
  if (!parsedClient?.name && !parsedClient?.email) return null;

  const normalise = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (parsedClient.email) {
    const byEmail = contacts.find(
      (c) => c.email && c.email.toLowerCase() === parsedClient.email.toLowerCase()
    );
    if (byEmail) return byEmail;
  }

  const target = normalise(parsedClient.name);
  if (!target) return null;
  return contacts.find((c) => normalise(c.name) === target) || null;
}
