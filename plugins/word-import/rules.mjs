// Word structure (docx.mjs) → Litzio authoring blocks and the list of places to check.
export const WARNING_KINDS = [
  ["merged", "병합을 푼 표"],
  ["joined", "칸 안 문단을 이어 적은 표"],
  ["image-failed", "그림을 옮기지 못함"],
  ["image-moved", "표 밖으로 뺀 그림"],
  ["ref-missing", "대상을 찾지 못한 참조"],
  ["math", "수식을 글자로 둠"],
  ["textbox", "글상자"],
  ["other", "바꿔 적은 그 밖의 것"],
];
export const LIMITS = { tableRows: 100, tableColumns: 32, listItems: 100 };

const SYMBOL = {
  0x22: "∀", 0x24: "∃", 0x27: "∋", 0x2a: "∗", 0x2d: "−", 0x40: "≅", 0x5c: "∴", 0x5e: "⊥", 0x7e: "∼",
  0xa2: "′", 0xa3: "≤", 0xa5: "∞", 0xab: "↔", 0xac: "←", 0xad: "↑", 0xae: "→", 0xaf: "↓", 0xb0: "°", 0xb1: "±",
  0xb2: "″", 0xb3: "≥", 0xb4: "×", 0xb5: "∝", 0xb6: "∂", 0xb7: "•", 0xb8: "÷", 0xb9: "≠", 0xba: "≡", 0xbb: "≈",
  0xbc: "…", 0xc4: "⊗", 0xc5: "⊕", 0xc6: "∅", 0xc7: "∩", 0xc8: "∪", 0xce: "∈", 0xcf: "∉", 0xd0: "∠", 0xd1: "∇",
  0xd6: "√", 0xd7: "⋅", 0xd8: "¬", 0xd9: "∧", 0xda: "∨", 0xdb: "⇔", 0xdc: "⇐", 0xde: "⇒", 0xe5: "∑", 0xf2: "∫",
};
"ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ".split("").forEach((c, i) => { SYMBOL[0x41 + i] = c; });
"αβχδεφγηιϕκλμνοπθρστυϖωξψζ".split("").forEach((c, i) => { SYMBOL[0x61 + i] = c; });
const WINGDINGS = { 0x9f: "•", 0xa7: "▪", 0x6c: "●", 0x6e: "■", 0xd8: "➢", 0xfc: "✓", 0xfb: "✗", 0xfe: "☑", 0xe8: "➔" };
export const symbolChar = (font, code) => (/^symbol$/i.test(font) ? SYMBOL : /^wingdings$/i.test(font) ? WINGDINGS : {})[code];

const LIST_STYLES = { decimal: "decimal", lowerLetter: "lower-alpha", upperLetter: "upper-alpha", lowerRoman: "lower-roman", upperRoman: "upper-roman" };
// "Table 3", "Figure 6.6.4-VII", "표 2-1": the kind word and the number Word's SEQ field wrote.
const CAPTION = /^\s*([Tt]able|TABLE|[Ff]igure|FIGURE|[Ff]ig\.?|표|그림)\s*((?:[A-Z]?\d+|[IVXLC]+)(?:[-.‑–](?:\d+|[IVXLC]+|[A-Za-z]))*)(?![\w])\s*(?:[:.\-–—]\s*)?/;
const captionKind = text => {
  const m = text.match(CAPTION);
  return m ? (/^(table|표)$/i.test(m[1]) ? "table" : "figure") : null;
};

