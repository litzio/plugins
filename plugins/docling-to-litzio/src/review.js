import { randomUUID } from "node:crypto";
import { firstBy, snapshotLookup } from "./lookup.js";
import { isDeepStrictEqual } from "node:util";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { hash } from "./convert.js";
import { loadHandoff, readRelative, createReadSet } from "./provenance.js";
import { extractPdf } from "./pdf-evidence.js";
import { detectReview } from "./detection.js";
import { validateSchema, schemas } from "./schema.js";
export function validateReview(report, handoff, evidence) {
  validateSchema(report, schemas["review-targets"]);
  const p = handoff.provenance;
  const lookup = snapshotLookup(handoff.snapshot);
  const pagesByNo = firstBy(evidence.pages, (p) => p.pageNo);
  const findingsById = firstBy(report.findings, (f) => f.id);
  const groupsById = firstBy(report.groups, (g) => g.id);
  if (
    report.generationId !== p.generationId ||
    report.baselineRevision !== p.document.revision ||
    report.documentRevision !== p.document.revision ||
    report.bindingState !== "current" ||
    report.pdfSha256 !== p.source.pdf.sha256 ||
    evidence.pdfSha256 !== p.source.pdf.sha256
  )
    throw new Error("review-input-mismatch");
  for (const i of p.items) {
    if (
      i.label === "formula" &&
      i.disposition === "mapped" &&
      !report.findings.some(
        (f) =>
          f.kind === "formula-review-required" &&
          f.sourceIds.includes(i.sourceId),
      )
    )
      throw new Error("review-formula-coverage");
    for (const loss of i.losses.filter((l) => l.severity === "blocking"))
      if (
        !report.findings.some(
          (f) =>
            f.kind === "meaning-loss" &&
            f.sourceIds.includes(i.sourceId) &&
            f.evidence.reasonCode === loss.reasonCode,
        )
      )
        throw new Error("review-loss-coverage");
  }
  const ids = new Set(report.findings.map((f) => f.id));
  if (ids.size !== report.findings.length)
    throw new Error("review-duplicate-finding");
  const sources = new Set(p.items.map((i) => i.sourceId)),
    refs = new Set(p.items.map((i) => i.selfRef)),
    tokens = new Set(evidence.pages.flatMap((p) => p.tokens.map((t) => t.id))),
    groups = new Set(report.groups.map((g) => g.id));
  const used = new Set();
  const coveredPages = new Map();
  const requiredEvidence = {
    "formula-review-required": ["reason"],
    "meaning-loss": ["reasonCode", "category", "originalValue"],
    "protected-token-difference": [
      "selectorKey",
      "pdfValues",
      "nativeValues",
      "missing",
      "extra",
      "confidence",
    ],
    "text-layer-unavailable": ["selectorKey", "reason"],
    "formula-suspicion": ["reasons", "latex"],
    "formula-prose-suspect": ["reason"],
    "picture-prose-suspect": ["reason", "text"],
    "merged-table-review": ["mergedRanges", "headerRows", "reason"],
    "repeated-merged-values": ["ranges", "reason"],
    "empty-table-header": ["columns"],
    "table-row-width": ["rowWidths", "expected"],
    "source-cell-unavailable": ["gaps", "reason"],
    "unmapped-table-tokens": ["pdfValues", "pdfTokenIds", "reason"],
    "source-native-change": ["selfRef", "kind", "reason"],
    "furniture-in-body": ["matchedSourceRefs", "text", "reason"],
    "reading-order-backtrack": ["previousSelfRef", "reason"],
    "reading-order-caption": ["captionRef", "reason"],
    "unmapped-pdf-text": ["text", "pdfItemId", "reason"],
    "heading-basis-low": ["bookmarkPresence", "reason"],
    "geometry-unavailable": ["reason"],
  };
  for (const f of report.findings) {
    if (!requiredEvidence[f.kind]?.every((k) => Object.hasOwn(f.evidence, k)))
      throw new Error("review-evidence-fields");
    if (
      f.sourceIds.some((id) => !sources.has(id)) ||
      f.selfRefs.some((ref) => !refs.has(ref))
    )
      throw new Error("review-source-ref");
    for (const r of f.regions) {
      const page = pagesByNo.get(r.pageNo);
      if (
        !page ||
        r.bbox.length !== 4 ||
        !r.bbox.every(Number.isFinite) ||
        r.bbox[0] > r.bbox[2] ||
        r.bbox[1] > r.bbox[3]
      )
        throw new Error("review-region");
    }
    for (const t of f.targets) {
      if (t.documentRevision !== report.documentRevision)
        throw new Error("review-target-revision");
      if (t.bindingState === "current" && !lookup.node(t.path))
        throw new Error("review-target-path");
    }
  }
  for (const g of report.groups) {
    if (
      !g.findingIds.length ||
      g.findingIds.some((id) => !ids.has(id)) ||
      !g.findingIds.includes(g.representativeId) ||
      g.pageNos.length > 3 ||
      (g.pageNos.length && g.pageNos.at(-1) - g.pageNos[0] > 2)
    )
      throw new Error("review-group");
    g.findingIds.forEach((id) => {
      used.add(id);
      if (!coveredPages.has(id)) coveredPages.set(id, new Set());
      for (const page of g.pageNos) coveredPages.get(id).add(page);
    });
  }
  for (const f of report.findings)
    for (const r of f.regions)
      if (!coveredPages.get(f.id)?.has(r.pageNo))
        throw new Error("review-page-coverage");
  if (used.size !== ids.size || groups.size !== report.groups.length)
    throw new Error("review-group-coverage");
  for (const g of report.groups) {
    const members = g.findingIds.map((id) => findingsById.get(id));
    if (
      !isDeepStrictEqual(
        [...new Set(members.map((f) => f.kind))].sort(),
        [...g.kinds].sort(),
      )
    )
      throw new Error("review-group-kinds");
    const worst = members
      .map((f) => f.priority)
      .sort(
        (a, b) =>
          ({ high: 0, medium: 1, low: 2 })[a] -
          { high: 0, medium: 1, low: 2 }[b],
      )[0];
    if (g.priority !== worst) throw new Error("review-group-priority");
  }
  const pattern = (g) =>
    [
      ...new Set(
        g.findingIds.map((id) => {
          const f = findingsById.get(id);
          return (
            f.kind +
            ":" +
            (f.evidence.reasonCode ??
              f.evidence.selectorKey?.split(":")[0] ??
              f.kind)
          );
        }),
      ),
    ]
      .sort()
      .join("+");
  const foldedMembers = new Set();
  for (const s of report.series) {
    if (
      s.groupIds.length < 2 ||
      s.groupIds.some((id) => !groups.has(id) || foldedMembers.has(id)) ||
      !s.groupIds.includes(s.representativeGroupId)
    )
      throw new Error("review-series");
    for (const id of s.groupIds) {
      foldedMembers.add(id);
      if (pattern(groupsById.get(id)) !== s.pattern)
        throw new Error("review-series-pattern");
    }
  }
  for (const c of report.checks)
    if (!sources.has(c.sourceId) || c.pdfTokenIds.some((id) => !tokens.has(id)))
      throw new Error("review-check");
  const counts = Object.fromEntries(
    [...new Set(report.findings.map((f) => f.kind))].map((k) => [
      k,
      report.findings.filter((f) => f.kind === k).length,
    ]),
  );
  const folded = new Set(report.series.flatMap((s) => s.groupIds));
  if (
    !isDeepStrictEqual(counts, report.statistics.byKind) ||
    report.statistics.groupsPerPage !==
      report.groups.length / evidence.pages.length ||
    report.statistics.foldedRows !==
      report.groups.filter((g) => !folded.has(g.id)).length +
        report.series.length
  )
    throw new Error("review-statistics");
  if (
    report.statistics.findings !== ids.size ||
    report.statistics.groups !== groups.size ||
    report.statistics.pages !== evidence.pages.length ||
    report.statistics.unavailableChecks !==
      report.checks.filter((c) => c.status !== "available").length
  )
    throw new Error("review-statistics");
}
export async function createReview(input, output) {
  const handoff = await loadHandoff(input),
    p = handoff.provenance,
    doc = handoff.sourceDocument;
  if (handoff.history) throw new Error("review-baseline-required");
  const originalMarkerBytes = await readRelative(input,"complete.json");
  if (!isDeepStrictEqual(JSON.parse(originalMarkerBytes),handoff.marker)) throw new Error("review-input-changed");
  const extraction = await extractPdf(await readRelative(input,p.source.pdf.relativePath),{coverage:true});
  const {evidence,pageCoverage} = extraction;
  // generation.json is diagnostic, so absent/unverified bookmark evidence stays unknown.
  const record = handoff.sourceRecord;
  const report = detectReview({
    handoff,
    doc,
    evidence,
    headingReview: {
      bookmarkPresence: evidence.outline.status,
      useBookmarksRequested:
        record.actual_request?.pdf_heading_hierarchy_options?.use_bookmarks ===
        true,
      inferenceEnabled:
        record.actual_request?.do_pdf_heading_hierarchy === true,
    },
  });
  report.inputs = {
    provenanceSha256: handoff.marker.files.find(
      (f) => f.relativePath === "provenance.json",
    ).sha256,
    snapshotSha256: handoff.marker.files.find(
      (f) => f.relativePath === "snapshot.json",
    ).sha256,
  };
  const evidenceBytes = Buffer.from(JSON.stringify(evidence, null, 2) + "\n");
  report.evidenceFile = {
    relativePath: "pdf-evidence.json",
    sha256: hash(evidenceBytes),
  };
  validateSchema(evidence, schemas["pdf-evidence"]);
  validateReview(report, handoff, evidence);
  await mkdir(output);
  await writeFile(join(output, "pdf-evidence.json"), evidenceBytes, {
    flag: "wx",
  });
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(output, "review-targets.json"), bytes, { flag: "wx" });
  const marker = {
    schemaVersion: "1.0.0",
    generationId: p.generationId,
    documentRevision: p.document.revision,
    reportSha256: hash(bytes),
    evidenceSha256: hash(evidenceBytes),
    status: "generated-unreviewed",
  };
  validateSchema(marker, schemas["review-complete"]);
  await writeFile(
    join(output, "review-complete.json"),
    JSON.stringify(marker, null, 2) + "\n",
    { flag: "wx" },
  );
  if (handoff.marker.schemaVersion === "1.3.0") {
    const coverageBytes=Buffer.from(JSON.stringify(pageCoverage,null,2)+"\n");
    const seal={schemaVersion:"1.3.0",generationId:p.generationId,baselineRevision:p.document.revision,
      pdfSha256:p.source.pdf.sha256,evidenceSha256:hash(evidenceBytes),coverageSha256:hash(coverageBytes)};
    validateSchema(pageCoverage,schemas["page-coverage"]);validateSchema(seal,schemas["page-coverage-complete"]);
    await writeFile(join(output,"page-coverage.json"),coverageBytes,{flag:"wx"});
    await writeFile(join(output,"page-coverage-complete.json"),JSON.stringify(seal,null,2)+"\n",{flag:"wx"});
    if (resolve(output) === resolve(input,"review")) {
      await loadHandoff(input);
      if (!isDeepStrictEqual(await readRelative(input,"complete.json"),originalMarkerBytes)) throw new Error("review-input-changed");
      const next={...handoff.marker,files:[...handoff.marker.files]};
      for (const name of ["pdf-evidence.json","review-targets.json","review-complete.json","page-coverage.json","page-coverage-complete.json"])
        next.files.push({relativePath:"review/"+name,sha256:hash(await readRelative(input,"review/"+name))});
      const temporary=join(input,"complete.json."+randomUUID()+".tmp");
      await writeFile(temporary,JSON.stringify(next,null,2)+"\n",{flag:"wx"});
      await rename(temporary,join(input,"complete.json"));
      await loadHandoff(input);
    }
  }
  return report;
}
export async function readReview(
  input,
  output,
  { read = createReadSet() } = {},
) {
  const loaded = await loadHandoff(input, { read });
  return readReviewFiles(input, output, loaded, read);
}
export async function readReviewFiles(input, output, loaded, read) {
  const handoff = loaded.baseline ?? loaded,
    raw = await read(output, "review-complete.json"),
    m = JSON.parse(raw);
  validateSchema(m, schemas["review-complete"]);
  const bytes = await read(output, "review-targets.json"),
    eb = await read(output, "pdf-evidence.json");
  const reportHash = hash(bytes),
    evidenceHash = hash(eb);
  if (reportHash !== m.reportSha256 || evidenceHash !== m.evidenceSha256)
    throw new Error("review-file-digest");
  let report, evidence;
  if (loaded.validatedReview) {
    if (
      loaded.validatedReview.reportHash !== reportHash ||
      loaded.validatedReview.evidenceHash !== evidenceHash
    )
      throw new Error("review-file-digest");
    ({ report, evidence } = loaded.validatedReview);
  } else {
    report = JSON.parse(bytes);
    evidence = JSON.parse(eb);
    validateSchema(evidence, schemas["pdf-evidence"]);
    validateReview(report, handoff, evidence);
  }
  if (
    report.inputs.provenanceSha256 !==
      handoff.marker.files.find((f) => f.relativePath === "provenance.json")
        .sha256 ||
    report.inputs.snapshotSha256 !==
      handoff.marker.files.find((f) => f.relativePath === "snapshot.json")
        .sha256 ||
    report.evidenceFile.sha256 !== evidenceHash ||
    m.generationId !== report.generationId ||
    m.documentRevision !== report.documentRevision ||
    hash(await readRelative(output, "review-complete.json")) !== hash(raw)
  )
    throw new Error("review-binding");
  return { report, evidence, handoff: loaded, read };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2),
    read = args[0] === "--read";
  if (read) args.shift();
  const [input, output] = args;
  if (!output)
    throw new Error(
      "Usage: node src/review.js [--read] GENERATION REVIEW_DIRECTORY",
    );
  const r = read
    ? (await readReview(resolve(input), resolve(output))).report
    : await createReview(resolve(input), resolve(output));
  console.log(JSON.stringify(r.statistics, null, 2));
}
