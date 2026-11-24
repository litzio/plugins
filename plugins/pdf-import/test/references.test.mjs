import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { destinationBlock, findReferences, figureTableLabels, referenceMatches } from "../references.mjs";
import { authoring } from "../authoring.mjs";
import { splitOffset } from "../corrections.mjs";
import { extract } from "../extract.mjs";
import { convert } from "../rules.mjs";
import ieee from "../profiles/ieee.mjs";
import generic from "../profiles/generic.mjs";

// One text line per block; x grows 5pt per character so a link rectangle can name its words.
const lineAt = (page, top, text, x0 = 60) => ({ page, text, box: { page, x0, top, x1: x0 + 5 * text.length, bottom: top + 10 } });
const textBlock = (id, kind, page, top, text) => {
  const l = lineAt(page, top, text);
  return { id, kind, text, page, lines: [l], boxes: [{ ...l.box }] };
};
const region = (id, kind, page, top, bottom, table) => ({
  id, kind, text: "", page, boxes: [{ page, x0: 60, top, x1: 400, bottom }],
  ...(table ? { table: { tokenRows: [[[{ text: "a", tokens: [{ text: "a" }] }]], [[{ text: "1", tokens: [{ text: "1" }] }]]] } } : {}),
});
// The rectangle over the n-th occurrence of words in a one-line block.
const linkOver = (b, words, dest, n = 0) => {
  let at = -1;
  for (let i = 0; i <= n; i++) at = b.text.indexOf(words, at + 1);
  const l = b.lines[0].box;
  return { box: { x0: l.x0 + 5 * at, top: l.top, x1: l.x0 + 5 * (at + words.length), bottom: l.bottom }, dest };
};
const stats = { footnotes: { refs_without_definition: [], definitions_without_ref: [], duplicate_definitions: [] } };
const sample = () => [
  textBlock("p", "paragraph", 0, 100, "See Table 2 and Table 3 and Figure 4."),
  textBlock("c2", "caption", 1, 80, "Table 2—Limits"),
  region("t2", "table", 1, 100, 200, true),
  textBlock("c3", "caption", 1, 300, "Table 3—Drawn as a picture"),
  region("t3", "table", 1, 320, 400, false),
  region("f4", "figure", 2, 100, 300),
  textBlock("c4", "caption", 2, 310, "Figure 4—Overview"),
];

test("S-02 a link destination maps to the block it lands on or the first block below it", () => {
  const blocks = sample();
  // Destinations usually sit about 20pt above the object.
  assert.equal(destinationBlock(blocks, { page: 1, top: 60 }).id, "c2");
  assert.equal(destinationBlock(blocks, { page: 1, top: 150 }).id, "t2");
  assert.equal(destinationBlock(blocks, { page: 2, top: 80 }).id, "f4");
  assert.equal(destinationBlock(blocks, { page: 2, top: 500 }), null);
  assert.equal(destinationBlock(blocks, { page: 5, top: 0 }), null);
});

test("S-02 a link becomes a reference only when its target has the same kind and number", () => {
  const blocks = sample(), p = blocks[0];
  const raw = { pages: [{ links: [
    linkOver(p, "Table 2", { page: 1, top: 60 }),
    // The table drawn as a picture would be shown as "Figure n": it stays text.
    linkOver(p, "Table 3", { page: 1, top: 280 }),
    // A link on "Figure 4" pointing at Table 2 is not a reference to Table 2.
    linkOver(p, "Figure 4", { page: 1, top: 60 }),
  ] }, { links: [] }, { links: [] }] };
  const r = findReferences(raw, blocks, ieee);
  assert.deepEqual(p.refs, [{ at: 4, length: 7, label: "tab-2" }]);
  assert.equal(r.method, "links");
  assert.equal(r.converted, 1);
  assert.deepEqual([...figureTableLabels(blocks, ieee).values()].map((v) => v.label), ["tab-2", "fig-4"]);
});

test("S-02 the linked occurrence is chosen when the same number appears twice in a block", () => {
  const blocks = sample();
  blocks[0] = textBlock("p", "paragraph", 0, 100, "Table 2 of IEEE Std 0000 differs from Table 2 here.");
  const raw = { pages: [{ links: [linkOver(blocks[0], "Table 2", { page: 1, top: 60 }, 1)] }, {}, {}] };
  findReferences(raw, blocks, ieee);
  assert.deepEqual(blocks[0].refs.map((r) => r.at), [blocks[0].text.lastIndexOf("Table 2")]);
});

