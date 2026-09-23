import { createClient } from "@supabase/supabase-js";
import { calculateDocumentTotals } from "@/lib/documentTotals";

// The figures an accountant asks for at the end of a period: tax collected on sales,
// tax paid on purchases, the difference, and expenses grouped by category.
//
// Deliberately a summary to hand over, not a filing. It reports what's been entered —
// which means it will understate tax paid if receipts haven't been captured, and that
// gap is worth seeing rather than hiding. Every figure is traceable back to a document
// or an expense in the app.
//
// Tax collected is recalculated from the line items rather than trusted from a stored
// total, because a stored total can predate a change to the rates.

async function requireAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active, company_id").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || profile.role !== "admin" || !profile.company_id) return null;
  return profile.company_id;
}

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const companyId = await requireAdmin(request, supabaseAdmin);
  if (!companyId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return new Response("Missing start or end date", { status: 400 });

  // Cash or accrual changes which date matters: when the invoice was raised, or when it
  // was paid. Most small contractors file cash-basis, so that's the default — but it's
  // the accountant's call, so it's a choice rather than an assumption.
  const basis = searchParams.get("basis") === "accrual" ? "accrual" : "cash";

  // Scoped to this company. The service role bypasses RLS, so every query here has to
  // say so explicitly.
  const { data: taxRates } = await supabaseAdmin
    .from("tax_rates").select("*").eq("company_id", companyId).eq("enabled", true).order("sort_order");

  const invoiceQuery = supabaseAdmin
    .from("invoices")
    .select("id, doc_number, date, paid_date, amount, payment_status, markup_pct, discount_amount, tax_exempt, gst_enabled, job_id, jobs(title)")
    .eq("company_id", companyId);

  const { data: invoices } = basis === "cash"
    ? await invoiceQuery.eq("payment_status", "paid").gte("paid_date", start).lte("paid_date", end)
    : await invoiceQuery.gte("date", start).lte("date", end);

  // Line items for all of them in one query rather than one per invoice.
  const invoiceIds = (invoices || []).map((i) => i.id);
  const { data: allLines } = invoiceIds.length
    ? await supabaseAdmin.from("line_items").select("*").eq("parent_type", "invoice").in("parent_id", invoiceIds)
    : { data: [] };

  const linesByInvoice = {};
  (allLines || []).forEach((l) => {
    (linesByInvoice[l.parent_id] = linesByInvoice[l.parent_id] || []).push(l);
  });

  // --- tax collected on sales ---------------------------------------------
  const collectedByTax = {};
  let salesSubtotal = 0;
  let salesTotal = 0;
  const invoiceRows = [];

  for (const invoice of invoices || []) {
    const totals = calculateDocumentTotals({
      doc: invoice,
      lines: linesByInvoice[invoice.id] || [],
      taxRates: taxRates || [],
    });

    salesSubtotal += totals.taxable;
    salesTotal += totals.total;
    totals.taxes.forEach((t) => {
      collectedByTax[t.name] = (collectedByTax[t.name] || 0) + t.amount;
    });

    invoiceRows.push({
      id: invoice.id,
      docNumber: invoice.doc_number,
      date: basis === "cash" ? invoice.paid_date : invoice.date,
      job: invoice.jobs?.title || null,
      subtotal: totals.taxable,
      taxes: totals.taxes,
      total: totals.total,
    });
  }

  // --- tax paid on purchases ----------------------------------------------
  const { data: expenses } = await supabaseAdmin
    .from("job_expenses")
    .select("id, date, description, amount, gst_amount, tax_category, category, original_currency, original_amount, fx_rate, job_id, jobs(title)")
    .eq("company_id", companyId)
    .gte("date", start).lte("date", end);

  const byCategory = {};
  let expenseTotal = 0;
  let gstPaid = 0;
  let missingGst = 0;

  for (const e of expenses || []) {
    const amount = Number(e.amount || 0);
    const gst = e.gst_amount == null ? null : Number(e.gst_amount);
    const category = e.tax_category || "Uncategorised";

    expenseTotal += amount;
    if (gst == null) missingGst++;
    else gstPaid += gst;

    if (!byCategory[category]) byCategory[category] = { category, total: 0, gst: 0, count: 0 };
    byCategory[category].total += amount;
    byCategory[category].gst += gst || 0;
    byCategory[category].count++;
  }

  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const collected = Object.entries(collectedByTax)
    .map(([name, amount]) => ({ name, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const gstCollected = collected.find((c) => c.name.trim().toUpperCase() === "GST")?.amount || 0;

  return Response.json({
    period: { start, end, basis },
    sales: {
      invoiceCount: invoiceRows.length,
      subtotal: round(salesSubtotal),
      total: round(salesTotal),
      taxCollected: collected,
    },
    purchases: {
      expenseCount: (expenses || []).length,
      total: round(expenseTotal),
      gstPaid: round(gstPaid),
      // Expenses with no GST recorded. Not necessarily wrong — some purchases genuinely
      // have none — but it's the number that tells you whether the input-tax figure can
      // be trusted.
      missingGstCount: missingGst,
      byCategory: Object.values(byCategory)
        .map((c) => ({ ...c, total: round(c.total), gst: round(c.gst) }))
        .sort((a, b) => b.total - a.total),
    },
    // GST only. Provincial sales taxes are usually remitted separately and the rules
    // differ by province, so netting them here would be misleading.
    gstSummary: {
      collected: round(gstCollected),
      paid: round(gstPaid),
      net: round(gstCollected - gstPaid),
    },
    invoices: invoiceRows,
    expenses: (expenses || []).map((e) => ({
      id: e.id,
      date: e.date,
      description: e.description,
      job: e.jobs?.title || null,
      category: e.tax_category || "Uncategorised",
      amount: round(e.amount),
      gst: e.gst_amount == null ? null : round(e.gst_amount),
      originalCurrency: e.original_currency,
      originalAmount: e.original_amount,
      fxRate: e.fx_rate,
    })),
  });
}
