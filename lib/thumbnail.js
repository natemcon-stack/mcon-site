"use client";

// Generates a downscaled copy of an image in the browser.
//
// Supabase's on-the-fly image transformation is a paid add-on that isn't enabled on this
// project, so every view of a job's photos was downloading the full-size originals —
// 3-5 MB per phone photo, several hundred megabytes for a busy week. That's slow on
// wifi and unusable on a hotspot, and it's what made photos fail to load and print
// previews stall.
//
// So the app makes its own rendition at upload time and stores it alongside the
// original. The original is never modified or discarded — it stays the archival copy,
// and remains what the EXIF backfill reads.

// 1400px on the long edge: comfortably sharp for a half-page print at 105mm, and around
// 150-300 KB instead of several megabytes.
const MAX_EDGE = 1400;
const QUALITY = 0.72;

// Reading the file through createImageBitmap where available avoids decoding the whole
// image into a DOM element, which matters on phones with limited memory.
async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch (e) {
      // Some browsers reject certain JPEGs here; fall through to the <img> path.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Returns { blob, reason }. blob is null when no thumbnail was produced, and reason
// says why — without that, a backfill that quietly skips everything gives no way to tell
// a decode failure from an image that simply didn't need shrinking.
export async function makeThumbnail(file) {
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch (e) {
    return { blob: null, reason: `couldn't decode (${e?.message || "unknown"})` };
  }

  try {
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    if (!width || !height) return { blob: null, reason: "no readable dimensions" };

    // Only skip when the image is small in both pixels and bytes. An image can be
    // modest in dimensions but still multiple megabytes, and those are worth
    // re-encoding — the earlier version bailed out on the pixel check alone.
    if (Math.max(width, height) <= MAX_EDGE && file.size < 600000) {
      return { blob: null, reason: `already small (${width}x${height}, ${Math.round(file.size / 1024)} KB)` };
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: null, reason: "no canvas context" };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    if (bitmap.close) bitmap.close();

    let blob;
    try {
      blob = await new Promise((resolve, reject) => {
        // toBlob reports failure by handing back null; a tainted canvas throws instead.
        try {
          canvas.toBlob((b) => resolve(b), "image/jpeg", QUALITY);
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      return { blob: null, reason: `encode blocked (${err?.message || "security"})` };
    }

    if (!blob) return { blob: null, reason: "encoder returned nothing" };
    if (blob.size >= file.size) {
      return { blob: null, reason: `no saving (${Math.round(blob.size / 1024)} KB vs ${Math.round(file.size / 1024)} KB)` };
    }
    return { blob, reason: null };
  } catch (e) {
    return { blob: null, reason: `failed (${e?.message || "unknown"})` };
  }
}

// Thumbnails live under a parallel prefix so the two are trivially related and a stray
// thumbnail can never be mistaken for an original.
export function thumbPathFor(storagePath) {
  return storagePath ? `thumbs/${storagePath}` : null;
}
