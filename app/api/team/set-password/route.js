import { createClient } from "@supabase/supabase-js";

// Sets a password on an account directly, with no email involved.
//
// Email links are single-use, and corporate mail security (Microsoft Defender, Proofpoint
// and similar) fetches every URL in an incoming message to check it's safe — which
// consumes the token before the recipient ever clicks. The result is "link expired or
// already in use" on a link that was never touched by a human, and it's unfixable from
// this end because the scanner is doing its job.
//
// So an admin can set a password and pass it on however they like. The person signs in
// with email and password like anyone else, and can change it afterwards.

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

  const { profileId, password } = await request.json();
  if (!profileId || !password) return new Response("Missing profileId or password", { status: 400 });
  if (String(password).length < 8) return new Response("Password must be at least 8 characters", { status: 400 });

  const { data: userResult, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(profileId);
  if (lookupError || !userResult?.user) {
    return new Response("Couldn't find a login for that person", { status: 404 });
  }

  // email_confirm alongside the password matters: an account invited but never
  // confirmed will refuse a password sign-in until the address is marked confirmed,
  // and confirming normally happens by clicking the very link that keeps getting eaten.
  const { error } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
    password: String(password),
    email_confirm: true,
  });

  if (error) return new Response(`Couldn't set the password: ${error.message}`, { status: 500 });

  return Response.json({ ok: true, email: userResult.user.email });
}
