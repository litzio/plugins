import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,mkdir,readFile,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfPaintSample } from "./pdf-paint-samples.js";
import { extractPdf } from "../src/pdf-evidence.js";
import { assertInspectablePaints } from "../src/pdf-reader.js";
import { makePlan,hash } from "../src/convert.js";
import { buildProvenance,publishHandoff,loadHandoff } from "../src/provenance.js";
import { createReview } from "../src/review.js";
import { createCorrections } from "../src/corrections.js";

for (const kind of ["type3","form","pattern","annotation","soft-mask"]) test(`${kind} paint outside the flat page program stays unassessed`,async()=> {
  const pdf=kind === "type3" ? await readFile(new URL("./type3-paint.pdf",import.meta.url)) : pdfPaintSample(kind);
  const result=await extractPdf(pdf,{coverage:true}),page=result.pageCoverage.pages[0];
  assert.equal(result.evidence.pages[0].items[0].text,"A");
  assert.equal(page.operatorScan,"unavailable");
  assert(page.notCompared.includes("operator-scan-unavailable"));
  if (kind === "type3" || kind === "annotation") {
    assert.equal(page.vectorPaints,0,"no standalone paint must not be promoted to a full scan");
    assert.equal(page.rasterObjects,0);
  }
});
test("unknown or unresolved font metadata is unassessed; an ordinary font remains inspectable",()=> {
  const OPS={setFont:1},program={fnArray:[1],argsArray:[["font",12]]};
  for (const font of [undefined,{}, {isType3Font:true},{isType3Font:false,isInvalidPDFjsFont:true}])
    assert.throws(()=>assertInspectablePaints(program,OPS,()=>font),/unassessed-font-program/);
  assert.throws(()=>assertInspectablePaints(program,OPS,()=>{throw new Error("unresolved");}),/unresolved/);
  assert.doesNotThrow(()=>assertInspectablePaints(program,OPS,()=>({isType3Font:false})));
});

async function generation(root,pdf) {
  const evidence=await extractPdf(pdf),page=evidence.pages[0],bbox=page.items[0].bbox;
  const doc={schema_name:"DoclingDocument",version:"1.10.0",body:{self_ref:"#/body",children:[{$ref:"#/texts/0"}]},
    furniture:{self_ref:"#/furniture",children:[],content_layer:"furniture"},texts:[{self_ref:"#/texts/0",parent:{$ref:"#/body"},children:[],label:"text",text:"A",orig:"A",
      prov:[{page_no:1,bbox:{l:bbox[0],t:bbox[1],r:bbox[2],b:bbox[3],coord_origin:"TOPLEFT"}}]}],tables:[],groups:[],pictures:[],
    pages:{1:{page_no:1,size:{width:100,height:100}}}};
  const raw=JSON.stringify(doc),record={source:{sha256:hash(pdf),bytes:pdf.length},document:{sha256:hash(raw),version:"1.10.0",schema:"DoclingDocument",page_count:1},
    actual_request:{},task:{task_status:"success"},result:{status:"success",errors:[]}};
  const plan=makePlan({doc,record,source:{doclingSha256:hash(raw),pdfSha256:hash(pdf),recordSha256:hash(JSON.stringify(record))}});
  plan.generationId="11111111-1111-4111-8111-111111111111";
  const native="Synthetic native paragraph A",revision=hash(native),snapshot={ok:true,revision,nodes:[{type:"paragraph",path:[1],text:"A",content:[{kind:"text",text:"A"}]}]};
  const receipt={revision,inputs:plan.request.authoring.inputs.map((input)=>({key:input.key,targets:[{path:[1],documentRevision:revision}]}))};
  const items=plan.items.map((item)=>({...item,targets:item.links.flatMap((link)=>receipt.inputs.find((input)=>input.key===link.key).targets.map((target)=>({...target,selector:link.selector,role:link.role}))),cells:[]}));
  await mkdir(root);await mkdir(join(root,"source"));
  for (const [name,bytes] of [["document.md",native],["source/source.pdf",pdf],["source/document.json",raw],["source/conversion-record.json",JSON.stringify(record)],
    ["snapshot.json",JSON.stringify(snapshot)],["receipt.json",JSON.stringify(receipt)]]) await writeFile(join(root,name),bytes);
  await publishHandoff(root,buildProvenance(plan,items,snapshot,receipt,doc));
  await createReview(root,join(root,"review"));
  return createCorrections(root,async(command)=> {
    if (command === "inspect") return structuredClone(snapshot);
    if (command === "check") return {ok:true};
    throw new Error("unexpected-test-command");
  });
}
test("a candidate-free Type3 page cannot finalize or satisfy the reader until a human confirms it",async()=> {
  const plain=await extractPdf(pdfPaintSample("plain"),{coverage:true});
  assert.equal(plain.pageCoverage.pages[0].operatorScan,"complete");
  assert.deepEqual(plain.pageCoverage.pages[0].notCompared,[]);
  const pdf=await readFile(new URL("./type3-paint.pdf",import.meta.url));
  assert.deepEqual(pdf,pdfPaintSample("type3"),"the retained reproducer has a single Type3 rectangular glyph program");
  const root=join(await mkdtemp(join(tmpdir(),"type3-review-")),"generation"),service=await generation(root,pdf);
  let progress=await service.progress();
  assert.equal(progress.scopes.length,1,"there are no problem groups, only a page scope");
  assert.equal(progress.pageComparisons[0].status,"requires-human");
  assert.equal(progress.gate.ready,false);assert.equal(progress.gate.human,1);
  await assert.rejects(service.finalize({revision:progress.revision}),error=>error.code === "review-incomplete");
  await assert.rejects(loadHandoff(root,{requireReviewed:true}),/review-unavailable/);
  const material=await service.pageMaterial(1);
  await service.humanDecision({groupId:"page:1",revision:material.documentRevision,contentDigest:material.contentDigest,
    decision:"confirmed",note:"Synthetic human transition test; not actual content approval"});
  progress=await service.progress();assert.equal(progress.gate.ready,true);
  await service.finalize({revision:progress.revision});
  assert.equal((await loadHandoff(root,{requireReviewed:true})).reviewComplete,true);
});
