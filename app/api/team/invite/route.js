import { createClient } from "@supabase/supabase-js";

// Invites a new person by email (Supabase sends them a signup link) and
// pre-creates their profile with the name/role you specify, so it's already
// set up correctly the moment they accept — rather than defaulting to
// "employee" with their email as their name on first login.
async function isAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAdmin(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { email, fullName, role, password } = await request.json();
  if (!email) return new Response("Missing email", { status: 400 });

  const VALID_ROLES = ["admin", "foreman", "employee"];
  const wantedRoleEarly = VALID_ROLES.includes(role) ? role : "employee";

  // With a password supplied, create the account outright and skip email entirely.
  // Corporate mail scanners consume single-use links before the recipient sees them,
  // which makes invite emails unreliable for exactly the people who most need to get in.
  if (password) {
    if (String(password).length < 8) {
      return new Response("Password must be at least 8 characters", { status: 400 });
    }
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: fullName || null },
    });
    if (createError) {
      return new Response("Couldn't create that account: " + createError.message, { status: 500 });
    }
    await supabaseAdmin.from("profiles").upsert([{
      id: created.user.id,
      full_name: fullName || null,
      role: wantedRoleEarly,
      is_active: true,
    }], { onConflict: "id" });

    return Response.json({ invited: true, created: true, email, password: String(password) });
  }

  const { origin } = new URL(request.url);
  const wantedRole = VALID_ROLES.includes(role) ? role : "employee";

  // Invite first; if the address already has an account, fall back to a recovery link
  // instead of failing. Re-inviting someone is a normal thing to do when their first
  // link expired, and it shouldn't come back as an error.
  let userId = null;
  let link = null;

  const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/set-password`,
  });

  if (!inviteError) {
    userId = invited.user.id;
    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite", email, options: { redirectTo: `${origin}/set-password` },
    });
    link = linkData?.properties?.action_link || null;
  } else {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const existing = (list?.users || []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!existing) {
      return new Response("Couldn't send invite: " + inviteError.message, { status: 500 });
    }
    userId = existing.id;
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery", email, options: { redirectTo: `${origin}/set-password` },
    });
    if (linkError) {
      return new Response("That address already has an account, and a reset link couldn't be generated: " + linkError.message, { status: 500 });
    }
    link = linkData?.properties?.action_link || null;
  }

  // Upsert rather than insert: a trigger now creates a profile the moment the auth user
  // exists, and the row may already be there from a previous invite. Either way the
  // requested name and role are applied.
  await supabaseAdmin.from("profiles").upsert([{
    id: userId,
    full_name: fullName || null,
    role: wantedRole,
    is_active: true,
  }], { onConflict: "id" });

  // Returned so an admin can pass it on directly — email delivery is the part that
  // most often fails, and it's what leaves someone stranded.
  return Response.json({ invited: true, existing: Boolean(inviteError), link });
}