const plain = runs => runs.map(r => r.text ?? (r.runs ? plain(r.runs) : "")).join("");
const short = (text, n = 48) => { const t = text.replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const imagesOf = runs => runs.flatMap(r => r.image ? [r.image] : r.runs ? imagesOf(r.runs) : []);
const linksOf = runs => runs.flatMap(r => r.link ? [r] : []);
const separator = n => n.suffix === "nothing" ? "" : " ";

function dropChars(runs, n) {
  const out = [];
  for (const r of runs) {
    if (n <= 0) { out.push(r); continue; }
    if (r.text !== undefined) {
      if (r.text.length <= n) n -= r.text.length;
      else { out.push({ ...r, text: r.text.slice(n) }); n = 0; }
    } else if (r.runs) {
      const len = plain(r.runs).length;
      if (len <= n) n -= len;
      else { out.push({ ...r, runs: dropChars(r.runs, n) }); n = 0; }
    } else out.push(r);
  }
  return out;
}

// Runs → Core InlineContent. Formatting marks never begin or end with spaces.
function inline(runs, { breaks = false, resolve, missing } = {}) {
  const out = [];
  const textNodes = (text, f) => {
    if (!text) return;
    const parts = breaks ? text.split("\n") : [text.replace(/\n/g, " ")];
    parts.forEach((part, i) => {
      if (i) out.push({ kind: "break" });
      const m = part.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (m[1]) out.push({ kind: "text", text: m[1] });
      if (m[2]) {
        let node = { kind: "text", text: m[2] };
        if (f.sup) node = { kind: "superscript", children: [node] };
        else if (f.sub) node = { kind: "subscript", children: [node] };
        if (f.i) node = { kind: "emphasis", children: [node] };
        if (f.b) node = { kind: "strong", children: [node] };
        out.push(node);
      }
      if (m[3]) out.push({ kind: "text", text: m[3] });
    });
  };
  for (const r of runs) {
    if (r.text !== undefined) textNodes(r.text, r);
    else if (r.link) {
      const url = r.link.bookmark ? resolve?.(r.link.bookmark) : /^(https?:|mailto:)/i.test(r.link.url || "") ? r.link.url : null;
      const children = tidy(inline(r.runs, {}));
      if (r.link.bookmark && !url && plain(r.runs).trim()) missing?.(r.link.bookmark, plain(r.runs));
      if (url && children.length) out.push({ kind: "link", url: url.startsWith("#") || !r.link.bookmark ? url : "#" + url, children });
      else out.push(...children);
    }
  }
  return tidy(out);
}

const same = (a, b) => a.kind === b.kind && ["strong", "emphasis", "superscript", "subscript"].includes(a.kind);
function tidy(nodes) {
  const out = [];
  for (const n of nodes) {
    const last = out.at(-1);
    if (n.kind === "text" && last?.kind === "text") last.text += n.text;
    else if (n.kind === "link" && last?.kind === "link" && last.url === n.url) last.children = tidy([...last.children, ...n.children]);
    else if (last && same(last, n)) last.children = tidy([...last.children, ...n.children]);
    else if (last?.kind === "text" && !last.text.trim() && out.length > 1 && same(out.at(-2), n)) {
      out.pop();
      out.at(-1).children = tidy([...out.at(-1).children, last, ...n.children]);
    }
    else out.push(n.children ? { ...n, children: [...n.children] } : { ...n });
  }
  while (out[0]?.kind === "break") out.shift();
  while (out.at(-1)?.kind === "break") out.pop();
  if (out[0]?.kind === "text") out[0].text = out[0].text.trimStart();
  if (out.at(-1)?.kind === "text") out.at(-1).text = out.at(-1).text.trimEnd();
  return out.filter(n => n.kind !== "text" || n.text);
}
const textOf = nodes => nodes.map(n => n.text ?? (n.children ? textOf(n.children) : n.kind === "break" ? " " : "")).join("");

export function convert(doc) {
  const units = [], warnings = [], records = new Map(), toc = [];
  let heading = "";
  const warn = (kind, unit, label, detail) => warnings.push({ kind, unit, label: short(label || heading || "문서 처음"), detail });

  // Pass 1: decide what each Word paragraph and table becomes.
  function structure(items, context) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type === "table") {
        const unit = { type: "table", item: it, record: { kind: "table" }, heading, hiddenBefore: hiddenOnly };
        hiddenOnly = 0;
        it.bookmarks.forEach(b => records.set(b, unit.record));
        units.push(unit);
        continue;
      }
      if (it.toc) { toc.push(it); continue; }
      const images = imagesOf(it.runs), text = plain(it.runs).trim();
      if (!text && !images.length && it.hidden) { hiddenOnly++; continue; }
      // The title line of a table of contents goes with it.
      if (!it.number && !images.length) {
        let j = i + 1;
        while (j < items.length && items[j].type === "p" && !items[j].toc && !plain(items[j].runs).trim() && !imagesOf(items[j].runs).length) j++;
        if (items[j]?.toc) continue;
      }
      const before = units.length;
      if (it.level && it.level <= 6 && (text || it.number?.marker)) {
        const unit = { type: "heading", item: it, record: { kind: "heading", number: it.number?.marker }, heading };
        it.bookmarks.forEach(b => records.set(b, unit.record));
        units.push(unit);
        heading = short((it.number?.marker ? it.number.marker + " " : "") + text, 40);
      } else if (it.caption && text) {
        units.push({ type: "caption", item: it, heading, kind: captionKind(text) });
      } else if (it.number && it.number.fmt !== "none" && text && !it.level) {
        units.push({ type: "list", item: it, heading });
      } else if (text) {
        units.push({ type: "paragraph", item: it, heading });
      }
      images.forEach((image, n) => {
        const unit = { type: "figure", item: it, image, record: { kind: "figure" }, heading, inText: !!text };
        if (n === 0 && !text) it.bookmarks.forEach(b => records.set(b, unit.record));
        units.push(unit);
      });
      if (units.length > before && hiddenOnly) { units[before].hiddenBefore = hiddenOnly; hiddenOnly = 0; }
      for (const box of it.textboxes) {
        const start = units.length;
        structure(box, "textbox");
        if (units.length > start) units[start].textbox = true;
      }
    }
  }
  let hiddenOnly = 0;
  structure(doc.items, "body");

  // Captions go to the neighbouring table or figure, preferring the kind their number names.
  const neighbours = i => [units[i - 1], units[i + 1]].filter(u => u && (u.type === "table" || u.type === "figure") && !u.caption);
  units.forEach((u, i) => {
    if (u.type !== "caption") return;
    const options = neighbours(i);
    const pick = options.find(o => o.type === u.kind) || (options.length === 1 && !u.kind ? options[0] : null)
      || (!u.kind ? options.find(o => (o.type === "table") === (o === units[i + 1])) : null);
    if (!pick) { u.type = "paragraph"; return; }
    pick.caption = u;
    u.type = "consumed";
    if (u.hiddenBefore) pick.hiddenBefore = (pick.hiddenBefore || 0) + u.hiddenBefore;
    u.item.bookmarks.forEach(b => records.set(b, pick.record));
  });

  // Labels only for targets something links to.
  const referenced = new Set();
  const collectLinks = runs => { for (const r of runs) if (r.link?.bookmark) referenced.add(r.link.bookmark); else if (r.runs) collectLinks(r.runs); };
  const visitItems = items => {
    for (const it of items) {
      if (it.type === "table") for (const row of it.rows) for (const c of row) visitItems(c.items);
      else if (!it.toc) { collectLinks(it.runs); it.textboxes.forEach(visitItems); }
    }
  };
  visitItems(doc.items);
  const used = new Set();
  let counter = 0;
  const labelFor = (record, hint) => {
    if (record.label) return record.label;
    let base = (record.kind === "heading" ? "sec-" : record.kind === "table" ? "tbl-" : "fig-") +
      (hint || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (/-$/.test(base)) base += ++counter;
    let label = base, n = 2;
    while (used.has(label)) label = base + "-" + n++;
    used.add(label);
    return (record.label = label);
  };

  const stats = { refs: { total: 0, linked: 0, text: 0 }, images: { total: 0, byType: {} } };
  let missingHere = [];
  const resolve = bookmark => {
    stats.refs.total++;
    const record = records.get(bookmark);
    if (record?.label) { stats.refs.linked++; return "#" + record.label; }
    stats.refs.text++;
    return null;
  };
  const missing = (bookmark, text) => missingHere.push(text.trim());
  for (const [b, r] of records) if (referenced.has(b) && !r.label) r.wanted = true;

  // Pass 2: blocks.
  const blocks = [], images = [];
  let listRun = [];
  const emit = (unit, block) => {
    blocks.push(block);
    if (unit.hiddenBefore) warn("other", blocks.length - 1, unit.heading, "바로 앞의 숨긴 글자만 있는 문단 " + unit.hiddenBefore + "개를 옮기지 않았습니다.");
    unit.hiddenBefore = 0;
    return blocks.length - 1;
  };
  const content = (runs, breaks) => inline(runs, { breaks, resolve, missing });
  const afterBlock = (index, unit) => {
    if (missingHere.length) warn("ref-missing", index, unit.caption ? plain(unit.caption.item.runs) : unit.heading, missingHere.map(t => "‘" + short(t, 24) + "’").join(", "));
    missingHere = [];
  };
  const itemWarnings = (index, unit) => {
    const it = unit.item;
    if (it.math) warn("math", index, unit.heading, "수식 " + it.math + "개");
    if (it.hidden) warn("other", index, unit.heading, "숨긴 글자 " + it.hidden + "곳을 옮기지 않았습니다.");
    if (it.notes) warn("other", index, unit.heading, "각주·미주 " + it.notes + "개를 옮기지 않았습니다.");
    if (it.unknownSymbols) warn("other", index, unit.heading, "기호 글꼴 문자 " + it.unknownSymbols + "개를 바꾸지 못해 원래 코드로 두었습니다.");
  };
  const caption = unit => {
    if (!unit.caption) return { enumerated: false, caption: "" };
    const runs = unit.caption.item.runs, text = plain(runs), m = text.match(CAPTION);
    if (m && captionKind(text) === unit.type) {
      const enumerator = m[2];
      if (unit.record.wanted) labelFor(unit.record, enumerator);
      return { enumerator, caption: content(dropChars(runs, m[0].length)) };
    }
    if (unit.record.wanted) labelFor(unit.record, "");
    return { enumerated: false, caption: content(runs) };
  };
  // Labels must exist before any block links to them, including earlier blocks.
  for (const u of units) {
    if (!u.record?.wanted) continue;
    if (u.type === "heading") labelFor(u.record, u.record.number || "");
    else {
      const text = u.caption ? plain(u.caption.item.runs) : "", m = text.match(CAPTION);
      labelFor(u.record, m && captionKind(text) === u.type ? m[2] : "");
    }
  }

  const listInfo = it => {
    const n = it.number, ordered = LIST_STYLES[n.fmt] && new RegExp("^%" + (n.ilvl + 1) + "([.)])$").exec(n.text);
    if (ordered) return { ordered: true, style: LIST_STYLES[n.fmt], delimiter: ordered[1], start: n.count };
    if (n.fmt === "bullet") return { ordered: false };
    return { ordered: false, marker: n.marker };
  };

  for (const unit of units) {
    const it = unit.item;
    if (unit.type !== "list") listRun = [];
    if (unit.type === "consumed") continue;
    if (unit.type === "heading") {
      if (unit.record.label) emit(unit, { kind: "target", label: unit.record.label });
      const number = it.number?.marker ? it.number.marker + separator(it.number) : "";
      const index = emit(unit, { kind: "heading", level: it.level, content: tidy([{ kind: "text", text: number }, ...content(it.runs, false)]) });
      itemWarnings(index, unit);
      afterBlock(index, unit);
    } else if (unit.type === "paragraph" || unit.type === "caption") {
      const index = emit(unit, { kind: "paragraph", content: content(it.runs, true) });
      if (it.level > 6) warn("other", index, unit.heading, "개요 수준 " + it.level + " 제목을 문단으로 옮겼습니다.");
      if (unit.textbox) warn("textbox", index, unit.heading, short(plain(it.runs), 32));
      itemWarnings(index, unit);
      afterBlock(index, unit);
    } else if (unit.type === "list") {
      const info = listInfo(it), level = it.number.ilvl;
      const body = content(it.runs, true);
      const item = { content: info.marker ? tidy([{ kind: "text", text: info.marker + " " }, ...body]) : body };
      while (listRun.length && listRun.at(-1).level > level) listRun.pop();
      const top = listRun.at(-1);
      const fits = l => l.list.ordered === info.ordered && l.list.style === info.style && l.list.delimiter === info.delimiter &&
        (!info.ordered || info.start === (l.list.start ?? 1) + l.list.items.length) && l.list.items.length < LIMITS.listItems;
      let index;
      if (top && top.level === level && fits(top)) {
        top.list.items.push(item);
        index = top.index;
      } else if (top && top.level < level && !top.list.items.at(-1).list) {
        const list = { ordered: info.ordered, ...(info.ordered ? { style: info.style, delimiter: info.delimiter, start: info.start } : {}), items: [item] };
        top.list.items.at(-1).list = list;
        listRun.push({ level, list, index: top.index });
        index = top.index;
      } else {
        const list = { kind: "list", ordered: info.ordered, ...(info.ordered ? { style: info.style, delimiter: info.delimiter, start: info.start } : {}), items: [item] };
        index = emit(unit, list);
        listRun = [{ level, list, index }];
      }
      if (info.marker !== undefined && !blocks[index].markerWarned) {
        blocks[index].markerWarned = true;
        warn("other", index, unit.heading, "번호 모양 ‘" + short(it.number.text, 16) + "’을 글자로 두고 글머리 목록으로 옮겼습니다.");
      }
      if (unit.textbox) warn("textbox", index, unit.heading, short(plain(it.runs), 32));
      itemWarnings(index, unit);
      afterBlock(index, unit);
    } else if (unit.type === "figure") {
      const cap = caption(unit);
      const index = figure(unit, unit.image, { ...(unit.record.label ? { label: unit.record.label } : {}), ...cap },
        unit.caption ? plain(unit.caption.item.runs) : unit.heading);
      if (unit.inText) warn("other", index, unit.heading, "글과 함께 있던 그림을 문단 뒤로 뺐습니다.");
      if (unit.textbox) warn("textbox", index, unit.heading, "그림");
      afterBlock(index, unit);
    } else if (unit.type === "table") {
      const tableIndex = tableBlocks(unit);
      afterBlock(tableIndex, unit);
    }
  }

  function figure(unit, image, fields, label) {
    const key = "figure-" + String(images.length + 1).padStart(3, "0");
    const index = emit(unit, { kind: "figure", imageAsset: key, imageAlt: (image.alt || "").trim() || "그림", ...fields });
    images.push({ key, part: image.part, block: index, label: short(label || "문서 처음") });
    stats.images.total++;
    const type = image.part ? image.part.split(".").pop().toLowerCase() : "shape";
    stats.images.byType[type] = (stats.images.byType[type] || 0) + 1;
    return index;
  }

  function cellContent(cell, moved, flags) {
    if (cell.content) return cell.content;
    const parts = [];
    const visit = items => {
      for (const it of items) {
        if (it.type === "table") {
          flags.nested = true;
          for (const row of it.rows) for (const c of new Set(row)) visit(c.items);
          continue;
        }
        if (it.toc) continue;
        moved.push(...imagesOf(it.runs));
        if (it.math) flags.math += it.math;
        if (it.hidden) flags.hidden += it.hidden;
        let body = content(it.runs, false);
        const n = it.number;
        if (n && n.fmt !== "bullet" && n.fmt !== "none" && n.marker) body = tidy([{ kind: "text", text: n.marker + separator(n) }, ...body]);
        if (body.length) parts.push(body);
        it.textboxes.forEach(box => { flags.textbox++; visit(box); });
      }
    };
    visit(cell.items);
    if (parts.length > 1) flags.joined++;
    cell.content = tidy(parts.flatMap((p, i) => i ? [{ kind: "text", text: " / " }, ...p] : p));
    return cell.content;
  }

  function tableBlocks(unit) {
    const t = unit.item, moved = [], flags = { joined: 0, nested: false, math: 0, hidden: 0, textbox: 0 };
    let rows = t.rows.map(row => row.map(cell => cellContent(cell, moved, flags)));
    const cap = caption(unit);
    let width = Math.max(1, ...rows.map(r => r.length));
    if (!rows.length) rows = [[[]]];
    rows = rows.map(r => { const copy = [...r]; while (copy.length < width) copy.push([]); return copy; });
    const label = cap.caption ? plain(unit.caption.item.runs) : unit.heading + " 아래 표";
    const wide = width > LIMITS.tableColumns;
    if (wide) {
      rows = rows.map(r => [...r.slice(0, LIMITS.tableColumns - 1), tidy(r.slice(LIMITS.tableColumns - 1).flatMap((c, i) => i ? [{ kind: "text", text: " / " }, ...c] : c))]);
      width = LIMITS.tableColumns;
    }
    const [header, ...body] = rows, chunks = [];
    for (let i = 0; i < Math.max(1, body.length); i += LIMITS.tableRows - 1) chunks.push([header, ...body.slice(i, i + LIMITS.tableRows - 1)]);
    let first;
    chunks.forEach((chunk, n) => {
      const index = emit(unit, { kind: "table", rows: chunk.map(r => r.map(c => c.length ? c : "")),
        ...(n === 0 ? { ...(unit.record.label ? { label: unit.record.label } : {}), ...cap } : { enumerated: false, caption: "" }) });
      if (n === 0) first = index;
    });
    if (t.horizontal || t.vertical) warn("merged", first, label, [t.horizontal && "가로 병합 " + t.horizontal + "곳", t.vertical && "세로 병합 " + t.vertical + "곳"].filter(Boolean).join(" · "));
    if (flags.joined) warn("joined", first, label, "칸 " + flags.joined + "개");
    if (flags.math) warn("math", first, label, "표 안의 수식 " + flags.math + "개");
    if (flags.textbox) warn("textbox", first, label, "표 안의 글상자 " + flags.textbox + "개");
    if (flags.hidden) warn("other", first, label, "숨긴 글자 " + flags.hidden + "곳을 옮기지 않았습니다.");
    if (flags.nested) warn("other", first, label, "표 안의 표를 칸의 글자로 이어 적었습니다.");
    if (wide) warn("other", first, label, "열이 " + LIMITS.tableColumns + "개를 넘어 남은 열을 마지막 열에 이어 적었습니다.");
    if (chunks.length > 1) warn("other", first, label, "행이 " + LIMITS.tableRows + "개를 넘어 표 " + chunks.length + "개로 나눴습니다.");
    moved.forEach((image, n) => {
      const index = figure(unit, image, { enumerated: false, caption: "" }, label);
      if (n === 0) warn("image-moved", index, label, "그림 " + moved.length + "개");
    });
    return first;
  }

  // Heading numbers against the numbers the table of contents still shows.
  const tocCheck = { entries: 0, compared: 0, matched: 0, mismatches: {}, other: {} };
  const headingsByBookmark = new Map();
  for (const u of units) if (u.type === "heading") u.item.bookmarks.forEach(b => headingsByBookmark.set(b, u.item));
  for (const entry of toc) {
    const anchor = entry.anchors[0];
    if (!anchor) continue;
    tocCheck.entries++;
    const h = headingsByBookmark.get(anchor);
    if (!h) {
      const kind = ["table", "figure"].includes(records.get(anchor)?.kind) ? "그림·표 목차 항목" : "목차가 가리키는 제목 없음";
      tocCheck.other[kind] = (tocCheck.other[kind] || 0) + 1;
      continue;
    }
    tocCheck.compared++;
    const shown = plain(entry.runs).replace(/\s+/g, " ").trim(), number = h.number?.marker || "";
    const type = !number ? (/^[\dA-Z]+(\.[\dA-Z]+)*\.?\s/.test(shown) ? "제목에 번호가 없는데 목차에 번호가 있음" : null)
      : shown.startsWith(number + " ") || shown === number ? null
        : /^[\dA-Z]+(\.[\dA-Z]+)*\.?\s/.test(shown) ? "번호가 다름" : "목차에 번호가 없음";
    if (!type) tocCheck.matched++;
    else tocCheck.mismatches[type] = (tocCheck.mismatches[type] || 0) + 1;
  }

  const headings = {};
  for (const b of blocks) if (b.kind === "heading") headings[b.level] = (headings[b.level] || 0) + 1;
  const outBlocks = blocks.map(({ markerWarned, ...b }) => b);
  return {
    title: doc.title || undefined,
    blocks: outBlocks,
    images,
    warnings: warnings.map(w => ({ ...w, block: w.unit, unit: undefined })),
    stats: {
      ...stats, headings, toc: tocCheck,
      tables: blocks.filter(b => b.kind === "table").length,
      figures: blocks.filter(b => b.kind === "figure").length,
      warnings: Object.fromEntries(WARNING_KINDS.map(([k]) => [k, warnings.filter(w => w.kind === k).length])),
    },
  };
}
// Pictures that could not become PNG: the figure becomes a paragraph that says so, keeps its
// caption, and links to it fall back to their text.
export function withImages(result, failed) {
  const gone = new Set(), warnings = [...result.warnings];
  const blocks = result.blocks.map((b, i) => {
    if (b.kind !== "figure" || !failed.has(b.imageAsset)) return b;
    if (b.label) gone.add("#" + b.label);
    const image = result.images.find(x => x.key === b.imageAsset);
    warnings.push({ kind: "image-failed", block: i, label: image.label, detail: failed.get(b.imageAsset) });
    const caption = typeof b.caption === "string" ? (b.caption ? [{ kind: "text", text: b.caption }] : []) : b.caption;
    const number = b.enumerator ? "Figure " + b.enumerator + " " : "";
    return { kind: "paragraph", content: tidy([{ kind: "text", text: "[그림을 옮기지 못함] " + number }, ...caption]) };
  });
  const unlink = nodes => tidy(nodes.flatMap(n => n.kind === "link" && gone.has(n.url) ? n.children : n.children ? [{ ...n, children: unlink(n.children) }] : [n]));
  const visit = x => {
    if (Array.isArray(x)) return x.map(visit);
    if (!x || typeof x !== "object") return x;
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = (k === "content" || k === "caption") && Array.isArray(v) ? unlink(v) : Array.isArray(v) || (v && typeof v === "object") ? visit(v) : v;
    if (Array.isArray(x.rows)) out.rows = x.rows.map(r => r.map(c => Array.isArray(c) ? unlink(c) : c));
    return out;
  };
  warnings.sort((a, b) => a.block - b.block);
  return { ...result, blocks: gone.size ? blocks.map(visit) : blocks, warnings,
    stats: { ...result.stats, warnings: { ...result.stats.warnings, "image-failed": failed.size } } };
}
export { inline, textOf };
