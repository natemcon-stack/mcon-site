import { createClient } from "@supabase/supabase-js";

// Fully removes someone — deletes their actual Supabase Auth account (so they
// can never log in again, at all, regardless of any cached session) and their
// profile row. This is the ONLY way to truly cut someone off; deleting just the
// profile row alone does not do this (that was the original bug report).
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

  const { userId } = await request.json();
  if (!userId) return new Response("Missing userId", { status: 400 });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return new Response("Couldn't remove account: " + error.message, { status: 500 });

  // The profile row cascade-deletes automatically (references auth.users on
  // delete cascade), but clean up explicitly in case that's ever not the case.
  await supabaseAdmin.from("profiles").delete().eq("id", userId);

  return Response.json({ removed: true });
}
