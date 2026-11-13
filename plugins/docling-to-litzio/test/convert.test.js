import test from "node:test";
import assert from "node:assert/strict";
import { readBundle, makePlan, RULES, validateLimits } from "../src/convert.js";
import { verifyNative } from "../src/score.js";
const folder = new URL(
  "../../../fixtures/lsr-1.1/converted/",
  import.meta.url,
).pathname.replace(/^\/([A-Z]:)/, "$1");
const original = await readBundle(folder);
const copy = () => structuredClone(original);
test("fixed bundle inventory is exhaustive, rules versioned, source untouched", () => {
  const before = JSON.stringify(original),
    p = makePlan(original);
  assert.equal(
    p.items.length,
    2 +
      original.doc.groups.length +
      original.doc.texts.length +
      original.doc.tables.length +
      original.doc.pictures.length,
  );
  assert(
    p.items.every((i) =>
      ["mapped", "container", "furniture", "omitted", "unsupported"].includes(
        i.disposition,
      ),
    ),
  );
  assert.equal(p.items.filter((i) => i.disposition === "omitted").length, 0);
  assert(Object.values(RULES).every((v) => /^1\.\d+\.0$/.test(v)));
  assert.equal(JSON.stringify(original), before);
});
test("reject schema, broken references, cycles and parent mismatch", () => {
  for (const mutate of [
    (b) => (b.doc.version = "1.9.0"),
    (b) => b.doc.body.children.push({ $ref: "#/texts/99999" }),
    (b) => b.doc.body.children.push({ $ref: "#/body" }),
    (b) => (b.doc.texts[0].parent = { $ref: "#/furniture" }),
  ]) {
    const b = copy();
    mutate(b);
    assert.throws(() => makePlan(b));
  }
});
test("reject overlapping table cells and invalid spans", () => {
  const b = copy();
  b.doc.tables[0].data.table_cells.push(b.doc.tables[0].data.table_cells[0]);
  assert.throws(() => makePlan(b), /overlapping/);
  b.doc.tables[0].data.table_cells.pop();
  b.doc.tables[0].data.table_cells[0].row_span = 20;
  assert.throws(() => makePlan(b), /cell-span/);
});
test("literal numbers, inequalities, units, decimal and code remain exact", () => {
  const b = copy(),
    n = b.doc.texts.find((n) => n.label === "text");
  n.text = "−0.73 ± 1.2 ms ≤ 10 kV > 3.0 %";
  let p = makePlan(b),
    i = p.items.find((i) => i.selfRef === n.self_ref);
  assert.equal(
    p.request.authoring.inputs.find((v) => v.key === i.links[0].key).blocks[0]
      .text,
    n.text,
  );
  n.label = "code";
  n.text = "  x = 0.73\n    y <= 10";
  p = makePlan(b);
  assert.equal(
    p.request.authoring.inputs.find((v) => v.key === i.links[0].key).blocks[0]
      .code,
    n.text,
  );
});
test("diagnose disabled enrichment and missing page images", () => {
  const b = copy();
  b.record.actual_request.do_formula_enrichment = false;
  delete b.doc.pages[1].image;
  assert.equal(makePlan(b).diagnostics.length, 2);
});
test("all equations require review and unknown/absent bookmarks lower trust", () => {
  const p = makePlan(original);
  assert.equal(p.formulaReview.length, 3);
  assert(p.formulaReview.every((f) => f.reviewRequired && f.regions.length));
  assert.equal(p.headingReview.reviewRequired, true);
  assert.equal(
    makePlan({
      ...original,
      bookmarkEvidence: {
        pdfSha256: original.source.pdfSha256,
        status: "absent",
      },
    }).headingReview.confidence,
    "low — review required",
  );
  assert.throws(() =>
    makePlan({
      ...original,
      bookmarkEvidence: { pdfSha256: "bad", status: "present" },
    }),
  );
});
test("coordinates invert bottom-left using source height", () => {
  const p = makePlan(original),
    i = p.items.find((i) => i.regions.length);
  const r = i.regions[0];
  assert.equal(r.bbox[1], r.pageSize.height - r.original.bbox.t);
  assert.equal(r.original.bbox.coord_origin, "BOTTOMLEFT");
});
test("limits refuse rather than truncate", () => {
  assert.throws(
    () =>
      validateLimits({
        authoring: {
          inputs: [
            {
              key: "a",
              blocks: [{ kind: "paragraph", text: "x".repeat(16385) }],
            },
          ],
        },
        images: [],
      }),
    /string-limit/,
  );
  assert.throws(
    () =>
      validateLimits({
        authoring: {
          inputs: Array.from({ length: 5001 }, (_, i) => ({
            key: String(i),
            blocks: [],
          })),
        },
        images: [],
      }),
    /count-limit/,
  );
});
test("readback catches literal mutation independently", () => {
  const p = {
    request: {
      authoring: {
        inputs: [
          { key: "x", blocks: [{ kind: "paragraph", text: "0.73 ms" }] },
        ],
      },
    },
  };
  const receipt = {
      revision: "a",
      inputs: [{ key: "x", targets: [{ path: [1] }] }],
    },
    snapshot = {
      revision: "a",
      nodes: [{ path: [1], type: "paragraph", text: "0.74 ms" }],
    };
  assert.equal(verifyNative(p, receipt, snapshot).mismatches.length, 1);
});

