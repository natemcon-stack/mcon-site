// Rebuilds a PDF page's LINES from pdf.js text items.
//
// Deliberately kept in its own file with no Node imports, because both the browser
// (the Import and PDF Library pages) and the server (receipt scanning) need it. Putting
// it alongside the server-only extractor broke the build: webpack can't resolve Node's
// "module" package for a browser bundle.
//
// pdf.js reports each item with a transform matrix; index 5 is its vertical position
// and index 4 its horizontal. Items sharing a y-position were printed on the same line,
// so grouping by it reconstructs the rows, and sorting each row by x puts the columns
// back in reading order.
//
// This matters more than it sounds: joining every item on a page with a space — which
// is what the code did before — destroys the row structure that invoice parsing depends
// on entirely. Flattened, a Rona receipt reported the paintbrush list price as the
// invoice total.

// How far apart two items can sit vertically and still count as one line. Generous
// enough for baseline wobble within a table row, tight enough not to merge two rows.
const LINE_TOLERANCE = 2.5;

export function itemsToLines(items) {
  const rows = [];

  for (const item of items) {
    const str = item.str;
    if (!str || !str.trim()) continue;

    // transform = [a, b, c, d, x, y]
    const y = item.transform?.[5] ?? 0;
    const x = item.transform?.[4] ?? 0;

    // Linear search: a page has tens of rows, not thousands.
    let row = rows.find((r) => Math.abs(r.y - y) <= LINE_TOLERANCE);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, str });
  }

  return rows
    // Top of the page downwards — pdf.js measures y from the bottom.
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        // Collapse the runs of spaces that come from column padding, while keeping the
        // single space separating a label from its value.
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean);
}
