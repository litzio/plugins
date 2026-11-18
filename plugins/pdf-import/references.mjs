// Figure and table references (S-02, in part). The engine follows internal PDF links to
// the block they point at; the profile reads "Figure n" / "Table n". A reference becomes a
// Litzio reference only when its target is the figure or table with the same number.
// Without any internal link in the document, the text rule is used, and only for numbers
// whose caption exists in the document.

// Caption → object on the same page: a table caption sits above its table, a figure
// caption below its figure; the nearest one wins and each object takes one caption.
export function captionTargets(blocks, profile) {
  const captionFor = new Map();
  for (const cap of blocks.filter((b) => b.kind === "caption")) {
    const table = profile.captionKind(cap.text) === "table";
    const obj = blocks
      .filter((b) => !b.formula && b.page === cap.page && b.kind === (table ? "table" : "figure"))
      .filter((b) => (table ? b.boxes[0].top >= cap.boxes[0].top : b.boxes[0].top <= cap.boxes[0].top))
      .sort((a, b) => Math.abs(a.boxes[0].top - cap.boxes[0].top) - Math.abs(b.boxes[0].top - cap.boxes[0].top))[0];
    if (obj && !captionFor.has(obj.id)) captionFor.set(obj.id, cap);
  }
  return captionFor;
}

// Litzio draws a text table as a table and every other region as a figure.
const documentKind = (b) => (b.kind === "table" && b.table ? "table" : "figure");

// objectId → { label, kind, number }. The original number becomes the fixed number.
// A table drawn as a figure would be shown as "Figure n", so it gets no number. A
// continued table repeats its caption number; only the first one is the target.
export function figureTableLabels(blocks, profile, captionFor = captionTargets(blocks, profile)) {
  const labels = new Map(), used = new Set();
  for (const b of blocks) {
    const cap = captionFor.get(b.id);
    const m = cap?.text.match(profile.caption);
    if (!m) continue;
    const kind = profile.captionKind(cap.text);
    const label = (kind === "table" ? "tab-" : "fig-") + m[2];
    if (kind !== documentKind(b) || used.has(label)) continue;
    used.add(label);
    labels.set(b.id, { label, kind, number: m[2] });
  }
  return labels;
}

// The original words of a reference this plugin wrote: "fig-3" → "Figure 3".
export const referenceText = (label) => {
  const m = /^(fig|tab)-(.+)$/.exec(label || "");
  return m ? (m[1] === "fig" ? "Figure " : "Table ") + m[2] : null;
};

// "Figure 3" → { kind: "figure", number: "3", at, length }.
export function referenceMatches(text, profile) {
  if (!profile.reference || !text) return [];
  return [...text.matchAll(new RegExp(profile.reference.source, "g"))].map((m) => ({
    kind: m[1].toLowerCase(),
    number: m[2],
    at: m.index,
    length: m[0].length,
  }));
}

const inside = (q, x, y, pad = 2) =>
  q.x0 - pad <= x && x <= q.x1 + pad && q.top - pad <= y && y <= q.bottom + pad;

// A destination usually points a little above its object (the end of the block before).
// The target is the block covering the point, else the first block starting below it.
export function destinationBlock(blocks, dest) {
  const onPage = blocks
    .map((b) => {
      const qs = b.boxes.filter((q) => q.page === dest.page);
      return qs.length && { b, top: Math.min(...qs.map((q) => q.top)), bottom: Math.max(...qs.map((q) => q.bottom)) };
    })
    .filter(Boolean);
  const covering = onPage.find((x) => x.top + 3 < dest.top && dest.top < x.bottom - 3);
  if (covering) return covering.b;
  return onPage.filter((x) => x.top >= dest.top - 3).sort((a, b) => a.top - b.top)[0]?.b ?? null;
}

// The character range of each source line in the block text, ignoring whitespace.
// Null when the lines do not spell the block text exactly.
function lineRanges(b) {
  const positions = [];
  for (let i = 0; i < b.text.length; i++) if (!/\s/u.test(b.text[i])) positions.push(i);
  const ranges = [];
  let n = 0;
  for (const l of b.lines || []) {
    const len = l.text.replace(/\s/gu, "").length;
    if (!len) continue;
    ranges.push({ line: l, from: positions[n], to: positions[n + len - 1] + 1 });
    n += len;
  }
  return n === positions.length && ranges.length ? ranges : null;
}

