import { test } from "node:test";
import assert from "node:assert/strict";
import { selectProfile } from "../profiles/index.mjs";
import { convert } from "../rules.mjs";

const line = (text, y, end = 500) => ({
  bbox: [60, y - 8, end, y + 2],
  spans: [{ text, size: 10, flags: 0 }],
  metrics: [{ text, x0: 60, x1: end, base: y, size: 10 }],
});
const page = (raw) => ({
  width: 600, height: 800, raw, tables: [], figures: [],
  nchars: raw.reduce((n, l) => n + l.spans[0].text.replace(/\s/g, "").length, 0),
});

test("profile selection needs an IEEE designation line on the first pages or in the PDF title", () => {
  const cover = (...texts) => [page(texts.map((t, i) => line(t, 100 + 20 * i)))];
  assert.equal(selectProfile({ pages: cover("A title", "IEEE Std 1547™-2018") }), "ieee");
  assert.equal(selectProfile({ pages: [page([]), ...cover("IEEE Std 2030.5-2018")] }), "ieee");
  assert.equal(selectProfile({ pages: [], title: "IEEE Std 1547-2018, IEEE Standard for …" }), "ieee");
  // A citation inside a sentence, a later page, or IEEE named elsewhere in the title is not enough.
  assert.equal(selectProfile({ pages: cover("This guide uses IEEE Std 1547 terms.") }), "generic");
  assert.equal(selectProfile({ pages: [page([]), page([]), ...cover("IEEE Std 1547-2018")] }), "generic");
  assert.equal(selectProfile({ pages: cover("IEEE Standards Association"), title: "Not an IEEE Std 1547 copy" }), "generic");
  assert.equal(selectProfile({ pages: [], toc: [] }), "generic");
});

test("the engine runs with the generic profile; the IEEE profile adds NOTE paragraphs", () => {
  const raw = {
    pages: [page([
      line("This is a full opening line of a paragraph that runs", 130),
      line("to the right edge as every justified body line does", 142),
      line("NOTE 1—A remark that directly follows the paragraph.", 154, 400),
    ])],
    toc: [],
  };
  const generic = convert(structuredClone(raw));
  assert.equal(generic.profile, "generic");
  assert.equal(generic.blocks.length, 1);
  const ieee = convert(structuredClone(raw), [], "ieee");
  assert.equal(ieee.profile, "ieee");
  assert.deepEqual(ieee.blocks.map((b) => b.text.slice(0, 4)), ["This", "NOTE"]);
  assert.throws(() => convert(structuredClone(raw), [], "unknown"));
});
