import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMaterialReader, MATERIAL_FIELDS } from "../src/review-material.js";
import { materialContentDigest, reviewBindings, invalidateChangedReviews } from "../src/review-bindings.js";
import { syntheticGeneration, fakeCli } from "./correction-fixture.js";
import { createReview, readReview } from "../src/review.js";
import { createCorrections } from "../src/corrections.js";
import { loadHandoff } from "../src/provenance.js";

function context() {
  const source=(index)=>({sourceId:`s${index}`,selfRef:`#/texts/${index}`,cells:[],regions:[{pageNo:1}],targets:[{path:[index+1],role:"content"}]});
  return { report:{baselineRevision:"baseline",groups:[{id:"g",findingIds:["f"],pageNos:[1]}],findings:[{id:"f",sourceIds:["s0"],targets:[{path:[1]}]}],checks:[{sourceId:"s0",pdfTokenIds:["token"]}]},
    handoff:{provenance:{generationId:"generation",source:{pdf:{sha256:"pdf"}},items:[source(0),source(1)]},sourceDocument:{texts:[{text:"source"},{text:"neighbor source"}]},snapshot:{revision:"current",nodes:[{path:[1],text:"current"},{path:[2],text:"neighbor",caption:"caption",content:[{kind:"text",text:"neighbor"}]}]},history:{changes:[{target:{path:[2]},before:"a",after:"b"},{target:{path:[100]},before:"unrelated",after:"unrelated edit"}]}},
    evidence:{pages:[{pageNo:1,tokens:[{id:"token",value:"1"}]}]}};
}
test("public material and binding inventory are exhaustive and exclude unrelated history",()=> {
  const c=context(), material=createMaterialReader(c.report,c.handoff,c.evidence)("g");
  assert.deepEqual(Object.keys(material).sort(),Object.keys(MATERIAL_FIELDS).sort());
  assert.equal(material.history.length,1);
  assert.throws(()=>materialContentDigest({...material,newPublicField:[]} ),/unbound-material-field/);
  const missing=structuredClone(material); delete missing.neighbors;
  assert.throws(()=>materialContentDigest(missing),/unbound-material-field/);
});
for (const field of Object.keys(MATERIAL_FIELDS)) test(`material field mutation: ${field}`,()=> {
  const c=context(), material=createMaterialReader(c.report,c.handoff,c.evidence)("g"), changed=structuredClone(material);
  if (MATERIAL_FIELDS[field] === "array") changed[field].push({bindingProbe:"changed"});
  else if (MATERIAL_FIELDS[field] === "object") changed[field].bindingProbe="changed";
  else changed[field]="changed";
  if (field === "documentRevision") assert.equal(materialContentDigest(changed),materialContentDigest(material));
  else {
    const before=materialContentDigest(material), after=materialContentDigest(changed);
    assert.notEqual(after,before);
    const state={completion:{},scopes:[{id:"g",state:"차이없음",checkpoint:{contentDigest:before}}],humanDecisions:[{groupId:"g",decision:"confirmed",contentDigest:before}]};
    invalidateChangedReviews(state,new Map([["g",after]]));
    assert.equal(state.scopes[0].checkpoint,null);
    assert(state.humanDecisions[0].invalidatedAt);
  }
});
for (const field of ["text","caption","content"]) test(`neighbor ${field} changes invalidate the original group`,()=> {
  const c=context(), before=reviewBindings(c.report,c.handoff,c.evidence).get("g");
  c.handoff.snapshot.nodes[1][field]=field === "content" ? [{kind:"math",value:"x"}] : "changed";
  assert.notEqual(reviewBindings(c.report,c.handoff,c.evidence).get("g"),before);
});

