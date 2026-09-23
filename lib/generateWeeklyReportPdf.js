"use client";
import { jsPDF } from "jspdf";

// Builds the weekly report as a real PDF file instead of going through the browser's
// print dialog.
//
// Printing was the wrong tool here. Chrome's print preview has to rasterize every page
// at once, and a week with a hundred multi-megabyte phone photos is enough to make it
// hang indefinitely — there's no progress, no error, and no way to intervene. Building
// the document directly avoids that entirely: images are downscaled one at a time before
// being placed, so peak memory stays flat no matter how many photos there are, and the
// result is a file that saves straight to disk with a sensible name.
//
// It also removes the browser's own page headers and footers, which were putting a URL
// and page title on a document that goes to clients.

const PAGE_W = 210; // A4 portrait, millimetres
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

// 2x2 grid of photos per page.
const GUTTER = 6;
const CELL_W = (CONTENT_W - GUTTER) / 2;
const CELL_H = 105;
const CAPTION_H = 6;

// Photos are downscaled before being embedded. 1000px on the long edge is more detail
// than a 88mm-wide placement can show, and a fraction of the bytes of a phone original.
const MAX_EDGE = 1000;
const JPEG_QUALITY = 0.7;

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Fetches an image and returns a downscaled JPEG data URL plus its dimensions.
// Returns null on any failure — one unreadable photo shouldn't abort the whole report.
async function loadScaledImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();

    const bitmap = await createImageBitmap(blob).catch(async () => {
      // Safari and older browsers: fall back to an <img> decode.
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = objectUrl;
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    });

    const w = bitmap.width || bitmap.naturalWidth;
    const h = bitmap.height || bitmap.naturalHeight;
    if (!w || !h) return null;

    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    // White behind any transparency, so a PNG doesn't come out with a black background.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();

    return {
      dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      width: canvas.width,
      height: canvas.height,
    };
  } catch (e) {
    return null;
  }
}

// Fits a width x height box inside CELL_W x CELL_H without distorting it, and centres
// what's left over — the printed equivalent of object-fit: contain.
function fitted(width, height) {
  const scale = Math.min(CELL_W / width, CELL_H / height);
  const w = width * scale;
  const h = height * scale;
  return { w, h, dx: (CELL_W - w) / 2, dy: (CELL_H - h) / 2 };
}

export async function generateWeeklyReportPdf({
  job,
  company,
  weekStart,
  photos,
  photoUrls,
  hoursByWorker,
  totalHours,
  includeHours,
  onProgress,
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  // ---- Letterhead ----------------------------------------------------------
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(`${job.title} — Weekly Report`, MARGIN, y);

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(company.companyName || "", PAGE_W - MARGIN, y, { align: "right" });
  y += 5;

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Week of ${weekStart}`, MARGIN, y);

  let rightY = y;
  for (const line of [company.address, company.phone, company.replyTo].filter(Boolean)) {
    doc.text(String(line), PAGE_W - MARGIN, rightY, { align: "right" });
    rightY += 4;
  }

  y = Math.max(y + 6, rightY + 2);
  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;
  doc.setTextColor(0);

  // ---- Hours (only when this client's reports include them) ----------------
  if (includeHours) {
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Hours by worker", MARGIN, y);
    y += 6;

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const entries = Object.entries(hoursByWorker || {});
    if (entries.length === 0) {
      doc.setTextColor(130);
      doc.text("No hours logged this week.", MARGIN, y);
      doc.setTextColor(0);
      y += 6;
    } else {
      for (const [name, hrs] of entries) {
        doc.text(String(name), MARGIN, y);
        doc.text(`${hrs} hrs`, PAGE_W - MARGIN, y, { align: "right" });
        y += 5;
      }
      doc.setDrawColor(220);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 5;
      doc.setFont(undefined, "bold");
      doc.text("Total", MARGIN, y);
      doc.text(`${totalHours} hrs`, PAGE_W - MARGIN, y, { align: "right" });
      doc.setFont(undefined, "normal");
      y += 8;
    }
  }

  // ---- Photos, four to a page ---------------------------------------------
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text(`Photos this week (${photos.length})`, MARGIN, y);
  doc.setFont(undefined, "normal");
  y += 6;

  if (photos.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(130);
    doc.text("No photos this week.", MARGIN, y);
    doc.setTextColor(0);
  }

  // Images are fetched and scaled one at a time on purpose: it keeps memory flat, and
  // on a slow connection it means steady progress rather than everything competing.
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    if (onProgress) onProgress(i + 1, photos.length);

    const positionOnPage = i % 4;
    if (positionOnPage === 0) {
      // First group shares the page with the header if there's room for two rows.
      const needed = CELL_H * 2 + CAPTION_H * 2 + GUTTER;
      if (i === 0 && y + needed > PAGE_H - MARGIN) {
        doc.addPage();
        y = MARGIN;
      } else if (i > 0) {
        doc.addPage();
        y = MARGIN;
      }
    }

    const col = positionOnPage % 2;
    const row = Math.floor(positionOnPage / 2);
    const cellX = MARGIN + col * (CELL_W + GUTTER);
    const cellY = y + row * (CELL_H + CAPTION_H + GUTTER);

    const url = photoUrls[photo.id];
    const image = url ? await loadScaledImage(url) : null;

    if (image) {
      const { w, h, dx, dy } = fitted(image.width, image.height);
      doc.addImage(image.dataUrl, "JPEG", cellX + dx, cellY + dy, w, h, undefined, "FAST");
    } else {
      // A placeholder keeps the grid aligned and makes a missing photo obvious rather
      // than silently shifting everything after it.
      doc.setDrawColor(220);
      doc.setFillColor(245);
      doc.rect(cellX, cellY, CELL_W, CELL_H, "FD");
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("image unavailable", cellX + CELL_W / 2, cellY + CELL_H / 2, { align: "center" });
      doc.setTextColor(0);
    }

    const taken = new Date(photo.taken_at || photo.created_at).toLocaleDateString();
    const caption = photo.caption ? `${photo.caption} · ${taken}` : taken;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(doc.splitTextToSize(caption, CELL_W)[0], cellX, cellY + CELL_H + 4);
    doc.setTextColor(0);
  }

  const safeTitle = String(job.title || "job").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  doc.save(`${safeTitle}-weekly-report-${weekStart}.pdf`);
}
