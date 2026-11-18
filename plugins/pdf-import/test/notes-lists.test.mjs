import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "../extract.mjs";
import { convert, suggestExcludedPages } from "../rules.mjs";
import { authoring } from "../authoring.mjs";
import { blockActions } from "../block-actions.mjs";
import { previewCorrection, transformMapping, restoreMapping, assertMapping } from "../corrections.mjs";

const line = (text, x, y, { end = 500, size = 10 } = {}) => ({
  bbox: [x, y - 8, end, y + 2],
  spans: [{ text, size, flags: 0 }],
  metrics: [{ text, x0: x, x1: end, base: y, size }],
});
const page = (raw) => ({
  width: 600, height: 800, raw, tables: [], figures: [],
  nchars: raw.reduce((n, l) => n + l.spans[0].text.replace(/\s/g, "").length, 0),
});
const body = [
  line("This is a full opening line of a paragraph that runs", 60, 130),
  line("to the right edge as every justified body line does", 60, 142),
  line("and it ends on a short line.", 60, 154, { end: 300 }),
];
const blocksOf = (input) => authoring(input).authoring.inputs[0].blocks;

test("P-07 IEEE NOTE paragraphs become note boxes that keep the original words", () => {
  const raw = { pages: [page([
    ...body,
    line("NOTE 2—A numbered remark that follows the paragraph.", 60, 178, { end: 400, size: 9 }),
    line("NOTE—An unnumbered remark.", 60, 202, { end: 300, size: 9 }),
    line("NOTE 3 – A remark with spaces around an en dash.", 60, 226, { end: 300, size: 9 }),
    line("NOTES are not a NOTE label.", 60, 250, { end: 300 }),
  ])], toc: [] };
  const ieee = convert(structuredClone(raw), [], "ieee");
  assert.deepEqual(ieee.blocks.map((b) => b.kind), ["paragraph", "note", "note", "note", "paragraph"]);
  assert.equal(ieee.stats.notes, 3);
  // The block and the authored box keep the source text, NOTE label and separator included.
  assert.ok(ieee.blocks[1].text.startsWith("NOTE 2—"));
  const boxes = blocksOf(ieee).filter((b) => b.kind === "admonition");
  assert.deepEqual(boxes.map((b) => [b.variant, b.content.map((c) => c.text).join("")]), [
    ["note", "NOTE 2—A numbered remark that follows the paragraph."],
    ["note", "NOTE—An unnumbered remark."],
    ["note", "NOTE 3 – A remark with spaces around an en dash."],
  ]);
  const generic = convert(structuredClone(raw), [], "generic");
  assert.ok(generic.blocks.every((b) => b.kind !== "note"));
  assert.ok(blocksOf(generic).every((b) => b.kind !== "admonition"));
});

test("P-07 a NOTE continued on the next page stays one box; a following paragraph stays outside", () => {
  const raw = { pages: [
    page([...body, line("NOTE 1—A remark that is long enough to fill the whole line and", 60, 700, { size: 9 })]),
    page([
      line("continues on the next page.", 60, 130, { end: 300, size: 9 }),
      line("A new body paragraph after the remark.", 60, 154, { end: 300 }),
    ]),
  ], toc: [] };
  const r = convert(raw, [], "ieee");
  const note = r.blocks.find((b) => b.kind === "note");
  assert.equal(note.boxes.length, 2);
  assert.match(note.text, /and continues on the next page\.$/);
  assert.equal(r.blocks.at(-1).kind, "paragraph");
  const box = blocksOf(r).find((b) => b.kind === "admonition");
  assert.match(box.content.map((c) => c.text).join(""), /^NOTE 1—A remark .* continues on the next page\.$/);
});

test("P-07 a table note exported from a text table stays a paragraph", () => {
  const r = convert({ pages: [page([...body, line("NOTE—Under a table.", 60, 178, { end: 300, size: 9 })])], toc: [] }, [], "ieee");
  // Simulate the table-note export, which happens before NOTE boxes are made.
  const plan = structuredClone(r);
  plan.blocks[1].kind = "paragraph";
  plan.blocks[1].tableNote = true;
  assert.equal(blocksOf(plan).filter((b) => b.kind === "admonition").length, 0);
});

// Page 1 ends with a list item and a footnote; page 2 starts with the next item.
const listPages = (first, next, { x = 70, footnote = true } = {}) => ({ pages: [
  page([
    line("The following conditions apply:", 60, 130, { end: 300 }),
    line(first + " First item of the list.", 70, 154, { end: 300 }),
    ...(footnote ? [line("1 A footnote at the foot of the page.", 60, 700, { end: 300, size: 8 })] : []),
  ]),
  page([
    line(next + " Next item of the list.", x, 130, { end: 300 }),
    line("A body paragraph after the list.", 60, 160, { end: 300 }),
  ]),
], toc: [] });
const lists = (input) => blocksOf(convert(input, [], "generic")).filter((b) => b.kind === "list");

test("L-05 a list continues across a page when the marker shape and number continue", () => {
  for (const [a, b] of [["a)", "b)"], ["1)", "2)"], ["(i)", "(ii)"], ["•", "•"]]) {
    const r = convert(listPages(a, b), [], "generic");
    assert.deepEqual(r.blocks.map((x) => x.kind), ["paragraph", "list", "footnote", "list", "paragraph"]);
    assert.equal(r.stats.lists.cross_page_joined, 1, a + " → " + b);
    assert.equal(r.blocks.find((x) => x.page === 1 && x.kind === "list").continuesList, true);
    const found = lists(listPages(a, b));
    assert.equal(found.length, 1, a + " → " + b);
    assert.equal(found[0].items.length, 2);
  }
  // Without a footnote between the pages the decision is the same.
  assert.equal(lists(listPages("a)", "b)", { footnote: false })).length, 1);
});

