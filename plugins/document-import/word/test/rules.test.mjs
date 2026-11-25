import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readDocx } from "../docx.mjs";
import { convert as convertWith, withImages, textOf } from "../rules.mjs";
// The SDK's DOCUMENT_AUTHORING_LIMITS; the Host passes the real value.
const limits = { tableRows: 500, tableColumns: 32, tableCells: 8000 };
const convert = (doc, options = {}) => convertWith(doc, { limits, ...options });
import { blockPaths } from "../output.mjs";
import { readZip } from "../zip.mjs";

const bytes = readFileSync(new URL("./fixtures/sample.docx", import.meta.url));
const result = convert(readDocx(bytes));
const { blocks, warnings } = result;
const text = b => b.content ? textOf(b.content) : "";
const headings = blocks.filter(b => b.kind === "heading");

test("heading numbers are computed from the numbering definitions and agree with the table of contents", () => {
  assert.deepEqual(headings.map(h => [h.level, text(h)]), [
    [1, "1. 개요"], [2, "1.1 범위"], [3, "1.1.1 세부 범위"], [2, "1.3 표"], [1, "2. 그림"], [1, "3. 부록 1.1 참고"],
  ]);
  assert.deepEqual({ ...result.stats.toc }, { entries: 3, compared: 3, matched: 3, mismatches: {}, other: {} });
  assert.ok(!blocks.some(b => /목차/.test(text(b))), "the table of contents and its title are not moved");
  assert.equal(result.title, "합성 표본 문서");
});

test("paragraph formatting: bold, italic, superscript and subscript stay; underline goes; tab is a space", () => {
  const p = blocks.find(b => b.kind === "paragraph" && text(b).startsWith("이 문단에는"));
  assert.deepEqual(p.content.map(n => n.kind), ["text", "strong", "text", "emphasis", "text", "superscript", "text", "subscript", "text", "break", "text"]);
  assert.match(text(p), /O, 밑줄이 있다\. 탭 뒤 글자\. 줄바꿈 뒤 글자\.$/);
  const bold = blocks.find(b => text(b) === "문단 전체가 굵은 경고 문장이다.");
  assert.deepEqual(bold.content.map(n => n.kind), ["strong"]);
});

test("a two-level list keeps its levels and number styles", () => {
  const list = blocks.find(b => b.kind === "list");
  assert.equal(list.style, "decimal");
  assert.equal(list.items.length, 2);
  assert.deepEqual({ ...list.items[0].list, items: list.items[0].list.items.map(i => textOf(i.content)) },
    { ordered: true, style: "lower-alpha", delimiter: ")", start: 1, items: ["둘째 단계 첫 항목", "둘째 단계 둘째 항목"] });
});

test("merged cells are repeated, cell paragraphs are joined, and the table gets its numbered caption", () => {
  const table = blocks.find(b => b.kind === "table");
  assert.deepEqual(table.rows.map(r => r.map(c => typeof c === "string" ? c : textOf(c))), [
    ["항목", "값과 설명", "값과 설명"],
    ["전압", "12 V", "첫 문단 / 둘째 문단"],
    ["전압", "24 V", "한 문단"],
  ]);
  assert.equal(table.enumerator, "1");
  assert.equal(textOf(table.caption), "합성 표");
  const figures = blocks.filter(b => b.kind === "figure");
  assert.deepEqual(figures.map(f => [f.enumerator, textOf(f.caption), f.imageAlt]), [["1", "PNG 그림", "막대 그림"], ["2", "EMF 그림, Table 1 참고", "도형 그림"]]);
});

test("one-row Note tables become note boxes and keep a numbered label, formatting, and links", () => {
  const [index, sourceTable] = result.noteTables.entries().next().value;
  assert.deepEqual(blocks[index], {
    kind: "admonition", variant: "note",
    content: [
      { kind: "strong", children: [{ kind: "text", text: "NOTE 2 —" }] },
      { kind: "text", text: " 합성 참고의 " },
      { kind: "emphasis", children: [{ kind: "text", text: "강조 글자" }] },
      { kind: "link", url: "https://example.com/", children: [{ kind: "text", text: "와 안내 링크" }] },
    ],
  });
  assert.equal(textOf(sourceTable.rows[0][0]), "NOTE 2 —");
  assert.ok(!warnings.some(w => w.block === index));
  const legacy = convert(readDocx(bytes), { noteAdmonitions: false });
  assert.equal(legacy.blocks[index].kind, "table");
  assert.equal(legacy.noteTables.size, 0);
});

