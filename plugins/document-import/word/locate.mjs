// Where each converted block sits in the PDF Word exported from the same document. The blocks'
// text is known, so this follows the PDF's text layer in order and finds the same letters; it does
// not guess. A block that is not found keeps no place, and the following blocks go on from where
// the last found block ended. Headings also take the PDF bookmark Word made for them as an anchor.
import { textOf } from "./rules.mjs";

const LETTER = /[\p{L}\p{N}]/u;
const CHUNK = 24;
// Letters allowed between two found pieces of one block: list markers, a footnote number, a
// symbol Word drew differently.
const GAP = { text: 6, item: 12, cell: 400, caption: 4000 };

// Only letters and digits count; spaces, punctuation, list bullets and case do not.
export function normalize(text) {
  let out = "";
  for (const ch of text) for (const c of ch.normalize("NFKC").toLowerCase()) if (LETTER.test(c)) out += c;
  return out;
}

// pages: [{width, height, items: [{str, x0, x1, top, bottom}]}] in content order → one string of
// letters and, for each letter, its page and box.
export function textStream(pages) {
  const letters = [], page = [], x0 = [], x1 = [], top = [], bottom = [], pageStart = [];
  pages.forEach((p, n) => {
    pageStart.push(letters.length);
    for (const it of p.items) {
      const chars = [...it.str], w = (it.x1 - it.x0) / Math.max(1, chars.length);
      chars.forEach((ch, k) => {
        for (const c of ch.normalize("NFKC").toLowerCase()) {
          if (!LETTER.test(c)) continue;
          letters.push(c); page.push(n); x0.push(it.x0 + w * k); x1.push(it.x0 + w * (k + 1)); top.push(it.top); bottom.push(it.bottom);
        }
      });
    }
  });
  pageStart.push(letters.length);
  return { text: letters.join(""), page, x0, x1, top, bottom, pageStart };
}

const inlineText = c => typeof c === "string" ? c : Array.isArray(c) ? textOf(c) : "";
const listItems = list => list.items.flatMap(item => [inlineText(item.content), ...(item.list ? listItems(item.list) : [])]);
const captionText = b => normalize((b.enumerator || "") + " " + inlineText(b.caption));
// A heading's text without the number in front: Word may draw a heading's number differently from
// the number this plugin computes, or not at all.
const bareHeading = text => normalize(text.replace(/^\s*[\dA-Za-z]{1,3}(?:[.\-][\dA-Za-z]{1,3})*\.?\s+/, ""));

function pieces(text, gap, optional = false, size = CHUNK) {
  if (text.length <= size * 1.5) return [{ text, gap, optional }];
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push({ text: text.slice(i, i + size), gap: i ? GAP.text : gap, optional });
  if (out.length > 1 && out.at(-1).text.length < size / 2) out.at(-2).text += out.pop().text;
  return out;
}

// What to look for, in order. A table's repeated merged values and the header row a split table
// repeats are looked for only right where they would be.
function piecesOf(block, previous) {
  if (block.kind === "heading" || block.kind === "paragraph") return pieces(normalize(textOf(block.content)), GAP.text);
  if (block.kind === "list") return listItems(block).flatMap(t => pieces(normalize(t), GAP.item));
  if (block.kind === "table") {
    // Word paints cell paragraphs and manual breaks on separate lines. Normalization joins
    // their letters in source order, just as it ignores the grid and punctuation.
    const rows = block.rows.map(r => r.map(c => normalize(inlineText(c))));
    const repeatedHeader = previous?.kind === "table" && !inlineText(block.caption) &&
      JSON.stringify(previous.rows[0]) === JSON.stringify(block.rows[0]);
    return rows.flatMap((row, r) => row.flatMap((cell, c) => {
      if (!cell) return [];
      const repeat = (r === 0 && repeatedHeader) || (c > 0 && row[c - 1] === cell) || (r > 0 && rows[r - 1][c] === cell);
      return pieces(cell, repeat ? 2 : GAP.cell, repeat);
    }));
  }
  return [];
}

