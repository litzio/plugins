import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticGeneration,fakeCli } from "./correction-fixture.js";
import { createReview } from "../src/review.js";
import { createCorrections } from "../src/corrections.js";
import { loadHandoff } from "../src/provenance.js";
import { observed } from "./observed-submission.js";

async function setup() {
  const root=join(await mkdtemp(join(tmpdir(),"rule-review-")),"generation");
  await syntheticGeneration(root,{header:false,text:"0.12 s"});await createReview(root,join(root,"review"));
  const fake=await fakeCli(root,undefined,{stableContent:true});
  return {root,service:createCorrections(root,(command,args)=>command==="check" ? {ok:true} : fake(command,args))};
}
async function opened(service,view) {
  const ids=[];
  for (const rep of view.representatives) for (const comparison of rep.comparisons) {
    const material=await service.material(comparison.groupId),openId=crypto.randomUUID();
    const receipt=await service.ruleOpen({openId,actor:"human",ruleId:view.ruleId,lossId:rep.lossId,
      groupId:comparison.groupId,pageNo:comparison.pageNo,revision:view.documentRevision,
      ruleContentDigest:view.contentDigest,contentDigest:material.contentDigest});ids.push(receipt.openId);
  }
  return ids;
}
async function approve(service,view,openIds) {
  return service.ruleDecision({ruleId:view.ruleId,revision:view.documentRevision,actor:"human",contentDigest:view.contentDigest,
    decision:"approved",note:"Deterministic rule-policy test",openIds});
}

test("rule approval requires observed representatives; machine verification, undo, revocation and completion are recomputed",async()=> {
  const {root,service}=await setup();let state=await service.progress();
  const view=await service.ruleMaterial(state.ruleReviews.rules[0].ruleId);
  await assert.rejects(approve(service,view,[]),(error)=>error.code==="rule-representative-required");
  await assert.rejects(service.ruleDecision({ruleId:view.ruleId,actor:"assistant",revision:view.documentRevision}),(error)=>error.code==="human-rule-required");
  await assert.rejects(approve(service,{...view,contentDigest:undefined},[]),(error)=>error.code==="material-digest-required");
  const openIds=await opened(service,view),approval=await approve(service,view,openIds);
  state=await service.progress();
  assert.equal(state.expressionReviews[0].confirmation,null);
  assert.equal(state.expressionReviews[0].ruleConfirmation.decisionId,approval.decisionId);
  assert.equal(state.gate.expressionUnconfirmed,0);
  for (const scope of state.scopes) await observed(service,"checkpoint",{scopeId:scope.id,revision:state.revision,state:"차이없음",note:"Deterministic inspection"});
  state=await service.progress();
  for (const group of state.humanQueue) await observed(service,"humanDecision",{groupId:group.id,revision:state.revision,decision:"confirmed",note:"Deterministic human check"});
  assert.equal((await service.progress()).gate.ready,true);
  await service.finalize({revision:state.revision});
  assert.equal((await loadHandoff(root,{requireReviewed:true})).reviewComplete,true);
  const groupId=view.representatives[0].comparisons[0].groupId;
  const material=await service.material(groupId),check=material.checks.find((check)=>check.selectorKey==="cell:0");
  const scope=material.pdf.flatMap((page)=> {
    const tokens=page.tokens.filter((token)=>check.pdfTokenIds.includes(token.id));
    return tokens.length ? [{pageNo:page.pageNo,bbox:[Math.min(...tokens.map((token)=>token.bbox[0])),Math.min(...tokens.map((token)=>token.bbox[1])),Math.max(...tokens.map((token)=>token.bbox[2])),Math.max(...tokens.map((token)=>token.bbox[3]))]}] : [];
  });
  const evidence={refs:check.pdfTokenIds,scope};
  await observed(service,"submit",{changeId:"rule-change",generationId:material.generationId,groupId,revision:state.revision,actor:"assistant",decision:"correct",
    before:"0.12 s",after:"0.12 s synthetic",target:{kind:"cell",path:[1],row:0,column:0},reason:"Deterministic mismatch",evidence});
  state=await service.progress();assert.equal(state.ruleReviews.items[0].status,"failed");assert.equal(state.gate.expressionUnconfirmed,1);
  await observed(service,"undo",{changeId:"rule-undo",undoOf:"rule-change",actor:"assistant",reason:"Deterministic restore",evidence});
  state=await service.progress();assert.equal(state.ruleReviews.items[0].status,"verified");assert.equal(state.gate.expressionUnconfirmed,0);
  assert.equal(state.ruleReviews.items[0].ruleConfirmation.decisionId,approval.decisionId,"same policy continues only after item passes verification again");
  const now=await service.ruleMaterial(view.ruleId);
  assert.notEqual(now.contentDigest,view.contentDigest,"local history belongs to representative material");
  await assert.rejects(approve(service,{...view,documentRevision:now.documentRevision},openIds),(error)=>error.code==="stale-material");
  await service.stop();await service.resume();assert.equal((await service.progress()).gate.expressionUnconfirmed,0);
  await service.ruleDecision({ruleId:now.ruleId,revision:now.documentRevision,actor:"human",contentDigest:now.contentDigest,
    decision:"deferred",note:"Deterministic withdrawal",openIds:[]});
  state=await service.progress();assert.equal(state.gate.expressionUnconfirmed,1);
  const ledger=JSON.parse(await readFile(join(root,"correction-ledger.json")));
  ledger.ruleDecisions.pop();await writeFile(join(root,"correction-ledger.json"),JSON.stringify(ledger));
  assert.equal((await service.progress()).gate.expressionUnconfirmed,1,"removing a withdrawal cannot revive invalidated approval");
});

