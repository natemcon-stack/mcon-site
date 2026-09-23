import { createClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cronAuth";

// Raises and sends subscription invoices, and restricts companies that don't pay.
//
// Runs daily and usually does nothing. Three jobs, in order:
//   1. invoice anyone whose renewal falls today
//   2. restrict anyone whose invoice went past due
//   3. lift the restriction on anyone who has since paid
//
// Invoices are created in the operator's own company through the ordinary tables, so
// they behave like any other invoice: same PayPal pay page, same reminders, same
// accountant export, same GST treatment.

// How long they get to pay before new estimates and invoices are blocked.
const GRACE_DAYS = 14;

export async function POST(request) {
  return run(request);
}
export async function GET(request) {
  return run(request);
}

async function run(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!isCronRequest(request)) {
    // Also runnable by an operator, for testing without waiting for the schedule.
    const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
    const { data: { user } } = token
      ? await supabaseAdmin.auth.getUser(token)
      : { data: { user: null } };
    const allowed = (process.env.PLATFORM_ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!user?.email || !allowed.includes(user.email.toLowerCase())) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const { origin } = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);

  const { data: operatorRow } = await supabaseAdmin
    .from("companies").select("id").order("created_at").limit(1).single();
  const operatorId = process.env.PLATFORM_COMPANY_ID || operatorRow?.id;
  if (!operatorId) return Response.json({ error: "No operator company" }, { status: 500 });

  const results = { invoiced: 0, restricted: 0, restored: 0, skipped: [] };

  // --- 1. Renewals due today ------------------------------------------------
  const { data: due } = await supabaseAdmin
    .from("companies")
    .select("*")
    .neq("id", operatorId)
    .lte("next_renewal_at", today)
    .in("subscription_status", ["trialing", "active", "past_due"]);

  for (const company of due || []) {
    // A company with no price or period hasn't been set up for billing yet. Skipping is
    // right — inventing a price would be worse than doing nothing.
    if (!company.price || !company.billing_period) {
      results.skipped.push({ company: company.name, reason: "no price or billing period set" });
      continue;
    }

    // Don't raise a second invoice for a period already invoiced.
    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("subscription_company_id", company.id)
      .eq("subscription_period_start", company.next_renewal_at)
      .maybeSingle();
    if (existing) continue;

    // The subscriber needs both a contact and a job in the operator's books, because an
    // invoice hangs off a job — the client is read from the job, not stored on the
    // invoice. One standing job per subscriber, created once and reused, so every
    // renewal for that company lands in one place.
    let contactId = company.billing_contact_id;
    if (!contactId) {
      const { data: owner } = await supabaseAdmin
        .from("profiles").select("id, full_name").eq("company_id", company.id).eq("role", "admin").limit(1).maybeSingle();
      const { data: authUser } = owner
        ? await supabaseAdmin.auth.admin.getUserById(owner.id)
        : { data: null };

      const { data: contact } = await supabaseAdmin.from("contacts").insert([{
        company_id: operatorId,
        name: company.name,
        email: authUser?.user?.email || null,
      }]).select().single();
      contactId = contact?.id;
      await supabaseAdmin.from("companies").update({ billing_contact_id: contactId }).eq("id", company.id);
    }

    let jobId = company.billing_job_id;
    if (!jobId) {
      const { data: job } = await supabaseAdmin.from("jobs").insert([{
        company_id: operatorId,
        contact_id: contactId,
        title: `Software subscription — ${company.name}`,
        status: "active",
      }]).select().single();
      jobId = job?.id;
      await supabaseAdmin.from("companies").update({ billing_job_id: jobId }).eq("id", company.id);
    }
    if (!jobId) {
      results.skipped.push({ company: company.name, reason: "couldn't create a billing job" });
      continue;
    }

    const periodStart = company.next_renewal_at;
    const periodEnd = addPeriod(periodStart, company.billing_period);
    const dueDate = addDays(today, GRACE_DAYS);

    // Subscriptions aren't attached to a job — a job_id is required elsewhere but this
    // is billing for software, so it stands alone.
    const { data: invoice, error } = await supabaseAdmin.from("invoices").insert([{
      company_id: operatorId,
      job_id: jobId,
      date: today,
      due_date: dueDate,
      amount: company.price,
      payment_status: "unpaid",
      send_reminders: true,
      approval_status: "approved",
      note: `${company.billing_period === "annual" ? "Annual" : "Monthly"} subscription — ${periodStart} to ${periodEnd}`,
      subscription_company_id: company.id,
      subscription_period_start: periodStart,
      subscription_period_end: periodEnd,
    }]).select().single();

    if (error) {
      results.skipped.push({ company: company.name, reason: error.message });
      continue;
    }

    await supabaseAdmin.from("line_items").insert([{
      parent_type: "invoice",
      parent_id: invoice.id,
      company_id: operatorId,
      description: `Job management software — ${company.billing_period === "annual" ? "12 months" : "1 month"} (${periodStart} to ${periodEnd})`,
      quantity: 1,
      unit: "each",
      unit_cost: company.price,
      markup_pct: 0,
      is_material: false,
      is_tool: false,
      is_labour: false,
      sort_order: 0,
    }]);

    // Sending goes through the same route a client invoice uses, so there's one code
    // path for email formatting, tracking and the pay link.
    try {
      await fetch(`${origin}/api/documents/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
          "x-internal-send": "1",
        },
        body: JSON.stringify({ kind: "invoice", id: invoice.id }),
      });
    } catch (e) {
      // The invoice exists and is visible in the operator's list; it can be sent by hand.
    }

    // Moved forward now so a failed send doesn't cause a duplicate tomorrow.
    await supabaseAdmin.from("companies").update({
      next_renewal_at: periodEnd,
      subscription_status: "past_due",
    }).eq("id", company.id);

    results.invoiced++;
  }

  // --- 2. Restrict anyone past the grace period -----------------------------
  const { data: overdue } = await supabaseAdmin
    .from("invoices")
    .select("id, subscription_company_id, due_date, payment_status")
    .not("subscription_company_id", "is", null)
    .neq("payment_status", "paid")
    .lt("due_date", today);

  for (const inv of overdue || []) {
    await supabaseAdmin.from("companies")
      .update({ restricted_at: new Date().toISOString() })
      .eq("id", inv.subscription_company_id)
      .is("restricted_at", null);
    results.restricted++;
  }

  // --- 3. Lift the restriction on anyone who has paid -----------------------
  const { data: restricted } = await supabaseAdmin
    .from("companies").select("id").not("restricted_at", "is", null);

  for (const company of restricted || []) {
    const { data: unpaid } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("subscription_company_id", company.id)
      .neq("payment_status", "paid")
      .lt("due_date", today);

    if (!unpaid || unpaid.length === 0) {
      await supabaseAdmin.from("companies")
        .update({ restricted_at: null, subscription_status: "active" })
        .eq("id", company.id);
      results.restored++;
    }
  }

  return Response.json(results);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addPeriod(dateStr, period) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (period === "annual") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