function find(text, piece, from, to) {
  if (from < 0) from = 0;
  if (to - from < piece.length) return -1;
  const at = text.substring(from, to).indexOf(piece);
  return at < 0 ? -1 : from + at;
}

// Looks for the pieces in order from `from`. The first piece may be anywhere before `limit`; each
// next one must follow within its gap (plus the length of pieces skipped since the last found one).
function follow(text, list, from, limit) {
  let pos = from, first = -1, end = -1, got = 0, total = 0, slack = 0;
  for (const p of list) {
    if (!p.optional) total += p.text.length;
    if (first < 0 && p.optional) continue;
    const to = first < 0 ? limit : Math.min(limit, pos + p.gap + slack + p.text.length);
    const at = find(text, p.text, pos, to);
    if (at < 0) { if (!p.optional) slack += p.text.length + p.gap; continue; }
    if (first < 0) first = at;
    pos = end = at + p.text.length;
    slack = 0;
    if (!p.optional) got += p.text.length;
  }
  return { first, end, got, total };
}

// A match counts when most of the block's letters were found close together. Very short blocks
// must be found whole and near where the previous block ended.
function accept(m, kind, from) {
  if (m.first < 0 || !m.total) return false;
  const span = m.end - m.first;
  if (m.total < 6) return m.got === m.total && m.first - from <= 400;
  if (kind === "table") return m.got / m.total >= 0.5 && span <= m.total * 4 + 3000;
  return m.got / m.total >= 0.6 && span <= m.total * 2 + 300;
}

function search(text, list, kind, from, limit) {
  for (let start = from, tries = 0; tries < 4 && start < limit; tries++) {
    const m = follow(text, list, start, limit);
    if (accept(m, kind, from)) return m;
    if (m.first < 0) return null;
    start = m.first + 1;
  }
  return null;
}

// Headings against the bookmarks in order: a bookmark title is the heading's text with or without
// its number. Extra bookmarks (a table of contents, a hidden numbered paragraph) are passed over.
function headingAnchors(blocks, outline, stream) {
  const anchors = new Map();
  let k = 0, last = -1;
  blocks.forEach((b, i) => {
    if (b.kind !== "heading") return;
    const text = textOf(b.content), full = normalize(text), bare = bareHeading(text);
    for (let j = k; j < Math.min(outline.length, k + 64); j++) {
      const t = normalize(outline[j].title || "");
      if (!t || !(t === full || t === bare || (t.length >= 4 && full.endsWith(t)))) continue;
      const at = anchorIndex(stream, outline[j]);
      if (at < last) continue;
      anchors.set(i, at);
      last = at;
      k = j + 1;
      return;
    }
  });
  return anchors;
}

function anchorIndex(s, { page, top }) {
  const start = s.pageStart[page] ?? s.text.length, end = s.pageStart[page + 1] ?? s.text.length;
  for (let i = start; i < end; i++) if (s.bottom[i] > top + 1) return i;
  return end;
}

const round = v => Math.round(v * 10) / 10;
// Union of the letters' boxes, one box per page.
function boxesOf(s, first, end) {
  const byPage = new Map();
  for (let i = first; i < end; i++) {
    const b = byPage.get(s.page[i]);
    if (!b) byPage.set(s.page[i], { page: s.page[i], x0: s.x0[i], top: s.top[i], x1: s.x1[i], bottom: s.bottom[i] });
    else { b.x0 = Math.min(b.x0, s.x0[i]); b.top = Math.min(b.top, s.top[i]); b.x1 = Math.max(b.x1, s.x1[i]); b.bottom = Math.max(b.bottom, s.bottom[i]); }
  }
  return [...byPage.values()];
}
const merge = (a, b) => ({ page: a.page, x0: Math.min(a.x0, b.x0), top: Math.min(a.top, b.top), x1: Math.max(a.x1, b.x1), bottom: Math.max(a.bottom, b.bottom) });

