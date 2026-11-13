import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, cp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { extractPdf } from "../src/pdf-evidence.js";
import { protectedTokens, difference } from "../src/tokens.js";
import { schemas, validateSchema } from "../src/schema.js";
import { detectReview } from "../src/detection.js";
import { loadHandoff } from "../src/provenance.js";
import { createReview, readReview, validateReview } from "../src/review.js";
import { evaluate } from "./evaluate-detection.js";
const corpus = process.env.DOCLING_DETECTION_CORPUS;
const fixtureFile = fileURLToPath(
  new URL("../../../fixtures/lsr-1.1/LSR-1.1-standards.pdf", import.meta.url),
);
test("numeric and unit lexer preserves important glyphs, zeroes and case; ignores prose hyphen", () => {
  assert.notDeepEqual(
    protectedTokens("−0.10 ms ≤ 10").map((t) => t.value),
    protectedTokens("-0.1 s < 10").map((t) => t.value),
  );
  assert.equal(protectedTokens("platform-driven").length, 0);
  assert.deepEqual(
    difference(protectedTokens("0.73 ms"), protectedTokens("0.74 s")),
    { missing: ["0.73", "ms"], extra: ["0.74", "s"] },
  );
});
test("vendored text-only reader has no install-time dependency, matches fixed PDF and outline", async () => {
  const e = await extractPdf(await readFile(fixtureFile));
  validateSchema(e, schemas["pdf-evidence"]);
  assert.equal(e.reader.version, "6.5.438");
  assert.equal(e.pages.length, 13);
  assert.equal(e.outline.status, "present");
  assert(e.pages[0].tokens.some((t) => t.value === "1.1"));
  assert(
    e.pages.every((p) => p.tokens.every((t) => t.bbox.every(Number.isFinite))),
  );
});
test(
  "known problems, six injected error families and oracle controls",
  { skip: !corpus },
  async () => {
    const e = await evaluate(corpus);
    assert(e.mutations.every((m) => m.detected));
    assert(
      e.mutations
        .filter((m) => m.kind !== "furniture-added")
        .every((m) => m.independentPdfDetected),
    );
    assert.equal(e.controls.count, 21);
    assert.equal(e.controls.falsePositives, 0);
    assert(e.known.formula3);
    assert.equal(e.known.captionOrderConflicts, 0); // Linked native captions replace trailing prose.
    assert.equal(e.known.firstTwoFormulaFalseAlarms, 0);
    assert(e.known.mergedTables.every((t) => t.flagged));
    assert(e.known.fourMissingNumericCells.every((c) => c.flagged));
    assert(e.known.knownBlankGapFalsePositive);
    assert.equal(e.known.falseFurnitureOnUnchanged, 0);
  },
);
test(
  "report schema, input binding and every finding/page/group/series stay complete",
  { skip: !corpus },
  async () => {
    for (const name of ["lsr", "no-bookmarks", "nist"]) {
      const { report, evidence } = await readReview(
        join(corpus, name),
        join(corpus, name + "-review"),
      );
      const h = await loadHandoff(join(corpus, name));
      validateReview(report, h, evidence);
      if (name !== "nist")
        assert.equal(
          report.findings.filter((f) => f.kind === "formula-review-required")
            .length,
          3,
        );
      assert(
        report.groups.every(
          (g) =>
            g.pageNos.length <= 3 &&
            (!g.pageNos.length || g.pageNos.at(-1) - g.pageNos[0] <= 2),
        ),
      );
      assert.equal(
        new Set(report.groups.flatMap((g) => g.findingIds)).size,
        report.findings.length,
      );
      if (name === "no-bookmarks")
        assert(report.findings.some((f) => f.kind === "heading-basis-low"));
      if (name === "lsr")
        assert(!report.findings.some((f) => f.kind === "heading-basis-low"));
      for (const change of [
        (r) => (r.schemaVersion = "2.0.0"),
        (r) => (r.documentRevision = "0".repeat(64)),
        (r) => r.groups[0].findingIds.push("absent"),
        (r) => r.statistics.groups++,
        (r) => (r.groups[0].priority = "low"),
        (r) => (r.findings[0].evidence = {}),
        (r) => (r.findings[0].regions[0].pageNo = 99),
      ]) {
        const r = structuredClone(report);
        change(r);
        assert.throws(() => validateReview(r, h, evidence));
      }
    }
  },
);
test(
  "reader refuses changed report and exclusive generation refuses an existing review directory",
  { skip: !corpus },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "docling-pr3-tamper-"));
    console.log("Retained tamper test:", root);
    await cp(join(corpus, "lsr-review"), join(root, "review"), {
      recursive: true,
    });
    await writeFile(join(root, "review/review-targets.json"), "{}");
    await assert.rejects(
      readReview(join(corpus, "lsr"), join(root, "review")),
      /review-file-digest/,
    );
    await assert.rejects(
      createReview(join(corpus, "lsr"), join(root, "review")),
      /EEXIST/,
    );
  },
);
test(
  "missing native row cell and sentence-like prose mislabelled as picture yield candidates",
  { skip: !corpus },
  async () => {
    const h = await loadHandoff(join(corpus, "lsr")),
      doc = JSON.parse(
        await readFile(join(corpus, "lsr/source/document.json")),
      ),
      evidence = JSON.parse(
        await readFile(join(corpus, "lsr-review/pdf-evidence.json")),
      );
    const snapshot = structuredClone(h.snapshot);
    const index = snapshot.nodes.findIndex(
      (n) => n.type === "cell" && n.path.at(-2) === 1,
    );
    snapshot.nodes.splice(index, 1);
    snapshot.revision = "f".repeat(64);
    assert(
      detectReview({ handoff: h, doc, evidence, snapshot }).findings.some(
        (f) => f.kind === "table-row-width",
      ),
    );
    const d = structuredClone(doc),
      item = h.provenance.items.find(
        (i) =>
          i.label === "text" &&
          i.sourceText.split(/\s+/).length >= 40 &&
          (i.sourceText.match(/\./g) ?? []).length >= 2,
      );
    d.texts[Number(item.selfRef.split("/").at(-1))].label = "picture";
    const result = detectReview({ handoff: h, doc: d, evidence });
    assert(
      result.findings.some(
        (f) =>
          f.kind === "picture-prose-suspect" &&
          f.sourceIds.includes(item.sourceId),
      ),
    );
  },
);

