import test from "node:test";
import assert from "node:assert/strict";
import { readBundle, makePlan } from "../src/convert.js";
import { projectTable } from "../src/table-rule.js";
const source = await readBundle(
  new URL(
    "../../../fixtures/lsr-1.1/converted/",
    import.meta.url,
  ).pathname.replace(/^\/([A-Z]:)/, "$1"),
);
test("two explicit header rows become one combined head; source spans and output selectors stay separate", () => {
  const raw = source.doc.tables[2].data,
    before = JSON.stringify(raw),
    p = projectTable(raw);
  assert.equal(p.rows.length, 6);
  assert.equal(p.rows[0][0], "Parameter");
  assert.equal(p.rows[0][1], "Steady observations – Accuracy");
  assert.equal(p.rows[0][6], "Transient observations – Range");
  assert.equal(p.model.headerRows, 2);
  assert.equal(p.model.mergedRanges.length, 3);
  assert(p.model.reviewRequired);
  assert(p.model.note.includes("R1/C2–4"));
  assert.deepEqual(p.cells[1].selectors, [
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
  ]);
  assert.equal(JSON.stringify(raw), before);
});
test("body merges repeat literal values and warn about shared conditions, with original ranges", () => {
  const p = projectTable(source.doc.tables[3].data);
  const c = p.cells.find((c) => c.sourceCell.text === "Review path");
  assert.equal(c.sourceCell.row_span, 2);
  assert.deepEqual(c.selectors, [
    { row: 3, column: 0 },
    { row: 4, column: 0 },
  ]);
  assert.equal(p.rows[3][0], p.rows[4][0]);
  assert(
    p.model.mergedRanges.some(
      (m) =>
        m.cellIndex === c.cellIndex && m.risks.includes("shared-across-rows"),
    ),
  );
  assert(p.model.note.includes("행별 독립 값이 아니라"));
});
test("ambiguous or absent header roles never infer another header level", () => {
  const raw = structuredClone(source.doc.tables[2].data);
  raw.table_cells.forEach((c) => (c.column_header = false));
  const p = projectTable(raw);
  assert.equal(p.model.headerRows, 0);
  assert.equal(p.rows.length, 7);
});
test("same-element equation markers and annex figure numbers become fixed without changing latex", () => {
  const p = makePlan(source),
    blocks = p.request.authoring.inputs.flatMap((i) => i.blocks);
  assert.deepEqual(
    blocks.filter((b) => b.kind === "equation").map((b) => b.enumerator),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    blocks.filter((b) => b.kind === "equation").map((b) => b.latex),
    source.doc.texts.filter((n) => n.label === "formula").map((n) => n.text),
  );
  assert.deepEqual(
    blocks.filter((b) => b.kind === "figure").map((b) => b.enumerator),
    ["K.1", "K.2"],
  );
  assert.equal(
    p.losses.filter((l) =>
      ["equation-number-unbound", "caption-number-literal"].includes(
        l.reasonCode,
      ),
    ).length,
    0,
  );
});
test("duplicate and suffixed numbers stay literal/unbound with review loss", () => {
  const b = structuredClone(source);
  b.doc.texts.find(
    (n) => n.label === "caption" && n.text.startsWith("Figure K.2"),
  ).text = "Figure K.1. Duplicate";
  const f = b.doc.texts.filter((n) => n.label === "formula");
  f[1].orig = "(1) duplicate marker";
  const p = makePlan(b),
    blocks = p.request.authoring.inputs.flatMap((i) => i.blocks);
  assert(
    blocks
      .filter((b) => b.kind === "figure")
      .every((b) => b.enumerated === false),
  );
  assert.equal(
    blocks.filter((b) => b.kind === "equation" && !b.enumerator).length,
    2,
  );
  assert(p.losses.some((l) => l.reasonCode === "equation-number-unbound"));
  b.doc.texts.find(
    (n) => n.label === "caption" && n.text.startsWith("Figure"),
  ).text = "Figure 2a. Ambiguous";
  assert(
    makePlan(b).losses.some((l) => l.reasonCode === "caption-number-literal"),
  );
});
test("native, authoring and pending losses are separated; inline evidence stays available", () => {
  const b = structuredClone(source),
    text = b.doc.texts.find((n) => n.label === "text");
  text.formatting = { bold: true, script: "super", underline:true };
  text.hyperlink = "https://example.org";
  const p = makePlan(b),
    i = p.items.find((i) => i.selfRef === text.self_ref);
  assert.deepEqual(i.structure.formatting, text.formatting);
  assert.equal(i.structure.hyperlink, text.hyperlink);
  assert(
    p.losses.every((l) =>
      ["native-format", "authoring-input", "plugin-pending"].includes(
        l.category,
      ),
    ),
  );
  assert(
    p.losses.some(
      (l) =>
        l.reasonCode === "merged-cell-repeated" &&
        l.category === "native-format",
    ),
  );
  assert(
    p.losses.some(
      (l) =>
        l.reasonCode === "inline-formatting" &&
        l.category === "plugin-pending",
    ),
  );
});

test("a parenthesized term retained in latex is not treated as a separate equation number", () => {
  const b = structuredClone(source);
  const f = b.doc.texts.find((n) => n.label === "formula");
  f.orig = "(7) + x = 2";
  f.text = "(7) + x = 2";
  const p = makePlan(b);
  const item = p.items.find((i) => i.selfRef === f.self_ref);
  const block = p.request.authoring.inputs.find(
    (i) => i.key === item.links[0].key,
  ).blocks[0];
  assert.equal(block.enumerator, undefined);
  assert.equal(block.latex, f.text);
  assert(
    p.losses.some(
      (l) =>
        l.selfRef === f.self_ref && l.reasonCode === "equation-number-unbound",
    ),
  );
});