// The usual text area of a page: where most pages' text starts and ends.
function bodyArea(s, pageCount) {
  const tops = [], bottoms = [], lefts = [], rights = [];
  for (let p = 0; p < pageCount; p++) {
    const a = s.pageStart[p], z = s.pageStart[p + 1];
    if (z <= a) continue;
    let t = Infinity, b = -Infinity, l = Infinity, r = -Infinity;
    for (let i = a; i < z; i++) { t = Math.min(t, s.top[i]); b = Math.max(b, s.bottom[i]); l = Math.min(l, s.x0[i]); r = Math.max(r, s.x1[i]); }
    tops.push(t); bottoms.push(b); lefts.push(l); rights.push(r);
  }
  const at = (list, q) => { const sorted = [...list].sort((x, y) => x - y); return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]; };
  return tops.length ? { top: at(tops, 0.1), bottom: at(bottoms, 0.9), left: at(lefts, 0.1), right: at(rights, 0.9) } : null;
}

// blocks: the authoring blocks in order (figures as figures, even if their picture failed).
// images: the conversion's picture list, which tells on which side of a figure its caption was.
// Returns one entry per block: {page, boxes} or null when it has no place in the PDF.
export function locate(blocks, pdf, images = [], noteTables = new Map()) {
  if (noteTables.size) blocks = blocks.map((block, i) => noteTables.get(i) ?? block);
  const s = textStream(pdf.pages), text = s.text;
  const anchors = headingAnchors(blocks, pdf.outline || [], s);
  const nextAnchor = [];
  for (let i = blocks.length - 1, next = text.length; i >= 0; i--) { nextAnchor[i] = next; if (anchors.has(i)) next = anchors.get(i); }
  const spans = new Array(blocks.length).fill(null), captions = new Array(blocks.length).fill(null);
  const noteSpans = new Map();
  let cursor = 0;
  blocks.forEach((b, i) => {
    const limit = anchors.size ? nextAnchor[i] : Math.min(text.length, cursor + 20000);
    if (b.kind === "figure") {
      const cap = captionText(b);
      if (!cap) return;
      const m = search(text, pieces(cap, GAP.text), "caption", cursor, Math.min(limit, cursor + GAP.caption + cap.length));
      if (m) { captions[i] = [m.first, m.end]; cursor = m.end; }
      return;
    }
    const list = piecesOf(b, blocks[i - 1]);
    if (!list.length) return;
    // Then, for a heading, its text without the number; then, for a heading or a paragraph,
    // smaller pieces, so that one changed word (a field Word updated) does not lose the block.
    const own = b.kind === "heading" || b.kind === "paragraph" ? normalize(textOf(b.content)) : "";
    const tries = [list, b.kind === "heading" && pieces(bareHeading(textOf(b.content)), GAP.text), own.length >= 12 && pieces(own, GAP.text, false, 8)].filter(Boolean);
    const look = (from, to) => { for (const t of tries) { const m = search(text, t, b.kind, from, to); if (m) return m; } return null; };
    if (anchors.has(i)) {
      // From the bookmark on; a little before it only when the heading starts above where the
      // bookmark points.
      const at = anchors.get(i), to = Math.min(text.length, at + 4000);
      const m = look(at, to) || look(at - 40, to);
      if (m) spans[i] = [m.first, m.end];
      cursor = m ? m.end : at;
      return;
    }
    const m = look(cursor, limit);
    if (!m) return;
    let [first, end] = [m.first, m.end];
    if (b.kind === "table") {
      if (noteTables.has(i)) noteSpans.set(i, [first, end]);
      // The caption above or below the table belongs to its box.
      const cap = captionText(b);
      if (cap) {
        const before = find(text, cap, Math.max(cursor, first - cap.length - 300), first);
        const after = before < 0 ? find(text, cap, end, Math.min(limit, end + cap.length + 300)) : -1;
        if (before >= 0) first = before;
        else if (after >= 0) end = after + cap.length;
      }
    }
    spans[i] = [first, end];
    cursor = end;
  });

  const out = spans.map(span => span ? boxesOf(s, span[0], span[1]) : null);
  // Figures: the space between the caption and the neighbouring block on the picture's side, or
  // between the two neighbours when there is no caption. Pictures taken out of a table stay unplaced.
  const body = bodyArea(s, pdf.pages.length);
  const above = new Map(images.map(im => [im.block, im.captionAbove]));
  const near = (i, step) => { for (let j = i + step; j >= 0 && j < blocks.length; j += step) if (blocks[j].kind !== "target") return j; return -1; };
  blocks.forEach((b, i) => {
    if (b.kind !== "figure" || !body) return;
    const prev = near(i, -1), next = near(i, 1);
    const prevBox = page => out[prev]?.filter(x => x.page === page).at(-1);
    const nextBox = page => out[next]?.find(x => x.page === page);
    let region = null, cap = captions[i] && boxesOf(s, captions[i][0], captions[i][1]);
    if (cap?.length === 1) {
      const c = cap[0];
      region = above.get(i)
        ? { page: c.page, x0: body.left, x1: body.right, top: c.bottom, bottom: nextBox(c.page)?.top ?? body.bottom }
        : { page: c.page, x0: body.left, x1: body.right, top: prevBox(c.page)?.bottom ?? body.top, bottom: c.top };
      region = region.bottom - region.top >= 12 ? merge(region, c) : null;
    } else if (!captionText(b) && prev >= 0 && !["table", "figure"].includes(blocks[prev].kind)) {
      const p = out[prev]?.at(-1), n = p && nextBox(p.page);
      if (n && n.top - p.bottom >= 24) region = { page: p.page, x0: body.left, x1: body.right, top: p.bottom, bottom: n.top };
    }
    if (region) out[i] = [region];
  });
  for (const [i, [first, end]] of noteSpans) out[i] = boxesOf(s, first, end);

  return out.map(boxes => boxes?.length
    ? { page: boxes[0].page, boxes: boxes.map(x => ({ page: x.page, x0: round(x.x0), top: round(x.top), x1: round(x.x1), bottom: round(x.bottom) })) }
    : null);
}

