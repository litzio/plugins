import path from "node:path";
import { readZip } from "./zip.mjs";
import { parseXml, kids, kid, val } from "./xml.mjs";
import { symbolChar } from "./rules.mjs";

// Reads the Word structure as written in the file: paragraphs with their style,
// outline level, computed list number, runs, fields, bookmarks, pictures and text
// boxes, and tables as cell grids. Turning this into blocks is rules.mjs's job.
const on = node => !!node && !["0", "false", "off"].includes(node.attrs["w:val"]);

function readStyles(root) {
  const styles = new Map(), defaults = {};
  for (const s of kids(root, "w:style")) {
    const pPr = kid(s, "w:pPr"), rPr = kid(s, "w:rPr"), numPr = kid(pPr, "w:numPr");
    styles.set(s.attrs["w:styleId"], {
      type: s.attrs["w:type"], name: (val(s, "w:name") || "").toLowerCase(), basedOn: val(s, "w:basedOn"),
      outline: val(pPr, "w:outlineLvl"),
      numPr: numPr && { numId: val(numPr, "w:numId"), ilvl: val(numPr, "w:ilvl") },
      run: runFormat(rPr),
    });
    if (s.attrs["w:default"] === "1" || s.attrs["w:default"] === "true") defaults[s.attrs["w:type"]] = s.attrs["w:styleId"];
  }
  const docDefaults = runFormat(kid(kid(kid(root, "w:docDefaults"), "w:rPrDefault"), "w:rPr"));
  // First value found along the basedOn chain.
  const find = (id, pick) => {
    for (let s = styles.get(id), seen = 0; s && seen < 20; s = styles.get(s.basedOn), seen++) {
      const v = pick(s);
      if (v !== undefined) return v;
    }
  };
  return { styles, defaults, docDefaults, find };
}

function runFormat(rPr) {
  if (!rPr) return {};
  const f = {}, va = val(rPr, "w:vertAlign");
  if (kid(rPr, "w:b")) f.b = on(kid(rPr, "w:b"));
  if (kid(rPr, "w:i")) f.i = on(kid(rPr, "w:i"));
  if (va) f.va = va;
  if (kid(rPr, "w:vanish")) f.hidden = on(kid(rPr, "w:vanish"));
  return f;
}

function readNumbering(root) {
  const abstracts = new Map(), nums = new Map();
  const level = l => ({
    start: val(l, "w:start") !== undefined ? +val(l, "w:start") : 0,
    fmt: val(l, "w:numFmt") || "decimal", text: val(l, "w:lvlText") ?? "",
    legal: !!kid(l, "w:isLgl") && on(kid(l, "w:isLgl")), restart: val(l, "w:lvlRestart"),
    suffix: val(l, "w:suff") || "tab", style: val(l, "w:pStyle"),
    font: kid(kid(l, "w:rPr"), "w:rFonts")?.attrs["w:ascii"],
  });
  for (const a of kids(root, "w:abstractNum")) {
    const levels = [];
    for (const l of kids(a, "w:lvl")) levels[+l.attrs["w:ilvl"]] = level(l);
    abstracts.set(a.attrs["w:abstractNumId"], { levels, link: val(a, "w:numStyleLink") });
  }
  for (const n of kids(root, "w:num")) {
    const overrides = {};
    for (const o of kids(n, "w:lvlOverride")) {
      const l = kid(o, "w:lvl");
      overrides[+o.attrs["w:ilvl"]] = { start: val(o, "w:startOverride"), level: l && level(l) };
    }
    nums.set(n.attrs["w:numId"], { abstract: val(n, "w:abstractNumId"), overrides });
  }
  return { abstracts, nums };
}

const roman = n => {
  let out = "";
  for (const [v, s] of [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]])
    while (n >= v) { out += s; n -= v; }
  return out;
};
const letter = n => n <= 0 ? "" : String.fromCharCode(97 + (n - 1) % 26).repeat(Math.floor((n - 1) / 26) + 1);
export function formatNumber(n, fmt) {
  switch (fmt) {
    case "lowerLetter": return letter(n);
    case "upperLetter": return letter(n).toUpperCase();
    case "lowerRoman": return roman(n);
    case "upperRoman": return roman(n).toUpperCase();
    case "decimalZero": return n < 10 ? "0" + n : String(n);
    case "none": return "";
    case "bullet": return "";
    default: return String(n);
  }
}

