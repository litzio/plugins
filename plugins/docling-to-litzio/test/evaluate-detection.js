import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadHandoff } from "../src/provenance.js";
import { detectReview } from "../src/detection.js";
import { protectedTokens } from "../src/tokens.js";
export async function evaluate(root) {
  const input = join(root, "lsr"),
    h = await loadHandoff(input),
    doc = JSON.parse(await readFile(join(input, "source/document.json"))),
    e = JSON.parse(await readFile(join(root, "lsr-review/pdf-evidence.json"))),
    gt = JSON.parse(
      await readFile(
        new URL(
          "../../../fixtures/lsr-1.1/ground_truth/standards.json",
          import.meta.url,
        ),
      ),
    );
  const run = (snapshot) =>
      detectReview({ handoff: h, doc, evidence: e, snapshot }),
    base = run(h.snapshot);
  const key = (f) =>
      [
        f.kind,
        f.sourceIds[0],
        f.evidence.selectorKey,
        f.evidence.cellIndex,
        JSON.stringify(f.regions),
      ].join("|"),
    old = new Set(base.findings.map(key));
  const item = h.provenance.items.find((i) => i.selfRef === "#/tables/2");
  const valueCells = item.cells.filter(
    (c) =>
      !c.sourceCell.column_header &&
      c.targets.length === 1 &&
      /[0-9]/.test(c.sourceCell.text),
  );
  const choose = (predicate) =>
      valueCells.find((c) => predicate(c.sourceCell.text)),
    number = choose((t) => /0\.7/.test(t)),
    operator = choose((t) => t.includes("≤")),
    unit = choose((t) => t.includes("Hz"));
  const targetNode = (snapshot, c) =>
    snapshot.nodes.find(
      (n) =>
        JSON.stringify(n.path) ===
        JSON.stringify([
          ...c.targets[0].path,
          c.targets[0].selector.row,
          c.targets[0].selector.column,
        ]),
    );
  const cases = [
    {
      kind: "number",
      sourceId: item.sourceId,
      mutate: (s) => {
        const n = targetNode(s, number);
        n.text = n.text.replace("0.7", "0.8");
        n.content = [{ kind: "text", text: n.text }];
      },
    },
    {
      kind: "inequality",
      sourceId: item.sourceId,
      mutate: (s) => {
        const n = targetNode(s, operator);
        n.text = n.text.replace("≤", "<");
        n.content = [{ kind: "text", text: n.text }];
      },
    },
    {
      kind: "unit",
      sourceId: item.sourceId,
      mutate: (s) => {
        const n = targetNode(s, unit);
        n.text = n.text.replace("Hz", "kHz");
        n.content = [{ kind: "text", text: n.text }];
      },
    },
    {
      kind: "cell-swap",
      sourceId: item.sourceId,
      mutate: (s) => {
        const a = targetNode(s, number),
          b = targetNode(s, unit);
        [a.text, b.text] = [b.text, a.text];
        [a.content, b.content] = [b.content, a.content];
      },
    },
    {
      kind: "paragraph-removed",
      sourceId: h.provenance.items.find((i) => i.selfRef === "#/texts/4")
        .sourceId,
      mutate: (s) => {
        const path = h.provenance.items.find((i) => i.selfRef === "#/texts/4")
          .targets[0].path;
        s.nodes = s.nodes.filter(
          (n) => JSON.stringify(n.path) !== JSON.stringify(path),
        );
      },
    },
    {
      kind: "furniture-added",
      mutate: (s) => {
        const f = h.provenance.items.find(
          (i) =>
            i.disposition === "furniture" && i.sourceText === "MAIS-SYN 1.1",
        );
        s.nodes.push({ path: [999], type: "paragraph", text: f.sourceText });
      },
    },
  ];
  const mutations = cases.map((c) => {
    const snapshot = structuredClone(h.snapshot);
    snapshot.revision = "f".repeat(64);
    c.mutate(snapshot);
    const r = run(snapshot),
      delta = r.findings.filter((f) => !old.has(key(f))),
      relevant = delta.filter((f) =>
        c.kind === "furniture-added"
          ? f.kind === "furniture-in-body"
          : f.sourceIds.includes(c.sourceId),
      );
    return {
      kind: c.kind,
      detected: relevant.length > 0,
      detectorKinds: [...new Set(relevant.map((f) => f.kind))],
      independentPdfDetected: relevant.some((f) =>
        ["protected-token-difference", "unmapped-pdf-text"].includes(f.kind),
      ),
      additionalFindings: delta.length,
      bindingState: r.bindingState,
    };
  });
  // Pre-declared authoring-oracle negative cell set, not chosen by detector output.
  const expected = gt.elements.find((el) => el.id === "std-matrix").table;
  const controls = [];
  for (const c of item.cells) {
    const sc = c.sourceCell;
    if (sc.column_header || !/[0-9]/.test(sc.text)) continue;
    const oracle = expected.cells.find(
      (v) =>
        v.r0 === sc.start_row_offset_idx && v.c0 === sc.start_col_offset_idx,
    );
    if (
      !oracle ||
      oracle.text.replace(/\s/g, "") !== sc.text.replace(/\s/g, "")
    )
      continue;
    const flagged = base.findings.some(
      (f) =>
        f.kind === "protected-token-difference" &&
        f.sourceIds.includes(item.sourceId) &&
        f.evidence.selectorKey === `cell:${c.cellIndex}`,
    );
    const checked = base.checks.find(
      (v) =>
        v.sourceId === item.sourceId && v.selectorKey === `cell:${c.cellIndex}`,
    );
    controls.push({
      selfRef: item.selfRef,
      cellIndex: c.cellIndex,
      flagged,
      available: checked?.status === "available",
    });
  }
  const gaps = base.findings.filter(
    (f) => f.kind === "source-cell-unavailable",
  );
  const four = [1, 2, 3, 4].map((col) => ({
    sourceRow: 3,
    sourceColumn: col,
    flagged: gaps.some(
      (f) =>
        f.selfRefs.includes("#/tables/3") &&
        f.evidence.gaps.some(
          (g) => g.sourceRow === 3 && g.sourceColumn === col,
        ),
    ),
  }));
  return {
    mutations,
    controls: {
      definition:
        "LSR std-matrix body numeric cells equal to preconversion authoring oracle; excludes header, geometry/other detector rules and unadjudicated corpus regions",
      count: controls.length,
      available: controls.filter((c) => c.available).length,
      falsePositives: controls.filter((c) => c.flagged).length,
      falsePositiveRate: controls.length
        ? controls.filter((c) => c.flagged).length / controls.length
        : null,
      cells: controls,
    },
    known: {
      formula3: base.findings.some(
        (f) =>
          f.kind === "formula-suspicion" && f.selfRefs.includes("#/texts/129"),
      ),
      captionOrderConflicts: base.findings.filter(
        (f) => f.kind === "reading-order-caption",
      ).length,
      firstTwoFormulaFalseAlarms: base.findings.filter(
        (f) =>
          f.kind === "formula-suspicion" &&
          ["#/texts/74", "#/texts/75"].some((ref) => f.selfRefs.includes(ref)),
      ).length,
      mergedTables: ["#/tables/2", "#/tables/3"].map((ref) => ({
        ref,
        flagged: base.findings.some(
          (f) => f.kind === "merged-table-review" && f.selfRefs.includes(ref),
        ),
      })),
      fourMissingNumericCells: four,
      missingNumericValuesFromTextLayer:
        "not recovered: these mathematical cell values are not present in the PDF text layer; structural gap candidates only",
      structuralGapSlots: gaps.map((f) => ({
        selfRef: f.selfRefs[0],
        positions: f.evidence.gaps,
      })),
      knownBlankGapFalsePositive: gaps.some(
        (f) =>
          f.selfRefs.includes("#/tables/3") &&
          f.evidence.gaps.some(
            (g) => g.sourceRow === 6 && g.sourceColumn === 3,
          ),
      ),
      falseFurnitureOnUnchanged: base.findings.filter(
        (f) => f.kind === "furniture-in-body",
      ).length,
    },
    unmeasured: [
      "Global corpus false-positive rate: no exhaustive visual truth labels",
      "Semantic errors with plausible text shared by PDF and Docling",
      "Actual human/assistant resolution time and remaining workload",
    ],
  };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const root = resolve(process.argv[2]);
  const result = await evaluate(root);
  await writeFile(
    join(root, "evaluation.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