// Found and not found per kind, for the report and the side file.
export function locateStats(blocks, places) {
  const stats = {};
  blocks.forEach((b, i) => {
    if (b.kind === "target") return;
    const k = stats[b.kind] ??= { found: 0, missing: 0 };
    if (places[i]) k.found++; else k.missing++;
  });
  return stats;
}

// Fill a missing figure only when its measured size identifies a single PDF draw between the
// two text anchors. Allow a two-page window when Word pushed the picture across a page break.
export async function fillFigurePlaces(blocks, places, images, readGraphics) {
  const anchors = (i, step) => {
    for (let j = i + step; j >= 0 && j < blocks.length; j += step) {
      if (blocks[j].kind === "target") continue;
      if (blocks[j].kind === "figure") return;
      return step < 0 ? places[j]?.boxes.at(-1) : places[j]?.boxes[0];
    }
  };
  const windows = images.flatMap(({ block, part, extent }) => {
    if (places[block] || !extent || !part) return [];
    const before = anchors(block, -1), after = anchors(block, 1);
    if (!before || !after || after.page < before.page || after.page > before.page + 1) return [];
    const kind = /\.(emf|wmf)$/i.test(part) ? "metafile" : "raster";
    return [{ block, extent, kind, before, after }];
  });
  if (!windows.length) return;
  const pages = new Set(windows.flatMap(({ before, after }) => [before.page, after.page]));
  const graphics = await readGraphics([...pages]);
  const tolerance = 0.75; // Word and PDF round to different units.
  const used = new Map();
  const matches = windows.map(({ block, extent: [width, height], kind, before, after }) => {
    const candidates = graphics.filter(g => g.kind === kind && g.page >= before.page && g.page <= after.page &&
      (g.page !== before.page || g.top >= before.bottom - tolerance) &&
      (g.page !== after.page || g.bottom <= after.top + tolerance) &&
      Math.abs(g.x1 - g.x0 - width) <= tolerance && Math.abs(g.bottom - g.top - height) <= tolerance);
    for (const g of candidates) used.set(g, (used.get(g) || 0) + 1);
    return { block, candidates };
  });
  for (const { block, candidates } of matches) {
    if (candidates.length !== 1 || used.get(candidates[0]) !== 1) continue;
    const { page, x0, top, x1, bottom } = candidates[0];
    places[block] = { page, boxes: [{ page, x0: round(x0), top: round(top), x1: round(x1), bottom: round(bottom) }] };
  }
}
