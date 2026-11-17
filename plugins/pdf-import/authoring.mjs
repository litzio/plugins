import { footnoteContent, BULLET } from "./rules.mjs";
function authoring(result) {
  const { blocks, stats } = result, consumed = /* @__PURE__ */ new Set(), units = [];
  const captionFor = /* @__PURE__ */ new Map();
  for (const cap of blocks.filter((b) => b.kind === "caption")) {
    const table = cap.text.startsWith("Table");
    const objs = blocks.filter((b) => b.page === cap.page && b.kind === (table ? "table" : "figure"));
    const eligible = objs.filter((b) => table ? b.boxes[0].top >= cap.boxes[0].top : b.boxes[0].top <= cap.boxes[0].top);
    const obj = eligible.sort((a, b) => Math.abs(a.boxes[0].top - cap.boxes[0].top) - Math.abs(b.boxes[0].top - cap.boxes[0].top))[0];
    if (obj && !captionFor.has(obj.id)) {
      captionFor.set(obj.id, cap);
      consumed.add(cap.id);
    }
  }
  for (const b of blocks) {
    if (consumed.has(b.id)) continue;
    let block;
    const sources = [b.id];
    const content = footnoteContent(b.text, stats);
    if (b.kind === "heading") block = { kind: "heading", level: b.level, content };
    else if (b.kind === "footnote") {
      const m = b.text.match(/^\[\^(\d+)\]:\s*(.*)$/);
      block = stats.footnotes.definitions_without_ref.includes(m[1]) ? { kind: "paragraph", text: "[" + m[1] + "] " + m[2] } : { kind: "footnote", label: m[1], text: m[2] };
    } else if (b.kind === "list") block = { kind: "list", ordered: false, items: [{ content: footnoteContent(b.text.replace(BULLET, ""), stats) }] };
    else if (["table", "figure"].includes(b.kind)) {
      const cap = captionFor.get(b.id);
      block = { kind: "figure", imageAsset: b.id, imageAlt: b.kind === "table" ? "표 영역" : "그림 영역", caption: cap ? footnoteContent(cap.text, stats) : "" };
      if (cap) sources.push(cap.id);
    } else block = { kind: "paragraph", content };
    units.push({ block, sources });
  }
  const defs = units.filter((u) => u.block.kind === "footnote"), body = units.filter((u) => u.block.kind !== "footnote"), order = [];
  const refs = (x) => {
    if (!x || typeof x !== "object") return;
    if (x.kind === "footnote" && x.label && !order.includes(x.label)) order.push(x.label);
    for (const v of Object.values(x)) if (Array.isArray(v)) v.forEach(refs);
    else if (v && typeof v === "object") refs(v);
  };
  body.forEach((u) => refs(u.block));
  defs.sort((a, b) => order.indexOf(a.block.label) - order.indexOf(b.block.label));
  const sorted = [...body, ...defs];
  return { authoring: { inputs: [{ key: "pdf", blocks: sorted.map((u) => u.block) }] }, units: sorted.map((u) => ({ kind: u.block.kind, sources: u.sources })) };
}
export {
  authoring
};
