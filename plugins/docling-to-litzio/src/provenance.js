import {
  completionGate,
  lossCatalog,
  expressionReviews,
} from "./human-review.js";
import { validateReview } from "./review.js";
import {
  validateHistory,
  validateCorrectionLedger,
  verifyCorrectionEvidence,
} from "./correction-history.js";
import { listText } from "./rich-content.js";
import { projectList } from "./list-rule.js";
import { projectTable, sourceStructure } from "./table-rule.js";
import { isDeepStrictEqual } from "node:util";
import { auditSourceNative } from "./source-audit.js";
import { readFile, lstat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hash, validate, regions } from "./convert.js";
import { schemas, validateSchema } from "./schema.js";
const equal = isDeepStrictEqual;
const need = (condition, code) => {
  if (!condition) throw new Error(`handoff-${code}`);
};
export const relativePath = (p) => p.replace(/^\.\//, "").replaceAll("\\", "/");
export function textAt(snapshot, path, selector = { kind: "block" }) {
  const n = snapshot.nodes.find((n) => equal(n.path, path));
  need(n, "target-missing");
  if (selector.kind === "cell")
    return (
      snapshot.nodes.find(
        (c) =>
          c.type === "cell" &&
          equal(c.path, [...path, selector.row, selector.column]),
      )?.text ?? null
    );
  if (selector.kind === "list-item")
    return n.items?.[selector.index]
      ? listText({ items: [n.items[selector.index]] })
      : null;
  return (
    n.text ??
    n.latex ??
    n.code ??
    (n.type === "figure"
      ? (snapshot.nodes.find(
          (c) => c.type === "caption" && c.path[0] === path[0],
        )?.text ?? "")
      : null)
  );
}
export function buildProvenance(plan, items, snapshot, receipt, doc) {
  const target = (t, selector) => ({
    role: t.role ?? "content",
    path: t.path,
    documentRevision: t.documentRevision,
    bindingState: t.bindingState ?? "current",
    selector:
      selector ??
      (t.selector?.listItem !== undefined
        ? { kind: "list-item", index: t.selector.listItem }
        : { kind: "block" }),
    text: textAt(
      snapshot,
      t.path,
      selector ??
        (t.selector?.listItem !== undefined
          ? { kind: "list-item", index: t.selector.listItem }
          : { kind: "block" }),
    ),
  });
  const normalized = items.map((i) => ({
    sourceId: i.sourceId,
    selfRef: i.selfRef,
    label: i.label ?? "",
    structure:
      i.structure ??
      sourceStructure(
        i.selfRef
          .slice(2)
          .split("/")
          .reduce((o, k) => o[k], doc),
      ),
    sourceText: i.sourceText,
    originalText: i.originalText,
    reviewState: "unreviewed",
    regions: i.regions.map((r) => ({
      pageNo: r.pageNo,
      bbox: r.bbox,
      unit: r.unit,
      origin: r.origin,
      original: r.original,
    })),
    disposition: i.targets.length ? "mapped" : i.disposition,
    targets: i.targets.map((t) => target(t)),
    cells: (
      i.cells ??
      (
        i.selfRef
          .slice(2)
          .split("/")
          .reduce((o, k) => o[k], doc).data?.table_cells ?? []
      ).map((sourceCell, cellIndex) => ({
        sourceId: hash(
          `${plan.source.doclingSha256}:${i.selfRef}:${cellIndex}`,
        ),
        cellIndex,
        sourceCell,
        targets: [],
      }))
    ).map((c) => ({
      sourceId: c.sourceId,
      cellIndex: c.cellIndex,
      sourceCell: c.sourceCell,
      regionPrecision: "table",
      targets: c.targets.map((t) =>
        target(t, {
          kind: "cell",
          row: t.selector.row,
          column: t.selector.column,
          rowSpan: 1,
          columnSpan: 1,
        }),
      ),
    })),
    losses: i.losses.map((l) => ({
      sourceId: i.sourceId,
      category: l.category,
      reasonCode: l.reasonCode,
      severity: l.severity,
      resolution: l.resolution,
      originalValue: l.originalValue ?? null,
      targets: i.targets.map((t) => target(t)),
    })),
  }));
  const assets = new Map();
  for (const i of items)
    if (i.asset) {
      const p = relativePath(i.asset.relativePath);
      if (!assets.has(p))
        assets.set(p, {
          relativePath: p,
          sha256: i.asset.sha256,
          sourceIds: [],
        });
      assets.get(p).sourceIds.push(i.sourceId);
    }
  const provenance = {
    schemaVersion: "1.0.0",
    generationId: plan.generationId,
    generatorVersion: plan.generatorVersion,
    rulesVersion: plan.rulesVersion,
    reviewState: "unreviewed",
    diagnostics: plan.diagnostics,
    source: {
      pdf: { relativePath: "source/source.pdf", sha256: plan.source.pdfSha256 },
      docling: {
        relativePath: "source/document.json",
        sha256: plan.source.doclingSha256,
      },
      conversionRecord: {
        relativePath: "source/conversion-record.json",
        sha256: plan.source.recordSha256,
      },
      documentSchemaVersion: "1.10.0",
    },
    document: {
      relativePath: "document.md",
      revision: receipt.revision,
      blocks: snapshot.nodes
        .filter((n) => n.path.length === 1 && n.type !== "caption")
        .map((n) => ({
          path: n.path,
          kind: n.type,
          text: textAt(snapshot, n.path),
        })),
    },
    pages: Object.values(doc.pages).map((p) => ({
      pageNo: p.page_no,
      width: p.size.width,
      height: p.size.height,
      rotation: null,
      printedLabel: null,
      unit: "pt",
      origin: "TOPLEFT",
    })),
    items: normalized,
    assets: [...assets.values()],
  };
  validateSchema(provenance, schemas.provenance);
  return provenance;
}
export async function readRelative(root, path) {
  validateSchema(
    path,
    schemas.provenance.properties.source.properties.pdf.properties.relativePath,
  );
  need(!(await lstat(root)).isSymbolicLink(), "root-symlink");
  for (const [index, part] of path.split("/").entries()) {
    need(part.length > 0, "path");
    const stat = await lstat(
      join(root, ...path.split("/").slice(0, index + 1)),
    );
    need(!stat.isSymbolicLink(), "symlink");
    need(
      index === path.split("/").length - 1 ? stat.isFile() : stat.isDirectory(),
      "file-kind",
    );
  }
  return readFile(join(root, path));
}
export function validateEvidence(p, doc, record, snapshot, receipt) {
  validateSchema(p, schemas.provenance);
  const nodes = validate(doc, record);
  need(p.items.length === nodes.size, "inventory-count");
  need(
    new Set(p.items.map((i) => i.selfRef)).size === nodes.size,
    "inventory-duplicate",
  );
  need(p.source.documentSchemaVersion === doc.version, "source-schema");
  need(
    p.document.revision === snapshot.revision &&
      p.document.revision === receipt.revision,
    "revision",
  );
  const blocks = snapshot.nodes
    .filter((n) => n.path.length === 1 && n.type !== "caption")
    .map((n) => ({
      path: n.path,
      kind: n.type,
      text: textAt(snapshot, n.path),
    }));
  need(equal(p.document.blocks, blocks), "block-inventory");
  need(
    equal(
      p.pages,
      Object.values(doc.pages).map((v) => ({
        pageNo: v.page_no,
        width: v.size.width,
        height: v.size.height,
        rotation: null,
        printedLabel: null,
        unit: "pt",
        origin: "TOPLEFT",
      })),
    ),
    "pages",
  );
  const ids = new Set(),
    covered = new Set();
  const checkTarget = (t) => {
    need(t.documentRevision === p.document.revision, "target-revision");
    need(
      blocks.some((b) => equal(b.path, t.path)),
      "target-block",
    );
    need(
      t.bindingState !== "current" ||
        t.text === textAt(snapshot, t.path, t.selector),
      "target-text",
    );
    if (t.selector.kind === "cell") {
      const n = snapshot.nodes.find((n) => equal(n.path, t.path));
      need(n.type === "table", "cell-kind");
      for (let r = t.selector.row; r < t.selector.row + t.selector.rowSpan; r++)
        for (
          let c = t.selector.column;
          c < t.selector.column + t.selector.columnSpan;
          c++
        )
          need(
            snapshot.nodes.some(
              (n) => n.type === "cell" && equal(n.path, [...t.path, r, c]),
            ),
            "cell-range",
          );
    }
    if (t.selector.kind === "list-item")
      need(
        snapshot.nodes.find((n) => equal(n.path, t.path))?.items?.[
          t.selector.index
        ],
        "list-range",
      );
  };
  for (const i of p.items) {
    const n = nodes.get(i.selfRef);
    need(n, "inventory-ref");
    need(
      i.sourceId === hash(`${p.source.docling.sha256}:${i.selfRef}`),
      "source-id",
    );
    need(!ids.has(i.sourceId), "duplicate-id");
    ids.add(i.sourceId);
    need(
      i.sourceText === (n.text ?? null) &&
        i.originalText === (n.orig ?? null) &&
        i.label === (n.label ?? ""),
      "source-text",
    );
    const rawStructure = sourceStructure(n);
    for (const [key, value] of Object.entries(rawStructure))
      need(equal(i.structure[key], value), "source-structure");
    if (i.structure.listProjection) {
      const { rootSelfRef, indexPath } = i.structure.listProjection;
      const root = nodes.get(rootSelfRef);
      const expected =
        rootSelfRef === i.selfRef && n.label === "list_item"
          ? [0]
          : projectList(rootSelfRef, nodes, () => []).mappings.find(
              (m) => m.ref === i.selfRef,
            )?.indexPath;
      need(root && equal(indexPath, expected), "list-projection");
      const rootItem = p.items.find((v) => v.selfRef === rootSelfRef);
      need(
        i.targets.every(
          (t) =>
            t.selector.kind === "list-item" &&
            t.selector.index === indexPath[0] &&
            rootItem.targets.some((r) => equal(r.path, t.path)),
        ),
        "list-projection-target",
      );
    }
    if (i.structure.noteBinding) {
      const b = i.structure.noteBinding,
        call = nodes.get(b.sourceRef),
        prefix = /^(\d+|[a-z])\s+(\S[\s\S]*)$/.exec(n.text ?? "");
      need(
        n.label === "footnote" &&
          prefix?.[1] === b.marker &&
          b.label === "docling-note-" + i.selfRef.split("/").at(-1),
        "note-definition",
      );
      const text =
        b.cellIndex === null
          ? call?.text
          : call?.data?.table_cells[b.cellIndex]?.text;
      need(
        Number.isInteger(b.start) &&
          b.start >= 0 &&
          text?.slice(b.start, b.start + b.marker.length) === b.marker,
        "note-call-site",
      );
      const callItem = p.items.find((v) => v.selfRef === b.sourceRef);
      need(
        callItem?.structure.noteReferences?.some((v) => equal(v, b)),
        "note-reciprocal",
      );
      need(
        b.witness && p.pages.some((v) => v.pageNo === b.witness.pageNo),
        "note-witness",
      );
      need(
        snapshot.nodes.some(
          (v) => v.type === "footnote" && v.label === b.label,
        ),
        "note-native-definition",
      );
    }
    for (const b of i.structure.noteReferences ?? [])
      need(
        b.sourceRef === i.selfRef &&
          p.items.some((v) => equal(v.structure.noteBinding, b)),
        "note-reference",
      );
    if (n.data?.table_cells && i.disposition === "mapped") {
      const model = projectTable(n.data).model;
      need(equal(i.structure.tableModel, model), "table-model");
      const notes = i.targets.filter((t) => t.role === "explanation");
      need(
        model.note
          ? notes.length === 1 && notes[0].text === model.note
          : notes.length === 0,
        "table-explanation",
      );
      if (model.note)
        need(
          i.targets.some(
            (t) =>
              t.role === "content" &&
              t.path[0] + 1 === notes[0].path[0] &&
              snapshot.nodes.some(
                (n) => n.type === "table" && equal(n.path, t.path),
              ),
          ),
          "table-explanation-order",
        );
    }
    const expected = regions(n.prov ?? [], doc).map((r) => ({
      pageNo: r.pageNo,
      bbox: r.bbox,
      unit: r.unit,
      origin: r.origin,
      original: r.original,
    }));
    need(equal(i.regions, expected), "source-regions");
    for (const r of i.regions) {
      const page = p.pages.find((v) => v.pageNo === r.pageNo);
      need(
        page &&
          r.bbox[0] >= 0 &&
          r.bbox[1] >= 0 &&
          r.bbox[2] <= page.width &&
          r.bbox[3] <= page.height &&
          r.bbox[0] <= r.bbox[2] &&
          r.bbox[1] <= r.bbox[3],
        "bounds",
      );
    }
    need(
      i.disposition === "mapped"
        ? i.targets.length > 0
        : i.targets.length === 0,
      "disposition",
    );
    for (const t of i.targets) {
      checkTarget(t);
      covered.add(JSON.stringify(t.path));
    }
    need(
      i.cells.length === (n.data?.table_cells?.length ?? 0),
      "cell-inventory",
    );
    for (const [index, c] of i.cells.entries()) {
      need(
        c.cellIndex === index &&
          c.sourceId ===
            hash(`${p.source.docling.sha256}:${i.selfRef}:${index}`) &&
          equal(c.sourceCell, n.data.table_cells[index]),
        "source-cell",
      );
      need(
        i.disposition === "mapped"
          ? c.targets.length > 0
          : c.targets.length === 0,
        "cell-targets",
      );
      for (const t of c.targets) checkTarget(t);
    }
    for (const l of i.losses) {
      need(l.sourceId === i.sourceId, "loss-source");
      l.targets.forEach(checkTarget);
    }
  }
  need(
    blocks.every((b) => covered.has(JSON.stringify(b.path))),
    "unmapped-block",
  );
  const expectedAssets = snapshot.nodes
    .filter((n) => n.type === "figure" && n.imageUrl)
    .map((n) => relativePath(n.imageUrl));
  need(
    equal(
      [...new Set(expectedAssets)].sort(),
      p.assets.map((a) => a.relativePath).sort(),
    ),
    "asset-inventory",
  );
  for (const a of p.assets)
    need(
      a.sourceIds.length > 0 && a.sourceIds.every((id) => ids.has(id)),
      "asset-source",
    );
  return {
    sourceItems: p.items.length,
    blocks: blocks.length,
    cells: p.items.reduce((v, i) => v + i.cells.length, 0),
    assets: p.assets.length,
  };
}
export async function loadHandoff(
  root,
  { requireReviewed = false, reconciling = false } = {},
) {
  let ledgerRaw, ledger;
  try {
    ledgerRaw = await readRelative(root, "correction-ledger.json");
    ledger = JSON.parse(ledgerRaw);
    need(reconciling || !ledger.pending, "pending-reconcile");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const markerRaw = await readRelative(root, "complete.json"),
    marker = JSON.parse(markerRaw);
  const result = await validateFileSet(root, marker);
  if (result.history)
    validateCorrectionLedger(result.history, ledger, reconciling);
  if (ledgerRaw)
    need(
      equal(ledgerRaw, await readRelative(root, "correction-ledger.json")),
      "ledger-changed",
    );
  need(
    equal(await readRelative(root, "complete.json"), markerRaw),
    "marker-changed",
  );
  let reviewed = false;
  if (marker.schemaVersion === "1.2.0" && marker.reviewState === "reviewed") {
    const completion = JSON.parse(
      await readRelative(root, "human-review.json"),
    );
    validateSchema(completion, schemas["human-review"]);
    need(
      marker.files.some((f) => f.relativePath === "human-review.json"),
      "completion-file-required",
    );
    need(
      ["review/review-targets.json", "review/pdf-evidence.json"].every((name) =>
        marker.files.some((f) => f.relativePath === name),
      ),
      "completion-evidence-required",
    );
    const report = JSON.parse(
      await readRelative(root, "review/review-targets.json"),
    );
    const evidence = JSON.parse(
      await readRelative(root, "review/pdf-evidence.json"),
    );
    validateSchema(evidence, schemas["pdf-evidence"]);
    validateReview(report, result.baseline ?? result, evidence);
    need(
      report.evidenceFile.sha256 ===
        hash(await readRelative(root, "review/pdf-evidence.json")) &&
        report.inputs.provenanceSha256 ===
          marker.files.find((f) => f.relativePath === "provenance.json")
            .sha256 &&
        report.inputs.snapshotSha256 ===
          marker.files.find((f) => f.relativePath === "snapshot.json").sha256,
      "completion-evidence-binding",
    );
    need(
      completion.schemaVersion === "1.2.0" &&
        completion.generationId === marker.generationId &&
        completion.documentRevision === marker.documentRevision,
      "completion-binding",
    );
    reviewed =
      ledger?.generationId === marker.generationId &&
      ledger?.sourceHash === result.provenance.source.pdf.sha256 &&
      !!ledger?.completion &&
      equal(ledger.completion, completion) &&
      equal(ledger.scopes, completion.scopes) &&
      equal(ledger.humanDecisions ?? [], completion.humanDecisions) &&
      equal(ledger.lossConfirmations ?? [], completion.lossConfirmations) &&
      equal(
        expressionReviews(
          ledger,
          lossCatalog(result.losses.items, result),
          marker.documentRevision,
        ),
        completion.expressionReviews,
      ) &&
      evidence.pages.every((p) =>
        ledger.scopes.some((t) => t.id === "page:" + p.pageNo),
      ) &&
      completionGate(
        ledger,
        report,
        result.losses.items,
        marker.documentRevision,
        result,
        evidence,
      ).ready;
  }
  need(
    equal(await readRelative(root, "complete.json"), markerRaw),
    "marker-changed",
  );
  if (ledgerRaw)
    need(
      equal(await readRelative(root, "correction-ledger.json"), ledgerRaw),
      "ledger-changed",
    );
  result.reviewComplete = reviewed;
  need(!requireReviewed || reviewed, "review-unavailable");
  return result;
}
async function validateFileSet(root, marker) {
  validateSchema(marker, schemas.complete);
  const files = new Map();
  for (const f of marker.files) {
    need(!files.has(f.relativePath), "duplicate-file");
    const bytes = await readRelative(root, f.relativePath);
    need(hash(bytes) === f.sha256, "file-digest");
    files.set(f.relativePath, bytes);
  }
  const json = (name) => {
    need(files.has(name), "required-file");
    return JSON.parse(files.get(name));
  };
  need(
    marker.schemaVersion === "1.2.0"
      ? ["reviewed", "unreviewed"].includes(marker.reviewState)
      : marker.reviewState === "unreviewed",
    "review-state",
  );
  const history =
    marker.schemaVersion === "1.1.0" ||
    (marker.schemaVersion === "1.2.0" && files.has("correction-history.json"))
      ? json("correction-history.json")
      : null;
  const p = json("provenance.json"),
    losses = json("losses.json"),
    snapshot = json("snapshot.json"),
    receipt = json("receipt.json");
  validateSchema(p, schemas.provenance);
  validateSchema(losses, schemas.losses);
  need(
    marker.generationId === p.generationId &&
      losses.generationId === p.generationId,
    "generation",
  );
  need(
    (history ? history.baselineRevision : marker.documentRevision) ===
      p.document.revision && losses.documentRevision === p.document.revision,
    "document-revision",
  );
  const mustFile = (path, digest) => {
    need(files.has(path) && hash(files.get(path)) === digest, "bound-file");
  };
  mustFile(
    p.document.relativePath,
    history ? marker.documentRevision : p.document.revision,
  );
  for (const f of [
    p.source.pdf,
    p.source.docling,
    p.source.conversionRecord,
    ...p.assets,
  ])
    mustFile(f.relativePath, f.sha256);
  const doc = json(p.source.docling.relativePath),
    record = json(p.source.conversionRecord.relativePath);
  need(
    record.source.sha256 === p.source.pdf.sha256 &&
      record.document.sha256 === p.source.docling.sha256,
    "record-digest",
  );
  need(
    equal(
      losses.items,
      p.items.flatMap((i) => i.losses),
    ),
    "loss-report",
  );
  const coverage = validateEvidence(p, doc, record, snapshot, receipt);
  need(
    auditSourceNative(doc, p, snapshot).mismatches.length === 0,
    "source-native",
  );
  for (const a of p.assets)
    for (const id of a.sourceIds) {
      const i = p.items.find((i) => i.sourceId === id);
      const n = i.selfRef
        .slice(2)
        .split("/")
        .reduce((o, k) => o[k], doc);
      const uri = n.image?.uri;
      need(
        typeof uri === "string" &&
          hash(Buffer.from(uri.split(",")[1] ?? "", "base64")) === a.sha256,
        "source-asset",
      );
    }
  need(
    record.source.bytes === files.get(p.source.pdf.relativePath).length,
    "pdf-bytes",
  );
  const baseline = { provenance: p, losses, marker, snapshot, coverage };
  if (!history) return baseline;
  validateSchema(history, schemas["correction-history"]);
  need(
    history.schemaVersion !== "1.2.0" || marker.schemaVersion === "1.2.0",
    "history-version",
  );
  const evidence = json("review/pdf-evidence.json"),
    report = json("review/review-targets.json");
  validateSchema(evidence, schemas["pdf-evidence"]);
  validateReview(report, baseline, evidence);
  need(
    report.evidenceFile.sha256 === hash(files.get("review/pdf-evidence.json")),
    "history-evidence-digest",
  );
  need(
    report.inputs.provenanceSha256 ===
      marker.files.find((f) => f.relativePath === "provenance.json").sha256 &&
      report.inputs.snapshotSha256 ===
        marker.files.find((f) => f.relativePath === "snapshot.json").sha256,
    "history-review-input",
  );
  verifyCorrectionEvidence(history, p, evidence, report);
  const current = validateHistory(
    history,
    snapshot,
    marker.documentRevision,
    p.generationId,
  );
  const updated = structuredClone(p);
  updated.schemaVersion = history.schemaVersion;
  updated.document.revision = current.revision;
  updated.document.blocks = current.nodes
    .filter((n) => n.path.length === 1 && n.type !== "caption")
    .map((n) => ({
      path: n.path,
      kind: n.type,
      text: textAt(current, n.path),
    }));
  for (const i of updated.items)
    for (const t of [
      ...i.targets,
      ...i.cells.flatMap((c) => c.targets),
      ...i.losses.flatMap((l) => l.targets),
    ]) {
      t.documentRevision = current.revision;
      t.text = textAt(current, t.path, t.selector);
    }
  return {
    provenance: updated,
    losses,
    marker,
    snapshot: current,
    coverage,
    history,
    baseline,
  };
}
export function currentTargets(item) {
  need(item.reviewState === "unreviewed", "review-state");
  need(
    item.targets.every((t) => t.bindingState === "current"),
    "uncertain-binding",
  );
  return item.targets;
}
export async function publishHandoff(root, p) {
  const losses = {
    schemaVersion: "1.0.0",
    generationId: p.generationId,
    documentRevision: p.document.revision,
    items: p.items.flatMap((i) => i.losses),
  };
  validateSchema(losses, schemas.losses);
  for (const [name, data] of [
    ["provenance.json", p],
    ["losses.json", losses],
  ])
    await writeFile(join(root, name), JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
    });
  const names = [
    "provenance.json",
    "losses.json",
    "document.md",
    "snapshot.json",
    "receipt.json",
    p.source.pdf.relativePath,
    p.source.docling.relativePath,
    p.source.conversionRecord.relativePath,
    ...p.assets.map((a) => a.relativePath),
  ];
  const files = await Promise.all(
    names.map(async (relativePath) => ({
      relativePath,
      sha256: hash(await readRelative(root, relativePath)),
    })),
  );
  const marker = {
    schemaVersion: "1.0.0",
    generationId: p.generationId,
    status: "generated",
    reviewState: "unreviewed",
    documentRevision: p.document.revision,
    files,
  };
  await validateFileSet(root, marker);
  await writeFile(
    join(root, "complete.json"),
    JSON.stringify(marker, null, 2) + "\n",
    { flag: "wx" },
  );
}
