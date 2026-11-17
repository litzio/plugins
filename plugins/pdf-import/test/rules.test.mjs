import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "../extract.mjs";
import { convert, suggestExcludedPages, footnoteContent, mergeRegions } from "../rules.mjs";
const raw = await extract(
  new URL("./fixtures/LSR-1.1-standards.pdf", import.meta.url),
);
const result = convert(raw);
test("public sample: headings, conservation, margins, and cross-page paragraph", () => {
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
  assert.ok(result.blocks.every((b) => b.boxes.every((x) => ![0,7,12].includes(x.page))));
  assert.equal(result.stats.chars_unaccounted, 0);
});
