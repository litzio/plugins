import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fillFigurePlaces, locate, locateStats, normalize } from "../locate.mjs";
import { readDocx } from "../docx.mjs";
import { convert } from "../rules.mjs";

// Synthetic text layers: one item per line, 5pt per letter, 12pt line height.
const line = (str, top, x0 = 72) => ({ str, x0, x1: x0 + str.length * 5, top, bottom: top + 10 });
const page = (...lines) => ({ width: 600, height: 800, items: lines.map(([str, top, x0]) => line(str, top, x0)) });
const t = text => [{ kind: "text", text }];
const para = text => ({ kind: "paragraph", content: t(text) });
const heading = (text, level = 1) => ({ kind: "heading", level, content: t(text) });

test("blocks are found in order, each with its page and the box around its lines", () => {
  const blocks = [heading("1 Introduction"), para("The controller shall report its state every second."), { kind: "list", ordered: true, items: [{ content: t("First item") }, { content: t("Second item") }] }];
  const pdf = { pages: [page(["1", 100], ["Introduction", 100, 100], ["The controller shall report its", 130], ["state every second.", 142], ["1.", 170], ["First item", 170, 90], ["2.", 182], ["Second item", 182, 90])] };
  const places = locate(blocks, pdf);
  assert.deepEqual(places.map(p => p.page), [0, 0, 0]);
  assert.deepEqual(places[0].boxes, [{ page: 0, x0: 72, top: 100, x1: 160, bottom: 110 }]);
  // The paragraph's two lines make one box; the list box takes in its markers.
  assert.deepEqual(places[1].boxes, [{ page: 0, x0: 72, top: 130, x1: 227, bottom: 152 }]);
  assert.deepEqual(places[2].boxes, [{ page: 0, x0: 72, top: 170, x1: 145, bottom: 192 }]);
});

test("a paragraph that runs onto the next page has a box on each page", () => {
  const blocks = [para("This paragraph starts at the foot of one page and ends at the top of the next.")];
  const pdf = { pages: [page(["This paragraph starts at the foot", 700]), page(["of one page and ends at the top of the next.", 80])] };
  const [place] = locate(blocks, pdf);
  assert.equal(place.page, 0);
  assert.deepEqual(place.boxes.map(b => [b.page, b.top, b.bottom]), [[0, 700, 710], [1, 80, 90]]);
});

test("a table is one box with its caption; repeated merged values and joined cell paragraphs still match", () => {
  const table = {
    kind: "table", enumerator: "3", caption: t("Supply limits"),
    rows: [[t("Item"), t("Value and note"), t("Value and note")], [t("Voltage"), t("12 V"), t("First line / Second line")], [t("Voltage"), t("24 V"), t("One line")]],
  };
  const pdf = { pages: [page(["Table 3 – Supply limits", 100], ["Item", 115], ["Value and note", 115, 200], ["Voltage", 130], ["12 V", 130, 200], ["First line", 130, 300], ["Second line", 142, 300], ["24 V", 157, 200], ["One line", 157, 300], ["After the table.", 190])] };
  const places = locate([table, para("After the table.")], pdf);
  assert.deepEqual(places[0].boxes, [{ page: 0, x0: 72, top: 100, x1: 355, bottom: 167 }]);
  assert.equal(places[1].boxes[0].top, 190);
});

test("a block that is not in the PDF has no place, and the blocks after it are still found", () => {
  const blocks = [para("First paragraph of the section."), para("A paragraph Word never drew."), para("Third paragraph of the section."), heading("2 Next section")];
  const pdf = { pages: [page(["First paragraph of the section.", 100], ["Third paragraph of the section.", 120], ["2", 150], ["Next section", 150, 100])] };
  const places = locate(blocks, pdf);
  assert.equal(places[1], null);
  assert.deepEqual(places.filter(Boolean).map(p => p.boxes[0].top), [100, 120, 150]);
  assert.deepEqual(locateStats(blocks, places), { paragraph: { found: 2, missing: 1 }, heading: { found: 1, missing: 0 } });
});

test("headings take their bookmark as an anchor, not the same words in the table of contents", () => {
  const blocks = [heading("1 Scope"), para("Scope text."), heading("2 Terms"), para("Terms text.")];
  const pdf = {
    pages: [page(["Contents", 60], ["1 Scope", 80], ["2 Terms", 92]), page(["1 Scope", 60], ["Scope text.", 80], ["2 Terms", 110], ["Terms text.", 130])],
    outline: [{ title: "Contents", page: 0, top: 60 }, { title: "1 Scope", page: 1, top: 58 }, { title: "2 Terms", page: 1, top: 108 }],
  };
  const places = locate(blocks, pdf);
  assert.deepEqual(places.map(p => [p.page, p.boxes[0].top]), [[1, 60], [1, 80], [1, 110], [1, 130]]);
});

