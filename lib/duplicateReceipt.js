// Duplicate detection for scanned email receipts.
//
// The gmail_message_id unique constraint already stops the same email being scanned
// twice. It does nothing about the two cases that actually cause double-counted
// expenses:
//
//   1. The vendor sends the same purchase twice — an "order confirmation" and then an
//      "invoice", or the same receipt forwarded from a second address. Different
//      message ids, same money.
//   2. The expense was already keyed in by hand from the paper slip, and then the
//      emailed copy got scanned on top of it.
//
// Both inflate job costs and land in the accountant export, so this flags them for
// review. Deliberately advisory: nothing is auto-hidden or auto-deleted, because a
// false positive on a real second purchase from the same supplier on the same day
// would quietly lose a legitimate expense.

// Vendors send from noreply@, receipts@, billing@ — the local part varies while the
// company doesn't, so the domain is the stable identity.
function emailDomain(address) {
  const match = /<?([^<>\s]+@[^<>\s]+)>?/.exec(address || "");
  if (!match) return null;
  const domain = match[1].split("@")[1];
  return domain ? domain.toLowerCase().trim() : null;
}

// Strips the noise that differs between two copies of the same receipt — "Re:",
// "Fwd:", order numbers, punctuation — so the remaining words can be compared.
function normalizeSubject(subject) {
  return String(subject || "")
    .toLowerCase()
    .replace(/^((re|fw|fwd)\s*:\s*)+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameAmount(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

function daysApart(a, b) {
  if (!a || !b) return Infinity;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff / 86400000;
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

// Windows are generous on purpose: a supplier's invoice often follows its order
// confirmation by a few days, and a hand-entered expense is frequently dated the day
// of purchase while the email arrives later.
const RECEIPT_WINDOW_DAYS = 4;
const EXPENSE_WINDOW_DAYS = 5;
const SUBJECT_WINDOW_DAYS = 14;

// Returns { duplicate_of_receipt_id, duplicate_of_expense_id, duplicate_reason } —
// all null when nothing matches, so the result can be spread straight into an
// insert or update. Never throws: a failed lookup means "not a duplicate", which
// leaves the receipt in the normal review queue rather than dropping it.
export async function findDuplicate({ supabaseAdmin, candidate }) {
  const none = { duplicate_of_receipt_id: null, duplicate_of_expense_id: null, duplicate_reason: null };
  try {
    const amount = candidate.extracted_amount;
    const receivedAt = candidate.received_at || new Date().toISOString();
    const domain = emailDomain(candidate.from_email);
    const po = candidate.matched_po_number ? candidate.matched_po_number.trim().toLowerCase() : null;

    // ---- Against other scanned receipts -------------------------------------
    const { data: others } = await supabaseAdmin
      .from("gmail_receipts")
      .select("id, from_email, subject, extracted_amount, matched_po_number, received_at, status")
      .neq("status", "dismissed")
      .order("received_at", { ascending: false })
      .limit(400);

    const candidates = (others || []).filter((r) => r.id !== candidate.id
      && r.gmail_message_id !== candidate.gmail_message_id);

    // Strongest signal: same purchase order, same total. A PO number is specific to
    // one purchase, so two receipts carrying it for the same amount are the same buy.
    if (po && amount != null) {
      const hit = candidates.find((r) =>
        r.matched_po_number && r.matched_po_number.trim().toLowerCase() === po && sameAmount(r.extracted_amount, amount));
      if (hit) {
        return {
          duplicate_of_receipt_id: hit.id,
          duplicate_of_expense_id: null,
          duplicate_reason: `Same PO #${candidate.matched_po_number} and ${money(amount)} as a receipt already scanned on ${new Date(hit.received_at).toLocaleDateString()}.`,
        };
      }
    }

    // Same supplier, same total, within a few days.
    if (domain && amount != null) {
      const hit = candidates.find((r) =>
        emailDomain(r.from_email) === domain
        && sameAmount(r.extracted_amount, amount)
        && daysApart(r.received_at, receivedAt) <= RECEIPT_WINDOW_DAYS);
      if (hit) {
        return {
          duplicate_of_receipt_id: hit.id,
          duplicate_of_expense_id: null,
          duplicate_reason: `Same sender and ${money(amount)} as a receipt scanned on ${new Date(hit.received_at).toLocaleDateString()}.`,
        };
      }
    }

    // Amount extraction failed on one or both copies — fall back to comparing the
    // subject line, which survives forwarding better than a parsed total does.
    const subject = normalizeSubject(candidate.subject);
    if (domain && subject.length > 8) {
      const hit = candidates.find((r) =>
        emailDomain(r.from_email) === domain
        && normalizeSubject(r.subject) === subject
        && daysApart(r.received_at, receivedAt) <= SUBJECT_WINDOW_DAYS);
      if (hit) {
        return {
          duplicate_of_receipt_id: hit.id,
          duplicate_of_expense_id: null,
          duplicate_reason: `Same sender and subject as a receipt scanned on ${new Date(hit.received_at).toLocaleDateString()}.`,
        };
      }
    }

    // ---- Against expenses already recorded ----------------------------------
    // Catches the paper-slip-then-email case. Compared on amount and date only:
    // a hand-typed description rarely resembles the email subject, so matching on
    // text here would miss almost every real instance.
    if (amount != null) {
      const from = new Date(new Date(receivedAt).getTime() - EXPENSE_WINDOW_DAYS * 86400000)
        .toISOString().slice(0, 10);
      const to = new Date(new Date(receivedAt).getTime() + EXPENSE_WINDOW_DAYS * 86400000)
        .toISOString().slice(0, 10);
      const { data: expenses } = await supabaseAdmin
        .from("job_expenses")
        .select("id, description, amount, date, job_id, source")
        .gte("date", from)
        .lte("date", to)
        .limit(400);

      const hit = (expenses || []).find((e) => sameAmount(e.amount, amount)
        // An expense created from this very receipt is not a duplicate of it.
        && e.id !== candidate.linked_expense_id);
      if (hit) {
        const how = hit.source === "gmail_import" ? "from another scanned receipt" : "entered manually";
        return {
          duplicate_of_receipt_id: null,
          duplicate_of_expense_id: hit.id,
          duplicate_reason: `${money(amount)} expense already recorded on ${hit.date} (${how}): ${hit.description || "no description"}.`,
        };
      }
    }

    return none;
  } catch (e) {
    return none;
  }
}

// Used at save time, when the user is about to turn a receipt into an expense. The
// scan-time check can't see an expense that was keyed in afterwards, so this runs
// the expense half of the comparison again against whatever the user is actually
// about to save — amount and date as edited, not as extracted.
export async function findDuplicateExpense({ supabase, amount, date, excludeExpenseId }) {
  try {
    if (amount == null || !date) return null;
    const from = new Date(new Date(date).getTime() - EXPENSE_WINDOW_DAYS * 86400000)
      .toISOString().slice(0, 10);
    const to = new Date(new Date(date).getTime() + EXPENSE_WINDOW_DAYS * 86400000)
      .toISOString().slice(0, 10);
    const { data: expenses } = await supabase
      .from("job_expenses")
      .select("id, description, amount, date, source")
      .gte("date", from)
      .lte("date", to)
      .limit(400);
    return (expenses || []).find((e) => sameAmount(e.amount, amount) && e.id !== excludeExpenseId) || null;
  } catch (e) {
    return null;
  }
}
