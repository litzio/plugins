import { assembleSheet, joinSheetHeadings, linkRequirements } from "./sheet-blocks.mjs";
import { formulaRegions } from "./formula-regions.mjs";
import { buildGrid, flattenGrid, joinText, markTableLabels, captionTokens, splitNoteTokens } from "./table-grid.mjs";
export const tableNoteMarker = text => /^a\s+value\s+of\b/i.test(text||'') ? null : text?.match(/^([a-z*†‡])\s+/)?.[1] || null;
import { profiles, selectProfile } from "./profiles/index.mjs";
import { findReferences, captionTargets } from "./references.mjs";
// The engine reads layout signals only. Document-family text conventions come from a profile.
const profileOf = (raw, name) => {
  const p = profiles[name ?? selectProfile(raw)];
  if (!p) throw new Error("알 수 없는 문서 형식입니다.");
  return p;
};
const BULLET = /^[—–•\-]\s*/;
const END = /[.:;?!)\]”"]$|\[\^\w+\]$/;
// L-05: a list item continues the previous page's list when it has the same marker
// shape and the next number (or the same bullet) at the same indentation.
const romans = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
function nextMarker(a, b) {
  const ordered = /^(\(?)([a-z]+|\d+)\)$/i,
    x = a.match(ordered),
    y = b.match(ordered);
  if (!x || !y) return !x && !y && a === b;
  if (x[1] !== y[1]) return false;
  const [u, v] = [x[2], y[2]];
  if (/^\d+$/.test(u) || /^\d+$/.test(v))
    return /^\d+$/.test(u) && /^\d+$/.test(v) && +v === +u + 1;
  if ((u === u.toLowerCase()) !== (v === v.toLowerCase())) return false;
  const r = romans.indexOf(u.toLowerCase());
  if (r >= 0 && romans[r + 1] === v.toLowerCase()) return true;
  return u.length === 1 && v.length === 1 && v.charCodeAt(0) === u.charCodeAt(0) + 1;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""),
  chars = (s) => s.replace(/\s/g, "").length;
const round = (x) =>
  Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x);
