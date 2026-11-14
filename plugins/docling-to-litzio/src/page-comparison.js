import { schemas, validateSchema } from "./schema.js";
import { digest, need } from "./correction-history.js";
import { reviewBindings } from "./review-bindings.js";

export const COVERAGE_FILES = Object.freeze(["review/page-coverage.json","review/page-coverage-complete.json"]);
export function uncoveredKinds(page) {
  return [...(page.textLayer !== "available" ? ["missing-text-layer"] : []),
    ...(page.operatorScan !== "complete" ? ["operator-scan-unavailable"] : []),
    ...(page.rasterObjects ? ["raster-content"] : []),...(page.vectorPaints ? ["vector-painted-content"] : [])];
}
export function validatePageCoverage(files,baseline) {
  if (!COVERAGE_FILES.some((file)=>files.has(file))) return null;
  need(COVERAGE_FILES.every((file)=>files.has(file)),"page-coverage-required");
  const coverage=JSON.parse(files.get(COVERAGE_FILES[0])),seal=JSON.parse(files.get(COVERAGE_FILES[1]));
  validateSchema(coverage,schemas["page-coverage"]);validateSchema(seal,schemas["page-coverage-complete"]);
  const evidenceBytes=files.get("review/pdf-evidence.json");need(evidenceBytes,"page-evidence-required");
  const evidence=JSON.parse(evidenceBytes);validateSchema(evidence,schemas["pdf-evidence"]);
  need(seal.generationId===baseline.provenance.generationId && seal.baselineRevision===baseline.snapshot.revision &&
    seal.pdfSha256===baseline.provenance.source.pdf.sha256 && coverage.pdfSha256===seal.pdfSha256 && evidence.pdfSha256===seal.pdfSha256 &&
    seal.evidenceSha256===digest(evidenceBytes) && seal.coverageSha256===digest(files.get(COVERAGE_FILES[0])),"page-coverage-binding");
  need(coverage.pages.length===evidence.pages.length && coverage.pages.every((page,index)=>
    page.pageNo===evidence.pages[index].pageNo && page.textLayer===evidence.pages[index].status &&
    JSON.stringify(page.notCompared)===JSON.stringify(uncoveredKinds(page))),"page-coverage-inventory");
  return coverage;
}

// A machine-only pass applies only to an unchanged, candidate-free page whose
// complete declared text-layer comparison had no unassessed graphical region.
export function pageComparisons(report,handoff,evidence,currentBindings) {
  if (!handoff.pageCoverage) return [];
  const baseline=handoff.baseline ?? handoff;
  const originalBindings=reviewBindings(report,{...baseline,pageCoverage:handoff.pageCoverage},evidence);
  const bindings=currentBindings ?? reviewBindings(report,handoff,evidence);
  const groups=new Map(),checks=new Map(),pictures=new Set();
  for (const group of report.groups)
    for (const pageNo of group.pageNos) {
      if (!groups.has(pageNo)) groups.set(pageNo,[]);
      groups.get(pageNo).push(group.id);
    }
  const items=new Map(handoff.provenance.items.map((item)=>[item.sourceId,item]));
  for (const item of handoff.provenance.items)
    if (item.label === "picture") for (const region of item.regions) pictures.add(region.pageNo);
  for (const check of report.checks)
    for (const pageNo of new Set((items.get(check.sourceId)?.regions ?? []).map((region)=>region.pageNo))) {
      if (!checks.has(pageNo)) checks.set(pageNo,[]);
      checks.get(pageNo).push(check);
    }
  return handoff.pageCoverage.pages.map((page)=> {
    const groupIds=groups.get(page.pageNo) ?? [], compared=checks.get(page.pageNo) ?? [],scopeId="page:"+page.pageNo;
    const notCompared=[...page.notCompared,...(pictures.has(page.pageNo) ? ["docling-picture"] : []),
      ...(compared.some((check)=>check.status!=="available") ? ["unavailable-protected-token-scope"] : [])];
    const contentDigest=bindings.get(scopeId),baselineDigest=originalBindings.get(scopeId);
    const unchanged=contentDigest===baselineDigest;
    return {pageNo:page.pageNo,scopeId,contentDigest,baselineDigest,
      status:notCompared.length ? "requires-human" : groupIds.length || !unchanged ? "candidates-or-content-change" : "machine-passed",
      groupIds,checked:["protected-number-unit-sign-identifier-tokens","unmapped-pdf-text-detection"],
      checks:compared.length,pdfTokens:compared.reduce((sum,check)=>sum+check.pdfTokenIds.length,0),
      notCompared,semanticLimits:[...handoff.pageCoverage.semanticLimits],regionPrecision:"whole-page"};
  });
}
