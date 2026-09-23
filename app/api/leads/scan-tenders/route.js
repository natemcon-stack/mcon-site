import { createClient } from "@supabase/supabase-js";
import { isCronRequest } from "@/lib/cronAuth";

// Scans the Government of Canada's official open-data tender feed (CanadaBuys)
// for keywords matching this company's target lead types, and files matches as leads
// for review. Runs on a schedule (see vercel.json) or can be triggered by an
// admin from the Leads page.
//
// Coverage note: this feed is FEDERAL tenders only. Provincial (BC Bid) and
// municipal (MERX/Biddingo/Bids&Tenders) postings aren't in this open dataset —
// see the saved-search links on the Leads page for those.

const KEYWORDS = {
  bollard_removal: ["bollard removal", "remove bollard", "bollard demolition"],
  bollard_painting: ["bollard painting", "paint bollard", "bollard coating"],
  rollout: ["rollout", "roll-out", "roll out program", "multi-site", "multiple locations"],
};

const FEED_URL = "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv";

function parseCsvLine(line) {
  // Minimal CSV parser tolerant of quoted commas — good enough for this feed.
  const result = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) { result.push(cur); cur = ""; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

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

export async function GET(request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!(await isAuthorized(request, supabaseAdmin))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const res = await fetch(FEED_URL);
  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  const titleIdx = headers.findIndex((h) => h.toLowerCase().includes("title-titre-eng"));
  const orgIdx = headers.findIndex((h) => h.toLowerCase().includes("contractingentityname") || h.toLowerCase().includes("orgentity"));
  const refIdx = headers.findIndex((h) => h.toLowerCase().includes("referencenumber") || h.toLowerCase().includes("solicitationnumber"));
  const closeIdx = headers.findIndex((h) => h.toLowerCase().includes("closingdate"));
  const urlIdx = headers.findIndex((h) => h.toLowerCase().includes("noticeurl") || h.toLowerCase().includes("tenderurl"));

  let found = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const title = (cols[titleIdx] || "").trim();
    if (!title) continue;
    const lower = title.toLowerCase();

    let matchedCategory = null;
    for (const [category, terms] of Object.entries(KEYWORDS)) {
      if (terms.some((t) => lower.includes(t))) { matchedCategory = category; break; }
    }
    if (!matchedCategory) continue;

    const ref = (cols[refIdx] || `${i}`).trim();
    const { data: existing } = await supabaseAdmin
      .from("leads").select("id").eq("source", "canadabuys").eq("external_ref", ref).maybeSingle();
    if (existing) continue;

    await supabaseAdmin.from("leads").insert([{
      source: "canadabuys",
      external_ref: ref,
      title,
      organization: (cols[orgIdx] || "").trim(),
      category: matchedCategory,
      region: "Canada (federal)",
      closing_date: cols[closeIdx] ? cols[closeIdx].trim().slice(0, 10) : null,
      url: (cols[urlIdx] || "").trim() || null,
      snippet: title,
    }]);
    found++;
  }

  return Response.json({ found });
}