const box = (page, b) => ({
  page,
  x0: Math.min(b[0], b[2]),
  top: Math.min(b[1], b[3]),
  x1: Math.max(b[0], b[2]),
  bottom: Math.max(b[1], b[3]),
});
function addBox(b, l) {
  if (typeof l.text === "function") {
    (b.lines ||= []).push({ page: l.page, box: box(l.page, l.bbox), text: l.text(), ...(l.tokens ? {tokens:l.tokens} : {}) });
  }
  l = { ...l, x0: l.bbox[0], y0: l.bbox[1], x1: l.bbox[2], y1: l.bbox[3] };
  const a = b.boxes.find((x) => x.page === l.page);
  if (a) {
    a.x0 = Math.min(a.x0, l.x0);
    a.top = Math.min(a.top, l.y0);
    a.x1 = Math.max(a.x1, l.x1);
    a.bottom = Math.max(a.bottom, l.y1);
  } else b.boxes.push(box(l.page, l.bbox));
}
function line(raw, page) {
  const spans = raw.spans.filter((s) => s.text.trim()).map(s => s.flags & 32 ? {...s} : s),
    main = spans.reduce(
      (a, s) => (!a || s.text.length > a.text.length ? s : a),
      null,
    ),
    main_size = main ? round(main.size * 10) / 10 : 0;
  return {
    page,
    tag: raw.tag,
    tokens: raw.tokens,
    metrics: raw.metrics,
    bbox: raw.bbox,
    x0: raw.bbox[0],
    y0: raw.bbox[1],
    x1: raw.bbox[2],
    y1: raw.bbox[3],
    spans,
    plain: raw.spans
      .map((s) => s.text)
      .join("")
      .trim(),
    size: Math.max(0, ...spans.map((s) => s.size)),
    main_size,
    bold:
      spans.length > 0 &&
      spans.filter((s) => s.size >= 7).every((s) => s.flags & 16),
    first_size: spans[0]?.size || 0,
    kind: null,
    text() {
      return spans
        .map((s) =>
          s.flags & 1 && s.size < main_size && s.text.trim()
            ? s.text.match(/^\s*/)[0] +
              s.text
                .trim()
                .split(/[,\s]+/)
                .map((x) => "[^" + x + "]")
                .join("") +
              s.text.match(/\s*$/)[0]
            : s.text,
        )
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    },
  };
}
const inside = (l, r) => {
  const x = (l.x0 + l.x1) / 2,
    y = (l.y0 + l.y1) / 2;
  return r[0] - 2 <= x && x <= r[2] + 2 && r[1] - 2 <= y && y <= r[3] + 2;
};
// Page numbers at this boundary are one-based, like the page picker.
function suggestExcludedPages(raw, profileName) {
  const profile = profileOf(raw, profileName);
  if (profile.name === "sheet") return [];
  const { all } = classifyLines(raw.pages, profile);
  const start = all.findIndex((ls) =>
    ls.some((l) => l.kind === "heading" && profile.bodyStart.test(l.text())),
  );
  return Array.from({ length: Math.max(0, start) }, (_, i) => i + 1);
}
function classifyLines(pages, profile, sheetPages = new Map()) {
  pages = pages.map((p) => ({ ...p }));
  const all = pages.map((p, i) =>
    p.raw
      .map((r) => line(r, i))
      .filter((l) => l.plain)
      .sort((a, b) => round(a.y0 / 3) - round(b.y0 / 3) || a.x0 - b.x0),
  );
  const sizes = /* @__PURE__ */ new Map();
  for (const [index, lines] of all.entries())
    for (const l of sheetPages.get(index)?.lines ?? lines)
      sizes.set(l.main_size, (sizes.get(l.main_size) || 0) + l.plain.length);
  const body = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  const seen = /* @__PURE__ */ new Map(),
    key = (l) => l.plain.replace(/\d+/g, "#"),
    margin = (l, i) =>
      l.y1 < pages[i].height * 0.1 || l.y0 > pages[i].height * 0.9;
  all.forEach((ls, i) => {
    for (const k of new Set(ls.filter((l) => margin(l, i)).map(key)))
      seen.set(k, (seen.get(k) || 0) + 1);
  });
  all.forEach((ls, i) => {
    for (const l of ls)
      if (
        (pages[i].footerTop != null ? l.y0 >= pages[i].footerTop : margin(l, i)) &&
        (pages[i].footerTop != null || (seen.get(key(l)) || 0) >= pages.length * 0.3 ||
          /^[ivxlc\d]+$/.test(l.plain))
      )
        l.kind = "margin";
    // Resolve geometry before captions and footnotes: text order cannot split a crop.
    const regions = coalesceOverlaps([
      ...pages[i].tables.map((r) => ({
        kind: "table",
        page: i,
        text: "",
        boxes: [box(i, r)],
      })),
      ...pages[i].figures.map((r) => ({
        kind: "figure",
        page: i,
        text: "",
        boxes: [box(i, r)],
      })),
    ]);
    for (const l of ls) {
      if (l.kind || !profile.caption.test(l.plain)) continue;
      const figure = profile.captionKind(l.plain) === "figure";
      const candidates = regions
        .map((o) => {
          const r = o.boxes[0];
          const below = l.y0 >= r.bottom;
          const gap = below ? l.y0 - r.bottom : r.top - l.y1;
          const between = ls.filter(
            (x) =>
              x !== l &&
              x.kind !== "margin" &&
              x.y0 >= (below ? r.bottom : l.y1) &&
              x.y1 <= (below ? l.y0 : r.top),
          );
          return { o, r, below, gap, between };
        })
        .filter(
          (c) =>
            l.x0 < c.r.x1 &&
            l.x1 > c.r.x0 &&
            c.gap >= 0 &&
            c.gap <= (figure && c.below ? body * 10 : body * 4),
        )
        .sort((a, b) => a.gap - b.gap);
      const c = candidates.find(
        (c) =>
          !c.between.length ||
          (figure && c.below && c.between.every((x) => x.main_size < body)),
      );
      if (c) {
        if (figure && c.below)
          for (const x of c.between) addBox(c.o, { page: i, bbox: x.bbox });
        c.o.kind = figure ? "figure" : "table";
        l.kind = "caption";
      } else if (l.bold) l.kind = "caption";
    }
    const formulas = formulaRegions(ls, regions, pages[i]);
    pages[i] = { ...pages[i], tables: [], figures: [] };
    for (const o of regions) {
      const r = o.boxes[0];
      pages[i][o.kind === "table" ? "tables" : "figures"].push([
        r.x0,
        r.top,
        r.x1,
        r.bottom,
      ]);
    }
    for (const l of ls) {
      if (l.kind) continue;
      if (pages[i].tables.some((t) => inside(l, t))) l.kind = "table";
      else if (pages[i].figures.some((f) => inside(l, f))) l.kind = "figure";
      if (l.kind === "figure") l.formulaRegion = formulas.find(r=>inside(l,[r.x0,r.top,r.x1,r.bottom]));
    }
    for (const t of pages[i].tables) {
      let y = t[3],
        note = false;
      for (const l of ls) {
        if (l.kind || l.y0 < t[3] - 2) continue;
        if (l.y0 - y > 16) break;
        const starts =
          l.first_size <= body * 0.7 ||
          (l.main_size < body &&
            profile.tableNote?.test(l.plain) &&
            l.x0 > t[0] - 2 &&
            l.x0 - t[0] < 12 &&
            l.x0 > 92);
        if (starts || (note && l.main_size < body)) {
          l.kind = "table";
          note = true;
          y = l.y1;
        } else break;
      }
    }
    const rest = ls.filter((l) => !l.kind),
      tail = [];
    for (const l of rest.toReversed()) {
      if (l.main_size < body) tail.unshift(l);
      else break;
    }
    while (
      tail.length &&
      !(
        /^\d+\s+/.test(tail[0].plain) ||
        (tail[0].first_size <= body * 0.7 && /^\d+/.test(tail[0].plain))
      )
    )
      tail.shift();
    let previousNote = null;
    for (const l of tail) {
      // F-06: a separated small-print paragraph need not be another note.
      if (previousNote && l.y0 - previousNote.y1 > previousNote.main_size * 2 &&
          !/^\d+\s+/.test(l.plain)) break;
      l.kind = "footnote";
      previousNote = l;
    }
    let prev = null;
    for (const l of ls) {
      if (l.kind) {
        prev = l.kind === "caption" ? l : null;
        continue;
      }
      const t = l.text();
      if (l.bold && profile.caption.test(t)) l.kind = "caption";
      else if (prev?.kind === "caption" && l.y0 - prev.y1 < 6 && l.x0 > 92)
        l.kind = "caption";
      else if (
        l.bold &&
        l.size >= body &&
        profile.heading(t)
      )
        l.kind = "heading";
      else if (l.size > body + 0.5 && !BULLET.test(t))
        l.kind = "heading_unnumbered";
      prev = l;
    }
    for (const l of ls) l.kind ??= "body";
  });
  return { pages, all, body };
}
function convert(raw, excludedPages = [], profileName) {
  const selectedProfile = profileOf(raw, profileName);
  const profile = selectedProfile.name === "sheet" ? profiles.generic : selectedProfile;
  let { pages } = raw;
  const { toc } = raw;
  if (
    !Array.isArray(excludedPages) ||
    excludedPages.some((p) => !Number.isInteger(p) || p < 1 || p > pages.length)
  )
    throw new Error("제외할 쪽 번호가 올바르지 않습니다.");
  const omitted = new Set(excludedPages);
  const sheetPages = new Map();
  if (selectedProfile.name === "sheet") {
    pages.forEach((p,i)=>{
      if (p.footerTop == null || !p.raw.some(l=>l.tag) || omitted.has(i+1)) return;
      const lines = p.raw.map(l=>line(l,i)).filter(l=>l.plain);
      for (const l of lines) l.kind = l.y0 >= p.footerTop ? "margin" : "body";
      sheetPages.set(i,{lines,...assembleSheet(p,lines)});
    });
  }
  const classified = classifyLines(pages.map((p,i)=>sheetPages.has(i) ? {...p,raw:[],tables:[],figures:[],graphics:[]} : p), profile, sheetPages);
  pages = classified.pages;
  let { all } = classified;
  const { body } = classified;
  const start = 0;
  all.forEach((ls, i) => {
    if (omitted.has(i + 1)) for (const l of ls) l.kind = "front";
  });
  // Preserve a raised numeric call when its definition is present on an included page.
  const footnoteLabels = new Set(all.flat().filter(l=>l.kind==="footnote")
    .map(l=>l.plain.match(/^(\d+)/)?.[1]).filter(Boolean));
  for (const lines of all) for (const l of lines) {
    for (const span of l.spans) if ((span.flags & 32) && footnoteLabels.has(span.text.trim())) span.flags |= 1;
  }
  // Only paragraph assembly uses body-sized baselines; classification stays intact.
  const bodyLines = all
    .flat()
    .filter((l) => l.kind === "body" && Math.abs(l.main_size - body) < 0.6);
  for (const l of all.flat()) {
    const ms = l.metrics?.filter((w) => Math.abs(w.size - body) < 0.6);
    l.base = ms?.length
      ? ms.reduce((n, w) => n + w.base * w.text.length, 0) /
        ms.reduce((n, w) => n + w.text.length, 0)
      : l.y0 + body * 0.8;
  }
  const quantile = (xs, q) =>
    [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)] || 0;
  const right = all.map((ls) =>
    quantile(
      ls
        .filter(
          (l) =>
            l.kind === "body" &&
            Math.abs(l.main_size - body) < 0.6 &&
            l.x1 - l.x0 > body * 15,
        )
        .map((l) => l.x1),
      0.9,
    ),
  );
  const full = (l) =>
    right[l.page] - l.x1 <= body * 1.25 && l.x1 - l.x0 > body * 15;
  const fullRatio = bodyLines.filter(full).length / (bodyLines.length || 1);
  const justified = fullRatio >= 0.45;
  const steps = all.flatMap((ls) =>
    ls
      .slice(1)
      .flatMap((l, i) =>
        l.kind === "body" &&
        ls[i].kind === "body" &&
        l.base - ls[i].base > body * 0.7 &&
        l.base - ls[i].base < body * 1.8
          ? [l.base - ls[i].base]
          : [],
      ),
  );
  const step = quantile(steps, 0.5) || body * 1.2;
  const marker = (l) => {
    const m = l.plain.match(
      /^([—–•-]|(?:[a-z]|[ivxlcdm]+|\d+)\)|\((?:[a-z]|[ivxlcdm]+|\d+)\))(?=\s|$)\s*/i,
    );
    if (!m) return null;
    const w =
      l.metrics?.[0]?.text.trim() === m[1]
        ? l.metrics.find(
            (w) =>
              w.x0 > l.x0 + body * 0.5 &&
              w.text.trim() &&
              w.text.trim() !== m[1],
          )
        : null;
    return {
      marker: m[1],
      contentX: w?.x0 ?? l.x0 + body * (m[1].length * 0.5 + 0.7),
      ordered: !BULLET.test(m[1]),
    };
  };
  const assembly = all.map((ls) => {
    const out = [];
    for (const l of ls) {
      const a = out.at(-1);
      if (
        a?.kind === "body" &&
        l.kind === "body" &&
        marker(a) &&
        a.plain === marker(a).marker &&
        Math.abs(a.base - l.base) < body * 0.4 &&
        l.x0 > a.x1
      ) {
        const joined = {
          ...l,
          plain: a.plain + " " + l.plain,
          x0: a.x0,
          bbox: [a.x0, Math.min(a.y0, l.y0), l.x1, Math.max(a.y1, l.y1)],
          text: () => a.text() + " " + l.text(),
        };
        joined.list = { ...marker(a), contentX: l.x0 };
        out[out.length - 1] = joined;
      } else if (
        a?.kind === "body" &&
        l.kind === "body" &&
        Math.abs(a.base - l.base) < body * 0.25 &&
        l.x0 > a.x1 &&
        !marker(l)
      ) {
        out[out.length - 1] = {
          ...a,
          plain: a.plain + " " + l.plain,
          x1: l.x1,
          bbox: [a.x0, Math.min(a.y0, l.y0), l.x1, Math.max(a.y1, l.y1)],
          tokens: [...(a.tokens || []), ...(l.tokens || [])],
          metrics: [...(a.metrics || []), ...(l.metrics || [])],
          text: () => a.text() + " " + l.text(),
        };
      } else out.push(l);
    }
    return out;
  });
  const lastLines = new WeakMap();
  const boundary = (b, reason) => {
    b.warning = { code: "paragraph-boundary", reason };
  };
  let blocks = [];
  const excluded = [];
  let joins = 0,
    listJoins = 0;
  const push = (kind, text, l, level) => {
    const b = {
      id: "",
      kind,
      text,
      page: l.page,
      boxes: [],
      ...(level ? { level } : {}),
    };
    addBox(b, l);
    if (l.formulaRegion) { b.formula = true; addBox(b,{page:l.page,bbox:[l.formulaRegion.x0,l.formulaRegion.top,l.formulaRegion.x1,l.formulaRegion.bottom]}); }
    blocks.push(b);
    return b;
  };
  for (let p = start; p < pages.length; p++) {
    if (omitted.has(p + 1)) continue;
    let prev = null,
      first = true,
      obj = null;
    let noteShape = null,
      noteNumber = -1;
    for (const l of assembly[p]) {
      if (["margin", "front"].includes(l.kind)) continue;
      const t = l.text();
      if (["table", "figure"].includes(l.kind)) {
        if (obj && obj.kind === l.kind && obj.page === p && !!obj.formula === !!l.formulaRegion && (!obj.formula || inside(l,[obj.boxes[0].x0,obj.boxes[0].top,obj.boxes[0].x1,obj.boxes[0].bottom]))) {
          obj.text += " " + t;
          addBox(obj, l);
        } else obj = push(l.kind, t, l);
        prev = null;
        continue;
      }
      obj = null;
      if (l.kind === "footnote") {
        const m = l.plain.match(
          l.first_size <= body * 0.7 ? /^(\d+)\s*(.*)$/ : /^(\d+)\s+(.*)$/,
        );
        const small = l.first_size <= body * 0.7;
        if (
          m &&
          (noteShape === null || (small === noteShape && +m[1] > noteNumber))
        ) {
          noteShape ??= small;
          noteNumber = +m[1];
          push("footnote", "[^" + m[1] + "]: " + m[2], l);
        } else if (blocks.at(-1)?.kind === "footnote") {
          blocks.at(-1).text += " " + l.plain;
          addBox(blocks.at(-1), l);
        }
        prev = null;
        continue;
      }
      if (l.kind === "heading") {
        push("heading", t, l, profile.heading(t).level);
        prev = l;
        continue;
      }
      if (l.kind === "heading_unnumbered") {
        const last = blocks.findLast((b) => b.kind !== "footnote");
        if (
          last &&
          ["heading", "heading_unnumbered"].includes(last.kind) &&
          last.page === p &&
          prev &&
          l.y0 - prev.y1 < 20
        ) {
          last.text += " " + t;
          addBox(last, l);
        } else push(l.kind, t, l);
        prev = l;
        continue;
      }
      if (l.kind === "caption") {
        if (
          blocks.at(-1)?.kind === "caption" &&
          prev &&
          l.y0 - prev.y1 < 6 &&
          !profile.caption.test(t)
        ) {
          blocks.at(-1).text += " " + t;
          addBox(blocks.at(-1), l);
        } else push("caption", t, l);
        prev = l;
        continue;
      }
      let mark = l.list || marker(l);
      // A closing parenthesis in a wrapped sentence is not a hanging list marker.
      if (
        mark &&
        prev?.kind === "body" &&
        full(prev) &&
        l.base - prev.base < step * 1.45 &&
        Math.abs(l.x0 - prev.x0) < body * 0.7
      )
        mark = null;
      const next = assembly[p][assembly[p].indexOf(l) + 1];
      if (
        mark &&
        next?.kind === "body" &&
        !marker(next) &&
        next.base - l.base < step * 1.45 &&
        next.x0 > l.x0 + body * 0.7 &&
        next.x0 < l.x0 + body * 4
      )
        mark = { ...mark, contentX: next.x0 };
      const active = blocks.at(-1);
      const largeGap = prev && l.base - prev.base > step * 1.45;
      const indent =
        prev &&
        Math.abs(l.x0 - (active?.kind === "list" ? active.contentX : prev.x0)) >
          body * 0.7;
      const same =
        prev?.kind === "body" &&
        !mark &&
        !profile.note?.test(t) &&
        ((!largeGap &&
          !indent &&
          (active?.kind === "list" ||
            !justified ||
            full(prev) ||
            /-$/.test(prev.plain))) ||
          (l.y0 < prev.y1 && Math.abs(l.main_size - prev.main_size) < 0.6));
      if (prev?.kind === "caption" && l.bold && l.y0 - prev.y1 < 6) {
        active.text += " " + t;
        addBox(active, l);
        continue;
      }
      if (same) {
        active.text = joinText(active.text, t);
        addBox(active, l);
        lastLines.set(active, l);
      } else {
        let joined = false;
        if (first && !mark) {
          const b = blocks.findLast((b) =>
            ["para", "list", "heading", "caption", "table", "figure"].includes(
              b.kind,
            ),
          );
          const tail = b && lastLines.get(b);
          if (b?.kind === "para" && tail?.page === p - 1) {
            const linguistic = !END.test(b.text) && /^[a-z(]/.test(t);
            const geometric =
              justified && full(tail) && Math.abs(l.x0 - tail.x0) < body * 0.7;
            if (geometric || (!justified && linguistic)) {
              b.text = joinText(b.text, t);
              addBox(b, l);
              blocks.splice(blocks.indexOf(b), 1);
              blocks.push(b);
              lastLines.set(b, l);
              joined = true;
              joins++;
              if (geometric && !linguistic)
                boundary(
                  b,
                  "쪽 끝의 가득 찬 줄과 다음 쪽의 문장 시작 신호가 어긋남",
                );
            } else if (linguistic)
              boundary(b, "짧은 줄로 끝났지만 다음 쪽이 문장 중간처럼 시작함");
          }
        }
        let continues = false;
        if (first && mark) {
          const b = blocks.findLast((b) =>
            ["para", "list", "heading", "caption", "table", "figure"].includes(
              b.kind,
            ),
          );
          if (b?.kind === "list" && lastLines.get(b)?.page === p - 1) {
            const run = [];
            for (let k = blocks.length - 1; k >= 0; k--) {
              if (blocks[k].kind === "footnote") continue;
              if (blocks[k].kind !== "list") break;
              run.push(blocks[k]);
            }
            const peer = run.find(
              (x) => Math.abs(x.boxes[0].x0 - l.x0) < body * 0.7,
            );
            continues = !!peer && nextMarker(peer.marker, mark.marker);
          }
        }
        if (!joined) {
          const b = push(mark ? "list" : "para", t, l);
          if (mark) Object.assign(b, mark, { level: 1 });
          if (continues) {
            b.continuesList = true;
            listJoins++;
          }
          lastLines.set(b, l);
          if (prev?.kind === "body" && !mark && active?.kind === "para") {
            if (justified && full(prev) && (largeGap || indent))
              boundary(active, "가득 찬 줄인데 뒤 간격이나 들여쓰기가 바뀜");
            else if (
              justified &&
              !full(prev) &&
              !END.test(active.text) &&
              /^[a-z]/.test(t) &&
              !/^[^.]{2,90}:/.test(t)
            )
              boundary(b, "짧은 줄로 끝났지만 다음 줄이 문장 중간처럼 시작함");
          }
        }
      }
      first = false;
      prev = l;
    }
  }
  all.forEach((ls) => {
    for (const l of ls)
      if (["margin", "front"].includes(l.kind))
        excluded.push({ page: l.page, kind: l.kind, box: box(l.page, l.bbox) });
  });
  for (const b of blocks.filter((b2) =>
    ["table", "figure"].includes(b2.kind),
  )) {
    const ls = all[b.page].filter(
      (l) =>
        l.kind === b.kind &&
        inside(l, [
          b.boxes[0].x0,
          b.boxes[0].top,
          b.boxes[0].x1,
          b.boxes[0].bottom,
        ]),
    );
    for (const r of pages[b.page][b.kind === "table" ? "tables" : "figures"])
      if (ls.some((l) => inside(l, r))) {
        addBox(b, { page: b.page, bbox: r });
      }
  }
  for (let p = start; p < pages.length; p++)
    for (const [kind, rs] of [
      ["table", pages[p].tables],
      ["figure", pages[p].figures],
    ])
      for (const r of rs)
        if (
          !omitted.has(p + 1) &&
          !blocks.some(
            (b) =>
              b.page === p &&
              b.kind === kind &&
              b.boxes.some(
                (x) =>
                  x.x0 <= r[0] + 2 &&
                  x.top <= r[1] + 2 &&
                  x.x1 >= r[2] - 2 &&
                  x.bottom >= r[3] - 2,
              ),
          )
        ) {
          const b = { id: "", kind, text: "", page: p, boxes: [box(p, r)] };
          const at = blocks.findIndex(
            (x) => x.page >= p && (x.page > p || x.boxes[0].top > r[1]),
          );
          if (at < 0) blocks.push(b);
          else blocks.splice(at, 0, b);
        }
  const merged = mergeRegions(blocks, profile);
  for(let i=0;i<merged.length;i++) {
    const b=merged[i];if(b.kind!=="table")continue;
    const x=b.boxes[0],p=pages[b.page];
    const regions=p.tables.filter(r=>r[0]>=x.x0-2&&r[2]<=x.x1+2&&r[1]>=x.top-2&&r[3]<=x.bottom+2).sort((a,b)=>a[1]-b[1]);
    if(regions.length<2 || regions.some((r,j)=>j&&r[1]<=regions[j-1][3]))continue;
    const grids=regions.map(r=>buildGrid(r,p.rulings||[],(p.words||[]).map((w,id)=>({...w,id})),p.graphics||[],footnoteLabels));
    const ok=grids.every(g=>!g.reason&&flattenGrid(g).rows.length<=100&&g.cols<=32);
    if(!ok){b.stackFallback=true;continue;}
    const parts=regions.map((r,j)=>({...b,boxes:[box(b.page,r)],text:grids[j].cells.map(c=>c.text).join(" "),stackSplit:true}));
    merged.splice(i,1,...parts);i+=parts.length-1;
  }
  blocks.splice(0, blocks.length, ...merged);
  for (let i=0;i<blocks.length;i++) {
    const b=blocks[i]; if(b.kind!=="table") continue;
    if(b.stackFallback){b.warning={code:"table-as-image",reason:"세로 묶음의 일부 영역을 글자로 옮길 수 없음"};continue;}
    const p=pages[b.page], x=b.boxes[0];
    const words=(p.words||[]).map((w,id)=>({...w,id}));
    const grid=buildGrid([x.x0,x.top,x.x1,x.bottom],p.rulings||[],words,p.graphics||[],footnoteLabels);
    if(grid.reason) {b.warning={code:"table-as-image",reason:grid.reason};continue;}
    const flat=flattenGrid(grid);
    if(flat.rows.length>100 || grid.cols>32) {b.warning={code:"table-as-image",reason:"100행 또는 32열 한도를 넘음"};continue;}
    b.grid=grid;b.table=flat;
    const lastRow=flat.notes.filter(c=>Number.isInteger(c.r0)).reduce((n,c)=>Math.min(n,c.r0),grid.rows);
    b.boxes=[{...x,x0:grid.colEdges[0],top:grid.rowEdges[0],x1:grid.colEdges.at(-1),bottom:grid.rowEdges[lastRow]}];
    const rec=flat.record, reasons=[];
    if(rec.headerRows>1) reasons.push(`머리글 ${rec.headerRows}줄 합침`);
    if(rec.repeated) reasons.push(`값 반복 ${rec.repeated}칸`);
    if(rec.sections) reasons.push(`구역 제목 ${rec.sections}행`);
    if(rec.exportedRows) reasons.push(`주석 ${rec.exportedRows}행 분리`);
    if(reasons.length) b.warning={code:"table-unmerged",reason:"병합 칸을 풀어 적음: "+reasons.join(", ")};
    const suspicious=grid.cells.filter(c=>c.graphic);
    if(suspicious.length) b.warning={code:"table-cell-graphic",reason:"글자가 아닌 내용 의심: "+suspicious.map(c=>`${c.r0+1}행 ${c.c0+1}열`).join(", ")+(b.warning?" · "+b.warning.reason:"")};
    const notes=flat.notes.flatMap(c=>{
      const bounds=c.box?box(b.page,c.box):{page:b.page,x0:grid.colEdges[c.c0],top:grid.rowEdges[c.r0],x1:grid.colEdges[c.c1],bottom:grid.rowEdges[c.r1]};
      const groups=splitNoteTokens(c.tokens,tableNoteMarker);
      if(!groups.length) groups.push([]);
      return groups.map(tokens=>{
        const text=tokens.length ? tokens.reduce((s,t)=>t.newLine&&s?joinText(s,t.text.trim()):s+t.text,'').trim() : c.text;
        const rows=[];
        for(const t of tokens) { if(!rows.length||t.newLine) rows.push([]); rows.at(-1).push(t); }
        const lines=rows.map(row=>{
          const coords=row.map(t=>t.box);
          const q={page:b.page,x0:Math.min(...coords.map(x=>x[0])),top:Math.min(...coords.map(x=>x[1])),x1:Math.max(...coords.map(x=>x[2])),bottom:Math.max(...coords.map(x=>x[3]))};
          return {page:b.page,box:q,text:row.map(t=>t.text).join('').trim(),...(!c.graphic?{tokens:row}:{})};
        });
        const boxes=lines.length?[{page:b.page,x0:Math.min(...lines.map(l=>l.box.x0)),top:Math.min(...lines.map(l=>l.box.top)),x1:Math.max(...lines.map(l=>l.box.x1)),bottom:Math.max(...lines.map(l=>l.box.bottom))}]:[bounds];
        return {kind:"para",text,page:b.page,tableNote:true,boxes,lines:lines.length?lines:[{page:b.page,box:{...bounds},text}]};
      });
    });
    blocks.splice(i+1,0,...notes);i+=notes.length;
  }
  // Adjacent paragraphs can be outside the detected grid. Require independent
  // evidence before treating their initial letter as a local table marker.
  blocks.forEach((b,i)=>b.id='b'+i);
  const captions=captionTargets(blocks,profile);
  const noteOwners = new Map();
  for (let i=0;i<blocks.length;i++) {
    const table=blocks[i]; if (!table.table) continue;
    const cap=captions.get(table.id);
    const capWords=cap?(pages[table.page].words||[]).filter(w=>cap.boxes.some(q=>(w.x0+w.x1)/2>=q.x0-1&&(w.x0+w.x1)/2<=q.x1+1&&(w.top+w.bottom)/2>=q.top-1&&(w.top+w.bottom)/2<=q.bottom+1)):[];
    const candidates=[]; let bottom=table.boxes[0].bottom;
    for (let j=i+1;j<blocks.length;j++) {
      const n=blocks[j], q=n.boxes?.[0], m=tableNoteMarker(n.text);
      if(n.tableNote && n.page===table.page && q) { bottom=Math.max(bottom,q.bottom); continue; }
      if (n.page!==table.page || n.kind!=="para" || !m || !q || q.top<bottom-2 || q.top-bottom>body*8) break;
      candidates.push({n,marker:m}); bottom=q.bottom;
    }
    const sequence=candidates.length>=2 && candidates.every((c,j)=>c.marker===String.fromCharCode(97+j));
    for (const {n,marker} of candidates) {
      const q=n.boxes[0];
      const ws=(pages[n.page].words||[]).filter(w=>(w.x0+w.x1)/2>=q.x0-1&&(w.x0+w.x1)/2<=q.x1+1&&(w.top+w.bottom)/2>=q.top-1&&(w.top+w.bottom)/2<=q.bottom+1);
      const small=ws.length>0 && ws.reduce((s,w)=>s+w.size*w.text.length,0)/ws.reduce((s,w)=>s+w.text.length,0)<body-0.5;
      const raised=table.table.tokenRows.flat(2).some(c=>c.tokens?.some(t=>t.superscript&&t.text.trim()===marker)) || captionTokens(capWords,new Set([marker])).at(-1)?.superscript===true;
      const signals=[...(raised?["raised"]:[]),...(sequence?["sequence"]:[]),...(small?["small"]:[])];
      if (!signals.length) break;
      n.tableNote=true; n.tableNoteSignals=signals;
      const groups=[];
      for(const line of n.lines||[]) {
        if(!groups.length || tableNoteMarker(line.text)) groups.push([]);
        groups.at(-1).push(line);
      }
      if(groups.length>1 && groups.every(g=>g.every(line=>line.page===n.page))) {
        const split=groups.map(lines=>{
          const boxes=lines.map(l=>l.box);
          const bounds={page:n.page,x0:Math.min(...boxes.map(q=>q.x0)),top:Math.min(...boxes.map(q=>q.top)),x1:Math.max(...boxes.map(q=>q.x1)),bottom:Math.max(...boxes.map(q=>q.bottom))};
          return {...n,lines,boxes:[bounds],text:lines.map(l=>l.text).reduce((a,b)=>a?joinText(a,b):b,'')};
        });
        blocks.splice(blocks.indexOf(n),1,...split);
      }
    }
    const labels=new Set();
    for(let j=i+1;blocks[j]?.tableNote && blocks[j].page===table.page;j++) {
      noteOwners.set(blocks[j], table);
      const m=blocks[j].text.match(/^([a-z*†‡])\s/); if(m) labels.add(m[1]);
    }
    if(labels.size) {
      markTableLabels(table.grid,pages[table.page].words||[],labels,footnoteLabels);
      const tokens=captionTokens(capWords,labels);
      if(cap && tokens.at(-1)?.script==='superscript' && labels.has(tokens.at(-1).text.trim())) { const label=tokens.at(-1).text.trim(); cap.text=cap.text.replace(/\[\^\s*([a-z*†‡])\]$/, (whole, marker)=>marker===label?marker:whole); cap.tableNoteCaption=true; cap.lines=[{page:cap.page,box:{...cap.boxes[0]},text:cap.text,tokens}]; }
    }
  }
  // A NOTE paragraph becomes a note box; table notes stay table-note paragraphs.
  if (profile.noteBody)
    for (const b of blocks)
      if (b.kind === "para" && !b.tableNote && profile.noteBody(b.text) !== null)
        b.kind = "note";
  // L-07: a NOTE indented past the marker of the list item right before it (on the same
  // page) is part of that item. A Litzio list item holds one paragraph, so its words
  // follow the item's words; the list is not cut there.
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== "note") continue;
    let j = i - 1;
    while (j >= 0 && blocks[j].kind === "footnote") j--;
    const item = blocks[j];
    const at = item?.kind === "list" && item.boxes.find((q) => q.page === b.page);
    if (!at || b.boxes.length !== 1 || b.boxes[0].x0 < at.x0 + body * 0.7) continue;
    item.text = item.text + " " + b.text;
    item.lines = [...(item.lines || []), ...(b.lines || [])];
    for (const q of b.boxes) {
      const a = item.boxes.find((x) => x.page === q.page);
      a.x0 = Math.min(a.x0, q.x0); a.top = Math.min(a.top, q.top);
      a.x1 = Math.max(a.x1, q.x1); a.bottom = Math.max(a.bottom, q.bottom);
    }
    item.noteInItem = (item.noteInItem || 0) + 1;
    blocks.splice(i, 1);
    i--;
  }
  if (sheetPages.size) {
    for (const [i,part] of sheetPages) {
      all[i]=part.lines;
      for(const l of part.lines.filter(l=>l.kind==="margin")) excluded.push({page:i,kind:"margin",box:box(i,l.bbox)});
      blocks.push(...part.blocks);
    }
    blocks=joinSheetHeadings(blocks.sort((a,b)=>a.page-b.page));
  }
  blocks.forEach((b, i) => (b.id = "b" + i));
  for (const [note, table] of noteOwners) note.tableNoteFor = table.id;
  let listIndents = [];
  for (const b of blocks) {
    if (b.kind !== "list") {
      if (b.kind !== "footnote") listIndents = [];
      continue;
    }
    const x = b.boxes[0].x0;
    while (listIndents.length && x < listIndents.at(-1) - body * 0.7)
      listIndents.pop();
    if (!listIndents.length || x > listIndents.at(-1) + body * 0.7)
      listIndents.push(x);
    b.level = listIndents.length;
  }
  const stats = measure(pages, toc, all, blocks, start, body, joins, selectedProfile);
  stats.paragraphs.layout = {
    full_line_ratio: fullRatio,
    justified,
    baseline_step: step,
    right_edges: right,
  };
  stats.notes = blocks.filter((b) => b.kind === "note").length;
  stats.lists = { cross_page_joined: listJoins };
  suspects(blocks, stats, selectedProfile);
  for (const b of blocks) if(b.formula) b.warning={code:"formula-as-image",reason:"수식을 그림으로 둠"};
  for (const b of blocks) if (b.kind === "para") b.kind = "paragraph";
  stats.references = findReferences(raw, blocks, selectedProfile);
  if(sheetPages.size) stats.sheet={pages:sheetPages.size,layoutTables:[...sheetPages.values()].reduce((n,s)=>n+s.layoutCount,0),links:linkRequirements(blocks)};
  return {
    pages: pages.map((p) => ({ width: p.width, height: p.height })),
    blocks,
    excluded,
    excludedPages: [...omitted].sort((a, b) => a - b),
    stats,
    profile: selectedProfile.name,
  };
}
function measure(pages, toc, all, blocks, start, body, joins, profile) {
  const headings = blocks.filter((b) => b.kind === "heading"),
    truth = toc.filter(([, t]) => profile.heading(t)),
    used = /* @__PURE__ */ new Map(),
    levels = {},
    missing = [];
  let matched = 0,
    level_correct = 0;
  for (const b of headings) {
    levels[b.level] = (levels[b.level] || 0) + 1;
    const k = norm(b.text.replace(/\[\^\w+\]/g, "")),
      i = truth.findIndex(([, t], i2) => !used.has(i2) && norm(t) === k);
    if (i >= 0) {
      used.set(i, true);
      matched++;
      if (truth[i][0] === b.level) level_correct++;
    }
  }
  truth.forEach((t, i) => {
    if (!used.has(i)) missing.push(t);
  });
  const buckets = {};
  for (const ls of all)
    for (const l of ls)
      buckets[l.kind] = (buckets[l.kind] || 0) + chars(l.plain);
  return {
    pages: pages.length,
    body_start_page: start + 1,
    body_font_size: body,
    chars_total: pages.reduce((n, p) => n + p.nchars, 0),
    chars_by_kind: buckets,
    chars_unaccounted:
      pages.reduce((n, p) => n + p.nchars, 0) -
      Object.values(buckets).reduce((a, b) => a + b, 0),
    headings: {
      detected: headings.length,
      bookmarks_numbered: truth.length,
      matched,
      level_correct,
      missing,
      detected_by_level: levels,
      unnumbered_candidates: blocks.filter(
        (b) => b.kind === "heading_unnumbered",
      ).length,
      numbering_gaps: [],
    },
    paragraphs: { cross_page_joined: joins },
    objects: {
      table_captions: blocks.filter(
        (b) => b.kind === "caption" && profile.captionKind(b.text) === "table",
      ).length,
      figure_captions: blocks.filter(
        (b) => b.kind === "caption" && profile.captionKind(b.text) === "figure",
      ).length,
    },
    footnotes: footnotePairs(blocks),
  };
}
function suspects(blocks, stats, profile) {
  const warn = (b, code, reason) => {
    if (b.warning) b.warning.reason += " · " + reason;
    else b.warning = { code, reason };
  };
  const seen = /* @__PURE__ */ new Set();
  for (const b of blocks) {
    if (b.kind === "heading_unnumbered")
      warn(b, "unnumbered-heading", "번호 없는 제목 후보");
    if (b.kind === "heading") {
      const h = profile.heading(b.text);
      if (!h?.number) continue;
      const n = h.number,
        parts = n.split("."),
        parent = parts.slice(0, -1).join("."),
        last = parts.at(-1),
        reasons = [];
      if (
        parent &&
        !seen.has(parent) &&
        h.parentHeading
      )
        reasons.push("상위 번호 없음");
      if (
        /^\d+$/.test(last) &&
        +last > 1 &&
        !seen.has((parent ? parent + "." : "") + (+last - 1))
      )
        reasons.push("앞 번호 없음");
      if (seen.has(n)) reasons.push("번호 중복");
      seen.add(n);
      for (const reason of reasons) {
        stats.headings.numbering_gaps.push({
          page: b.page + 1,
          number: n,
          reason,
        });
        warn(b, "heading-number", reason);
      }
    }
  }
  reconcileFootnotes({ blocks, stats });
}
function footnotePairs(blocks) {
  const refs = /* @__PURE__ */ new Map(),
    defs = /* @__PURE__ */ new Map();
  for (const b of blocks) {
    if (b.kind === "footnote") {
      const n = b.text.match(/^\[\^(\d+)\]/)?.[1];
      if (n) defs.set(n, (defs.get(n) || 0) + 1);
    } else if (b.grid) {
      for(const c of b.grid.cells.filter(c=>!c.graphic)) for(const t of c.tokens) if(t.superscript && /^\d+$/.test(t.text.trim())) {
        const n=t.text.trim();refs.set(n,(refs.get(n)||0)+1);
      }
    } else if (
      [
        "para",
        "paragraph",
        "note",
        "list",
        "heading",
        "heading_unnumbered",
        "caption",
      ].includes(b.kind)
    )
      for (const m of b.text.matchAll(/\[\^(\d+)\]/g))
        refs.set(m[1], (refs.get(m[1]) || 0) + 1);
  }
  return {
    definitions: [...defs.values()].reduce((a, b) => a + b, 0),
    refs: [...refs.values()].reduce((a, b) => a + b, 0),
    refs_without_definition: [...refs.keys()].filter((n) => !defs.has(n)),
    definitions_without_ref: [...defs.keys()].filter((n) => !refs.has(n)),
    duplicate_definitions: [...defs.keys()].filter((n) => defs.get(n) > 1),
  };
}
// Run after assembly/exclusion; authoring repeats this on its actual block list.
function reconcileFootnotes(result) {
  const { blocks, stats } = result;
  stats.footnotes = footnotePairs(blocks);
  for (const b of blocks) {
    const reason = "각주 짝 불일치";
    if (b.warning?.code === "footnote-pair") delete b.warning;
    else if (b.warning)
      b.warning.reason = b.warning.reason
        .split(" · ")
        .filter((x) => x !== reason)
        .join(" · ");
    const missing =
      b.kind !== "footnote" &&
      !["table", "figure"].includes(b.kind) &&
      [...stats.footnotes.refs_without_definition,...stats.footnotes.duplicate_definitions].some((n) =>
        b.text.includes("[^" + n + "]"),
      );
    const unused =
      b.kind === "footnote" &&
      [...stats.footnotes.definitions_without_ref,...stats.footnotes.duplicate_definitions].some((n) =>
        b.text.startsWith("[^" + n + "]:"),
      );
    if (missing || unused) {
      if (b.warning) b.warning.reason += " · " + reason;
      else b.warning = { code: "footnote-pair", reason };
    }
  }
  return result;
}

