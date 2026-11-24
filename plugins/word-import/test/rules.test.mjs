import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readDocx } from "../docx.mjs";
import { convert, withImages, textOf } from "../rules.mjs";
import { blockPaths } from "../output.mjs";
import { readZip } from "../zip.mjs";

const bytes = readFileSync(new URL("./fixtures/sample.docx", import.meta.url));
const result = convert(readDocx(bytes));
const { blocks, warnings } = result;
const text = b => b.content ? textOf(b.content) : "";
const headings = blocks.filter(b => b.kind === "heading");

test("heading numbers are computed from the numbering definitions and agree with the table of contents", () => {
  assert.deepEqual(headings.map(h => [h.level, text(h)]), [
    [1, "1. 개요"], [2, "1.1 범위"], [3, "1.1.1 세부 범위"], [2, "1.2 표"], [1, "2. 그림"], [1, "3. 부록"],
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
  assert.deepEqual(figures.map(f => [f.enumerator, textOf(f.caption), f.imageAlt]), [["1", "PNG 그림", "막대 그림"], ["2", "EMF 그림", "도형 그림"]]);
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

test("the list of places to check has exactly the expected kinds", () => {
  const count = {};
  for (const w of warnings) count[w.kind] = (count[w.kind] || 0) + 1;
  assert.deepEqual(count, { merged: 1, joined: 1, "ref-missing": 1, math: 1, textbox: 1 });
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