test("S-02 a link over a reference wrapped onto two lines still finds it", () => {
  const blocks = sample();
  const a = lineAt(0, 100, "Limits are in Table"), b = lineAt(0, 120, "2 for each value.");
  blocks[0] = { id: "p", kind: "paragraph", page: 0, text: "Limits are in Table 2 for each value.", lines: [a, b], boxes: [{ ...a.box, bottom: 130 }] };
  blocks[0].boxes = [{ page: 0, x0: 60, top: 100, x1: 160, bottom: 110 }, { page: 0, x0: 60, top: 120, x1: 160, bottom: 130 }];
  // One rectangle over both lines: its centre (y 115) lies between them.
  const link = { box: { x0: 60, top: 100, x1: 160, bottom: 130 }, dest: { page: 1, top: 60 } };
  findReferences({ pages: [{ links: [link] }, {}, {}] }, blocks, ieee);
  assert.deepEqual(blocks[0].refs, [{ at: 14, length: 7, label: "tab-2" }]);
});

test("S-02 the text rule runs only without internal links and only for captions that exist", () => {
  const blocks = sample();
  blocks[0] = textBlock("p", "paragraph", 0, 100, "See Table 2, Table 9, ANSI C84.1 Table 2 and Figure 4.");
  const r = findReferences({ pages: [{}, {}, {}] }, blocks, generic);
  assert.equal(r.method, "text");
  assert.deepEqual(blocks[0].refs.map((x) => blocks[0].text.slice(x.at, x.at + x.length)), ["Table 2", "Figure 4"]);
  // A caption's own number is not a reference to itself.
  assert.equal(blocks.find((b) => b.id === "c2").refs, undefined);
  // One internal link anywhere switches the text rule off.
  const linked = sample();
  linked[0] = textBlock("p", "paragraph", 0, 100, "See Table 2.");
  findReferences({ pages: [{ links: [{ box: { x0: 0, top: 0, x1: 1, bottom: 1 }, dest: { page: 2, top: 0 } }] }, {}, {}] }, linked, generic);
  assert.equal(linked[0].refs, undefined);
});

test("S-02 the reference pattern needs the whole number", () => {
  const read = (t) => referenceMatches(t, ieee).map((m) => m.kind + " " + m.number);
  assert.deepEqual(read("Table 3. Figure B.2, Table 3.1, Figure 4a, Table 10"), ["table 3", "figure B.2", "table 10"]);
});

test("S-02 numbered captions get a label and fixed number; the caption loses its number", () => {
  const blocks = sample();
  blocks[0] = textBlock("p", "paragraph", 0, 100, "See Table 2 and Table 3.");
  blocks.push(textBlock("c2b", "caption", 3, 80, "Table 2—Limits (continued)"), region("t2b", "table", 3, 100, 200, true));
  findReferences({ pages: [{}, {}, {}, {}] }, blocks, generic);
  const out = authoring({ blocks, stats: structuredClone(stats), profile: "generic" }).authoring.inputs[0].blocks;
  const [para, t2, t3, f4, t2b] = out;
  assert.deepEqual(para.content, [
    { kind: "text", text: "See " }, { kind: "reference", role: "numref", label: "tab-2" },
    { kind: "text", text: " and Table 3." },
  ]);
  assert.deepEqual([t2.label, t2.enumerator, t2.enumerated, t2.caption], ["tab-2", "2", undefined, [{ kind: "text", text: "Limits" }]]);
  // A table drawn as a picture keeps its words and no number.
  assert.deepEqual([t3.kind, t3.label, t3.enumerated, t3.caption[0].text], ["figure", undefined, false, "Table 3—Drawn as a picture"]);
  assert.deepEqual([f4.label, f4.enumerator, f4.caption[0].text], ["fig-4", "4", "Overview"]);
  // A repeated number (a continued table) is not a second target.
  assert.deepEqual([t2b.label, t2b.enumerated, t2b.caption[0].text], [undefined, false, "Table 2—Limits (continued)"]);
});