import { hash } from "../src/convert.js";
import { formulaHints } from "../src/formula.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test("vendor bytes and versions match pinned manifest", async () => {
  const root = new URL("../vendor/pdfjs/", import.meta.url),
    m = JSON.parse(await readFile(new URL("manifest.json", root)));
  assert.equal(m.version, "6.5.438");
  for (const f of m.files)
    assert.equal(hash(await readFile(new URL(f.path, root))), f.sha256, f.path);
});
test("portable copied artifact extracts PDF in a fresh Node process without npm install", async () => {
  const root = await mkdtemp(join(tmpdir(), "docling-pr3-portable-"));
  console.log("Retained portable artifact:", root);
  for (const dir of ["src", "schema", "vendor"])
    await cp(new URL("../" + dir + "/", import.meta.url), join(root, dir), {
      recursive: true,
    });
  await writeFile(join(root, "package.json"), '{"type":"module"}');
  const script = `import{extractPdf}from${JSON.stringify(pathToFileURL(join(root, "src/pdf-evidence.js")).href)};import{readFile}from'node:fs/promises';const e=await extractPdf(await readFile(${JSON.stringify(fixtureFile)}));console.log(JSON.stringify({pages:e.pages.length,reader:e.reader.version}));`;
  const result = await promisify(execFile)(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: root,
      env: { ...process.env, NODE_PATH: "" },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), {
    pages: 13,
    reader: "6.5.438",
  });
});
test("plausible wrong math without prose is not falsely declared verified", () => {
  const value = "\\Theta = \\sqrt{\\sum_{j=2}^{3} b_j^3}";
  const hint = formulaHints(value);
  assert.equal(hint.suspicious, false);
  assert.equal(hint.correctness, "not evaluated");
});

test(
  "missing cell bbox and rotated pages are explicitly not compared",
  { skip: !corpus },
  async () => {
    const h = await loadHandoff(join(corpus, "lsr")),
      doc = JSON.parse(
        await readFile(join(corpus, "lsr/source/document.json")),
      ),
      evidence = JSON.parse(
        await readFile(join(corpus, "lsr-review/pdf-evidence.json")),
      );
    const table = h.provenance.items.find((i) => i.selfRef === "#/tables/2");
    table.cells[10].sourceCell.bbox = null;
    doc.tables[2].data.table_cells[10].bbox = null;
    let r = detectReview({ handoff: h, doc, evidence });
    assert(
      r.checks.some(
        (c) =>
          c.sourceId === table.sourceId &&
          c.selectorKey === "cell:10" &&
          c.status === "unavailable",
      ),
    );
    const rotated = structuredClone(evidence);
    rotated.pages[0].rotation = 90;
    r = detectReview({ handoff: h, doc, evidence: rotated });
    assert(
      r.findings.some(
        (f) => f.kind === "geometry-unavailable" && f.regions[0].pageNo === 1,
      ),
    );
  },
);
