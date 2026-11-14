import { repoPath } from "./paths.js";
import { inlineText } from "../src/rich-content.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { extractPdf } from "../src/pdf-evidence.js";
import { makePlan, hash } from "../src/convert.js";
import { buildProvenance, publishHandoff } from "../src/provenance.js";
import { projectEdit } from "../src/correction-history.js";
export async function syntheticGeneration(
  out,
  { header = false, text = "999", neighborText } = {},
) {
  const pdf = await readFile(
      repoPath("fixtures/lsr-1.1/LSR-1.1-standards.pdf"),
    ),
    evidence = await extractPdf(pdf);
  const page = evidence.pages.find((p) =>
    p.items.some((i) => i.text === "0.12 s"),
  );
  const bbox = page.items.find((i) => i.text === "0.12 s").bbox;
  const cell = {
    text,
    row_span: 1,
    col_span: 1,
    start_row_offset_idx: 0,
    end_row_offset_idx: 1,
    start_col_offset_idx: 0,
    end_col_offset_idx: 1,
    column_header: header,
    row_header: false,
    row_section: false,
    bbox: {
      l: bbox[0] - 1,
      t: bbox[1] - 1,
      r: bbox[2] + 1,
      b: bbox[3] + 1,
      coord_origin: "TOPLEFT",
    },
  };
  const doc = {
    schema_name: "DoclingDocument",
    version: "1.10.0",
    body: { self_ref: "#/body", children: [{ $ref: "#/tables/0" }] },
    furniture: {
      self_ref: "#/furniture",
      children: [],
      content_layer: "furniture",
    },
    texts: [],
    groups: [],
    pictures: [],
    tables: [
      {
        self_ref: "#/tables/0",
        parent: { $ref: "#/body" },
        children: [],
        label: "table",
        prov: [{ page_no: page.pageNo, bbox: cell.bbox }],
        data: { num_rows: 1, num_cols: 1, table_cells: [cell] },
      },
    ],
    pages: Object.fromEntries(
      evidence.pages.map((p) => [
        p.pageNo,
        { page_no: p.pageNo, size: { width: p.width, height: p.height } },
      ]),
    ),
  };
  if (neighborText !== undefined) {
    const neighbor = structuredClone(doc.tables[0]);
    neighbor.self_ref = "#/tables/1";
    neighbor.data.table_cells[0].text = neighborText;
    doc.tables.push(neighbor);
    doc.body.children.push({$ref:neighbor.self_ref});
  }
  const raw = JSON.stringify(doc),
    record = {
      source: { sha256: hash(pdf), bytes: pdf.length },
      document: {
        sha256: hash(raw),
        version: "1.10.0",
        schema: "DoclingDocument",
        page_count: evidence.pages.length,
      },
      actual_request: {},
      task: { task_status: "success" },
      result: { status: "success", errors: [] },
    };
  const source = {
    doclingSha256: hash(raw),
    pdfSha256: hash(pdf),
    recordSha256: hash(JSON.stringify(record)),
  };
  const plan = makePlan({ doc, record, source });
  plan.generationId = "11111111-1111-4111-8111-111111111111";
  const revision = hash("fake native document"),
    receipt = {
      revision,
      inputs: plan.request.authoring.inputs.map((i, index) => ({
        key: i.key,
        targets: [{ path: [index + 1], documentRevision: revision }],
      })),
    };
  const snapshot = {
    ok: true,
    revision,
    nodes: doc.tables.flatMap((table,index) => {
      const value=table.data.table_cells[0].text;
      return [{type:"table",path:[index+1]}, {type:"cell",path:[index+1,0,0],text:value,content:value ? [{kind:"text",text:value}] : []}];
    }),
  };
  const items = plan.items.map((i) => ({
    ...i,
    targets: i.links.flatMap((l) =>
      receipt.inputs
        .find((r) => r.key === l.key)
        .targets.map((t) => ({ ...t, selector: l.selector, role: l.role })),
    ),
    cells: i.cells?.map((c) => ({
      ...c,
      targets: c.selectors.map((selector) => ({
        ...receipt.inputs.find((row)=>row.key === i.links[0].key).targets[0],
        selector,
      })),
    })),
  }));
  const p = buildProvenance(plan, items, snapshot, receipt, doc);
  await mkdir(out);
  await mkdir(join(out, "source"));
  for (const [name, bytes] of [
    ["document.md", "fake native document"],
    ["source/source.pdf", pdf],
    ["source/document.json", raw],
    ["source/conversion-record.json", JSON.stringify(record)],
    ["snapshot.json", JSON.stringify(snapshot)],
    ["receipt.json", JSON.stringify(receipt)],
  ])
    await writeFile(join(out, name), bytes);
  await publishHandoff(out, p);
}
export async function fakeCli(out, initialSnapshot, { stableContent = false } = {}) {
  let snapshot = initialSnapshot
    ? structuredClone(initialSnapshot)
    : JSON.parse(await readFile(join(out, "snapshot.json")));
  return async (command, args) => {
    if (command === "inspect") return structuredClone(snapshot);
    if (command !== "apply-batch") throw new Error("unexpected-command");
    const ops = JSON.parse(
      await readFile(args[args.indexOf("--operations") + 1]),
    );
    if (args[args.indexOf("--if-revision") + 1] !== snapshot.revision)
      throw new Error("revision-conflict");
    const op = ops[0],
      p = op.path.split(",").map(Number),
      target = { kind: "cell", path: [p[0]], row: p[1], column: p[2] };
    const before = snapshot.nodes.find(
      (n) => JSON.stringify(n.path) === JSON.stringify(p),
    ).text;
    let bytes = JSON.stringify(ops), revision = hash(bytes);
    snapshot = projectEdit(
      snapshot,
      target,
      before,
      op.text ?? inlineText(op.content),
      revision,
      op.content,
      snapshot.nodes.find((n) => JSON.stringify(n.path) === JSON.stringify(p))
        .content,
    );
    if (stableContent) {
      bytes = JSON.stringify(snapshot.nodes);
      revision = hash(bytes);
      snapshot.revision = revision;
    }
    await writeFile(join(out, "document.md"), bytes);
    return { ok: true, command: "apply-batch", applied: 1, revision };
  };
}