test("LSR confirmed bad formula is flagged; first two have no suspicion (not correctness)", () => {
  const p = makePlan(original);
  assert.deepEqual(
    p.formulaReview.map((f) => f.suspicious),
    [false, false, true],
  );
  assert.deepEqual(p.formulaReview[2].reasons, ["prose-inside-formula"]);
});
test("missing image is reported, malformed image refused, rich inline reported", () => {
  const b = copy();
  delete b.doc.pictures[0].image;
  assert(
    makePlan(b).losses.some((l) => l.reasonCode === "picture-image-missing"),
  );
  b.doc.pictures[0].image = { uri: "data:image/png;base64,broken" };
  assert.throws(() => makePlan(b), /invalid-image/);
});

test("invalid heading degrades with loss; unknown roles stay literal; explicit furniture only", () => {
  const b = copy(),
    n = b.doc.texts.find((n) => n.label === "section_header");
  n.level = 12;
  let p = makePlan(b);
  assert(p.losses.some((l) => l.reasonCode === "heading-level"));
  n.label = "unknown-role";
  p = makePlan(b);
  assert(p.losses.some((l) => l.reasonCode === "role-as-paragraph"));
  n.label = "page_footer";
  p = makePlan(b);
  assert.equal(
    p.items.find((i) => i.selfRef === n.self_ref).disposition,
    "furniture",
  );
});
test("merged cells have full selectors and captions contribute to figure block", () => {
  const p = makePlan(original);
  assert(p.items.some((i) => i.cells?.some((c) => c.selectors.length > 1)));
  for (const n of original.doc.pictures)
    for (const c of n.captions) {
      assert.deepEqual(
        p.items.find((i) => i.selfRef === c.$ref).links,
        p.items.find((i) => i.selfRef === n.self_ref).links,
      );
    }
});

test("readback checks list start, code language and fixed enumerator", () => {
  const plan = {
    request: {
      authoring: {
        inputs: [
          {
            key: "list",
            blocks: [
              { kind: "list", ordered: true, start: 7, items: ["7 ms"] },
            ],
          },
          {
            key: "code",
            blocks: [{ kind: "code", language: "python", code: "x=1" }],
          },
          {
            key: "eq",
            blocks: [{ kind: "equation", latex: "x=1", enumerator: "A.1" }],
          },
        ],
      },
    },
  };
  const receipt = {
    revision: "a",
    inputs: plan.request.authoring.inputs.map((i, k) => ({
      key: i.key,
      targets: [{ path: [k + 1] }],
    })),
  };
  const snapshot = {
    revision: "a",
    nodes: [
      {
        path: [1],
        type: "list",
        ordered: true,
        start: 8,
        items: [{ content: [{ text: "7 ms" }] }],
      },
      { path: [2], type: "code", code: "x=1", language: "javascript" },
      { path: [3], type: "equation", latex: "x=1", enumerator: "A.2" },
    ],
  };
  assert.deepEqual(
    verifyNative(plan, receipt, snapshot).mismatches.map((m) => m.field),
    ["list-start", "code-language", "enumerator"],
  );
});