// Pick the occurrence the link rectangle covers: its position is estimated on its source
// line from the character offset, and the one nearest the rectangle wins. A link may
// cover two lines when the reference wraps.
function pickOccurrence(b, candidates, link) {
  const ranges = lineRanges(b);
  if (!ranges) return candidates[0];
  const q = link.box;
  const scored = candidates
    .map((c) => {
      const r = ranges.find((r) => r.line.page === link.page && c.at < r.to && c.at + c.length > r.from);
      if (!r) return null;
      const span = Math.max(1, r.to - r.from), mid = c.at + c.length / 2 - r.from;
      const x = r.line.box.x0 + (Math.min(span, Math.max(0, mid)) / span) * (r.line.box.x1 - r.line.box.x0);
      const y = (r.line.box.top + r.line.box.bottom) / 2;
      const dx = Math.max(0, q.x0 - x, x - q.x1), dy = Math.max(0, q.top - y, y - q.bottom);
      return { c, d: Math.hypot(dx, dy) };
    })
    .filter((s) => s && s.d < 20)
    .sort((a, b) => a.d - b.d);
  // A table note keeps one coarse source box; a single occurrence is still certain.
  return scored[0]?.c ?? (candidates.length === 1 ? candidates[0] : null);
}

function gridCell(b, x, y) {
  const g = b.grid;
  if (!g?.cells) return null;
  const r = g.rowEdges.findIndex((e, i) => i < g.rowEdges.length - 1 && e <= y && y < g.rowEdges[i + 1]);
  const c = g.colEdges.findIndex((e, i) => i < g.colEdges.length - 1 && e <= x && x < g.colEdges[i + 1]);
  if (r < 0 || c < 0) return null;
  return g.cells.find((cell) => cell.r0 <= r && r < cell.r1 && cell.c0 <= c && c < cell.c1) ?? null;
}

// The caption's own number at its start is not a reference.
const ownNumber = (b, m, profile) => b.kind === "caption" && m.at === 0 && profile.caption.test(b.text);
const textKinds = ["paragraph", "list", "note", "footnote", "caption", "heading", "heading_unnumbered"];

