const HEAD = /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/,
  ANNEX = /^([A-Z](?:\.\d+)+)\s+(\S.*)$/,
  TOP = /^Annex\s+([A-Z])\b\s*(.*)$/;
const CAP = /^(Table|Figure)\s+([A-Z]\.\d+|\d+)\s*[—–.:-]/;
const BULLET = /^[—–•\-]\s*/;
const END = /[.:;?!)\]”"]$|\[\^\w+\]$/;
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
    (b.lines ||= []).push({ page: l.page, box: box(l.page, l.bbox), text: l.text() });
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
  const spans = raw.spans.filter((s) => s.text.trim()),
    main = spans.reduce(
      (a, s) => (!a || s.text.length > a.text.length ? s : a),
      null,
    ),
    main_size = main ? round(main.size * 10) / 10 : 0;
  return {
    page,
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
function suggestExcludedPages({ pages }) {
  const { all } = classifyLines(pages);
  const start = all.findIndex((ls) =>
    ls.some((l) => l.kind === "heading" && /^1\.?\s/.test(l.text())),
  );
  return Array.from({ length: Math.max(0, start) }, (_, i) => i + 1);
}
function classifyLines(pages) {
  pages = pages.map((p) => ({ ...p }));
  const all = pages.map((p, i) =>
    p.raw
      .map((r) => line(r, i))
      .filter((l) => l.plain)
      .sort((a, b) => round(a.y0 / 3) - round(b.y0 / 3) || a.x0 - b.x0),
  );
  const sizes = /* @__PURE__ */ new Map();
  for (const lines of all)
    for (const l of lines)
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
        margin(l, i) &&
        ((seen.get(key(l)) || 0) >= pages.length * 0.3 ||
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
      if (l.kind || !CAP.test(l.plain)) continue;
      const figure = l.plain.startsWith("Figure");
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
            /^NOTE/.test(l.plain) &&
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
    for (const l of tail) l.kind = "footnote";
    let prev = null;
    for (const l of ls) {
      if (l.kind) {
        prev = l.kind === "caption" ? l : null;
        continue;
      }
      const t = l.text();
      if (l.bold && CAP.test(t)) l.kind = "caption";
      else if (prev?.kind === "caption" && l.y0 - prev.y1 < 6 && l.x0 > 92)
        l.kind = "caption";
      else if (
        l.bold &&
        l.size >= body &&
        (HEAD.test(t) || ANNEX.test(t) || TOP.test(t))
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
function convert({ pages, toc }, excludedPages = []) {
  if (
    !Array.isArray(excludedPages) ||
    excludedPages.some((p) => !Number.isInteger(p) || p < 1 || p > pages.length)
  )
    throw new Error("제외할 쪽 번호가 올바르지 않습니다.");
  const omitted = new Set(excludedPages);
  const classified = classifyLines(pages);
  pages = classified.pages;
  let { all } = classified;
  const { body } = classified;
  const start = 0;
  all.forEach((ls, i) => {
    if (omitted.has(i + 1)) for (const l of ls) l.kind = "front";
  });
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
  const blocks = [],
    excluded = [];
  let joins = 0;
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
        if (obj && obj.kind === l.kind && obj.page === p) {
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
        const m = t.match(HEAD) || t.match(ANNEX);
        push("heading", t, l, TOP.test(t) ? 1 : m[1].split(".").length);
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
          !CAP.test(t)
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
        !/^NOTE(?:\s|[—–-])/.test(t) &&
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
        active.text += (active.text.endsWith("-") ? "" : " ") + t;
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
              b.text += (b.text.endsWith("-") ? "" : " ") + t;
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
        if (!joined) {
          const b = push(mark ? "list" : "para", t, l);
          if (mark) Object.assign(b, mark, { level: 1 });
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
  const merged = mergeRegions(blocks);
  blocks.splice(0, blocks.length, ...merged);
  blocks.forEach((b, i) => (b.id = "b" + i));
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
  const stats = measure(pages, toc, all, blocks, start, body, joins);
  stats.paragraphs.layout = {
    full_line_ratio: fullRatio,
    justified,
    baseline_step: step,
    right_edges: right,
  };
  suspects(blocks, stats);
  for (const b of blocks) if (b.kind === "para") b.kind = "paragraph";
  return {
    pages: pages.map((p) => ({ width: p.width, height: p.height })),
    blocks,
    excluded,
    excludedPages: [...omitted].sort((a, b) => a - b),
    stats,
  };
}
function measure(pages, toc, all, blocks, start, body, joins) {
  const headings = blocks.filter((b) => b.kind === "heading"),
    truth = toc.filter(([, t]) => HEAD.test(t) || ANNEX.test(t) || TOP.test(t)),
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
        (b) => b.kind === "caption" && b.text.startsWith("Table"),
      ).length,
      figure_captions: blocks.filter(
        (b) => b.kind === "caption" && b.text.startsWith("Figure"),
      ).length,
    },
    footnotes: footnotePairs(blocks),
  };
}
function suspects(blocks, stats) {
  const warn = (b, code, reason) => {
    if (b.warning) b.warning.reason += " · " + reason;
    else b.warning = { code, reason };
  };
  const seen = /* @__PURE__ */ new Set();
  for (const b of blocks) {
    if (b.kind === "heading_unnumbered")
      warn(b, "unnumbered-heading", "번호 없는 제목 후보");
    if (b.kind === "heading") {
      const m = b.text.match(HEAD) || b.text.match(ANNEX);
      if (!m) continue;
      const n = m[1],
        parts = n.split("."),
        parent = parts.slice(0, -1).join("."),
        last = parts.at(-1),
        reasons = [];
      if (
        parent &&
        !seen.has(parent) &&
        !(parts.length === 2 && /^[A-Z]$/.test(parts[0]))
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
    } else if (
      [
        "para",
        "paragraph",
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

function footnoteContent(text, stats) {
  const missing = new Set([...stats.footnotes.refs_without_definition,...(stats.footnotes.duplicate_definitions||[])]);
  const content = [];
  let at = 0;
  for (const m of text.matchAll(/\[\^(\d+)\]/g)) {
    if (m.index > at)
      content.push({ kind: "text", text: text.slice(at, m.index) });
    content.push(
      missing.has(m[1])
        ? { kind: "text", text: "[" + m[1] + "]" }
        : { kind: "footnote", label: m[1] },
    );
    at = m.index + m[0].length;
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
        if (o.page !== b.page) continue;
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
function mergeRegions(blocks) {
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
  const isObject = (b) => b && ["table", "figure"].includes(b.kind);
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
      /^Table\b/.test(prior.text);
    const afterCaption =
      next?.page === first.page &&
      next.kind === "caption" &&
      /^Figure\b/.test(next.text);
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
