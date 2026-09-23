// Server-side PDF text extraction (Node build of pdf.js).
//
// Server-side by intent, though it no longer imports anything Node-specific. The
// line-rebuilding logic lives in lib/pdfLines.js so the browser-side Import and PDF
// Library pages can use it without dragging pdf.js into their bundle.
//
// Two bugs lived here, both silent:
//
//   1. pdf.js's legacy build is CommonJS, so a dynamic import puts its exports under
//      .default. getDocument was undefined, and since this function returns "" on
//      failure it failed completely quietly — receipt PDFs produced no text at all
//      while the problem looked like bad parsing.
//
//   2. Even with no worker thread, pdf.js loads its parsing engine by requiring
//      ./pdf.worker.js at runtime. Next bundles the library without tracing that
//      sibling file, so on Vercel every extraction died with "Setting up fake worker
//      failed". pdfjs-dist is now listed in serverComponentsExternalPackages so it
//      loads from node_modules where the file exists.

import { itemsToLines } from "./pdfLines.js";

export { itemsToLines };

export async function extractPdfText(buffer) {
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf.js");
    const pdfjsLib = typeof mod.getDocument === "function" ? mod : mod.default;
    if (!pdfjsLib?.getDocument) throw new Error("pdf.js did not load");

    // No explicit workerSrc here on purpose.
    //
    // Resolving it needed Node's "module" package, and this file gets pulled into the
    // browser bundle by anything that imports it transitively — which broke the build
    // twice. The real fix is next.config.mjs listing pdfjs-dist in
    // serverComponentsExternalPackages, so the library loads from node_modules and
    // finds its own worker. Defensive code that can fail a deploy is worse than none.

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      // Server-side: nothing to render, no network fetches, no eval. These avoid the
      // browser-only paths that cause most of pdf.js's trouble under Node.
      disableFontFace: true,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;

    const lines = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      lines.push(...itemsToLines(content.items));
    }
    return lines.join("\n");
  } catch (e) {
    // Still best-effort — one unreadable PDF must not break a whole sync run — but no
    // longer silent. A receipt that produced no text should be visible as a problem,
    // not indistinguishable from one with nothing in it.
    console.error("PDF text extraction failed:", e?.message || e);
    return "";
  }
}