test("L-05 a list does not continue across a page when the number breaks, the shape differs or the indent moves", () => {
  for (const [a, b, options] of [
    ["a)", "c)"], ["a)", "2)"], ["a)", "(b)"], ["a)", "B)"], ["•", "—"],
    ["a)", "b)", { x: 110 }],
    ["•", "•", { footnote: false, x: 110 }],
  ]) {
    const r = convert(listPages(a, b, options), [], "generic");
    assert.equal(r.stats.lists.cross_page_joined, 0, a + " → " + b);
    assert.equal(lists(listPages(a, b, options)).length, 2, a + " → " + b);
  }
});

// Two adjacent saved lists: the first has two source items, the second one.
const item = (id, at, documentKind = "list", top = 0) => ({
  id, path: [at], kind: documentKind === "list" ? "list" : "paragraph", documentKind,
  lines: [{ page: 0, text: id, box: { page: 0, x0: 10, top, x1: 100, bottom: top + 10 } }],
  boxes: [{ page: 0, x0: 10, top, x1: 100, bottom: top + 10 }],
});
const listNode = (at, ordered, ...texts) => ({ path: [at], type: "list", ordered,
  ...(ordered ? { start: 1, style: "lower-alpha", delimiter: ")" } : {}),
  items: texts.map((text) => ({ content: [{ kind: "text", text }] })) });
const mapping = () => ({
  revision: "r", excluded: [],
  blocks: [item("p", 1, "paragraph"), item("a1", 2, "list", 20), item("a2", 2, "list", 32), item("b1", 3, "list", 50), item("c1", 4, "list", 70)],
  snapshotNodes: [
    { path: [1], type: "paragraph", content: [{ kind: "text", text: "p" }] },
    listNode(2, true, "a1", "a2"), listNode(3, true, "b1"), listNode(4, false, "c1"),
  ],
});

test("L-05 merge accepts adjacent lists of one kind and still refuses mixed or partial choices", () => {
  const m = mapping(), pick = (...ids) => m.blocks.filter((b) => ids.includes(b.id));
  const merge = (...ids) => blockActions(pick(...ids), m.blocks, m.snapshotNodes).find((a) => a.id === "merge");
  assert.equal(merge("a1", "a2", "b1").disabled, false);
  assert.equal(merge("b1", "c1").disabled, true, "ordered and unordered");
  assert.equal(merge("p", "a1", "a2").disabled, true, "paragraph and list");
  assert.match(merge("a1", "b1").disabledReason, /모두/);
  assert.equal(merge("a1", "a2", "c1").disabled, true, "not adjacent");
  assert.match(merge("b1", "c1").disabledReason, /같은 종류의 목록/);
  // Converted blocks are drawn before the saved document exists; they have no path.
  const unsaved = [{ id: "u", kind: "list", boxes: [] }];
  assert.ok(blockActions(unsaved, [], []).every((x) => x.disabled));
});

test("L-05 merging lists keeps every source item on the merged list and undo restores both", () => {
  const m = mapping();
  const merged = previewCorrection(m, { action: "merge", ids: ["a1", "a2", "b1"], time: "t" });
  assert.deepEqual(merged.blocks.map((b) => [b.id, b.path[0]]), [["p", 1], ["a1", 2], ["a2", 2], ["b1", 2], ["c1", 3]]);
  assert.deepEqual(merged.blocks.find((b) => b.id === "b1").boxes, m.blocks.find((b) => b.id === "b1").boxes);
  assert.equal(merged.snapshotNodes[1].items.length, 3);
  assert.equal(merged.snapshotNodes[1].ordered, true);
  assertMapping(merged, { nodes: merged.snapshotNodes });
  const direct = transformMapping(m, { action: "merge", ids: ["a1", "a2", "b1"], at: 2, removeCount: 2, newCount: 1, time: "t" });
  assert.deepEqual(direct.blocks.map((b) => b.path[0]), [1, 2, 2, 2, 3]);
  assert.equal(direct.blocks.find((b) => b.id === "b1").documentKind, "list");
  const undone = restoreMapping(m, merged, "a1", "u");
  assert.deepEqual(undone.blocks.map((b) => [b.id, b.path[0], b.boxes]), m.blocks.map((b) => [b.id, b.path[0], b.boxes]));
});

test("P-07 L-05 synthetic sample: NOTE boxes, one list across pages and two adjacent lists", async () => {
  const raw = await extract(new URL("./fixtures/notes-lists.pdf", import.meta.url));
  const r = convert(raw, suggestExcludedPages(raw));
  assert.equal(r.profile, "ieee");
  assert.equal(r.stats.notes, 3);
  assert.equal(r.stats.lists.cross_page_joined, 1);
  assert.equal(r.stats.chars_unaccounted, 0);
  const authored = blocksOf(r);
  assert.deepEqual(authored.filter((b) => b.kind === "list").map((b) => b.items.length), [4, 2, 2]);
  assert.deepEqual(authored.filter((b) => b.kind === "admonition").map((b) => b.content[0].text.slice(0, 7)), ["NOTE 1—", "NOTE 2—", "NOTE—Th"]);
});