test("S-02 a reference whose target block is gone stays text", () => {
  const blocks = sample();
  findReferences({ pages: [{}, {}, {}] }, blocks, generic);
  const without = blocks.filter((b) => b.id !== "t2" && b.id !== "c2");
  const para = authoring({ blocks: without, stats: structuredClone(stats), profile: "generic" }).authoring.inputs[0].blocks[0];
  assert.deepEqual(para.content.filter((c) => c.kind === "reference").map((c) => c.label), ["fig-4"]);
  assert.ok(para.content.some((c) => c.kind === "text" && c.text.includes("Table 2")));
});

test("S-02 a reference counts as one position when a paragraph is split", () => {
  const lines = [{ text: "Limits are in Table B.2. The" }, { text: "next line." }];
  const content = [{ kind: "text", text: "Limits are in " }, { kind: "reference", role: "numref", label: "tab-B.2" }, { kind: "text", text: ". The next line." }];
  assert.equal(splitOffset(lines, 1, content), 21);
  assert.throws(() => splitOffset(lines, 1, [{ kind: "text", text: "Limits are in " }, { kind: "reference", role: "numref", label: "other" }, { kind: "text", text: ". The next line." }]));
});

test("S-02 public sample: five references by the text rule, the pictured table stays text", async () => {
  const pdf = fileURLToPath(new URL("./fixtures/LSR-1.1-standards.pdf", import.meta.url));
  const r = convert(await extract(pdf));
  assert.equal(r.stats.references.method, "text");
  const found = r.blocks.flatMap((b) => (b.refs || []).map((x) => b.text.slice(x.at, x.at + x.length) + "→" + x.label));
  assert.deepEqual(found, ["Table 1→tab-1", "Table 3→tab-3", "Table 3→tab-3", "Figure K.1→fig-K.1", "Figure K.2→fig-K.2"]);
  const out = authoring(structuredClone(r)).authoring.inputs[0].blocks;
  const numbered = out.filter((b) => b.label && b.enumerator).map((b) => b.kind + " " + b.enumerator);
  assert.deepEqual(numbered, ["table 1", "table 2", "table 3", "table 4", "figure K.1", "figure K.2", "table L.1"]);
  // Table L.2 is cropped as a picture and Table 3 continues: both keep their own caption words.
  const pictured = out.filter((b) => b.enumerated === false && /^Table/.test(b.caption?.[0]?.text || ""));
  assert.equal(pictured.length, 2);
});

test("S-02 PDF annotation spans keep their words and only label included matching headings", async () => {
  const raw = await extract(fileURLToPath(new URL("./fixtures/clause-links.pdf", import.meta.url)));
  for (const excluded of [[], [2]]) {
    const result = convert(raw, excluded);
    const {authoring:input, units} = authoring(result);
    const blocks = input.inputs[0].blocks;
    assert.deepEqual(units.map(u=>u.kind), blocks.map(b=>b.kind));
    assert.deepEqual(blocks.filter(b=>b.kind==="target").map(b=>b.label),
      excluded.length ? ["sec-1","sec-4"] : ["sec-1","sec-2","sec-4"]);
    const links = blocks.flatMap(b=>b.content || []).filter(c=>c.kind==="link");
    assert.equal(links.length, excluded.length ? 6 : 12);
    for (const link of links) assert.equal(link.children[0].text, "Clause "+link.url.slice(5));
    assert.ok(blocks.some(b=>b.content?.some(c=>c.text?.includes("Clause 8"))));
  }
});

test("S-02 page-only destinations stay plain and labels avoid another heading ID", async () => {
  const raw = await extract(fileURLToPath(new URL("./fixtures/clause-links.pdf", import.meta.url)));
  const {blocks} = convert(raw);
  blocks.find(b=>b.text==="3. Review").text = "sec-4";
  for (const page of raw.pages)
    for (const link of page.links) if (link.dest.page === 1) link.dest.pageOnly = true;
  findReferences(raw, blocks, generic);
  assert.equal(blocks.find(b=>b.text==="4. Closing").sectionLabel, "sec-4-2");
  assert.equal(blocks.find(b=>b.text==="2. Inspection").sectionLabel, undefined);
  assert.equal(ieee.linkedNumber("Annex B.1"), "B.1");
  assert.equal(ieee.linkedNumber("see 6.4.1"), "6.4.1");
});
