import { sourceItemText } from "./rich-content.js";
import { hash } from "./convert.js";
import { auditSourceNative } from "./source-audit.js";
import { formulaHints } from "./formula.js";
import { protectedTokens, difference } from "./tokens.js";
export const DETECTOR_VERSION = "1.1.0";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const compact = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const inside = (box, region, margin = 1.5) => {
  const x = (box[0] + box[2]) / 2,
    y = (box[1] + box[3]) / 2;
  return (
    x >= region[0] - margin &&
    x <= region[2] + margin &&
    y >= region[1] - margin &&
    y <= region[3] + margin
  );
};
const union = (boxes) => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];
export function detectReview({
  handoff,
  doc,
  evidence,
  snapshot = handoff.snapshot,
  headingReview,
}) {
  const p = handoff.provenance;
  if (evidence.pdfSha256 !== p.source.pdf.sha256)
    throw new Error("evidence-pdf-digest");
  const changed = snapshot.revision !== p.document.revision,
    findings = [],
    checks = [],
    byRef = new Map(p.items.map((i) => [i.selfRef, i]));
  const page = (n) => evidence.pages.find((v) => v.pageNo === n);
  const pdfBox = (box, n) => {
    const source = p.pages.find((v) => v.pageNo === n),
      pdf = page(n);
    return box.map(
      (v, k) =>
        v * (k % 2 ? pdf.height / source.height : pdf.width / source.width),
    );
  };
  const regions = (i) =>
    i.regions.map((r) => ({
      pageNo: r.pageNo,
      bbox: pdfBox(r.bbox, r.pageNo),
      unit: "pt",
      origin: "TOPLEFT",
    }));
  const targets = (i) =>
    (i?.targets ?? []).map((t) => ({
      ...t,
      documentRevision: snapshot.revision,
      bindingState: changed ? "uncertain" : t.bindingState,
    }));
  const add = (
    kind,
    i,
    detail = {},
    priority = "medium",
    rs = regions(i),
    ts = targets(i),
  ) => {
    const id =
      "finding-" +
      hash(JSON.stringify([kind, i.sourceId, rs, detail])).slice(0, 24);
    if (!findings.some((f) => f.id === id))
      findings.push({
        id,
        kind,
        priority,
        sourceIds: i.sourceId ? [i.sourceId] : [],
        selfRefs: i.selfRef ? [i.selfRef] : [],
        regions: rs,
        targets: ts,
        evidence: detail,
        status: "candidate",
      });
  };
  const selected = (rs, field = "tokens") => [
    ...new Map(
      rs
        .flatMap((r) =>
          (page(r.pageNo)?.rotation === 0
            ? (page(r.pageNo)?.[field] ?? [])
            : []
          ).filter((t) => inside(t.bbox, r.bbox)),
        )
        .map((t) => [t.id, t]),
    ).values(),
  ];
  const compare = (item, rs, text, selectorKey, confidence = "approximate") => {
    const pdf = selected(rs),
      actual = protectedTokens(text ?? "");
    const status = selected(rs, "items").length ? "available" : "unavailable";
    const diff = difference(pdf, actual);
    checks.push({
      sourceId: item.sourceId,
      selectorKey,
      status,
      confidence,
      pdfTokenIds: pdf.map((t) => t.id),
      nativeTokens: actual.map((t) => t.value),
      regions: rs,
    });
    if (status === "unavailable") {
      add(
        "text-layer-unavailable",
        item,
        {
          selectorKey,
          reason:
            "No text-layer items in region; vector formula/scanned/geometry mismatch possible",
        },
        "low",
        rs,
      );
      return;
    }
    if (diff.missing.length || diff.extra.length)
      add(
        "protected-token-difference",
        item,
        {
          selectorKey,
          pdfValues: pdf.map((t) => t.value),
          nativeValues: actual.map((t) => t.value),
          ...diff,
          confidence,
        },
        confidence === "cell-single-page" ? "high" : "medium",
        rs,
      );
  };
  for (const i of p.items) {
    if (i.disposition !== "mapped") continue;
    const source = i.selfRef
        .slice(2)
        .split("/")
        .reduce((o, k) => o[k], doc),
      rs = regions(i);
    for (const loss of i.losses)
      if (loss.severity === "blocking")
        add(
          "meaning-loss",
          i,
          {
            reasonCode: loss.reasonCode,
            category: loss.category,
            originalValue: loss.originalValue,
          },
          i.cells.length ? "high" : "medium",
        );
    if (source.label === "formula") {
      add(
        "formula-review-required",
        i,
        {
          reason:
            "Every formula requires review even without mechanical suspicion",
        },
        "medium",
      );
      const hints = formulaHints(source.text);
      if (hints.suspicious)
        add(
          "formula-suspicion",
          i,
          { reasons: hints.reasons, latex: source.text },
          "high",
        );
      if (hints.reasons.includes("prose-inside-formula"))
        add(
          "formula-prose-suspect",
          i,
          { reason: "intertext prose; possible body absorbed into formula" },
          "high",
        );
      // Numeric agreement does not verify a formula; still record text-layer availability.
      checks.push({
        sourceId: i.sourceId,
        selectorKey: "formula",
        status: selected(rs, "items").length
          ? "formula-not-comparable"
          : "unavailable",
        confidence: "not-a-math-oracle",
        pdfTokenIds: selected(rs).map((t) => t.id),
        nativeTokens: [],
        regions: rs,
      });
      if (!selected(rs, "items").length)
        add(
          "text-layer-unavailable",
          i,
          {
            selectorKey: "formula",
            reason: "No readable text in equation region",
          },
          "low",
        );
      continue;
    }
    if (source.label === "picture") {
      checks.push({
        sourceId: i.sourceId,
        selectorKey: "picture",
        status: "image-not-comparable",
        confidence: "text-only detector does not verify picture semantics",
        pdfTokenIds: selected(rs).map((t) => t.id),
        nativeTokens: [],
        regions: rs,
      });
      const text = selected(rs, "items")
        .map((t) => t.text)
        .join(" ");
      if (
        text.split(/\s+/).length >= 40 &&
        (text.match(/[.!?](?:\s|$)/g) ?? []).length >= 2
      )
        add(
          "picture-prose-suspect",
          i,
          { reason: "Long sentence-like PDF text inside picture", text },
          "medium",
        );
      continue;
    }
    if (source.data?.table_cells) {
      const model = i.structure.tableModel;
      if (model?.mergedRanges.length)
        add(
          "merged-table-review",
          i,
          {
            mergedRanges: model.mergedRanges,
            headerRows: model.headerRows,
            reason: "Source merges require semantic review",
          },
          "high",
        );
      const tableTarget = i.targets.find((t) =>
          snapshot.nodes.some(
            (n) => n.type === "table" && same(n.path, t.path),
          ),
        ),
        tablePath = tableTarget?.path;
      const cells = snapshot.nodes.filter(
        (n) => n.type === "cell" && same(n.path.slice(0, -2), tablePath),
      );
      const rows = new Map();
      for (const c of cells) {
        const r = c.path.at(-2);
        if (!rows.has(r)) rows.set(r, []);
        rows.get(r).push(c);
      }
      if ([...rows.values()].some((r) => r.length !== source.data.num_cols))
        add(
          "table-row-width",
          i,
          {
            rowWidths: [...rows].map(([r, c]) => [r, c.length]),
            expected: source.data.num_cols,
          },
          "high",
        );
      if (cells.some((c) => c.path.at(-2) === 0 && !c.text?.trim()))
        add(
          "empty-table-header",
          i,
          {
            columns: cells
              .filter((c) => c.path.at(-2) === 0 && !c.text?.trim())
              .map((c) => c.path.at(-1)),
          },
          "medium",
        );
      // Known structural repetitions only: unrelated equal values (zero/N/A) are not errors.
      if (model?.mergedRanges.some((m) => m.role === "body"))
        add(
          "repeated-merged-values",
          i,
          {
            ranges: model.mergedRanges.filter((m) => m.role === "body"),
            reason: "Repeated values may express shared conditions",
          },
          "high",
        );
      const occupied = new Set();
      for (const c of source.data.table_cells)
        for (let r = c.start_row_offset_idx; r < c.end_row_offset_idx; r++)
          for (
            let col = c.start_col_offset_idx;
            col < c.end_col_offset_idx;
            col++
          )
            occupied.add(`${r}:${col}`);
      const gaps = [];
      for (let r = 0; r < source.data.num_rows; r++)
        for (let col = 0; col < source.data.num_cols; col++)
          if (!occupied.has(`${r}:${col}`))
            gaps.push({
              sourceRow: r,
              sourceColumn: col,
              outputRow:
                r < Math.max(1, model?.headerRows ?? 0)
                  ? 0
                  : r - Math.max(0, (model?.headerRows ?? 0) - 1),
              outputColumn: col,
            });
      if (gaps.length)
        add(
          "source-cell-unavailable",
          i,
          {
            gaps,
            reason:
              "No source cell record: may be intentionally blank, missed/vector formula or extraction loss; text layer cannot decide",
          },
          "high",
          rs,
          tablePath
            ? gaps.map((g) => ({
                path: tablePath,
                selector: {
                  kind: "cell",
                  row: g.outputRow,
                  column: g.outputColumn,
                  rowSpan: 1,
                  columnSpan: 1,
                },
                documentRevision: snapshot.revision,
                bindingState: changed ? "uncertain" : "current",
                role: "content",
                text:
                  snapshot.nodes.find((n) =>
                    same(n.path, [...tablePath, g.outputRow, g.outputColumn]),
                  )?.text ?? null,
              }))
            : [],
        );
      const knownCellBoxes = [];
      for (const c of i.cells) {
        if (i.regions.length !== 1 || !c.sourceCell.bbox) {
          checks.push({
            sourceId: i.sourceId,
            selectorKey: `cell:${c.cellIndex}`,
            status: "unavailable",
            confidence: "Cell page/bbox not established",
            pdfTokenIds: [],
            nativeTokens: c.targets.flatMap((t) =>
              protectedTokens(sourceItemText(snapshot, t, i, p) ?? "").map(
                (v) => v.value,
              ),
            ),
            regions: rs,
          });
          add(
            "text-layer-unavailable",
            i,
            {
              selectorKey: `cell:${c.cellIndex}`,
              reason:
                "Cell page or bbox is not established; no comparison attempted",
            },
            "low",
            rs,
          );
          continue;
        }
        const b = c.sourceCell.bbox;
        if (b.coord_origin !== "TOPLEFT") {
          checks.push({
            sourceId: i.sourceId,
            selectorKey: `cell:${c.cellIndex}`,
            status: "unavailable",
            confidence: "Unsupported cell coordinate origin",
            pdfTokenIds: [],
            nativeTokens: [],
            regions: rs,
          });
          add(
            "text-layer-unavailable",
            i,
            {
              selectorKey: `cell:${c.cellIndex}`,
              reason: "Cell coordinate origin not supported",
            },
            "low",
            rs,
          );
          continue;
        }
        const cellRs = [
          { ...rs[0], bbox: pdfBox([b.l, b.t, b.r, b.b], rs[0].pageNo) },
        ];
        knownCellBoxes.push(cellRs[0].bbox);
        const target = c.targets[0];
        let text = target ? sourceItemText(snapshot, target, i, p) : "";
        if (model?.headerRows > 1 && c.sourceCell.column_header) {
          text = c.sourceCell.text;
        } // Combined headers are separately checked against source-native rules.
        compare(i, cellRs, text, `cell:${c.cellIndex}`, "cell-single-page");
      }
      if (rs.length === 1) {
        const orphan = selected(rs).filter(
          (t) => !knownCellBoxes.some((b) => inside(t.bbox, b, 2)),
        );
        if (orphan.length)
          add(
            "unmapped-table-tokens",
            i,
            {
              pdfValues: orphan.map((t) => t.value),
              pdfTokenIds: orphan.map((t) => t.id),
              reason:
                "PDF tokens within table but outside all source cell text boxes; missing cells or geometry",
            },
            "high",
            [{ ...rs[0], bbox: union(orphan.map((t) => t.bbox)) }],
          );
      }
      continue;
    }
    const content = i.targets.filter((t) => t.role === "content");
    if (typeof source.text === "string" && !rs.length) {
      checks.push({
        sourceId: i.sourceId,
        selectorKey: "block",
        status: "unavailable",
        confidence: "No source regions",
        pdfTokenIds: [],
        nativeTokens: [],
        regions: [],
      });
      add(
        "text-layer-unavailable",
        i,
        {
          selectorKey: "block",
          reason: "No source region; comparison not attempted",
        },
        "low",
        [],
      );
    }
    if (typeof source.text === "string" && rs.length)
      compare(
        i,
        rs,
        content
          .map((t) => {
            const text = sourceItemText(snapshot, t, i, p),
              node = snapshot.nodes.find((n) => same(n.path, t.path));
            return source.label === "caption" &&
              ["figure", "table"].includes(node?.type) &&
              node.enumerator
              ? `${node.enumerator} ${text ?? ""}`
              : source.label === "footnote" && i.structure.noteBinding
                ? `${i.structure.noteBinding.marker} ${text ?? ""}`
                : text;
          })
          .filter((t) => t !== null)
          .join(" "),
        "block",
      );
  }
  // Independent source->native preservation catches damage even when source was already wrong.
  for (const m of auditSourceNative(doc, p, snapshot).mismatches) {
    const i = byRef.get(m.selfRef);
    add(
      "source-native-change",
      i,
      {
        ...m,
        reason: "Source-native rule differs; not an oracle correctness verdict",
      },
      "high",
    );
  }
  const furniture = p.items.filter(
    (i) =>
      i.disposition === "furniture" &&
      compact(i.sourceText).length >= 8 &&
      /[A-Za-z가-힣]{3}/.test(i.sourceText),
  );
  for (const n of snapshot.nodes.filter(
    (n) =>
      n.path.length === 1 && ["paragraph", "heading", "list"].includes(n.type),
  )) {
    const text =
      n.text ??
      n.items
        ?.map((i) => i.content.map((c) => c.text ?? "").join(""))
        .join(" ");
    const matches = furniture.filter(
      (i) => compact(i.sourceText) === compact(text),
    );
    if (matches.length) {
      const i = matches[0];
      add(
        "furniture-in-body",
        i,
        {
          matchedSourceRefs: matches.map((i) => i.selfRef),
          text,
          reason:
            "Exact known furniture text appears as body; location is a candidate",
        },
        "high",
        regions(i),
        [
          {
            path: n.path,
            selector: { kind: "block" },
            text,
            role: "content",
            documentRevision: snapshot.revision,
            bindingState: changed ? "uncertain" : "no-source",
          },
        ],
      );
    }
  }
  for (const table of p.items.filter(
    (i) => i.cells.length && i.disposition === "mapped",
  ))
    for (const cap of table.structure.captions ?? []) {
      const c = byRef.get(cap.$ref);
      if (!c?.targets.length) continue;
      const tr = regions(table)[0],
        cr = regions(c)[0];
      if (
        tr &&
        cr &&
        tr.pageNo === cr.pageNo &&
        cr.bbox[3] < tr.bbox[1] &&
        c.targets[0].path[0] > table.targets[0].path[0]
      )
        add(
          "reading-order-caption",
          table,
          {
            captionRef: c.selfRef,
            reason:
              "PDF caption above table, native caption paragraph follows table; review logical reading order",
          },
          "medium",
          [cr, tr],
          [...targets(c), ...targets(table)],
        );
    }
  const inPicture = (i) => {
    let parent = i.structure.parent?.$ref;
    const seen = new Set();
    while (parent && !seen.has(parent)) {
      if (parent.startsWith("#/pictures/")) return true;
      seen.add(parent);
      parent = byRef.get(parent)?.structure.parent?.$ref;
    }
    return false;
  };
  const ordered = p.items
    .filter(
      (i) =>
        i.disposition === "mapped" &&
        !inPicture(i) &&
        ["text", "paragraph", "section_header", "list_item"].includes(
          i.label,
        ) &&
        i.regions.length === 1,
    )
    .sort(
      (a, b) => (a.targets[0]?.path[0] ?? 0) - (b.targets[0]?.path[0] ?? 0),
    );
  for (let index = 1; index < ordered.length; index++) {
    const a = ordered[index - 1],
      b = ordered[index],
      ra = regions(a)[0],
      rb = regions(b)[0];
    if (ra.pageNo !== rb.pageNo) continue;
    const shared =
      Math.max(
        0,
        Math.min(ra.bbox[2], rb.bbox[2]) - Math.max(ra.bbox[0], rb.bbox[0]),
      ) /
      Math.max(1, Math.min(ra.bbox[2] - ra.bbox[0], rb.bbox[2] - rb.bbox[0]));
    if (shared > 0.5 && ra.bbox[1] > rb.bbox[3] + 12)
      add(
        "reading-order-backtrack",
        b,
        {
          previousSelfRef: a.selfRef,
          reason:
            "Same-column vertical jump backward; notes/captions may be legitimate",
        },
        "medium",
        [ra, rb],
        [...targets(a), ...targets(b)],
      );
  }
  for (const pg of evidence.pages) {
    if (pg.rotation !== 0) {
      add(
        "geometry-unavailable",
        { sourceId: null, selfRef: null, regions: [], targets: [] },
        {
          reason:
            "Rotated PDF page and unknown source rotation; no coordinate matching",
        },
        "medium",
        [
          {
            pageNo: pg.pageNo,
            bbox: [0, 0, pg.width, pg.height],
            unit: "pt",
            origin: "TOPLEFT",
          },
        ],
        [],
      );
      continue;
    }
    const covered = p.items
      .filter(
        (i) =>
          i.regions.some((r) => r.pageNo === pg.pageNo) &&
          (i.disposition === "furniture" ||
            i.targets.some((t) =>
              snapshot.nodes.some((n) => same(n.path, t.path)),
            )),
      )
      .flatMap((i) =>
        regions(i)
          .filter((r) => r.pageNo === pg.pageNo)
          .map((r) => r.bbox),
      );
    const missing = pg.items.filter(
      (t) =>
        !covered.some((b) => inside(t.bbox, b, 2)) && t.text.trim().length >= 8,
    );
    for (const t of missing) {
      const pseudo = {
        sourceId: null,
        selfRef: null,
        regions: [],
        targets: [],
      };
      add(
        "unmapped-pdf-text",
        pseudo,
        {
          text: t.text,
          pdfItemId: t.id,
          reason:
            "PDF text region has no source/active native coverage; geometry or omission",
        },
        "medium",
        [{ pageNo: pg.pageNo, bbox: t.bbox, unit: "pt", origin: "TOPLEFT" }],
        [],
      );
    }
  }
  if (
    (headingReview?.bookmarkPresence ?? evidence.outline?.status) !==
      "present" ||
    headingReview?.useBookmarksRequested === false ||
    headingReview?.inferenceEnabled === false
  )
    for (const i of p.items.filter(
      (i) =>
        ["title", "section_header"].includes(i.label) &&
        i.disposition === "mapped",
    ))
      add(
        "heading-basis-low",
        i,
        {
          bookmarkPresence:
            headingReview?.bookmarkPresence ??
            evidence.outline?.status ??
            "unknown",
          reason: "No verified bookmark presence; levels are not corrected",
        },
        "medium",
      );
  const groups = groupFindings(findings, byRef);
  const foldedKinds = new Set([
    "heading-basis-low",
    "text-layer-unavailable",
    "unmapped-pdf-text",
    "meaning-loss",
    "reading-order-caption",
    "formula-review-required",
  ]);
  const patterns = new Map();
  for (const g of groups) {
    if (!g.kinds.length || !g.kinds.every((k) => foldedKinds.has(k))) continue;
    const kind = g.kinds.length === 1 ? g.kinds[0] : "same-rule-pattern",
      members = g.findingIds.map((id) => findings.find((f) => f.id === id)),
      pattern = [
        ...new Set(
          members.map(
            (f) =>
              f.kind +
              ":" +
              (f.evidence.reasonCode ??
                f.evidence.selectorKey?.split(":")[0] ??
                f.kind),
          ),
        ),
      ]
        .sort()
        .join("+");
    const key = kind + ":" + pattern;
    if (!patterns.has(key)) patterns.set(key, { kind, pattern, groupIds: [] });
    patterns.get(key).groupIds.push(g.id);
  }
  const series = [];
  for (const s of patterns.values())
    if (s.groupIds.length > 1)
      series.push({
        ...s,
        representativeGroupId: s.groupIds[0],
        defaultCollapsed: true,
        note: "Same rule pattern only; all members retained; representative is not approval of the rest",
      });
  const folded = new Set(series.flatMap((s) => s.groupIds));
  return {
    schemaVersion: "1.0.0",
    detectorVersion: DETECTOR_VERSION,
    generationId: p.generationId,
    documentRevision: snapshot.revision,
    baselineRevision: p.document.revision,
    bindingState: changed ? "uncertain" : "current",
    pdfSha256: evidence.pdfSha256,
    reviewState: "unreviewed",
    findings,
    groups,
    series,
    checks,
    statistics: {
      pages: evidence.pages.length,
      findings: findings.length,
      groups: groups.length,
      groupsPerPage: groups.length / evidence.pages.length,
      foldedRows:
        groups.filter((g) => !folded.has(g.id)).length + series.length,
      byKind: Object.fromEntries(
        [...new Set(findings.map((f) => f.kind))].map((k) => [
          k,
          findings.filter((f) => f.kind === k).length,
        ]),
      ),
      unavailableChecks: checks.filter((c) => c.status !== "available").length,
    },
    limitations: [
      "Candidate is not a proven error; no finding is not correctness",
      "PDF item/token boxes are approximate; cell page mapping only when source table has one page",
      "PDF text and Docling can share extraction errors; vector math/scans are not verified",
      "Changed snapshot uses uncertain baseline paths; no automatic identity reconnection",
      "No AI/visual review or final human workload acceptance",
    ],
  };
}
function groupFindings(findings, byRef) {
  const map = new Map();
  for (const f of findings) {
    const item = byRef.get(f.selfRefs[0]),
      scope = item?.structure.tableModel
        ? `table:${item.selfRef}`
        : item?.label === "formula"
          ? `formula:${item.selfRef}`
          : `${f.kind}:${f.evidence.reasonCode ?? ""}`;
    const pages = [...new Set(f.regions.map((r) => r.pageNo))].sort(
      (a, b) => a - b,
    );
    const windows = new Map();
    for (const n of pages) {
      const key = Math.floor((n - 1) / 3);
      if (!windows.has(key)) windows.set(key, []);
      windows.get(key).push(n);
    }
    const buckets = pages.length ? [...windows.values()] : [[]];
    for (const ns of buckets) {
      const bucket =
        scope.startsWith("table:") || scope.startsWith("formula:")
          ? ns.join(",")
          : Math.floor(((ns[0] ?? 1) - 1) / 3);
      const key = scope + ":" + bucket;
      if (!map.has(key))
        map.set(key, {
          id: "group-" + hash(key).slice(0, 24),
          scope,
          kinds: [],
          priority: "low",
          pageNos: [],
          findingIds: [],
          representativeId: f.id,
          reviewState: "unreviewed",
        });
      const g = map.get(key);
      g.kinds = [...new Set([...g.kinds, f.kind])];
      g.pageNos = [...new Set([...g.pageNos, ...ns])].sort((a, b) => a - b);
      g.findingIds = [...new Set([...g.findingIds, f.id])];
      if (
        { low: 0, medium: 1, high: 2 }[f.priority] >
        { low: 0, medium: 1, high: 2 }[g.priority]
      )
        g.priority = f.priority;
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 })[a.priority] -
        { high: 0, medium: 1, low: 2 }[b.priority] ||
      (a.pageNos[0] ?? 0) - (b.pageNos[0] ?? 0),
  );
}
