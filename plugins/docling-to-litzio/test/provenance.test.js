import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash, makePlan } from "../src/convert.js";
import { schemas, validateSchema } from "../src/schema.js";
import {
  buildProvenance,
  validateEvidence,
  publishHandoff,
  loadHandoff,
  currentTargets,
} from "../src/provenance.js";
import { auditSourceNative } from "../src/source-audit.js";
const root = await mkdtemp(join(tmpdir(), "docling-pr2-unit-"));
console.log("Retained unit directory:", root);
let seq = 0;
async function fixture() {
  const out = join(root, String(seq++));
  await mkdir(out);
  await mkdir(join(out, "source"));
  const cell = {
    text: "0.73 ms",
    row_span: 1,
    col_span: 2,
    start_row_offset_idx: 0,
    end_row_offset_idx: 1,
    start_col_offset_idx: 0,
    end_col_offset_idx: 2,
    column_header: true,
    row_header: false,
    row_section: false,
    bbox: null,
  };
  const doc = {
    schema_name: "DoclingDocument",
    version: "1.10.0",
    body: {
      self_ref: "#/body",
      children: [{ $ref: "#/texts/0" }, { $ref: "#/tables/0" }],
    },
    furniture: {
      self_ref: "#/furniture",
      children: [],
      content_layer: "furniture",
    },
    groups: [],
    pictures: [],
    texts: [
      {
        self_ref: "#/texts/0",
        parent: { $ref: "#/body" },
        children: [],
        label: "text",
        text: "1.2 ms ≤ 10",
        orig: "1.2 ms ≤ 10",
        prov: [
          {
            page_no: 1,
            bbox: { l: 1, t: 1, r: 90, b: 10, coord_origin: "TOPLEFT" },
            charspan: [0, 12],
          },
        ],
      },
    ],
    tables: [
      {
        self_ref: "#/tables/0",
        parent: { $ref: "#/body" },
        children: [],
        label: "table",
        prov: [
          {
            page_no: 1,
            bbox: { l: 1, t: 11, r: 90, b: 20, coord_origin: "TOPLEFT" },
          },
        ],
        data: { num_rows: 1, num_cols: 2, table_cells: [cell] },
      },
    ],
    pages: { 1: { page_no: 1, size: { width: 100, height: 100 } } },
  };
  const pdf = Buffer.from("%PDF-unit-fixture"),
    raw = Buffer.from(JSON.stringify(doc)),
    record = {
      source: { sha256: hash(pdf), bytes: pdf.length },
      document: {
        sha256: hash(raw),
        version: "1.10.0",
        schema: "DoclingDocument",
        page_count: 1,
      },
      actual_request: {},
      task: { task_status: "success" },
      result: { status: "success", errors: [] },
    };
  const plan = makePlan({
    doc,
    record,
    source: {
      doclingSha256: hash(raw),
      pdfSha256: hash(pdf),
      recordSha256: hash(JSON.stringify(record)),
    },
  });
  plan.generationId = "11111111-1111-4111-8111-111111111111";
  const revision = hash("native document fixture"),
    receipt = {
      revision,
      inputs: plan.request.authoring.inputs.map((i, index) => ({
        key: i.key,
        targets: [
          {
            path: [index + 1],
            documentRevision: revision,
            documentHash: revision,
          },
        ],
      })),
    };
  const snapshot = {
    revision,
    nodes: [
      { type: "paragraph", path: [1], text: doc.texts[0].text },
      { type: "table", path: [2] },
      { type: "cell", path: [2, 0, 0], text: cell.text },
      { type: "cell", path: [2, 0, 1], text: cell.text },
    ],
  };
  const items = plan.items.map((i) => ({
    ...i,
    targets: i.links.flatMap((l) =>
      receipt.inputs
        .find((r) => r.key === l.key)
        .targets.map((t) => ({ ...t, selector: l.selector })),
    ),
    cells: i.cells?.map((c) => ({
      ...c,
      targets: receipt.inputs
        .find((r) => r.key === i.links[0].key)
        .targets.flatMap((t) =>
          c.selectors.map((selector) => ({ ...t, selector })),
        ),
    })),
  }));
  const p = buildProvenance(plan, items, snapshot, receipt, doc);
  await writeFile(join(out, "document.md"), "native document fixture");
  await writeFile(join(out, "source/source.pdf"), pdf);
  await writeFile(join(out, "source/document.json"), raw);
  await writeFile(
    join(out, "source/conversion-record.json"),
    JSON.stringify(record),
  );
  for (const [name, data] of [
    ["snapshot.json", snapshot],
    ["receipt.json", receipt],
  ])
    await writeFile(join(out, name), JSON.stringify(data));
  await publishHandoff(out, p);
  return { out, p, doc, record, snapshot, receipt };
}
async function mutate(f, change) {
  const p = JSON.parse(await readFile(join(f.out, "provenance.json")));
  change(p);
  await writeFile(join(f.out, "provenance.json"), JSON.stringify(p));
  const marker = JSON.parse(await readFile(join(f.out, "complete.json")));
  marker.files.find((f) => f.relativePath === "provenance.json").sha256 = hash(
    JSON.stringify(p),
  );
  await writeFile(join(f.out, "complete.json"), JSON.stringify(marker));
}
test("v1 schemas validate; coverage complete; generated is never reviewed", async () => {
  const f = await fixture();
  assert.deepEqual((await loadHandoff(f.out)).coverage, {
    sourceItems: 4,
    blocks: 2,
    cells: 1,
    assets: 0,
  });
  await assert.rejects(
    loadHandoff(f.out, { requireReviewed: true }),
    /review-unavailable/,
  );
});
test("unknown schema/version/field and invalid target reject", async () => {
  const f = await fixture();
  for (const change of [
    (p) => (p.schemaVersion = "2.0.0"),
    (p) => (p.extra = true),
    (p) => (p.items[2].targets[0].bindingState = "guess"),
    (p) =>
      (p.items[2].targets[0].selector = {
        kind: "cell",
        row: -1,
        column: 0,
        rowSpan: 1,
        columnSpan: 1,
      }),
  ]) {
    const p = structuredClone(f.p);
    change(p);
    assert.throws(
      () => validateSchema(p, schemas.provenance),
      /schema-invalid/,
    );
  }
});
test("missing/truncated marker and changed document reject", async () => {
  const f = await fixture();
  await rename(join(f.out, "complete.json"), join(f.out, "saved.json"));
  await assert.rejects(loadHandoff(f.out));
  await writeFile(join(f.out, "complete.json"), "{");
  await assert.rejects(loadHandoff(f.out));
  await rename(join(f.out, "saved.json"), join(f.out, "complete.json"));
  await writeFile(join(f.out, "document.md"), "human correction");
  await assert.rejects(loadHandoff(f.out), /file-digest/);
  assert.equal(
    await readFile(join(f.out, "document.md"), "utf8"),
    "human correction",
  );
});
test("wrong source digest, foreign document revision, generation, missing file reject", async () => {
  for (const change of [
    (p) => (p.source.pdf.sha256 = "0".repeat(64)),
    (p) => (p.document.revision = "1".repeat(64)),
    (p) => (p.generationId = "22222222-2222-4222-8222-222222222222"),
  ]) {
    const f = await fixture();
    await mutate(f, change);
    await assert.rejects(loadHandoff(f.out));
  }
  const f = await fixture();
  await rename(
    join(f.out, "source/source.pdf"),
    join(f.out, "source/moved.pdf"),
  );
  await assert.rejects(loadHandoff(f.out));
});
test("semantic validator rejects omitted inventory, uncovered block and out-of-page coordinates", async () => {
  const f = await fixture();
  for (const change of [
    (p) => p.items.pop(),
    (p) => p.items.push(p.items[0]),
    (p) => {
      p.items.find((i) => i.disposition === "mapped").targets = [];
    },
    (p) => (p.items.find((i) => i.regions.length).regions[0].bbox[2] = 101),
    (p) =>
      (p.items.find((i) => i.targets.length).targets[0].documentRevision =
        "0".repeat(64)),
    (p) =>
      (p.items.find((i) => i.cells.length).cells[0].targets[0].selector.column =
        5),
  ]) {
    const p = structuredClone(f.p);
    change(p);
    assert.throws(() =>
      validateEvidence(p, f.doc, f.record, f.snapshot, f.receipt),
    );
  }
});
test("uncertain binding is readable draft but cannot supply current source targets", async () => {
  const f = await fixture();
  await mutate(f, (p) => {
    p.items.find((i) => i.targets.length).targets[0].bindingState = "uncertain";
  });
  const item = (await loadHandoff(f.out)).provenance.items.find(
    (i) => i.targets.length,
  );
  assert.throws(() => currentTargets(item), /uncertain-binding/);
});
test("source cell span stays independent of repeated versus one range target", async () => {
  const f = await fixture();
  const cell = f.p.items.find((i) => i.cells.length).cells[0];
  assert.equal(cell.targets.length, 2);
  const sourceId = cell.sourceId;
  cell.targets = [
    {
      ...cell.targets[0],
      selector: { kind: "cell", row: 0, column: 0, rowSpan: 1, columnSpan: 2 },
    },
  ];
  validateSchema(f.p, schemas.provenance);
  validateEvidence(f.p, f.doc, f.record, f.snapshot, f.receipt);
  assert.equal(cell.sourceId, sourceId);
});
test("independent source-native audit detects damage already wrong against an oracle", async () => {
  const f = await fixture();
  f.doc.texts[0].text = "already extracted wrong: 0.74 ms";
  const p = structuredClone(f.p);
  p.items.find((i) => i.selfRef === "#/texts/0").sourceText =
    f.doc.texts[0].text;
  const changed = structuredClone(f.snapshot);
  changed.nodes[0].text = "further damaged: 0.75 ms";
  assert.equal(auditSourceNative(f.doc, p, changed).mismatches.length, 1);
  changed.nodes[0].text = f.doc.texts[0].text;
  assert.equal(auditSourceNative(f.doc, p, changed).mismatches.length, 0);
});
test("manifest traversal and duplicate file reject even after marker rewrite", async () => {
  const f = await fixture();
  const m = JSON.parse(await readFile(join(f.out, "complete.json")));
  m.files.push(m.files[0]);
  await writeFile(join(f.out, "complete.json"), JSON.stringify(m));
  await assert.rejects(loadHandoff(f.out), /duplicate-file/);
  m.files[0].relativePath = "../outside";
  await writeFile(join(f.out, "complete.json"), JSON.stringify(m));
  await assert.rejects(loadHandoff(f.out), /schema-invalid/);
});

test("coordinates matching source still reject outside page bounds", async () => {
  const f = await fixture();
  const p = structuredClone(f.p),
    doc = structuredClone(f.doc);
  doc.texts[0].prov[0].bbox.r = 101;
  const region = p.items.find((i) => i.selfRef === "#/texts/0").regions[0];
  region.bbox[2] = 101;
  region.original.bbox.r = 101;
  assert.throws(
    () => validateEvidence(p, doc, f.record, f.snapshot, f.receipt),
    /bounds/,
  );
});
test("semantic equality does not depend on JSON property order", async () => {
  const f = await fixture();
  const p = JSON.parse(
    JSON.stringify(f.p, (k, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).reverse())
        : v,
    ),
  );
  validateEvidence(p, f.doc, f.record, f.snapshot, f.receipt);
});
