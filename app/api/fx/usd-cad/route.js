import { createClient } from "@supabase/supabase-js";
import { getUsdCadRate } from "@/lib/fxRate";

// Rate lookup for the receipts screen. Proxied through the server rather than called
// from the browser so the Bank of Canada request isn't subject to CORS, and so the
// same code path serves both the UI and the sync job.
export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const result = await getUsdCadRate(date);
  return Response.json(result);
}