// Word list counters: one set per abstract list, restarted by a list instance's start override.
function numberer(numbering, styleInfo) {
  const state = new Map();
  const resolve = numId => {
    const num = numbering.nums.get(numId);
    let abstractId = num?.abstract, abstract = numbering.abstracts.get(abstractId);
    if (abstract?.link) {
      const linked = styleInfo.find(abstract.link, s => s.numPr?.numId);
      const target = linked && numbering.nums.get(linked);
      if (target) { abstractId = target.abstract; abstract = numbering.abstracts.get(abstractId); }
    }
    return abstract && { num, abstractId, abstract };
  };
  return {
    levelFor(numId, style) {
      const r = resolve(numId);
      if (!r) return undefined;
      const chain = [];
      for (let s = style, n = 0; s && n < 20; s = styleInfo.styles.get(s)?.basedOn, n++) chain.push(s);
      const i = r.abstract.levels.findIndex(l => l && chain.includes(l.style));
      return i >= 0 ? i : undefined;
    },
    next(numId, ilvl) {
      const r = resolve(numId);
      if (!r) return null;
      const lvl = i => r.num.overrides[i]?.level || r.abstract.levels[i] || { start: 1, fmt: "decimal", text: "", suffix: "tab" };
      let s = state.get(r.abstractId);
      if (!s) state.set(r.abstractId, s = { counts: [], used: new Set() });
      if (!s.used.has(numId)) {
        s.used.add(numId);
        for (const [i, o] of Object.entries(r.num.overrides)) if (o.start !== undefined) s.counts[+i] = +o.start - 1;
      }
      const here = lvl(ilvl);
      s.counts[ilvl] = (s.counts[ilvl] ?? here.start - 1) + 1;
      for (let k = ilvl + 1; k < 9; k++) {
        const restart = lvl(k).restart;
        if (restart === undefined || (+restart !== 0 && ilvl + 1 <= +restart)) s.counts[k] = undefined;
      }
      const marker = here.fmt === "bullet" ? here.text : here.text.replace(/%(\d)/g, (_, d) => {
        const i = +d - 1;
        return formatNumber(s.counts[i] ?? lvl(i).start, here.legal ? "decimal" : lvl(i).fmt);
      });
      return { numId, ilvl, fmt: here.fmt, text: here.text, marker, count: s.counts[ilvl], suffix: here.suffix, font: here.font };
    },
  };
}

function relationships(zip, part) {
  const file = path.posix.join(path.posix.dirname(part), "_rels", path.posix.basename(part) + ".rels");
  const map = new Map(), data = zip.read(file);
  if (!data) return map;
  for (const r of kids(parseXml(data.toString("utf8")), "Relationship"))
    map.set(r.attrs.Id, { type: r.attrs.Type, external: r.attrs.TargetMode === "External",
      target: r.attrs.TargetMode === "External" ? r.attrs.Target : path.posix.normalize(path.posix.join(path.posix.dirname(part), r.attrs.Target)).replace(/^\/+/, "") });
  return map;
}

