import { extractPdfText } from "@/lib/pdfText";
import { parseReceipt } from "@/lib/receiptParser";
import Tesseract from "tesseract.js";

export async function refreshAccessToken(refresh_token) {
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

function guessAmount(text) {
  const totalMatch = (text || "").match(/total[^$]{0,20}\$?\s?([0-9]{1,6}(?:,[0-9]{3})*\.[0-9]{2})/i);
  if (totalMatch) return Number(totalMatch[1].replace(/,/g, ""));
  const all = [...(text || "").matchAll(/\$\s?([0-9]{1,6}(?:,[0-9]{3})*\.[0-9]{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
  return all.length ? Math.max(...all) : null;
}
function guessGst(text) {
  const match = (text || "").match(/(?:gst|hst)[^$0-9]{0,15}\$?\s?([0-9]{1,5}(?:,[0-9]{3})*\.[0-9]{2})/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}
// Currency detection. A bare "$" is ambiguous — Canadian and US receipts both use it —
// so this only claims USD on an explicit marker. Anything unmarked stays null and is
// treated as CAD downstream, which is the right default for a BC contractor and errs
// toward not silently applying a conversion that wasn't wanted.
function guessCurrency(text) {
  const t = String(text || "");
  if (/\b(usd|us\s?dollars?)\b/i.test(t) || /US\s?\$/.test(t) || /\$\s?[0-9][0-9,.]*\s?USD\b/i.test(t)) {
    // A receipt can mention both — "prices in USD, total in CAD". If CAD is stated as
    // the charged currency, trust that over the USD mention.
    if (/\btotal[^\n]{0,40}\bcad\b/i.test(t) || /\bcharged in cad\b/i.test(t)) return "CAD";
    return "USD";
  }
  if (/\b(cad|canadian\s?dollars?)\b/i.test(t) || /CA\s?\$/.test(t)) return "CAD";
  return null;
}

function guessPoNumber(text) {
  const match = (text || "").match(/p\.?\s*o\.?\s*(?:number|#|:)?\s*#?\s*([a-z0-9-]{2,20})/i)
    || (text || "").match(/purchase\s*order\s*(?:number|#|:)?\s*#?\s*([a-z0-9-]{2,20})/i);
  return match ? match[1].trim() : null;
}

function decodeBase64Url(data) {
  if (!data) return Buffer.alloc(0);
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function extractBodyText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).toString("utf-8").replace(/<[^>]+>/g, " ");
  }
  return "";
}

function extractHtmlBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const html = extractHtmlBody(part);
      if (html) return html;
    }
  }
  return "";
}

function findPdfAttachment(payload) {
  if (!payload) return null;
  if (payload.filename?.toLowerCase().endsWith(".pdf") && payload.body?.attachmentId) {
    return { filename: payload.filename, attachmentId: payload.body.attachmentId };
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = findPdfAttachment(part);
      if (found) return found;
    }
  }
  return null;
}

function findImageAttachments(payload, found = []) {
  if (!payload) return found;
  if (/\.(jpe?g|png)$/i.test(payload.filename || "") && payload.body?.attachmentId && found.length < 2) {
    found.push({ filename: payload.filename, attachmentId: payload.body.attachmentId });
  }
  if (payload.parts) payload.parts.forEach((part) => findImageAttachments(part, found));
  return found;
}

async function tryFollowInvoiceLink(html) {
  const hrefMatches = [...(html || "").matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const candidates = hrefMatches.filter((url) =>
    /invoice|receipt|view.?bill|statement/i.test(url) && /^https?:\/\//i.test(url)
  ).slice(0, 2);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const pageHtml = await res.text();
      const text = pageHtml.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
      if (text.length > 200) return text;
    } catch (e) {
      // link required auth, timed out, or was JS-rendered — skip silently
    }
  }
  return "";
}

// Fetches one Gmail message by id and runs the full extraction pipeline
// (PDF attachment -> image OCR -> hosted-link fallback -> regex parsing).
// Shared by both the daily sync (new messages) and the manual rescan
// (re-running the pipeline on a message already in the database).
export async function processGmailMessage({ accessToken, msgId, supabaseAdmin }) {
  const detailRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const detail = await detailRes.json();
  const headers = {};
  (detail.payload?.headers || []).forEach((h) => { headers[h.name] = h.value; });
  const bodyText = extractBodyText(detail.payload);
  let sourceText = `${headers.Subject || ""} ${bodyText}`;
  let attachmentPath = null;
  let usedMethod = "email body only";

  const pdfAttachment = findPdfAttachment(detail.payload);
  if (pdfAttachment) {
    try {
      const attRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${pdfAttachment.attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const attData = await attRes.json();
      const pdfBuffer = decodeBase64Url(attData.data);
      const pdfText = await extractPdfText(pdfBuffer);
      if (pdfText) sourceText += ` ${pdfText}`;
      const path = `receipts/${msgId}-${pdfAttachment.filename}`;
      const { error: uploadError } = await supabaseAdmin.storage.from("documents").upload(path, pdfBuffer, {
        contentType: "application/pdf", upsert: true,
      });
      if (!uploadError) { attachmentPath = path; usedMethod = "PDF attachment"; }
    } catch (e) { /* fall through */ }
  }

  if (!attachmentPath) {
    const images = findImageAttachments(detail.payload);
    for (const img of images) {
      try {
        const attRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${img.attachmentId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const attData = await attRes.json();
        const imgBuffer = decodeBase64Url(attData.data);
        const { data: { text: ocrText } } = await Tesseract.recognize(imgBuffer, "eng");
        if (ocrText) sourceText += ` ${ocrText}`;
        const path = `receipts/${msgId}-${img.filename}`;
        const { error: uploadError } = await supabaseAdmin.storage.from("documents").upload(path, imgBuffer, { upsert: true });
        if (!uploadError && !attachmentPath) { attachmentPath = path; usedMethod = "image OCR"; }
      } catch (e) { /* OCR failed on this image — skip it */ }
    }
  }

  if (!attachmentPath) {
    const htmlBody = extractHtmlBody(detail.payload);
    const linkedText = await tryFollowInvoiceLink(htmlBody);
    if (linkedText) { sourceText += ` ${linkedText}`; usedMethod = "followed link"; }
  }

  // Parsed line by line against real supplier layouts. The previous flat-text patterns
  // scored zero against actual receipts from Rona, Columbia Fuels, Relay and the rest —
  // mostly because every vendor prints its GST registration number right after the word
  // GST, so a pattern looking for "GST then a number" found the registration.
  const parsed = parseReceipt(sourceText);

  return {
    headers,
    extracted_amount: parsed.total,
    extracted_gst: parsed.gst,
    extracted_pst: parsed.pst,
    // The sender's display name is a fallback only — "billing@" or "no-reply" tells you
    // nothing, and plenty of suppliers send through a third party.
    extracted_vendor: parsed.vendor || (headers.From || "").split("<")[0].trim() || null,
    extracted_currency: guessCurrency(sourceText),
    extracted_date: parsed.date,
    matched_po_number: parsed.poNumber || guessPoNumber(sourceText),
    parse_warnings: parsed.warnings,
    attachment_path: attachmentPath,
    usedMethod,
  };
}
