// Headers, footers and page numbers on the source pages: text lines that belong to no placed
// block, sit in the top or bottom band of the page, and come back at the same height on other
// pages. Their text may differ from page to page (a page number); their place does not.
// Only text Word marked as an artifact counts: the table of contents and other text this plugin
// does not move also belong to no block, and their first and last lines sit in the band too.
// The regions have the shape PDF import leaves in `excluded`, so the comparison hatches them alike.

// Part of the page height counted as its top or bottom band. Word's default margin is 2.54 cm, a
// header or footer line sits inside it.
export const BAND = 0.12;
// Points two lines on different pages may differ in height and still be at the same place.
const SAME = 1.5;
// Pages a line must come back on, at least.
const PAGES = 2;

const round = x => Math.round(x * 100) / 100;
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.top < b.bottom && b.top < a.bottom;

// Items on one height are one line; a wide gap (a header with text on the left and on the right)
// starts another piece of it.
export function textLines(items) {
  const rows = [];
  for (const it of [...items].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
    const middle = (it.top + it.bottom) / 2;
    const row = rows.find(r => middle >= r.top && middle <= r.bottom);
    if (row) { row.items.push(it); row.top = Math.min(row.top, it.top); row.bottom = Math.max(row.bottom, it.bottom); }
    else rows.push({ top: it.top, bottom: it.bottom, items: [it] });
  }
  return rows.flatMap(r => {
    const out = [];
    for (const it of r.items.sort((a, b) => a.x0 - b.x0)) {
      const last = out.at(-1);
      if (last && it.x0 - last.x1 <= 2 * (r.bottom - r.top)) { last.x1 = Math.max(last.x1, it.x1); last.top = Math.min(last.top, it.top); last.bottom = Math.max(last.bottom, it.bottom); }
      else out.push({ x0: it.x0, x1: it.x1, top: it.top, bottom: it.bottom });
    }
    return out;
  });
}

// pages: [{width, height, artifacts}] with text boxes in page points from the top;
// blocks: the placed blocks [{boxes: [{page, x0, top, x1, bottom}]}].
// → [{page, kind: "margin", box: {page, x0, top, x1, bottom}}].
export function pageFrames(pages, blocks) {
  const placed = pages.map(() => []);
  for (const b of blocks) for (const x of b.boxes) placed[x.page]?.push(x);
  const candidates = pages.map((p, page) => textLines(p.artifacts || []).filter(l =>
    (l.bottom <= p.height * BAND || l.top >= p.height * (1 - BAND)) && !placed[page].some(x => overlaps(l, x))));
  const same = (a, b) => Math.abs(a.top - b.top) <= SAME && Math.abs(a.bottom - b.bottom) <= SAME;
  return candidates.flatMap((lines, page) => lines
    .filter(l => candidates.filter((other, n) => n === page || other.some(o => same(o, l))).length >= PAGES)
    .map(l => ({ page, kind: "margin", box: { page, x0: round(l.x0), top: round(l.top), x1: round(l.x1), bottom: round(l.bottom) } })));
}
