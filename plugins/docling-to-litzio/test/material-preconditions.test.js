import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { syntheticGeneration, fakeCli } from "./correction-fixture.js";
import { createReview, readReview } from "../src/review.js";
import { createCorrections } from "../src/corrections.js";
import { loadHandoff } from "../src/provenance.js";
import { createPageBindingProjection, PAGE_BINDING_FIELDS, pageBindingDigest } from "../src/review-bindings.js";

let prepared;
async function baseline() {
  return prepared ??= (async()=> {
    const parent=await mkdtemp(join(tmpdir(),"material-precondition-")),root=join(parent,"baseline");
    await syntheticGeneration(root,{text:"999",neighborText:"888"});
    await createReview(root,join(root,"review"));
    const fake=await fakeCli(root,undefined,{stableContent:true}),service=createCorrections(root,(command,args)=>command==="check" ? {ok:true} : fake(command,args));
    const context=await readReview(root,join(root,"review"));
    const groupFor=(selfRef)=> {
      const source=context.handoff.provenance.items.find((item)=>item.selfRef===selfRef);
      return context.report.groups.find((group)=>group.findingIds.some((id)=>context.report.findings.find((finding)=>finding.id===id).sourceIds.includes(source.sourceId))).id;
    };
    const original=groupFor("#/tables/0"),neighbor=groupFor("#/tables/1");
    await correct(service,original,[1],"999","0.12 s","A");
    return {parent,root,original,neighbor,report:context.report};
  })();
}
async function copy() {
  const b=await baseline(),root=join(b.parent,randomUUID());
  await cp(b.root,root,{recursive:true});
  const handoff=await loadHandoff(root),fake=await fakeCli(root,handoff.snapshot,{stableContent:true});
  return {...b,root,service:createCorrections(root,(command,args)=>command==="check" ? {ok:true} : fake(command,args))};
}
async function correct(service,groupId,path,before,after,changeId) {
  const seen=await service.material(groupId);
  return service.submit({changeId,generationId:seen.generationId,revision:seen.documentRevision,contentDigest:seen.contentDigest,groupId,actor:"human",decision:"correct",target:{kind:"cell",path,row:0,column:0},before,after,reason:"Deterministic correction with observed material",evidence:{kind:"human-source-region",refs:[],scope:seen.findings[0].regions.map((region)=>({pageNo:region.pageNo,bbox:region.bbox}))}});
}
async function payload(x,method,seen) {
  const base={revision:seen.documentRevision,contentDigest:seen.contentDigest,note:"Observed material only"};
  if (method === "checkpoint") return {...base,scopeId:x.original,state:"차이없음"};
  base.groupId=x.original;
  if (method === "humanDecision") return {...base,decision:"confirmed"};
  if (method === "lossDecision") {
    const loss=(await x.service.progress()).losses.find((loss)=>seen.fragments.some((fragment)=>fragment.sourceId===loss.sourceId));
    return {...base,lossId:loss.lossId,targetPath:loss.targets[0].path,pageNo:seen.group.pageNos[0],decision:"meaning-preserved"};
  }
  return {changeId:randomUUID(),generationId:seen.generationId,revision:seen.documentRevision,contentDigest:seen.contentDigest,groupId:x.original,actor:method === "uncertain" ? "assistant" : "human",decision:method === "uncertain" ? "uncertain" : "correct",reason:"Observed evidence must not be replaced at submit time",
    ...(method === "correct" ? {target:{kind:"cell",path:[1],row:0,column:0},before:"0.12 s",after:"0.13 s",evidence:{kind:"human-source-region",refs:[],scope:seen.findings[0].regions.map((region)=>({pageNo:region.pageNo,bbox:region.bbox}))}} : {})};
}
const invoke=(service,method,input)=>service[["correct","uncertain"].includes(method) ? "submit" : method](input);
test("page evidence inventory binds every field and accepts an explicit resubmission after identical restoration",async()=> {
  const x=await copy(),seen=await x.service.material(x.original),scopeId="page:"+seen.group.pageNos[0];
  const progress=await x.service.progress(),digest=progress.scopeDigests[scopeId];
  const context=await readReview(x.root,join(x.root,"review"));
  const projection=createPageBindingProjection(context.report,context.handoff,context.evidence)(seen.group.pageNos[0]);
  assert.deepEqual(Object.keys(projection).sort(),[...PAGE_BINDING_FIELDS].sort());
  assert.equal(pageBindingDigest(projection),digest);
  assert.throws(()=>pageBindingDigest({...projection,unboundField:[]}),/unbound-page-material-field/);
  for (const field of PAGE_BINDING_FIELDS) {
    const changed=structuredClone(projection);
    changed[field]=Array.isArray(changed[field]) ? [...changed[field],"changed"] : "changed";
    assert.notEqual(pageBindingDigest(changed),digest,field);
    delete changed[field];
    assert.throws(()=>pageBindingDigest(changed),/unbound-page-material-field/,field);
  }
  const input={scopeId,revision:seen.documentRevision,contentDigest:digest,state:"차이없음",note:"Previously inspected identical page evidence"};
  await x.service.checkpoint(input);
  const documentBefore=await readFile(join(x.root,"document.md"));
  await correct(x.service,x.neighbor,[2],"888","0.12 s","page-B");
  let current=await x.service.progress();
  assert.notEqual(current.scopeDigests[scopeId],digest);
  assert.equal(current.scopes.find((scope)=>scope.id===scopeId).checkpoint,null);
  await assert.rejects(x.service.checkpoint({...input,revision:current.revision}),/stale-material/);
  const undoSeen=await x.service.material(x.neighbor);
  await x.service.undo({undoOf:"page-B",changeId:"page-undo-B",actor:"human",reason:"Restore the inspected page content",contentDigest:undoSeen.contentDigest});
  assert.deepEqual(await readFile(join(x.root,"document.md")),documentBefore);
  current=await x.service.progress();
  assert.equal(current.revision,input.revision);
  assert.equal(current.scopeDigests[scopeId],digest);
  assert.equal(current.scopes.find((scope)=>scope.id===scopeId).state,"미검사");
  assert.equal(current.scopes.find((scope)=>scope.id===scopeId).checkpoint,null);
  assert.notEqual((await x.service.material(x.original)).contentDigest,seen.contentDigest,"group evidence includes the added local history");
  // No observation nonce or session-order check: this is a NEW true assertion
  // about the same page content, not automatic resurrection of the old record.
  await x.service.checkpoint(input);
  current=await x.service.progress();
  assert.equal(current.scopes.find((scope)=>scope.id===scopeId).state,"차이없음");
  assert.equal(current.scopes.find((scope)=>scope.id===scopeId).checkpoint.contentDigest,digest);
  assert.equal(current.reviewComplete,false);
});
for (const method of ["checkpoint","humanDecision","lossDecision","uncertain","correct"]) {
  test(`${method} requires a supplied material digest`,async()=> {
    const x=await copy(),seen=await x.service.material(x.original),input=await payload(x,method,seen);
    delete input.contentDigest;
    const before=await readFile(join(x.root,"correction-ledger.json"));
    await assert.rejects(invoke(x.service,method,input),(error)=>["material-digest-required","schema-invalid"].includes(error.code));
    assert.deepEqual(await readFile(join(x.root,"correction-ledger.json")),before);
  });
  for (const event of ["neighbor-changed","same-revision-local-history-grew"])
    test(`${method} refuses old observed material after ${event}`,async()=> {
      const x=await copy(),seen=await x.service.material(x.original),input=await payload(x,method,seen),documentBefore=await readFile(join(x.root,"document.md"));
      await correct(x.service,x.neighbor,[2],"888","0.12 s","B");
      if (event === "same-revision-local-history-grew") {
        const undoSeen=await x.service.material(x.neighbor);
        await x.service.undo({undoOf:"B",changeId:"undo-B",actor:"human",reason:"Restore document bytes, retain history",contentDigest:undoSeen.contentDigest});
        assert.deepEqual(await readFile(join(x.root,"document.md")),documentBefore);
      }
      const current=await x.service.material(x.original);
      assert.notEqual(current.contentDigest,seen.contentDigest);
      if (event === "same-revision-local-history-grew") {
        assert.equal(current.documentRevision,seen.documentRevision);
        assert.equal(seen.history.length,1);
        assert.equal(current.history.length,3);
      } else {
        assert.notEqual(current.documentRevision,seen.documentRevision);
        await assert.rejects(invoke(x.service,method,input),/stale-/);
      }
      // Even changing only the revision label cannot bless unseen context.
      input.revision=current.documentRevision;
      const ledgerBefore=await readFile(join(x.root,"correction-ledger.json"));
      await assert.rejects(invoke(x.service,method,input),(error)=>error.code === "stale-material");
      assert.deepEqual(await readFile(join(x.root,"correction-ledger.json")),ledgerBefore);
      await assert.rejects(x.service.finalize({revision:current.documentRevision}),/review-incomplete/);
      assert.equal((await loadHandoff(x.root)).reviewComplete,false);
      // An actual reread supplies the accepted digest, never an implicit refresh.
      input.contentDigest=current.contentDigest;
      await invoke(x.service,method,input);
      const recorded=await x.service.progress();
      const digest=method === "checkpoint" || method === "uncertain" ? recorded.scopes.find((scope)=>scope.id===x.original).checkpoint.contentDigest
        : method === "humanDecision" ? recorded.humanDecisions.at(-1).contentDigest
        : method === "lossDecision" ? recorded.lossConfirmations.at(-1).contentDigest
        : recorded.changes.at(-1).contentDigest;
      assert.equal(digest,input.contentDigest);
    });
}