// refs: [{ at, length, label }] in this text become figure/table references.
function footnoteContent(text, stats, refs = []) {
  const missing = new Set([...stats.footnotes.refs_without_definition,...(stats.footnotes.duplicate_definitions||[])]);
  const content = [];
  let at = 0;
  const cuts = [
    ...[...text.matchAll(/\[\^(\d+)\]/g)].map((m) => ({
      at: m.index,
      length: m[0].length,
      node: missing.has(m[1])
        ? { kind: "text", text: "[" + m[1] + "]" }
        : { kind: "footnote", label: m[1] },
    })),
    ...refs.map((r) => ({ at: r.at, length: r.length, node: r.section ? {kind:"link",url:"#"+r.label,children:[{kind:"text",text:text.slice(r.at,r.at+r.length)}]} : { kind: "reference", role: "numref", label: r.label } })),
  ].sort((a, b) => a.at - b.at);
  for (const c of cuts) {
    if (c.at < at) continue;
    if (c.at > at) content.push({ kind: "text", text: text.slice(at, c.at) });
    const previous = content.at(-1);
    if (c.node.kind === "link" && previous?.kind === "link" && c.node.url === previous.url)
      previous.children[0].text += c.node.children[0].text;
    else content.push(c.node);
    at = c.at + c.length;
  }
  if (at < text.length) content.push({ kind: "text", text: text.slice(at) });
  return content;
}
export {
  BULLET,
  suggestExcludedPages,
  convert,
  footnoteContent,
  mergeRegions,
  reconcileFootnotes,
};