test("a heading number this plugin put in front is matched with or without the number Word drew", () => {
  // Word drew "2.1" for the first heading and no number for the second.
  const blocks = [heading("2.1 Ratings", 2), para("Ratings text."), heading("2.2 Limits", 2), para("Limits text.")];
  const pdf = { pages: [page(["2.1", 100], ["Ratings", 100, 100], ["Ratings text.", 115], ["Limits", 140], ["Limits text.", 155])] };
  const places = locate(blocks, pdf);
  assert.deepEqual(places.map(p => p?.boxes[0].top), [100, 115, 140, 155]);
});

test("a figure's place is the space between its caption and the block on the picture's side", () => {
  const blocks = [para("Text before the picture."), { kind: "figure", imageAsset: "figure-001", enumerator: "2", caption: t("Wiring") }, para("Text after the caption.")];
  const pdf = { pages: [page(["Text before the picture.", 100], ["Figure 2 – Wiring", 300], ["Text after the caption.", 330])] };
  const places = locate(blocks, pdf, [{ block: 1, captionAbove: false }]);
  assert.deepEqual(places[1].boxes, [{ page: 0, x0: 72, top: 110, x1: 187, bottom: 310 }]);
});

test("only letters and digits are compared", () => {
  assert.equal(normalize("Table 3 – Ｓupply, ﬁlter (A/B)"), "table3supplyfilterab");
});

test("a missing inline picture across a page break needs one size-matched PDF draw inside the text anchors", async () => {
  const blocks = [para("Before the figure"), { kind: "figure" }, para("After the figure")];
  const pdf = { pages: [page(["Before the figure", 700]), page(["After the figure", 300])] };
  const places = locate(blocks, pdf);
  const before = structuredClone(places);
  const images = [{ block: 1, part: "media/pic.emf", extent: [120, 90] }];
  const match = { kind: "metafile", page: 1, x0: 72, top: 150, x1: 192, bottom: 240 };
  const late = { ...match, top: 310, bottom: 400 };
  const tooWide = { ...match, x1: 199 };
  await fillFigurePlaces(blocks, places, images, async () => [match, { ...match, top: 40, bottom: 130 }]);
  assert.deepEqual(places, before);
  await fillFigurePlaces(blocks, places, images, async pages => {
    assert.deepEqual(pages, [0, 1]);
    return [match, late, tooWide, { ...match, kind: "raster" }];
  });
  assert.deepEqual(places[1], { page: 1, boxes: [{ page: 1, x0: 72, top: 150, x1: 192, bottom: 240 }] });
  assert.deepEqual([places[0], places[2]], [before[0], before[2]]);
});

test("a note points at both original cells without a repeated caption", () => {
  const note = { kind: "admonition", content: t("Settings are retained") };
  const sourceTable = { kind: "table", caption: t("Readings"), enumerator: "4",
    rows: [[t("Note:"), t("Settings are retained")]] };
  const pdf = { pages: [page(["Note:", 80], ["Settings are retained", 80, 160], ["Table 4 Readings", 100], ["After the table", 125])] };
  const places = locate([note, para("After the table")], pdf, [], new Map([[0, sourceTable]]));
  assert.deepEqual(places[0], { page: 0, boxes: [{ page: 0, x0: 72, top: 80, x1: 265, bottom: 90 }] });
  assert.equal(places[1].boxes[0].top, 125);
});

// Needs Word on Windows; skipped elsewhere and when Word is not installed.
test("Word exports the sample and most of its blocks are found (Windows with Word only)", { skip: process.platform !== "win32" }, async t => {
  const { exportPdf } = await import("../source-pdf.mjs");
  const { readPdfText } = await import("../source-text.mjs");
  const dir = await mkdtemp(path.join(os.tmpdir(), "word-import-test-"));
  try {
    const docx = path.join(dir, "sample.docx"), pdf = path.join(dir, "sample.source.pdf");
    await copyFile(new URL("./fixtures/sample.docx", import.meta.url), docx);
    const r = await exportPdf(docx, pdf);
    if (/Word를 찾을 수 없어/.test(r.error || "")) return t.skip("Word is not installed");
    assert.equal(r.error, undefined);
    const { blocks, images, noteTables } = convert(readDocx(readFileSync(docx)), { limits: { tableRows: 500, tableColumns: 32, tableCells: 8000 } });
    const places = locate(blocks, await readPdfText(pdf), images, noteTables);
    const stats = locateStats(blocks, places);
    assert.equal(stats.table.found, 1);
    assert.equal(stats.admonition.found, 1);
    assert.equal(stats.figure.found, 2);
    assert.ok(stats.heading.found >= 4, JSON.stringify(stats));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
