import { createClient } from "@supabase/supabase-js";

// Who's signed up, for whoever runs the platform.
//
// Ordinary admins are scoped to their own company by RLS, which is the whole point of
// the tenancy work — so this deliberately uses the service role to see across it. That
// makes the access check here the only thing standing between one customer and a list
// of all the others, so it's an explicit allow-list of operator addresses rather than
// anything role-derived.
//
// Set PLATFORM_ADMIN_EMAILS to a comma-separated list. Unset means nobody qualifies,
// which fails closed.

function operatorEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user?.email) return new Response("Unauthorized", { status: 401 });

  const allowed = operatorEmails();
  if (!allowed.includes(user.email.toLowerCase())) {
    // Same response as a bad token: someone poking at this shouldn't learn that a
    // platform view exists at all.
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, name, subscription_status, trial_ends_at, promo_code, created_at")
    .order("created_at", { ascending: false });

  // Counts per company, gathered in one pass rather than a query per company.
  const [{ data: profiles }, { data: jobs }, { data: invoices }] = await Promise.all([
    supabaseAdmin.from("profiles").select("company_id, is_active"),
    supabaseAdmin.from("jobs").select("company_id"),
    supabaseAdmin.from("invoices").select("company_id, amount"),
  ]);

  const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
  const emailById = new Map((userList?.users || []).map((u) => [u.id, u.email]));
  const { data: owners } = await supabaseAdmin
    .from("profiles").select("id, company_id, full_name, role").eq("role", "admin");

  const tally = (rows, key) => (rows || []).reduce((acc, r) => {
    acc[r[key]] = (acc[r[key]] || 0) + 1;
    return acc;
  }, {});

  const people = tally(profiles, "company_id");
  const activePeople = tally((profiles || []).filter((p) => p.is_active), "company_id");
  const jobCount = tally(jobs, "company_id");
  const invoiceCount = tally(invoices, "company_id");

  const result = (companies || []).map((c) => {
    const companyOwners = (owners || [])
      .filter((o) => o.company_id === c.id)
      .map((o) => ({ name: o.full_name, email: emailById.get(o.id) }));

    // How much they've actually put in. A company that signed up and never created a
    // job is a very different signal from one running twenty.
    return {
      ...c,
      people: people[c.id] || 0,
      activePeople: activePeople[c.id] || 0,
      jobs: jobCount[c.id] || 0,
      invoices: invoiceCount[c.id] || 0,
      owners: companyOwners,
      trialDaysLeft: c.trial_ends_at
        ? Math.ceil((new Date(c.trial_ends_at) - new Date()) / 86400000)
        : null,
    };
  });

  return Response.json({ companies: result });
}
