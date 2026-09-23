import { createClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cronAuth";

// Scans recent inbox mail for messages that look like they're waiting on a reply
// from you — surfaced on the Today page. This is a keyword heuristic, not true
// understanding of the email — it'll miss some and occasionally flag something
// that doesn't actually need a reply, so it's meant as a prompt to glance at,
// not a guarantee.
async function isAuthorized(request, supabaseAdmin) {
  const authHeader = request.headers.get("authorization") || "";
  if (isCronRequest(request)) return true;
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

async function refreshAccessToken(refresh_token) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

function decodeBase64Url(data) {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}
function extractBodyText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

const REPLY_PHRASES = [
  "let me know", "please confirm", "can you", "could you", "please advise",
  "your response", "get back to me", "please reply", "awaiting your reply",
  "waiting on your", "waiting for your", "when can you", "please respond",
  "look forward to hearing", "please call", "give me a call", "please email",
];
const AUTOMATED_SENDER_PATTERNS = ["noreply", "no-reply", "donotreply", "notifications@", "notification@", "mailer-daemon", "newsletter"];

function shouldFlag(fromEmail, subject, body) {
  const lowerFrom = (fromEmail || "").toLowerCase();
  if (AUTOMATED_SENDER_PATTERNS.some((p) => lowerFrom.includes(p))) return null;
  const text = `${subject || ""} ${body || ""}`.toLowerCase();
  if (text.includes("unsubscribe") && !text.includes("please")) return null; // likely bulk/marketing
  const matched = REPLY_PHRASES.find((p) => text.includes(p));
  if (matched) return `contains "${matched}"`;
  if (text.trim().endsWith("?") || /\?\s*$/.test(subject || "")) return "ends with a question";
  return null;
}

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAuthorized(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: connections } = await supabaseAdmin.from("gmail_connections").select("*");
  let flagged = 0;

  for (const conn of connections || []) {
    const accessToken = await refreshAccessToken(conn.refresh_token);
    if (!accessToken) continue;

    const query = encodeURIComponent("in:inbox newer_than:3d -category:promotions -category:social");
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=30`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const list = await listRes.json();

    for (const msg of list.messages || []) {
      const { data: existing } = await supabaseAdmin
        .from("email_action_items").select("id").eq("gmail_message_id", msg.id).maybeSingle();
      if (existing) continue;

      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const detail = await detailRes.json();
      const headers = {};
      (detail.payload?.headers || []).forEach((h) => { headers[h.name] = h.value; });
      const bodyText = extractBodyText(detail.payload) || detail.snippet || "";

      const reason = shouldFlag(headers.From, headers.Subject, bodyText);
      if (reason) {
        await supabaseAdmin.from("email_action_items").insert([{
          gmail_message_id: msg.id,
          from_email: headers.From || "",
          subject: headers.Subject || "(no subject)",
          snippet: detail.snippet || bodyText.slice(0, 200),
          reason,
          received_at: headers.Date ? new Date(headers.Date).toISOString() : new Date().toISOString(),
        }]);
        flagged++;
      }
    }
  }

  return Response.json({ flagged });
}
