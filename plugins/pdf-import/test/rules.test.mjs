import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "../extract.mjs";
import {
  convert,
  suggestExcludedPages,
  footnoteContent,
  mergeRegions,
} from "../rules.mjs";
const raw = await extract(
  new URL("./fixtures/LSR-1.1-standards.pdf", import.meta.url),
);
const result = convert(raw);
test("public sample: headings, conservation, margins, and cross-page paragraph", () => {
  // Its PDF information mentions IEEE, but it has no IEEE designation line.
  assert.equal(result.profile, "generic");
  assert.equal(result.stats.headings.detected, 15);
  assert.equal(result.stats.headings.matched, 15);
  assert.equal(result.stats.headings.level_correct, 15);
  assert.equal(result.stats.chars_unaccounted, 0);
  const excluded = result.excluded.filter((x) => x.kind === "margin");
  assert.ok(excluded.length);
  for (const b of result.blocks)
    for (const x of b.boxes)
      assert.ok(
        !excluded.some(
          (e) =>
            e.page === x.page &&
            e.box.top === x.top &&
            e.box.bottom === x.bottom,
        ),
      );
  assert.equal(result.stats.paragraphs.cross_page_joined, 1);
  assert.ok(
    result.blocks.some((b) => b.kind === "paragraph" && b.boxes.length === 2),
  );
  assert.equal(result.pages.length, 13);
  const ids = /* @__PURE__ */ new Set();
  for (const b of result.blocks) {
    assert.ok(!ids.has(b.id));
    ids.add(b.id);
    assert.equal(typeof b.text, "string");
    assert.ok(b.boxes.length);
    for (const x of b.boxes) {
      assert.ok(x.x1 >= x.x0 && x.bottom >= x.top);
      assert.ok(result.pages[x.page]);
    }
  }
});
test("public sample: unmatched superscript is retained as literal marker with warning", () => {
  const unmatched = structuredClone(raw);
  unmatched.pages[1].raw = unmatched.pages[1].raw.filter(
    (l) =>
      !l.spans
        .map((s) => s.text)
        .join("")
        .startsWith("17 A page note"),
  );
  const result = convert(unmatched);
  const b = result.blocks.find((b2) => b2.warning?.code === "footnote-pair");
  assert.ok(b);
  const n = result.stats.footnotes.refs_without_definition.find((n2) =>
    b.text.includes("[^" + n2 + "]"),
  );
  assert.ok(n);
  const content = footnoteContent(b.text, result.stats);
  assert.ok(content.some((c) => c.kind === "text" && c.text === "[" + n + "]"));
  assert.ok(!content.some((c) => c.kind === "footnote" && c.label === n));
});

test("public sample: adjacent regions unite but captions separate tables", () => {
  const rectangles = raw.pages[7].figures.slice(0, 2);
  assert.equal(rectangles.length, 2);
  const objects = rectangles.map((r, i) => ({
    id: "fragment" + i,
    kind: i ? "figure" : "table",
    text: "",
    page: 7,
    boxes: [{ page: 7, x0: r[0], top: r[1], x1: r[2], bottom: r[3] }],
  }));
  const combined = mergeRegions(objects);
  assert.equal(combined.length, 1);
  assert.deepEqual(combined[0].boxes[0], {
    page: 7,
    x0: Math.min(...rectangles.map((r) => r[0])),
    top: Math.min(...rectangles.map((r) => r[1])),
    x1: Math.max(...rectangles.map((r) => r[2])),
    bottom: Math.max(...rectangles.map((r) => r[3])),
  });
  const cap = (text) => ({ kind: "caption", text, page: 7, boxes: [] });
  const separated = mergeRegions([
    cap("Table 1 — Public sample"),
    objects[0],
    cap("Table 2 — Public sample"),
    objects[1],
  ]);
  assert.equal(separated.filter((b) => b.kind === "table").length, 2);
  assert.equal(separated.length, 4);
});
test("public sample: whitespace around superscript stays exactly as extracted", () => {
  const b = result.blocks.find((b) => b.text.includes("[^17]"));
  assert.match(b.text, /item\[\^17\] even/);
  const modified = structuredClone(raw);
  const spans = modified.pages
    .flatMap((p) => p.raw)
    .map((l) => l.spans)
    .find((ss) => ss.some((s) => s.flags & 1 && s.text.trim() === "17"));
  const at = spans.findIndex((s) => s.flags & 1 && s.text.trim() === "17");
  spans[at].text = spans[at].text.trimEnd();
  spans[at + 1].text = spans[at + 1].text.trimStart();
  const noGap = convert(modified).blocks.find((b) => b.text.includes("[^17]"));
  assert.match(noGap.text, /item\[\^17\]even/);
});