async function setup(options) {
  const root=join(await mkdtemp(join(tmpdir(),"material-binding-")),"generation");
  await syntheticGeneration(root,options); await createReview(root,join(root,"review"));
  const fake=await fakeCli(root), service=createCorrections(root,(command,args)=>command === "check" ? {ok:true} : fake(command,args));
  return {root,service,...await readReview(root,join(root,"review"))};
}
async function approveAll(service,report) {
  let state=await service.progress();
  for (const scope of state.scopes) await service.checkpoint({scopeId:scope.id,revision:state.revision,state:"차이없음",note:"Deterministic inspection"});
  state=await service.progress();
  for (const group of state.humanQueue) await service.humanDecision({groupId:group.id,revision:state.revision,decision:"confirmed",note:"Deterministic decision"});
  for (const loss of state.losses) {
    const group=report.groups.find((g)=>g.findingIds.some((id)=>report.findings.find((f)=>f.id===id).sourceIds.includes(loss.sourceId)));
    await service.lossDecision({lossId:loss.lossId,groupId:group.id,revision:state.revision,targetPath:loss.targets[0].path,pageNo:group.pageNos[0],decision:"meaning-preserved",note:"Deterministic expression decision"});
  }
}
test("uncertain -> human confirmed uses its bound checkpoint and permits completion",async()=> {
  const x=await setup({text:"0.12 s",header:true});
  await approveAll(x.service,x.report);
  const state=await x.service.progress(), groupId=x.report.groups[0].id;
  await x.service.submit({changeId:"uncertain",generationId:state.generationId,revision:state.revision,groupId,actor:"assistant",decision:"uncertain",reason:"Actual scope inspected, human judgment needed"});
  const uncertain=await x.service.progress();
  assert.match(uncertain.scopes.find((scope)=>scope.id===groupId).checkpoint.contentDigest,/^[a-f0-9]{64}$/);
  await x.service.humanDecision({groupId,revision:state.revision,decision:"confirmed",note:"Human resolved the recorded uncertainty"});
  assert.equal((await x.service.progress()).gate.ready,true);
  await x.service.finalize({revision:state.revision});
  assert.equal((await loadHandoff(x.root,{requireReviewed:true})).reviewComplete,true);
});
test("every explicit checkpoint state and both human decisions record the same content binding",async()=> {
  const x=await setup({text:"0.12 s",header:true}), state=await x.service.progress(), groupId=x.report.groups[0].id;
  const expected=reviewBindings(x.report,x.handoff,x.evidence).get(groupId);
  for (const value of ["미검사","검사중","차이없음","교정후재검사","판단불가","실패"]) {
    const checkpoint=await x.service.checkpoint({scopeId:groupId,revision:state.revision,state:value,note:"Explicit state and observed evidence"});
    assert.equal(checkpoint.checkpoint.contentDigest,expected,value);
  }
  for (const decision of ["confirmed","deferred"]) {
    await x.service.humanDecision({groupId,revision:state.revision,decision,note:"Explicit human state"});
    assert.equal((await x.service.progress()).humanDecisions.at(-1).contentDigest,expected,decision);
  }
});
test("correcting an adjacent table invalidates inspections and human confirmation that saw it",async()=> {
  const x=await setup({text:"0.12 s",neighborText:"888"});
  const findGroup=(selfRef)=> {
    const source=x.handoff.provenance.items.find((item)=>item.selfRef===selfRef);
    return x.report.groups.find((group)=>group.findingIds.some((id)=>x.report.findings.find((finding)=>finding.id===id).sourceIds.includes(source.sourceId)));
  };
  const original=findGroup("#/tables/0"), neighbor=findGroup("#/tables/1");
  await approveAll(x.service,x.report);
  const before=await x.service.progress(), material=await x.service.material(neighbor.id);
  assert((await x.service.material(original.id)).neighbors.some((node)=>JSON.stringify(node.path)==="[2,0,0]"));
  await x.service.submit({changeId:"neighbor-edit",generationId:before.generationId,revision:before.revision,groupId:neighbor.id,actor:"human",decision:"correct",target:{kind:"cell",path:[2],row:0,column:0},before:"888",after:"0.12 s",reason:"Deterministic adjacent correction",evidence:{kind:"human-source-region",refs:[],scope:material.findings[0].regions.map((region)=>({pageNo:region.pageNo,bbox:region.bbox}))}});
  const after=await x.service.progress();
  assert.equal(after.scopes.find((scope)=>scope.id===original.id).checkpoint,null);
  assert(after.humanDecisions.filter((record)=>record.groupId===original.id).every((record)=>record.invalidatedAt));
  await assert.rejects(x.service.finalize({revision:after.revision}),/review-incomplete/);
  await assert.rejects(loadHandoff(x.root,{requireReviewed:true}));
  await approveAll(x.service,x.report);
  await x.service.finalize({revision:after.revision});
  assert.equal((await loadHandoff(x.root,{requireReviewed:true})).reviewComplete,true);
});