export function readDocx(buffer) {
  const zip = readZip(buffer);
  const xml = name => { const b = zip.read(name); return b ? parseXml(b.toString("utf8")) : null; };
  const main = [...relationships(zip, "").values()].find(r => r.type.endsWith("/officeDocument"))?.target || "word/document.xml";
  const body = kid(xml(main), "w:body");
  if (!body) throw new Error("워드 문서의 본문을 찾을 수 없습니다.");
  const rels = relationships(zip, main);
  const partOf = type => [...rels.values()].find(r => r.type.endsWith("/" + type))?.target;
  const styleInfo = readStyles(xml(partOf("styles") || "") || { children: [] });
  const numbering = readNumbering(xml(partOf("numbering") || "") || { children: [] });
  const counter = numberer(numbering, styleInfo);
  const core = xml("docProps/core.xml");
  const titleNode = core && kid(core, "dc:title");
  const title = titleNode ? titleNode.children.filter(c => typeof c === "string").join("").trim() : "";

  const fields = []; // open complex fields across runs and paragraphs
  let pendingBookmarks = [];
  const inField = type => fields.some(f => f.type === type);

  function fieldType(code) {
    const m = code.trim().match(/^(\S+)\s*(.*)$/s);
    if (!m) return { type: "" };
    const type = m[1].toUpperCase(), rest = m[2];
    if (type === "REF" || type === "PAGEREF") return { type, bookmark: rest.match(/^"?([^"\s\\]+)/)?.[1] };
    if (type === "HYPERLINK") {
      const anchor = rest.match(/\\l\s+"([^"]+)"/)?.[1];
      const url = rest.match(/^"([^"]+)"/)?.[1] ?? rest.match(/^([^\s\\]+)/)?.[1];
      return anchor ? { type, bookmark: anchor } : { type, url };
    }
    return { type };
  }

  // A paragraph's inline output. Fields that become links collect their own result runs.
  function paragraph(p, context) {
    const pPr = kid(p, "w:pPr"), numPr = kid(pPr, "w:numPr");
    const style = val(pPr, "w:pStyle") || styleInfo.defaults.paragraph;
    const st = styleInfo.styles.get(style);
    const outline = val(pPr, "w:outlineLvl") ?? styleInfo.find(style, s => s.outline);
    const level = outline !== undefined && +outline < 9 ? +outline + 1 : 0;
    const styleName = styleInfo.find(style, s => s.name === "caption" ? s.name : undefined);
    const item = {
      type: "p", style: st?.name || style || "", level, caption: !!styleName, toc: inField("TOC"),
      runs: [], bookmarks: pendingBookmarks, images: [], textboxes: [], math: 0, notes: 0, hidden: 0, anchors: [], context,
      // A hidden paragraph mark hides an empty paragraph, number included.
      markHidden: on(kid(kid(pPr, "w:rPr"), "w:vanish")),
    };
    pendingBookmarks = [];
    let numId = val(numPr, "w:numId"), ilvl = val(numPr, "w:ilvl");
    if (numId === undefined) {
      numId = styleInfo.find(style, s => s.numPr?.numId);
      if (numId !== undefined && ilvl === undefined) ilvl = styleInfo.find(style, s => s.numPr?.ilvl) ?? counter.levelFor(numId, style);
    }
    if (numId !== undefined && numId !== "0") item.number = counter.next(numId, +(ilvl ?? 0));
    const out = () => {
      for (let i = fields.length - 1; i >= 0; i--) if (fields[i].collect) return fields[i].runs;
      return item.runs;
    };
    const fmtOf = rPr => {
      const direct = runFormat(rPr), rStyle = val(rPr, "w:rStyle");
      const pick = key => direct[key] ?? (rStyle && styleInfo.find(rStyle, s => s.run[key])) ??
        (level || item.caption ? undefined : styleInfo.find(style, s => s.run[key])) ?? styleInfo.docDefaults[key];
      return { b: !!pick("b"), i: !!pick("i"), va: pick("va"), hidden: !!pick("hidden") };
    };
    const push = (text, f) => {
      if (fields.some(x => x.phase === "code" || x.drop)) return;
      if (f.hidden) { item.hidden++; return; }
      out().push({ text, b: f.b, i: f.i, sup: f.va === "superscript", sub: f.va === "subscript" });
    };
    const drawing = (node, alt) => {
      // Pictures and text boxes inside a drawing, VML shape or embedded object.
      let found = false;
      const visit = (n, extent) => {
        if (n.name === "wp:inline") {
          const size = kid(n, "wp:extent")?.attrs;
          extent = size && [+size.cx / 12700, +size.cy / 12700];
        } else if (n.name === "v:shape") {
          const style = n.attrs.style || "";
          const pt = key => +style.match(new RegExp("(?:^|;)\\s*" + key + ":\\s*([\\d.]+)pt(?=\\s*(?:;|$))", "i"))?.[1];
          // Only inline VML has a reliable order relative to the surrounding Word paragraphs.
          if (!/(?:^|;)\s*position\s*:\s*absolute\b/i.test(style)) extent = [pt("width"), pt("height")];
        }
        for (const c of kids(n)) {
          if (c.name === "w:txbxContent") { item.textboxes.push(blocks(c, "textbox")); found = true; continue; }
          if (c.name === "mc:AlternateContent") { visit(kid(c, "mc:Choice") || kid(c, "mc:Fallback") || c, extent); continue; }
          if (c.name === "wp:docPr") alt = c.attrs.descr || c.attrs.title || alt;
          const rid = c.name === "a:blip" ? c.attrs["r:embed"] || c.attrs["r:link"] : c.name === "v:imagedata" ? c.attrs["r:id"] : null;
          if (rid) {
            const rel = rels.get(rid);
            if (!fields.some(x => x.phase === "code" || x.drop)) out().push({ image: {
              part: rel && !rel.external ? rel.target : null, alt,
              ...(extent?.every(x => Number.isFinite(x) && x > 0) ? { extent } : {}),
            } });
            found = true;
            continue;
          }
          visit(c, extent);
        }
      };
      visit(node);
      if (!found && !fields.some(x => x.phase === "code" || x.drop)) out().push({ image: { part: null, alt, shape: true } });
    };
    const run = r => {
      const f = fmtOf(kid(r, "w:rPr"));
      for (const c of kids(r)) {
        switch (c.name) {
          case "w:t": push(c.children.filter(x => typeof x === "string").join(""), f); break;
          case "w:tab": case "w:ptab": push(" ", f); break;
          case "w:br": if (!["page", "column"].includes(c.attrs["w:type"])) push("\n", f); break;
          case "w:cr": push("\n", f); break;
          case "w:noBreakHyphen": push("-", f); break;
          case "w:sym": {
            const code = parseInt(c.attrs["w:char"], 16), plainCode = code >= 0xf000 ? code - 0xf000 : code;
            const mapped = symbolChar(c.attrs["w:font"] || "", plainCode);
            if (!mapped) item.unknownSymbols = (item.unknownSymbols || 0) + 1;
            push(mapped ?? String.fromCodePoint(code), f);
            break;
          }
          case "w:instrText": if (fields.at(-1)?.phase === "code") fields.at(-1).code += c.children.join(""); break;
          case "w:fldChar": {
            const t = c.attrs["w:fldCharType"];
            if (t === "begin") fields.push({ code: "", phase: "code", runs: [] });
            else if (t === "separate" && fields.length) begin(fields.at(-1));
            else if (t === "end" && fields.length) end(fields.pop());
            break;
          }
          case "w:drawing": case "w:pict": case "w:object": drawing(c, ""); break;
          case "mc:AlternateContent": drawing(kid(c, "mc:Choice") || c, ""); break;
          case "w:footnoteReference": case "w:endnoteReference": item.notes++; break;
          default: break;
        }
      }
    };
    function begin(field) {
      Object.assign(field, fieldType(field.code), { phase: "result" });
      field.drop = ["PAGEREF", "PAGE", "NUMPAGES", "SECTIONPAGES"].includes(field.type);
      field.collect = field.type === "REF" || field.type === "HYPERLINK";
      if (field.type === "TOC") item.toc = true;
      if (field.bookmark && ["HYPERLINK", "PAGEREF"].includes(field.type) && inField("TOC")) item.anchors.push(field.bookmark);
    }
    function end(field) {
      if (field.phase === "code") Object.assign(field, fieldType(field.code));
      if (field.collect) out().push({ link: field.bookmark ? { bookmark: field.bookmark, type: field.type } : { url: field.url }, runs: field.runs });
    }
    const inline = node => {
      for (const c of kids(node)) {
        switch (c.name) {
          case "w:r": run(c); break;
          case "w:hyperlink": {
            const rel = c.attrs["r:id"] && rels.get(c.attrs["r:id"]);
            const field = { phase: "result", collect: true, runs: [] };
            if (item.toc && c.attrs["w:anchor"]) item.anchors.push(c.attrs["w:anchor"]);
            fields.push(field);
            inline(c);
            fields.pop();
            out().push({ link: c.attrs["w:anchor"] ? { bookmark: c.attrs["w:anchor"], type: "HYPERLINK" } : { url: rel?.target }, runs: field.runs });
            break;
          }
          case "w:fldSimple": {
            const field = { code: c.attrs["w:instr"] || "", phase: "code", runs: [] };
            fields.push(field);
            begin(field);
            inline(c);
            end(fields.pop());
            break;
          }
          case "w:bookmarkStart": if (c.attrs["w:name"] !== "_GoBack") item.bookmarks.push(c.attrs["w:name"]); break;
          case "m:oMath": case "m:oMathPara": {
            item.math++;
            const text = [];
            const visit = n => { for (const x of kids(n)) { if (x.name === "m:t") text.push(x.children.join("")); else visit(x); } };
            visit(c);
            push(text.join(""), { b: false, i: false });
            break;
          }
          case "w:del": case "w:moveFrom": case "w:pPr": break;
          case "mc:AlternateContent": inline(kid(c, "mc:Choice") || c); break;
          case "w:sdt": inline(kid(c, "w:sdtContent") || c); break;
          default: inline(c); // w:ins, w:smartTag, w:customXml, w:sdtContent and the like
        }
      }
    };
    inline(p);
    return item;
  }

  function table(tbl, context) {
    const grid = kids(kid(tbl, "w:tblGrid"), "w:gridCol").length;
    const rows = [], above = [];
    let horizontal = 0, vertical = 0;
    const bookmarks = pendingBookmarks;
    pendingBookmarks = [];
    const rowsOf = node => kids(node).flatMap(c => c.name === "w:tr" ? [c] : ["w:sdt", "w:sdtContent", "w:customXml"].includes(c.name) ? rowsOf(c) : []);
    const cellsOf = node => kids(node).flatMap(c => c.name === "w:tc" ? [c] : ["w:sdt", "w:sdtContent", "w:customXml"].includes(c.name) ? cellsOf(c) : []);
    for (const tr of rowsOf(tbl)) {
      const trPr = kid(tr, "w:trPr"), row = [];
      for (let i = 0; i < +(val(trPr, "w:gridBefore") ?? 0); i++) row.push({ items: [] });
      for (const tc of cellsOf(tr)) {
        const tcPr = kid(tc, "w:tcPr"), span = +(val(tcPr, "w:gridSpan") ?? 1), vm = kid(tcPr, "w:vMerge");
        const items = blocks(tc, "cell");
        const col = row.length;
        let cell = { items };
        if (vm && vm.attrs["w:val"] !== "restart" && above[col]) {
          cell = above[col];
          cell.items.push(...items);
          cell.continued = true;
        }
        if (span > 1) horizontal++;
        for (let k = 0; k < span; k++) { row.push(cell); above[col + k] = cell; }
      }
      rows.push(row);
    }
    const seen = new Set();
    for (const row of rows) for (const cell of row) if (cell.continued && !seen.has(cell)) { seen.add(cell); vertical++; }
    const width = Math.max(grid, ...rows.map(r => r.length));
    for (const row of rows) while (row.length < width) row.push({ items: [] });
    return { type: "table", rows, horizontal, vertical, bookmarks, context };
  }

  function blocks(container, context) {
    const out = [];
    for (const c of kids(container)) {
      if (c.name === "w:p") out.push(paragraph(c, context));
      else if (c.name === "w:tbl") out.push(table(c, context));
      else if (c.name === "w:bookmarkStart") { if (c.attrs["w:name"] !== "_GoBack") pendingBookmarks.push(c.attrs["w:name"]); }
      else if (["w:sdt", "w:customXml", "w:sdtContent"].includes(c.name)) out.push(...blocks(c.name === "w:sdt" ? kid(c, "w:sdtContent") || c : c, context));
    }
    return out;
  }

  const items = blocks(body, "body");
  const media = name => zip.read(name);
  return { title, items, media };
}