test("public sample: captions, one graph crop with axes, and paired endnotes", async () => {
  const { authoring } = await import("../authoring.mjs");
  for (const text of [
    "Figure K.1.",
    "Figure K.2.",
    "Table 1.",
    "Table 2.",
    "Table 3.",
    "Table 4.",
  ])
    assert.ok(
      result.blocks.some(
        (b) => b.kind === "caption" && b.text.startsWith(text),
      ),
      text,
    );
  const graph = result.blocks.filter(
    (b) => b.page === 9 && ["table", "figure"].includes(b.kind),
  );
  assert.equal(graph.length, 1);
  assert.equal(graph[0].kind, "figure");
  assert.ok(graph[0].boxes[0].bottom >= 492.8);
  assert.ok(
    !result.blocks.some(
      (b) =>
        b.page === 9 &&
        b.kind === "paragraph" &&
        /Time from capture|t ≥ 18/.test(b.text),
    ),
  );
  for (const n of ["17", "121"]) {
    assert.ok(
      result.blocks.some(
        (b) => b.kind === "footnote" && b.text.startsWith("[^" + n + "]:"),
      ),
    );
    assert.ok(
      authoring(result).authoring.inputs[0].blocks.some(
        (b) => b.kind === "footnote" && b.label === n,
      ),
    );
    assert.ok(!result.stats.footnotes.refs_without_definition.includes(n));
  }
  assert.ok(
    !result.blocks.some(
      (b) => b.kind === "paragraph" && b.text.startsWith("17 A page note"),
    ),
  );
  const blocked = structuredClone(raw);
  const axis = blocked.pages[9].raw.find((l) =>
    l.spans.some((s) => s.text.includes("Time from capture")),
  );
  axis.spans.forEach((s) => (s.size = 9.5));
  blocked.pages[9].raw
    .find((l) => l.spans.some((s) => s.text.startsWith("Figure K.2.")))
    .spans.forEach((s) => (s.flags = 0));
  assert.ok(
    !convert(blocked).blocks.some(
      (b) => b.kind === "caption" && b.text.startsWith("Figure K.2."),
    ),
  );
});

test("public sample: front-page suggestion is advisory", () => {
  assert.deepEqual(suggestExcludedPages(raw), [1]);
  assert.ok(convert(raw, []).blocks.some((b) => b.page === 0));
});
test("public sample: chosen pages exclude text and objects without renumbering pages", () => {
  const result = convert(raw, [1, 8, 13]);
  assert.deepEqual(result.excludedPages, [1, 8, 13]);
  assert.equal(result.pages.length, raw.pages.length);
  assert.ok(result.blocks.length);
  assert.ok(
    result.blocks.every((b) =>
      b.boxes.every((x) => ![0, 7, 12].includes(x.page)),
    ),
  );
  assert.equal(result.stats.chars_unaccounted, 0);
});

test("public oracle: paragraph boundary score and ragged layout", async () => {
  const { readFile } = await import("node:fs/promises");
  const { compare } = await import("../compare-paragraphs.mjs");
  const oracle = JSON.parse(
    await readFile(
      new URL("./fixtures/paragraphs.json", import.meta.url),
      "utf8",
    ),
  );
  const score = compare(result, oracle, 2);
  assert.equal(score.total, 48);
  assert.equal(score.matched, 35);
  assert.equal(result.stats.paragraphs.layout.justified, false);
  assert.ok(
    !result.blocks.some((b) =>
      ["paragraph-start", "paragraph-end"].includes(b.warning?.code),
    ),
  );
});

const sampleLine = (text, x, y, end = 500) => ({
  bbox: [x, y - 8, end, y + 2],
  spans: [{ text, size: 10, flags: 0 }],
  metrics: [{ text, x0: x, x1: end, base: y, size: 10 }],
});
const samplePage = (raw) => ({
  width: 600,
  height: 800,
  raw,
  tables: [],
  figures: [],
  nchars: raw.reduce(
    (n, l) =>
      n +
      l.spans
        .map((s) => s.text)
        .join("")
        .replace(/\s/g, "").length,
    0,
  ),
});
test("body baselines ignore a subscript's displaced bounding box", () => {
  const lines = [
    sampleLine("This is a full opening line of a paragraph", 60, 130),
    sampleLine("and another full body line containing subscript", 60, 142),
    sampleLine("and its final short line.", 60, 154, 270),
    sampleLine("A separate paragraph begins here.", 60, 178, 350),
  ];
  const original = convert({ pages: [samplePage(lines)], toc: [] });
  const displaced = structuredClone(lines);
  displaced[1].bbox[1] -= 6;
  displaced[1].bbox[3] += 9;
  displaced[1].spans.push({ text: "q", size: 6, flags: 0 });
  displaced[1].metrics.push({
    text: "q",
    x0: 300,
    x1: 304,
    base: 148,
    size: 6,
  });
  const modified = convert({ pages: [samplePage(displaced)], toc: [] });
  assert.deepEqual(
    modified.blocks.map((b) => b.boxes.length),
    original.blocks.map((b) => b.boxes.length),
  );
  assert.equal(modified.blocks.length, 2);
  assert.ok(modified.blocks[0].text.includes("subscriptq and its final"));
});
test("detached symbol, hanging continuation and nested ordered lists keep their sources", async () => {
  const { authoring } = await import("../authoring.mjs");
  const lines = [
    sampleLine("The following conditions apply:", 60, 130, 300),
    sampleLine("•", 70, 154, 75),
    sampleLine("First item with enough text to establish a body line", 95, 154),
    sampleLine("continuation of the same list item.", 95, 166, 300),
    sampleLine("a) Child item", 110, 190, 350),
    sampleLine("b) Second child", 110, 214, 360),
    sampleLine("• Another top level item", 70, 238, 360),
  ];
  const r = convert({ pages: [samplePage(lines)], toc: [] });
  const lists = r.blocks.filter((b) => b.kind === "list");
  assert.equal(lists.length, 4);
  assert.ok(lists[0].text.includes("continuation"));
  assert.deepEqual(
    lists.map((b) => b.level),
    [1, 2, 2, 1],
  );
  const plan = authoring(r);
  const top = plan.authoring.inputs[0].blocks.find((b) => b.kind === "list");
  assert.equal(top.items.length, 2);
  assert.equal(top.items[0].list.style, "lower-alpha");
  assert.equal(top.items[0].list.delimiter, ")");
  assert.equal(top.items[0].list.kind, undefined);
  assert.equal(plan.units.find((u) => u.kind === "list").sources.length, 4);
  const fallback = structuredClone(r);
  fallback.blocks.find((b) => b.kind === "list").marker = "(a)";
  fallback.blocks.find((b) => b.kind === "list").text =
    "(a) Preserved source marker";
  assert.ok(
    JSON.stringify(authoring(fallback).authoring).includes(
      "(a) Preserved source marker",
    ),
  );
});

