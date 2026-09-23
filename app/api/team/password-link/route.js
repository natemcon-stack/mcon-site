import { createClient } from "@supabase/supabase-js";

// Generates a set-password link for an existing team member and returns it to the
// admin, rather than relying on an email arriving.
//
// Two reasons this exists. Emails are the weak link — Supabase's built-in mail service
// is rate-limited to a handful an hour and silently drops the rest, which is how someone
// ends up with an account they can't get into. And the email address lives in auth.users,
// not profiles, so the browser can't look it up: profiles has no email column and the
// auth schema isn't reachable with the anon key.
//
// The returned link is a credential — anyone holding it can set that account's password.
// It's shown once to an admin who already has full access, and it expires on its own.

async function requireAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? user : null;
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!(await requireAdmin(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { profileId } = await request.json();
  if (!profileId) return new Response("Missing profileId", { status: 400 });

  const { data: userResult, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(profileId);
  if (lookupError || !userResult?.user?.email) {
    return new Response("Couldn't find a login for that person", { status: 404 });
  }
  const email = userResult.user.email;

  const { origin } = new URL(request.url);
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/set-password` },
  });

  if (error) {
    return new Response(`Couldn't generate a link: ${error.message}`, { status: 500 });
  }

  // generateLink also triggers the email where SMTP is configured; the URL is returned
  // so it can be passed on by text or in person when it isn't.
  return Response.json({ email, link: data?.properties?.action_link || null });
}