function coalesceOverlaps(blocks) {
  const out = [];
  for (const source of blocks) {
    let b = { ...source, boxes: source.boxes.map((x) => ({ ...x })) };
    for (let changed = true; changed; ) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        const o = out[i];
        if (o.page !== b.page || o.formula || b.formula) continue;
        const a = b.boxes[0],
          c = o.boxes[0];
        const area = (x) =>
          Math.max(0, x.x1 - x.x0) * Math.max(0, x.bottom - x.top);
        const overlap =
          Math.max(0, Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0)) *
          Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
        const contains = (x, y) =>
          x.x0 <= y.x0 &&
          x.x1 >= y.x1 &&
          x.top <= y.top &&
          x.bottom >= y.bottom;
        if (
          contains(a, c) ||
          contains(c, a) ||
          overlap > Math.min(area(a), area(c)) / 2
        ) {
          out.splice(i, 1);
          b.text += " " + o.text;
          addBox(b, { page: o.page, bbox: [c.x0, c.top, c.x1, c.bottom] });
          changed = true;
          break;
        }
      }
    }
    out.push(b);
  }
  return out;
}
function mergeRegions(blocks, profile = profiles.generic) {
  const objects = blocks.filter((b) => ["table", "figure"].includes(b.kind));
  const united = coalesceOverlaps(objects);
  const emitted = new Set();
  blocks = blocks.flatMap((b) => {
    if (!objects.includes(b)) return [b];
    const x = b.boxes[0];
    const owner = united.find(
      (o) =>
        o.page === b.page &&
        o.boxes[0].x0 <= x.x0 &&
        o.boxes[0].x1 >= x.x1 &&
        o.boxes[0].top <= x.top &&
        o.boxes[0].bottom >= x.bottom,
    );
    if (emitted.has(owner)) return [];
    emitted.add(owner);
    return [owner];
  });
  // Text enclosed by an object belongs to the crop, rather than separating its fragments.
  const enclosed = new Set();
  for (const b of blocks) {
    if (!["para", "heading_unnumbered"].includes(b.kind)) continue;
    const owner = blocks.find(
      (o) =>
        ["table", "figure"].includes(o.kind) &&
        o.page === b.page &&
        b.boxes.every((x) =>
          o.boxes.some(
            (r) =>
              r.page === x.page &&
              r.x0 <= (x.x0 + x.x1) / 2 &&
              r.x1 >= (x.x0 + x.x1) / 2 &&
              r.top <= (x.top + x.bottom) / 2 &&
              r.bottom >= (x.top + x.bottom) / 2,
          ),
        ),
    );
    if (owner) {
      owner.text += " " + b.text;
      for (const x of b.boxes)
        addBox(owner, { page: x.page, bbox: [x.x0, x.top, x.x1, x.bottom] });
      enclosed.add(b);
    }
  }
  blocks = blocks.filter((b) => !enclosed.has(b));
  const isObject = (b) => b && !b.formula && ["table", "figure"].includes(b.kind);
  const merged = [];
  for (let i = 0; i < blocks.length; ) {
    const first = blocks[i];
    if (!isObject(first)) {
      merged.push(first);
      i++;
      continue;
    }
    const run = [first];
    let end = i + 1;
    while (isObject(blocks[end]) && blocks[end].page === first.page) {
      run.push(blocks[end++]);
    }
    const area = (b) =>
      (b.boxes[0].x1 - b.boxes[0].x0) * (b.boxes[0].bottom - b.boxes[0].top);
    const largest = run.reduce((a, b) => (area(b) > area(a) ? b : a));
    const prior = blocks[i - 1];
    const next = blocks[end];
    const beforeCaption =
      prior?.page === first.page &&
      prior.kind === "caption" &&
      profile.captionKind(prior.text) === "table";
    const afterCaption =
      next?.page === first.page &&
      next.kind === "caption" &&
      profile.captionKind(next.text) === "figure";
    const kind = beforeCaption
      ? "table"
      : afterCaption
        ? "figure"
        : largest.kind;
    const combined = {
      ...first,
      kind,
      text: run
        .map((b) => b.text)
        .filter(Boolean)
        .join(" "),
      boxes: [],
    };
    for (const b of run)
      for (const x of b.boxes) {
        addBox(combined, { page: x.page, bbox: [x.x0, x.top, x.x1, x.bottom] });
      }
    merged.push(combined);
    i = end;
  }
  return merged;
}