test("post-assembly footnote pairing uses only remaining blocks of every authored kind", async () => {
  const { authoring, validateFootnoteInput } = await import("../authoring.mjs");
  const call = result.blocks.find(
    (b) => b.text.includes("[^17]") && b.kind !== "footnote",
  );
  for (const kind of [
    "paragraph",
    "list",
    "heading",
    "heading_unnumbered",
    "caption",
  ]) {
    const filtered = structuredClone(result);
    filtered.blocks = filtered.blocks.filter(
      (b) => !(b.kind === "footnote" && b.text.startsWith("[^17]:")),
    );
    const b = filtered.blocks.find((b) => b.id === call.id);
    b.kind = kind;
    if (kind === "heading") b.level = 2;
    const plan = authoring(filtered);
    assert.ok(
      filtered.stats.footnotes.refs_without_definition.includes("17"),
      kind,
    );
    assert.match(b.warning.reason, /각주 짝 불일치/, kind);
    const json = JSON.stringify(plan.authoring);
    assert.ok(json.includes('"text":"[17]"'), kind);
    assert.ok(!json.includes('"kind":"footnote","label":"17"'), kind);
    validateFootnoteInput(plan.authoring);
  }
  const noCall = structuredClone(result);
  noCall.blocks = noCall.blocks.filter(
    (b) => b.kind === "footnote" || !b.text.includes("[^17]"),
  );
  const unused = noCall.blocks.find(
    (b) => b.kind === "footnote" && b.text.startsWith("[^17]:"),
  );
  const plan = authoring(noCall);
  assert.equal(unused.warning.code, "footnote-pair");
  assert.equal(
    plan.units.find((u) => u.sources.includes(unused.id)).kind,
    "paragraph",
  );
  assert.ok(JSON.stringify(plan.authoring).includes("[17] A page note"));
  const invalid = {
    inputs: [
      {
        key: "first",
        blocks: [
          {
            kind: "list",
            ordered: false,
            items: [
              {
                content: [],
                list: {
                  ordered: false,
                  items: [{ content: [{ kind: "footnote", label: "17" }] }],
                },
              },
            ],
          },
        ],
      },
      {
        key: "other",
        blocks: [{ kind: "footnote", label: "17", text: "Separate input" }],
      },
    ],
  };
  assert.throws(
    () => validateFootnoteInput(invalid),
    /각주 정의가 없는 작성 입력: 17/,
  );
});

test("F-07 repeated footnote definitions preserve both texts and ambiguous calls without duplicate labels",async()=>{
  const {authoring}=await import('../authoring.mjs');
  const sample=structuredClone(result),definition=sample.blocks.find(b=>b.kind==='footnote'&&b.text.startsWith('[^17]:'));
  sample.blocks.push({...structuredClone(definition),id:'duplicate-public-note',text:'[^17]: Another public definition.'});
  const plan=authoring(sample),output=JSON.stringify(plan.authoring);
  assert.deepEqual(sample.stats.footnotes.duplicate_definitions,['17']);
  for(const b of sample.blocks.filter(b=>b.text.includes('[^17]')))assert.match(b.warning.reason,/각주 짝 불일치/);
  assert.ok(output.includes('[17] A page note'));
  assert.ok(output.includes('[17] Another public definition.'));
  assert.ok(output.includes('"text":"[17]"'));
  assert.ok(!output.includes('"kind":"footnote","label":"17"'));
  assert.equal(plan.units.length,authoring(structuredClone(result)).units.length+1);
});
