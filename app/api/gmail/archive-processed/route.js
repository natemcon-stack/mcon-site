import { createClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "@/lib/gmailReceiptProcessor";
import { brand } from "@/lib/brand";

const LABEL_NAME = brand.gmailReceiptLabel;

async function isAdmin(request, supabaseAdmin) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  // A foreman needs this for receipt filing.
  return ["admin", "foreman"].includes(profile?.role);
}

async function getOrCreateLabel(accessToken) {
  const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = await listRes.json();
  const existing = (listData.labels || []).find((l) => l.name === LABEL_NAME);
  if (existing) return existing.id;

  const createRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: LABEL_NAME, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  const createData = await createRes.json();
  return createData.id;
}

// Moves a receipt email out of the inbox into a dedicated label once it's been
// recorded as an expense — archives it out of the way in Gmail without deleting
// anything. Only ever called after a receipt is confirmed, never on dismiss (a
// dismissed "not a receipt" email is left completely untouched in Gmail).
export async function POST(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAdmin(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { receiptId } = await request.json();
  const { data: receipt } = await supabaseAdmin.from("gmail_receipts").select("*").eq("id", receiptId).single();
  if (!receipt) return new Response("Not found", { status: 404 });

  const { data: connection } = await supabaseAdmin.from("gmail_connections").select("*").eq("user_id", receipt.user_id).maybeSingle();
  if (!connection) return new Response("No Gmail connection found", { status: 400 });

  const accessToken = await refreshAccessToken(connection.refresh_token);
  if (!accessToken) return new Response("Couldn't refresh Gmail access — the connection may need reconnecting", { status: 500 });

  const labelId = await getOrCreateLabel(accessToken);
  if (!labelId) return new Response("Couldn't create/find the Gmail label", { status: 500 });

  const modifyRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${receipt.gmail_message_id}/modify`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ addLabelIds: [labelId], removeLabelIds: ["INBOX"] }),
    }
  );
  if (!modifyRes.ok) {
    const err = await modifyRes.text();
    return new Response("Gmail label move failed: " + err, { status: 500 });
  }

  return Response.json({ moved: true });
}
