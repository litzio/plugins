import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractPdf } from "../src/pdf-evidence.js";
import { repoPath } from "./paths.js";
import { digest } from "../src/correction-history.js";
import { pageComparisons, uncoveredKinds, validatePageCoverage } from "../src/page-comparison.js";
import { pageMaterial,pageMaterialDigest,createPageBindingProjection,pageBindingDigest,PAGE_MATERIAL_FIELDS } from "../src/review-bindings.js";
import { completionGate } from "../src/human-review.js";

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

test("public human page material and indexed checkpoint projection bind the same exhaustive fields",()=> {
  const x=fixture(),material=pageMaterial(x.report,x.handoff,x.evidence,1);
  assert.deepEqual(Object.keys(material).sort(),[...PAGE_MATERIAL_FIELDS].sort());
  assert.equal(material.contentDigest,pageBindingDigest(createPageBindingProjection(x.report,x.handoff,x.evidence)(1)));
  const mutations={generationId:(m)=>m.generationId+="x",sourceHash:(m)=>m.sourceHash+="x",
    sources:(m)=>m.sources[0].item.selfRef+="x",blocks:(m)=>m.blocks[0].nodes[0].text+="x",
    pages:(m)=>m.pages[0].items[0].text+="x",extra:(m)=>m.extra.comparisonCoverage.rasterObjects++};
  assert.deepEqual(Object.keys(mutations).sort(),PAGE_MATERIAL_FIELDS.filter((field)=>!["contentDigest","documentRevision"].includes(field)).sort());
  for (const [field,mutate] of Object.entries(mutations)) {
    const changed=structuredClone(material);mutate(changed);
    assert.notEqual(pageMaterialDigest(changed),material.contentDigest,field);
  }
  assert.throws(()=>pageMaterialDigest({...material,unbound:1}),/unbound-page-material-field/);
});

test("machine-only pages meet coverage; an unassessed page cannot be cleared by an assistant checkpoint",()=> {
  const x=fixture();x.report.statistics={pages:1};x.handoff.provenance.document={revision:"revision"};
  const state={reviewVersion:"1.3.0",generationId:"g",sourceHash:"pdf",revision:"revision",scopes:[{id:"page:1",state:"미검사",checkpoint:null}],pending:null,stopped:false};
  assert.equal(completionGate(state,x.report,[],state.revision,x.handoff,x.evidence).uncovered,0);
  x.handoff.pageCoverage.pages[0].rasterObjects=1;x.handoff.pageCoverage.pages[0].notCompared=["raster-content"];
  const digest=pageMaterial(x.report,x.handoff,x.evidence,1).contentDigest;
  state.scopes[0]={id:"page:1",state:"차이없음",checkpoint:{revision:state.revision,contentDigest:digest,note:"Synthetic assistant checkpoint"}};
  assert.equal(completionGate(state,x.report,[],state.revision,x.handoff,x.evidence).uncovered,1);
  state.humanDecisions=[{groupId:"page:1",revision:state.revision,contentDigest:digest,decision:"confirmed"}];
  assert.equal(completionGate(state,x.report,[],state.revision,x.handoff,x.evidence).uncovered,0);
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