test("plain Note labels are omitted, and other labels, extra rows or columns, and multiple paragraphs stay as tables", () => {
  const cell = (...texts) => ({ items: texts.map(text => ({
    type: "p", runs: [{ text }], textboxes: [], bookmarks: [],
  })) });
  const table = rows => ({ type: "table", rows, bookmarks: [] });
  const items = [
    ...["Note", "NOTE", "Note:"].map(label => table([[cell(label), cell("Body")]])),
    table([[cell("Warning:"), cell("Body")]]),
    table([[cell("Note the setting"), cell("Body")]]),
    table([[cell("Note:"), cell("Body"), cell("Extra")]]),
    table([[cell("Note:"), cell("Body")], [cell("More"), cell("Content")]]),
    table([[cell("Note:"), cell("First", "Second")]]),
  ];
  const r = convert({ items });
  assert.deepEqual(r.blocks.map(b => b.kind), [...Array(3).fill("admonition"), ...Array(5).fill("table")]);
  assert.deepEqual(r.blocks.slice(0, 3).map(text), ["Body", "Body", "Body"]);
  assert.deepEqual(r.warnings.map(w => [w.kind, w.block]), [["joined", 7]]);
});

test("only a caption repeated on the following table can be dropped from a note box", () => {
  const p = (text, caption = false) => ({ type: "p", runs: [{ text }], caption, textboxes: [], bookmarks: [] });
  const row = (...cells) => cells.map(text => ({ items: [p(text)] }));
  const table = (...rows) => ({ type: "table", rows, bookmarks: [] });
  const items = () => [
    p("Table 4 — Readings", true), table(row("Note", "Body")),
    p("Table 4 — Readings", true), table(row("Item", "Value"), row("A", "42")),
  ];
  const r = convert({ items: items() });
  assert.deepEqual(r.blocks.map(b => b.kind), ["admonition", "table"]);
  assert.equal(r.blocks[1].enumerator, "4");
  assert.equal(textOf(r.blocks[1].caption), "Readings");
  assert.deepEqual(convert({ items: items().slice(0, 2) }).blocks.map(b => b.kind), ["table"]);
});

test("REF fields become in-document links to labelled targets; a missing target stays text", () => {
  const p = blocks.find(b => text(b).startsWith("참조:"));
  const links = p.content.filter(n => n.kind === "link").map(n => [n.url, textOf(n.children)]);
  assert.deepEqual(links, [["#sec-1-1", "1.1"], ["#tbl-1", "Table 1"], ["#fig-1", "Figure 1"], ["https://example.com/", "주소"]]);
  assert.match(text(p), /없는 대상 Clause 9,/);
  const target = blocks.findIndex(b => b.kind === "target");
  assert.deepEqual(blocks[target], { kind: "target", label: "sec-1-1" });
  assert.equal(text(blocks[target + 1]), "1.1 범위");
  assert.equal(blocks.find(b => b.kind === "table").label, "tbl-1");
  assert.deepEqual(blocks.filter(b => b.kind === "figure").map(f => f.label), ["fig-1", undefined]);
});

test("an empty numbered paragraph with a hidden mark is not moved, but its number still counts", () => {
  assert.ok(!headings.some(h => /^1\.2(\s|$)/.test(text(h))), "no number-only heading");
  const notice = warnings.filter(w => w.kind === "other");
  assert.deepEqual(notice.map(w => [w.detail, text(blocks[w.block])]),
    [["숨긴 번호 문단 1개를 옮기지 않았습니다. 뒤따르는 제목의 번호는 원본과 같습니다.", "1.3 표"]]);
});

test("REF fields inside headings and captions stay their result text", () => {
  const hasLink = nodes => nodes.some(n => n.kind === "link" || (n.children && hasLink(n.children)));
  for (const h of headings) assert.ok(!hasLink(h.content), textOf(h.content));
  for (const b of blocks.filter(b => Array.isArray(b.caption))) assert.ok(!hasLink(b.caption), textOf(b.caption));
  assert.equal(text(headings.at(-1)), "3. 부록 1.1 참고");
});

