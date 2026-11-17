import { imageKeys } from "./output.mjs";
import { footnoteContent, BULLET, reconcileFootnotes } from "./rules.mjs";
function authoring(result) {
  reconcileFootnotes(result);
  const keys = imageKeys(result.blocks);
  const { blocks, stats } = result,
    consumed = /* @__PURE__ */ new Set(),
    units = [];
  const captionFor = /* @__PURE__ */ new Map();
  for (const cap of blocks.filter((b) => b.kind === "caption")) {
    const table = cap.text.startsWith("Table");
    const objs = blocks.filter(
      (b) => b.page === cap.page && b.kind === (table ? "table" : "figure"),
    );
    const eligible = objs.filter((b) =>
      table
        ? b.boxes[0].top >= cap.boxes[0].top
        : b.boxes[0].top <= cap.boxes[0].top,
    );
    const obj = eligible.sort(
      (a, b) =>
        Math.abs(a.boxes[0].top - cap.boxes[0].top) -
        Math.abs(b.boxes[0].top - cap.boxes[0].top),
    )[0];
    if (obj && !captionFor.has(obj.id)) {
      captionFor.set(obj.id, cap);
      consumed.add(cap.id);
    }
  }
  let listRun = [];
  for (const b of blocks) {
    if (consumed.has(b.id)) continue;
    if (b.kind !== "list") listRun = [];
    let block;
    const sources = [b.id];
    const content = footnoteContent(b.text, stats);
    if (b.kind === "heading")
      block = { kind: "heading", level: b.level, content };
    else if (b.kind === "footnote") {
      const m = b.text.match(/^\[\^(\d+)\]:\s*(.*)$/);
      block = (stats.footnotes.definitions_without_ref.includes(m[1]) || stats.footnotes.duplicate_definitions.includes(m[1]))
        ? { kind: "paragraph", text: "[" + m[1] + "] " + m[2] }
        : { kind: "footnote", label: m[1], text: m[2] };
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
        content: footnoteContent(
          strip ? b.text.slice(marker.length).trimStart() : b.text,
          stats,
        ),
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
      const cap=captionFor.get(b.id);
      block={kind:"table", rows:b.table.tokenRows.map(row=>row.map(cells=>cells.flatMap((c,ci)=>[
        ...(ci?[{kind:"text",text:" / "}]:[]), ...tableContent(c,stats)
      ]))),caption:cap?footnoteContent(cap.text,stats):""};
      if(cap) sources.push(cap.id);
    } else if (["table", "figure"].includes(b.kind)) {
      const cap = captionFor.get(b.id);
      block = {
        kind: "figure",
        imageAsset: keys.get(b.id),
        imageAlt: b.kind === "table" ? "표 영역" : "그림 영역",
        caption: cap ? footnoteContent(cap.text, stats) : "",
      };
      if (cap) sources.push(cap.id);
    } else block = { kind: "paragraph", content };
    units.push({ block, sources });
  }
  const defs = units.filter((u) => u.block.kind === "footnote"),
    body = units.filter((u) => u.block.kind !== "footnote"),
    order = [];
  const refs = (x) => {
    if (!x || typeof x !== "object") return;
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
  const sorted = [...body, ...defs];
  const input = {
    inputs: [{ key: "pdf", blocks: sorted.map((u) => u.block) }],
  };
  validateFootnoteInput(input);
  return {
    authoring: input,
    units: sorted.map((u) => ({ kind: u.block.kind, sources: u.sources })),
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
    if(t.superscript) {
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
  const last=out.at(-1);if(last?.kind==='text') last.text=last.text.trimEnd();
  return out.filter(t=>t.kind!=='text'||t.text);
}