// Sets b.refs = [{ at, length, label }] on text blocks and cell.refs = [{ kind, number, label }]
// on text-table cells. Returns counts for stats.
export function findReferences(raw, blocks, profile) {
  const links = (raw.pages || []).flatMap((p, page) => (p.links || []).map((l) => ({ ...l, page })));
  const result = { method: links.length ? "links" : "text", links: links.length, converted: 0, targets: 0, unmatched: 0 };
  for (const b of blocks) delete b.refs;
  if (!profile.reference) return result;
  const captionFor = captionTargets(blocks, profile);
  const labels = figureTableLabels(blocks, profile, captionFor);
  const objectOf = new Map([...captionFor].map(([obj, cap]) => [cap.id, obj]));
  const byKey = new Map([...labels.values()].map((v) => [v.kind + ":" + v.number, v.label]));
  const targets = new Set();
  const addText = (b, m, label) => {
    if ((b.refs ||= []).some((r) => r.at === m.at)) return false;
    b.refs.push({ at: m.at, length: m.length, label });
    targets.add(label);
    return true;
  };
  const addCell = (cell, m, label) => {
    const refs = (cell.refs ||= []);
    if (!refs.some((r) => r.label === label)) refs.push({ kind: m.kind, number: m.number, label });
    targets.add(label);
  };
  if (links.length) {
    links.sort((a, b) => a.page - b.page || a.box.top - b.box.top || a.box.x0 - b.box.x0);
    for (const link of links) {
      const cx = (link.box.x0 + link.box.x1) / 2, cy = (link.box.top + link.box.bottom) / 2;
      const target = destinationBlock(blocks, link.dest);
      const info = target && labels.get(objectOf.get(target.id) ?? target.id);
      if (!info) continue;
      // A link over a wrapped reference covers two lines; its centre may fall between them.
      const q = link.box, overlaps = (x) => x.x0 < q.x1 && q.x0 < x.x1 && x.top < q.bottom && q.top < x.bottom;
      const holds = (b, hit) =>
        b.table
          ? b.boxes.some((x) => x.page === link.page && hit(x))
          : textKinds.includes(b.kind) && (b.lines || []).some((l) => l.page === link.page && hit(l.box));
      const source =
        blocks.find((b) => holds(b, (x) => inside(x, cx, cy))) ??
        blocks.find((b) => !b.table && holds(b, overlaps));
      if (!source) continue;
      const same = (m) => m.kind === info.kind && m.number === info.number && !ownNumber(source, m, profile);
      if (source.table) {
        const cell = gridCell(source, cx, cy);
        const m = cell && !cell.graphic && referenceMatches(cell.text, profile).find(same);
        if (m) {
          addCell(cell, m, info.label);
          result.converted++;
        } else result.unmatched++;
        continue;
      }
      const taken = new Set((source.refs || []).map((r) => r.at));
      const candidates = referenceMatches(source.text, profile).filter((m) => same(m) && !taken.has(m.at));
      const m = candidates.length && pickOccurrence(source, candidates, link);
      if (m && addText(source, m, info.label)) result.converted++;
      else result.unmatched++;
    }
  } else {
    for (const b of blocks) {
      if (b.table) {
        for (const cell of b.grid?.cells || []) {
          if (cell.graphic) continue;
          for (const m of referenceMatches(cell.text, profile)) {
            const label = byKey.get(m.kind + ":" + m.number);
            const before = cell.text.slice(Math.max(0, m.at - 40), m.at);
            if (label && !profile.foreignReference?.test(before)) {
              addCell(cell, m, label);
              result.converted++;
            }
          }
        }
        continue;
      }
      if (!textKinds.includes(b.kind) || b.kind.startsWith("heading")) continue;
      for (const m of referenceMatches(b.text, profile)) {
        const label = byKey.get(m.kind + ":" + m.number);
        const before = b.text.slice(Math.max(0, m.at - 40), m.at);
        if (label && !ownNumber(b, m, profile) && !profile.foreignReference?.test(before) && addText(b, m, label))
          result.converted++;
      }
    }
  }
  for (const b of blocks) b.refs?.sort((x, y) => x.at - y.at);
  result.targets = targets.size;
  return result;
}

// Refs of a block, moved onto a text that keeps the end of the block text
// (a list marker, a NOTE prefix or a caption number removed from the front).
export function refsFor(b, text, labels) {
  if (!b.refs?.length) return [];
  let k = 0;
  while (k < text.length && k < b.text.length && text[text.length - 1 - k] === b.text[b.text.length - 1 - k]) k++;
  const shift = b.text.length - text.length;
  return b.refs
    .filter((r) => r.at >= b.text.length - k && labels.has(r.label))
    .map((r) => ({ ...r, at: r.at - shift }));
}

// Split text nodes of a table cell's inline content at its references.
export function cellReferences(content, refs, profile, labels) {
  const usable = (refs || []).filter((r) => labels.has(r.label));
  if (!usable.length) return content;
  const merged = [];
  for (const c of content) {
    const last = merged.at(-1);
    if (c.kind === "text" && last?.kind === "text") last.text += c.text;
    else merged.push({ ...c });
  }
  return merged.flatMap((c) => {
    if (c.kind !== "text") return [c];
    const out = [];
    let at = 0;
    for (const m of referenceMatches(c.text, profile)) {
      const r = usable.find((r) => r.kind === m.kind && r.number === m.number);
      if (!r) continue;
      if (m.at > at) out.push({ kind: "text", text: c.text.slice(at, m.at) });
      out.push({ kind: "reference", role: "numref", label: r.label });
      at = m.at + m.length;
    }
    if (at < c.text.length) out.push({ kind: "text", text: c.text.slice(at) });
    return out;
  });
}
