import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractPdf } from "../src/pdf-evidence.js";
import { repoPath } from "./paths.js";
import { digest } from "../src/correction-history.js";
import { pageComparisons, uncoveredKinds, validatePageCoverage } from "../src/page-comparison.js";

function fixture() {
  const page={pageNo:1,textLayer:"available",operatorScan:"complete",rasterObjects:0,vectorPaints:0,notCompared:[]};
  const handoff={pageCoverage:{pages:[page],semanticLimits:["heading-hierarchy","reading-order","meaning"]},provenance:{generationId:"g",source:{pdf:{sha256:"pdf"}},items:[{sourceId:"s",selfRef:"#/texts/0",regions:[{pageNo:1}],targets:[{path:[1]}],cells:[]}]},snapshot:{revision:"revision",nodes:[{type:"paragraph",path:[1],text:"same"}]},sourceDocument:{texts:[{text:"same"}]}};
  return {handoff,report:{groups:[],findings:[],checks:[]},evidence:{pages:[{pageNo:1,items:[{text:"same"}],tokens:[]}]}};
}
test("a candidate-free unchanged page records machine comparison limits without claiming semantic review",()=> {
  const x=fixture(),page=pageComparisons(x.report,x.handoff,x.evidence)[0];
  assert.equal(page.status,"machine-passed");
  assert.deepEqual(page.notCompared,[]);
  assert.deepEqual(page.semanticLimits,["heading-hierarchy","reading-order","meaning"]);
  assert.deepEqual(page.checked,["protected-number-unit-sign-identifier-tokens","unmapped-pdf-text-detection"]);
});
for (const kind of ["raster","vector","scan-failure","no-text"]) test(`${kind} leaves the page for a human`,()=> {
  const x=fixture(),page=x.handoff.pageCoverage.pages[0];
  if (kind==="raster") page.rasterObjects=1;
  if (kind==="vector") page.vectorPaints=1;
  if (kind==="scan-failure") page.operatorScan="unavailable";
  if (kind==="no-text") page.textLayer="unavailable";
  page.notCompared=uncoveredKinds(page);
  assert.equal(pageComparisons(x.report,x.handoff,x.evidence)[0].status,"requires-human");
});
test("current content changes and candidate groups cannot receive machine-only credit",()=> {
  const x=fixture();x.handoff.baseline=structuredClone(x.handoff);
  x.handoff.snapshot.nodes[0].text="changed";
  assert.equal(pageComparisons(x.report,x.handoff,x.evidence)[0].status,"candidates-or-content-change");
  x.handoff.snapshot.nodes[0].text="same";
  x.report.groups=[{id:"g",findingIds:["f"],pageNos:[1]}];
  x.report.findings=[{id:"f",sourceIds:["s"],targets:[{path:[1]}]}];
  assert.equal(pageComparisons(x.report,x.handoff,x.evidence)[0].status,"candidates-or-content-change");
});
test("PDF operator coverage is sealed to the text evidence and detects partial changes",async()=> {
  const bytes=await readFile(repoPath("fixtures/lsr-1.1/LSR-1.1-standards.pdf"));
  const {evidence,pageCoverage}=await extractPdf(bytes,{coverage:true});
  assert.equal(evidence.pages.length,13);assert.equal(pageCoverage.pages.length,13);
  for (const page of pageCoverage.pages) assert.deepEqual(page.notCompared,uncoveredKinds(page));
  const evidenceBytes=Buffer.from(JSON.stringify(evidence)),coverageBytes=Buffer.from(JSON.stringify(pageCoverage));
  const baseline={provenance:{generationId:"g",source:{pdf:{sha256:digest(bytes)}}},snapshot:{revision:"a".repeat(64)}};
  const seal={schemaVersion:"1.3.0",generationId:"g",baselineRevision:baseline.snapshot.revision,pdfSha256:digest(bytes),evidenceSha256:digest(evidenceBytes),coverageSha256:digest(coverageBytes)};
  const files=new Map([["review/pdf-evidence.json",evidenceBytes],["review/page-coverage.json",coverageBytes],["review/page-coverage-complete.json",Buffer.from(JSON.stringify(seal))]]);
  assert.deepEqual(validatePageCoverage(files,baseline),pageCoverage);
  const changed=structuredClone(pageCoverage);changed.pages[0].rasterObjects++;
  files.set("review/page-coverage.json",Buffer.from(JSON.stringify(changed)));
  assert.throws(()=>validatePageCoverage(files,baseline),/page-coverage-binding/);
  seal.coverageSha256=digest(files.get("review/page-coverage.json"));
  files.set("review/page-coverage-complete.json",Buffer.from(JSON.stringify(seal)));
  assert.throws(()=>validatePageCoverage(files,baseline),/page-coverage-inventory/);
});
