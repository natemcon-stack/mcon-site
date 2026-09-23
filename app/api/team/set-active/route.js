import { createClient } from "@supabase/supabase-js";

// Activates or deactivates an account properly.
//
// Setting profiles.is_active = false only tells the app to deny things. Supabase Auth
// knows nothing about that column, so the person could still sign in successfully — any
// check in the browser is advisory and can be skipped by talking to the auth endpoint
// directly. Banning the user blocks it at the auth service, before a token is ever
// issued, which is the only place it can't be worked around.
//
// Both are done together so they can't drift apart: profiles.is_active drives the app's
// policies, the ban blocks the login itself.

const FOREVER = "876000h"; // ~100 years; Supabase has no permanent-ban value

async function requireAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active").eq("id", user.id).single();
  if (!profile?.is_active || profile.role !== "admin") return null;
  return user;
}

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const admin = await requireAdmin(request, supabaseAdmin);
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const { profileId, active } = await request.json();
  if (!profileId || typeof active !== "boolean") {
    return new Response("Missing profileId or active", { status: 400 });
  }

  // Locking yourself out would need another admin to undo, and there may not be one.
  if (profileId === admin.id && !active) {
    return new Response("You can't deactivate your own account", { status: 400 });
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles").update({ is_active: active }).eq("id", profileId);
  if (profileError) {
    return new Response(`Couldn't update the profile: ${profileError.message}`, { status: 500 });
  }

  // ban_duration "none" clears an existing ban.
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
    ban_duration: active ? "none" : FOREVER,
  });

  if (authError) {
    // Roll the profile back rather than leave a half-applied state that looks done.
    await supabaseAdmin.from("profiles").update({ is_active: !active }).eq("id", profileId);
    return new Response(`Couldn't update the login: ${authError.message}`, { status: 500 });
  }

  // An already-issued token stays valid until it expires (about an hour), so kill any
  // live sessions rather than waiting it out.
  if (!active) {
    try {
      await supabaseAdmin.auth.admin.signOut(profileId, "global");
    } catch (e) {
      // Not fatal — the ban stops re-authentication, and AuthGate polls the status.
    }
  }

  return Response.json({ ok: true, active });
}
