import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "../extract.mjs";
import { convert } from "../rules.mjs";
import { authoring } from "../authoring.mjs";
import { hasSheetSignals } from "../profiles/sheet.mjs";
import { checkSaveSize } from "../save-size.mjs";
const raw = await extract(
  new URL("./fixtures/sheet-spec.pdf", import.meta.url),
);
const result = convert(raw);

test("T-06 repeated frame removed on every sheet, footer retained as excluded source", () => {
  assert.equal(result.stats.sheet.pages, 6);
  assert.equal(result.stats.chars_unaccounted, 0);
  assert.equal(result.excluded.length, 6);
  assert.ok(
    raw.pages.every((p) => p.footerTop > 720 && p.figures.length === 0),
  );
  assert.equal(hasSheetSignals(raw.pages.slice(0, 1)), false);
  assert.equal(
    hasSheetSignals(raw.pages.map((p) => ({ ...p, footerTop: null }))),
    false,
  );
});
test("T-14 source order, bilingual paragraphs, continued headings and linked requirements", () => {
  assert.deepEqual(
    result.blocks.filter((b) => b.number).map((b) => b.number),
    ["1", "1.1", "1.2", "1.3"],
  );
  assert.equal(result.blocks.find((b) => b.number === "1.1").boxes.length, 2);
  assert.equal(
    result.blocks.filter((b) => b.text === "メモを確認する。").length,
    6,
  );
  const plan = authoring(result).authoring.inputs[0].blocks;
  assert.equal(
    plan.filter((b) => b.kind === "target" && b.label === "req-log-6-01")
      .length,
    1,
  );
  assert.equal(result.stats.sheet.links, 6);
  assert.equal(
    result.blocks.find((b) => b.requirement === "LOG_6_01").level,
    3,
  );
  assert.equal(result.blocks.filter((b) => b.bold).length, 6);
});
test("T-14 tagged cells stay in their data table and a layout cell becomes a source heading", () => {
  assert.equal(result.stats.sheet.layoutTables, 1);
  assert.deepEqual(result.blocks.find((b) => b.table).table.rows, [
    ["Entry 1-1", "Entry 1-2"],
    ["Entry 2-1", "Entry 2-2"],
  ]);
  assert.equal(result.blocks.find((b) => b.requirement === "LOG_9_01").page, 4);
});
test("saveDocument image count, decoded bytes and total UTF-8 request bytes", () => {
  const image = { base64: "AA==" };
  assert.doesNotThrow(() => checkSaveSize({ images: Array(256).fill(image) }));
  assert.throws(
    () => checkSaveSize({ images: Array(257).fill(image) }),
    /257장/,
  );
  assert.throws(
    () =>
      checkSaveSize({
        images: [{ base64: "AAAA".repeat(Math.ceil((10 * 1024 ** 2) / 3)) }],
      }),
    /10 MiB/,
  );
  assert.throws(
    () => checkSaveSize({ images: [], name: "글".repeat(12 * 1024 ** 2) }),
    /32 MiB/,
  );
});

test("T-14 different titles under one number are retained for review", () => {
  const changed = structuredClone(raw);
  const title = changed.pages[1].raw.find((line) =>
    line.spans.some((span) => span.text.includes("Observation")),
  );
  title.spans.find((span) => span.text.includes("Observation")).text =
    "1.1 Recheck (2 of 2)";
  const mismatch = convert(changed).blocks.find(
    (b) => b.text === "1.1 Recheck",
  );
  assert.equal(mismatch.warning.code, "section-title");
});

test("T-06 low tag coverage leaves the page on the coordinate path", async () => {
  const { taggedMembership } = await import("../tagged-sheet.mjs");
  const page = {
    getStructTree: async () => ({
      role: "P",
      children: [{ type: "content", id: "known" }],
    }),
    getTextContent: async () => ({
      items: [
        { type: "beginMarkedContentProps", id: "known" },
        { str: "few" },
        { type: "endMarkedContent" },
        { str: "unattached" },
      ],
    }),
  };
  assert.equal(await taggedMembership(page), null);
});