test("the list of places to check has exactly the expected kinds", () => {
  const count = {};
  for (const w of warnings) count[w.kind] = (count[w.kind] || 0) + 1;
  assert.deepEqual(count, { merged: 1, joined: 1, "ref-missing": 1, math: 1, textbox: 1, other: 1 });
  for (const w of warnings) assert.ok(Number.isInteger(w.block) && blocks[w.block], w.kind + " points at a block");
  assert.equal(blocks[warnings.find(w => w.kind === "textbox").block].content[0].text, "글상자 안의 문장.");
  assert.equal(blocks.filter(b => text(b) === "글상자 안의 문장.").length, 1, "the fallback copy of a text box is not moved twice");
});

test("no text is lost: every run of body text appears in the document", () => {
  const xml = readZip(bytes).read("word/document.xml").toString("utf8");
  const tocText = ["목차", "1.", "개요", "1", "1.1", "범위", "2.", "그림", "2"];
  const shown = blocks.map(b => {
    const parts = [text(b)];
    if (b.kind === "table") parts.push("Table " + b.enumerator, textOf(b.caption), ...b.rows.flat().map(c => typeof c === "string" ? c : textOf(c)));
    if (b.kind === "figure") parts.push("Figure " + b.enumerator, textOf(b.caption));
    if (b.kind === "list") { const walk = l => l.items.forEach(i => { parts.push(textOf(i.content)); if (i.list) walk(i.list); }); walk(b); }
    return parts.join(" ");
  }).join(" ");
  const squash = s => s.replace(/[\s\p{P}]/gu, "");
  const body = squash(shown);
  const runs = [...xml.matchAll(/<(?:w|m):t(?: [^>]*)?>([^<]*)</g)].map(m => m[1]);
  // The table of contents is the first paragraphs; drop exactly its runs once.
  const rest = [...runs];
  for (const t of tocText) rest.splice(rest.findIndex(r => r.trim() === t), 1);
  for (const r of rest) assert.ok(body.includes(squash(r)), "missing: " + r);
});

test("a picture that could not be made becomes a paragraph and links to it become text", () => {
  const failed = withImages(result, new Map([["figure-001", "그림을 PNG로 바꾸지 못했습니다."]]));
  const i = blocks.findIndex(b => b.imageAsset === "figure-001");
  assert.deepEqual(failed.blocks[i], { kind: "paragraph", content: [{ kind: "text", text: "[그림을 옮기지 못함] Figure 1 PNG 그림" }] });
  const p = failed.blocks.find(b => text(b).startsWith("참조:"));
  assert.ok(!p.content.some(n => n.kind === "link" && n.url === "#fig-1"));
  assert.ok(text(p).includes("Figure 1"));
  assert.deepEqual(failed.warnings.filter(w => w.kind === "image-failed").map(w => w.block), [i]);
});

test("block paths come from the saved read model in order, and a different count is an error", () => {
  const nodes = blocks.map((b, i) => ({ path: [i + 1], type: b.kind }));
  nodes.splice(3, 0, { path: [3, 1], type: "caption" });
  assert.deepEqual(blockPaths(nodes, blocks), blocks.map((b, i) => [i + 1]));
  assert.throws(() => blockPaths(nodes.slice(1), blocks), /블록 수/);
});

test("a long Word table stays one table up to the SDK's table limits and splits only beyond them", () => {
  const p = text => ({ type: "p", runs: [{ text }], textboxes: [], bookmarks: [] });
  const table = (rows, cols) => ({ type: "table", bookmarks: [], rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ({ items: [p(r + ":" + c)] }))) });
  const tables = r => r.blocks.filter(b => b.kind === "table");
  // 120 rows was cut at 100 before; it is one table now.
  assert.deepEqual(tables(convert({ items: [table(120, 3)] })).map(b => b.rows.length), [120]);
  // Beyond 500 rows the header repeats on each part.
  const long = convert({ items: [table(600, 2)] });
  assert.deepEqual(tables(long).map(b => b.rows.length), [500, 101]);
  assert.deepEqual(tables(long)[1].rows[0], tables(long)[0].rows[0]);
  assert.match(long.warnings.at(-1).detail, /행이 500개를 넘어 표 2개로/);
  // 32 columns stay within 8,000 cells: 250 rows to a part.
  assert.deepEqual(tables(convert({ items: [table(300, 32)] })).map(b => b.rows.length), [250, 51]);
  assert.deepEqual(tables(convertWith({ items: [table(30, 2)] }, { limits: { tableRows: 10, tableColumns: 32, tableCells: 8000 } })).map(b => b.rows.length), [10, 10, 10, 3]);
});
