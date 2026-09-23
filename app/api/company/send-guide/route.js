import { createClient } from "@supabase/supabase-js";
import { getCompanySettings } from "@/lib/companySettings";
import { getGuide, guideAsHtml, guideAsText } from "@/lib/setupGuides";

// Emails a setup guide to whoever asked for it.
//
// The same guide is on screen, so this isn't the only way to read it. But connecting
// PayPal or adding DNS records means moving between this app, another website and often
// a different machine — having the steps in your inbox is the difference between
// finishing it and abandoning it halfway.

export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role, is_active, company_id, full_name").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || profile.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { guide: guideKey, to } = await request.json();
  const guide = getGuide(guideKey);
  if (!guide) return new Response("Unknown guide", { status: 400 });

  // Defaults to the person asking, but can be sent elsewhere — often to whoever
  // actually manages their domain, who may not be the person logged in.
  const recipient = (to || "").trim() || user.email;
  if (!recipient) return new Response("No email address to send to", { status: 400 });

  const settings = await getCompanySettings(profile.company_id);
  const { origin } = new URL(request.url);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: settings.fromHeader,
      to: [recipient],
      reply_to: settings.replyTo,
      subject: `Setup guide — ${guide.title}`,
      html: guideAsHtml(guide, origin),
      text: guideAsText(guide, origin),
    }),
  });

  if (!res.ok) {
    return new Response(`Couldn't send that: ${await res.text()}`, { status: 500 });
  }

  return Response.json({ ok: true, sentTo: recipient });
}
