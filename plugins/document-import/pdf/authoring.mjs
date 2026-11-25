import { decorate } from "./inline-styles.mjs";
import { imageKeys } from "./output.mjs";
import { footnoteContent, BULLET, reconcileFootnotes } from "./rules.mjs";
import { profiles } from "./profiles/index.mjs";
import { captionTargets, figureTableLabels, referenceText, refsFor, cellReferences } from "./references.mjs";
import { references } from "./corrections.mjs";
function authoring(result) {
  reconcileFootnotes(result);
  const profile = profiles[result.profile] ?? profiles.generic;
  const keys = imageKeys(result.blocks);
  const { blocks, stats } = result,
    consumed = /* @__PURE__ */ new Set(),
    units = [];
  const captionFor = captionTargets(blocks, profile);
  for (const cap of captionFor.values()) consumed.add(cap.id);
  // Figures and tables with a caption number of their own kind get a label and that
  // fixed number; a reference is kept only when its target is in this block list.
  const labels = figureTableLabels(blocks, profile, captionFor);
  const live = new Set([...labels.values()].map((v) => v.label));
  for (const b of blocks) if (b.sectionLabel) live.add(b.sectionLabel);
  const display = c => c.text ?? (c.kind === "reference" ? referenceText(c.label) : c.kind === "footnote" ? c.label : c.children?.map(x=>x.text).join(""));
  const inline = (b, text) => {
    const marker = b.tableNote && text.match(/^([a-z*†‡])(?=\s)/);
    const rest = marker ? text.slice(marker[1].length) : text;
    const content = footnoteContent(rest, stats, refsFor(b, rest, live));
    if (!["paragraph","list","footnote","note"].includes(b.kind) && !b.tableNoteCaption) return content;
    const styled = decorate(content,b.lines?.flatMap(l=>l.tokens || []),display);
    return marker ? [{kind:"superscript",children:[{kind:"text",text:marker[1]}]}, ...styled] : styled;
  };
  // Litzio puts "Figure 3" in front of a numbered caption; the original number goes.
  const captionOf = (b) => {
    const cap = captionFor.get(b.id);
    if (!cap) return { caption: "" };
    const n = labels.get(b.id);
    const m = n && cap.text.match(profile.caption);
    if (!m) return { enumerated: false, caption: inline(cap, cap.text) };
    return { label: n.label, enumerator: n.number, caption: inline(cap, cap.text.slice(m[0].length).trimStart()) };
  };
  let listRun = [],
    lastList = null;
  const tables = new Set(blocks.filter(b => b.kind === "table" && b.table).map(b => b.id));
  const notesByTable = new Map(), keptNotes = new Set();
  for (const b of blocks) {
    if (!tables.has(b.tableNoteFor) || consumed.has(b.id)) continue;
    const content = b.bold ? [{kind:"strong",children:inline(b,b.text)}] : inline(b,b.text);
    if (references(content).length) {
      keptNotes.add(b.id);
    } else {
      const notes = notesByTable.get(b.tableNoteFor) || [];
      notes.push({id:b.id, content});
      notesByTable.set(b.tableNoteFor, notes);
      consumed.add(b.id);
    }
  }
  for (const b of blocks) {
    if (consumed.has(b.id)) continue;
    // Footnotes sit between pages; a list crosses a page only when rules say it continues.
    if (b.kind === "list") {
      if (lastList && lastList.page !== b.page && !b.continuesList) listRun = [];
      lastList = b;
    } else if (b.kind !== "footnote") {
      listRun = [];
      lastList = null;
    }
    let block;
    const sources = [b.id];
    let tableNotes;
    if (b.kind === "heading")
      block = { kind: "heading", level: b.level, content: inline(b,b.text) };
    else if (b.kind === "note")
      block = {
        kind: "admonition",
        variant: "note",
        content: inline(b, profile.noteBody(b.text)),
      };
    else if (b.kind === "footnote") {
      const m = b.text.match(/^\[\^(\d+)\]:\s*(.*)$/);
      const body = inline(b,m[2]);
      const rich = body.some(n=>n.kind!=="text");
      block = (stats.footnotes.definitions_without_ref.includes(m[1]) || stats.footnotes.duplicate_definitions.includes(m[1]))
        ? { kind: "paragraph", ...(rich ? {content:[{kind:"text",text:"["+m[1]+"] "},...body]} : {text:"[" + m[1] + "] " + m[2]}) }
        : { kind: "footnote", label: m[1], ...(rich ? { content: body } : { text: m[2] }) };
    } else if (b.kind === "list") {
      const marker = b.marker || b.text.match(BULLET)?.[0]?.trim() || "";
      const m = marker.match(/^([a-z]+|\d+)\)$/i);
      const roman =
        m &&
        /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(m[1]) &&
        (m[1].length > 1 ||
          blocks.some(
            (x) =>
              x.kind === "list" &&
              x.level === b.level &&
              /^ii\)$/i.test(x.marker || ""),
          ));
      const style = m
        ? /^\d+$/.test(m[1])
          ? "decimal"
          : roman
            ? m[1] === m[1].toUpperCase()
              ? "upper-roman"
              : "lower-roman"
            : m[1] === m[1].toUpperCase()
              ? "upper-alpha"
              : "lower-alpha"
        : null;
      const romans = [
        "i",
        "ii",
        "iii",
        "iv",
        "v",
        "vi",
        "vii",
        "viii",
        "ix",
        "x",
      ];
      const start = m
        ? style === "decimal"
          ? +m[1]
          : roman
            ? romans.indexOf(m[1].toLowerCase()) + 1
            : m[1].toLowerCase().charCodeAt(0) - 96
        : 1;
      const ordered = !!m && start > 0;
      const list = {
        kind: "list",
        ordered,
        ...(ordered ? { style, delimiter: ")", start } : {}),
        items: [],
      };
      const strip = ordered || BULLET.test(marker);
      const item = {
        content: inline(b, strip ? b.text.slice(marker.length).trimStart() : b.text),
      };
      while (listRun.length && listRun.at(-1).level > b.level) listRun.pop();
      const parent = listRun.at(-1);
      if (
        parent &&
        parent.level === b.level &&
        parent.list.ordered === ordered &&
        parent.list.style === list.style &&
        (!ordered || start === parent.list.start + parent.list.items.length) &&
        parent.list.items.length < 100
      ) {
        parent.list.items.push(item);
        parent.unit.sources.push(b.id);
        continue;
      }
      if (parent && parent.level < b.level && !parent.list.items.at(-1).list) {
        delete list.kind;
        parent.list.items.at(-1).list = list;
        list.items.push(item);
        parent.unit.sources.push(b.id);
        listRun.push({ level: b.level, list, unit: parent.unit });
        continue;
      }
      block = list;
      block.items.push(item);
      const unit = { block, sources };
      units.push(unit);
      listRun = listRun.filter((x) => x.level < b.level);
      listRun.push({ level: b.level, list, unit });
      continue;
    } else if (b.kind === "table" && b.table) {
      const cap=captionFor.get(b.id), {caption, ...number}=captionOf(b);
      block={kind:"table", ...(cap?number:{enumerated:false}), rows:b.table.tokenRows.map(row=>row.map(cells=>cells.flatMap((c,ci)=>[
        ...(ci?[{kind:"text",text:" / "}]:[]), ...decorate(cellReferences(tableContent(c,stats),c.refs,profile,live),c.graphic ? [] : c.tokens,display)
      ]))),caption};
      if(cap) sources.push(cap.id);
      const notes = notesByTable.get(b.id);
      if (notes?.length) {
        block.notes = notes.map(n => n.content);
        tableNotes = notes.map(n => n.id);
        sources.push(...tableNotes);
      }
    } else if (["table", "figure"].includes(b.kind)) {
      const cap = captionFor.get(b.id), { caption, ...number } = captionOf(b);
      block = {
        kind: "figure",
        ...(cap ? number : { enumerated: false }),
        imageAsset: keys.get(b.id),
        imageAlt: b.formula ? "수식 영역" : b.kind === "table" ? "표 영역" : "그림 영역",
        caption,
      };
      if (cap) sources.push(cap.id);
    } else block = { kind: "paragraph", content: b.bold ? [{kind:"strong",children:inline(b,b.text)}] : inline(b,b.text) };
    if (b.sectionLabel) units.push({block:{kind:"target",label:b.sectionLabel},sources:[]});
    units.push({ block, sources, ...(tableNotes ? {tableNotes} : {}),
      ...(keptNotes.has(b.id) ? {keptTableNote:true} : {}) });
  }
  const defs = units.filter((u) => u.block.kind === "footnote"),
    body = units.filter((u) => u.block.kind !== "footnote"),
    order = [];
  const linkedSections = new Set();
  const refs = (x) => {
    if (!x || typeof x !== "object") return;
    if (x.kind === "link" && x.url.startsWith("#")) linkedSections.add(x.url.slice(1));
    if (x.kind === "footnote" && x.label && !order.includes(x.label))
      order.push(x.label);
    for (const v of Object.values(x))
      if (Array.isArray(v)) v.forEach(refs);
      else if (v && typeof v === "object") refs(v);
  };
  body.forEach((u) => refs(u.block));
  defs.sort(
    (a, b) => order.indexOf(a.block.label) - order.indexOf(b.block.label),
  );
  defs.forEach(u => refs(u.block));
  const sorted = [...body.filter(u => u.block.kind !== "target" || linkedSections.has(u.block.label)), ...defs];
  const input = {
    inputs: [{ key: "pdf", blocks: sorted.map((u) => u.block) }],
  };
  validateFootnoteInput(input);
  return {
    authoring: input,
    units: sorted.map(({block, ...unit}) => ({ kind: block.kind, ...unit })),
  };
}
// Check the completed input, including references in nested lists and captions.
function validateFootnoteInput(authoring) {
  for (const input of authoring.inputs) {
    const definitions = new Set(
      input.blocks.filter((b) => b.kind === "footnote").map((b) => b.label),
    );
    const missing = new Set();
    const visit = (x) => {
      if (!x || typeof x !== "object") return;
      if (x.kind === "footnote" && x.label && !definitions.has(x.label))
        missing.add(x.label);
      for (const value of Object.values(x)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    };
    input.blocks.filter((b) => b.kind !== "footnote").forEach(visit);
    if (missing.size)
      throw new Error("각주 정의가 없는 작성 입력: " + [...missing].join(", "));
  }
}
export { authoring, validateFootnoteInput };

function tableContent(cell,stats) {
  const out=[];
  for(const t of cell.tokens) {
    let text=t.text;
    if(t.newLine && out.length) text=(out.at(-1).text?.endsWith('-')?'':' ')+text.trimStart();
    if(!out.length) text=text.trimStart();
    if(!text) continue;
    if(t.superscript && !cell.graphic) {
      const label=text.trim();
      if(/^\d+$/.test(label) && !stats.footnotes.definitions_without_ref.includes(label) && !stats.footnotes.refs_without_definition.includes(label) && !stats.footnotes.duplicate_definitions.includes(label)) {
        if(/^\s/.test(text)) out.push({kind:"text",text:" "});
        out.push({kind:"footnote",label});
      } else {
        if(/^\s/.test(text)&&out.length) out.push({kind:"text",text:" "});
        out.push({kind:"superscript",children:[{kind:"text",text:text.trim()}]});
        if(/\s$/.test(text)) out.push({kind:"text",text:" "});
      }
    } else out.push({kind:"text",text});
  }
  const merged=[];
  for(const n of out) {
    if(n.kind==="text" && merged.at(-1)?.kind==="text") merged.at(-1).text+=n.text;
    else merged.push(n);
  }
  const last=merged.at(-1);if(last?.kind==='text') last.text=last.text.trimEnd();
  return merged.filter(t=>t.kind!=='text'||t.text);
}
