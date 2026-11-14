import { observed } from "./observed-submission.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syntheticGeneration, fakeCli } from "./correction-fixture.js";
import { createReview, readReview } from "../src/review.js";
import { createCorrections } from "../src/corrections.js";
import { loadHandoff } from "../src/provenance.js";
import { reviewBindings, currentReview, invalidateChangedReviews, interruptReview } from "../src/review-bindings.js";
import { digest, need } from "../src/correction-history.js";

test("repeated byte revisions accept fresh confirmations at their own change count", () => {
  const state = {reviewVersion:"1.3.0",baselineMarker:{documentRevision:"r0"},changes:[{afterRevision:"r1"},{afterRevision:"r0"},{afterRevision:"r1"}]};
  const bindings = new Map([["g","digest"]]);
  assert(currentReview({revision:"r1",changeCount:3,contentDigest:"digest"},"g",state,"r1",bindings));
  assert(!currentReview({revision:"r1",changeCount:2,contentDigest:"digest"},"g",state,"r1",bindings));
});

for (const code of ["group-not-found","invalid-checkpoint","legacy-review-read-only","stale-submission","pending-reconcile"])
  test(`processing diagnostic ${code} has a stable code and next action`, () => {
    assert.throws(() => need(false,code), (error) => error.code === code && error.message.startsWith(code+":") && error.message.length > code.length+40);
  });

function context() {
  return {
    report: { groups: [1,2].map((i) => ({ id: `g${i}`, findingIds: [`f${i}`], pageNos: [i] })),
      findings: [1,2].map((i) => ({ id: `f${i}`, sourceIds: [`s${i}`], targets:[{path:[i*10]}] })), checks: [] },
    handoff: { provenance: { generationId: "generation", source: { pdf: { sha256: "pdf" } },
      items: [1,2].map((i) => ({ sourceId: `s${i}`, selfRef:`#/texts/${i-1}`, regions: [{ pageNo: i }], cells: [], targets: [{path:[i*10]}] })) },
      sourceDocument:{texts:[{text:"source1"},{text:"source2"}]},
      snapshot: { revision: "r1", nodes: [1,2].map((i) => ({ path:[i*10], type:"paragraph", text:`text${i}` })) } },
    evidence: { pages: [1,2].map((i) => ({pageNo:i,tokens:[]})) },
  };
}
for (const event of ["text", "rich-content", "evidence", "mapping", "check", "finding"])
  test(`v1.3 scope binding isolates ${event} mutation`, () => {
    const c = context(), initial = reviewBindings(c.report,c.handoff,c.evidence);
    if (event === "text") c.handoff.snapshot.nodes[0].text = "changed";
    if (event === "rich-content") c.handoff.snapshot.nodes[0].content = [{kind:"math",value:"x"}];
    if (event === "evidence") c.evidence.pages[0].tokens.push({id:"changed"});
    if (event === "mapping") c.handoff.provenance.items[0].targets[0].path = [2];
    if (event === "check") c.report.checks.push({sourceId:"s1",status:"unavailable"});
    if (event === "finding") c.report.findings[0].reason = "changed";
    const next = reviewBindings(c.report,c.handoff,c.evidence);
    assert.notEqual(initial.get("g1"), next.get("g1"));
    assert.equal(initial.get("g2"), next.get("g2"));
    const state = {reviewVersion:"1.3.0", completion:{}, scopes:[...initial].map(([id,contentDigest]) => ({id,state:"차이없음",checkpoint:{contentDigest}})),
      humanDecisions: [1,2].map((i)=>({groupId:`g${i}`,contentDigest:initial.get(`g${i}`)}))};
    invalidateChangedReviews(state,next);
    assert(state.humanDecisions[0].invalidatedAt);
    assert(!state.humanDecisions[1].invalidatedAt);
    assert.equal(state.scopes.find((s)=>s.id==="g1").checkpoint,null);
    assert(state.scopes.find((s)=>s.id==="g2").checkpoint);
    // Restoring bytes does not resurrect an invalidated decision.
    assert.equal(currentReview(state.humanDecisions[0],"g1",state,"r1",initial),false);
  });

test("v1.3 interruption preserves completed evidence and clears only in-flight scopes", () => {
  const state = {completion:{},scopes:[{id:"g1",state:"차이없음",checkpoint:{note:"done"}},{id:"g2",state:"검사중",checkpoint:{note:"partial"}}],humanDecisions:[{groupId:"g1"}]};
  const record = structuredClone(state.humanDecisions);
  interruptReview(state);
  assert.equal(state.completion,null);
  assert.equal(state.scopes[0].checkpoint.note,"done");
  assert.equal(state.scopes[1].checkpoint,null);
  assert.deepEqual(state.humanDecisions,record);
});

test("external editing preserves independent scope evidence while blocking the handoff", async () => {
  const root = join(await mkdtemp(join(tmpdir(),"external-scope-")),"generation");
  await syntheticGeneration(root,{text:"0.12 s"});
  await createReview(root,join(root,"review"));
  const fake = await fakeCli(root), service = createCorrections(root,fake);
  const s = await service.progress();
  await observed(service, "checkpoint", {scopeId:"page:1",revision:s.revision,state:"차이없음",note:"Independent page inspection"});
  const before = (await service.progress()).scopes.find((s)=>s.id==="page:1");
  const operations = join(root,"external-edit.json");
  await writeFile(operations,JSON.stringify([{command:"update-table-cell",path:"1,0,0",text:"external"}]));
  await fake("apply-batch",["--operations",operations,"--if-revision",s.revision]);
  const after = await service.progress();
  assert.deepEqual(after.scopes.find((s)=>s.id==="page:1"),before);
  assert.equal(after.reviewComplete,false);
  await assert.rejects(loadHandoff(root));
});

test("v1.3 stop/resume cannot resurrect completion; unchanged inspections permit explicit reissuance", async () => {
  const root = join(await mkdtemp(join(tmpdir(),"review-v13-")),"generation");
  await syntheticGeneration(root,{header:true,text:"0.12 s"});
  await createReview(root,join(root,"review"));
  const fake = await fakeCli(root), service = createCorrections(root,(cmd,args)=> cmd === "check" ? {ok:true} : fake(cmd,args));
  let s = await service.progress();
  await assert.rejects(service.material("page:2"),(error)=>error.code === "group-not-found" && error.message.includes("groups({jobId})"));
  await assert.rejects(observed(service, "checkpoint", {scopeId:"missing",revision:s.revision,state:"차이없음",note:"invalid scope"}),(error)=>error.code === "invalid-checkpoint" && error.message.includes("scopes[].id"));
  await assert.rejects(observed(service, "submit", {after:123}),(error)=>error.code === "schema-invalid" && error.message.includes("material"));
  for (const scope of s.scopes) await observed(service, "checkpoint", {scopeId:scope.id,revision:s.revision,state:"차이없음",note:"Deterministic scope inspection"});
  s = await service.progress();
  for (const group of s.humanQueue) await observed(service, "humanDecision", {groupId:group.id,revision:s.revision,decision:"confirmed",note:"Deterministic human decision"});
  s = await service.progress();
  const {report} = await readReview(root,join(root,"review"));
  for (const loss of s.losses) {
    const group = report.groups.find((g)=>g.findingIds.some((id)=>report.findings.find((f)=>f.id===id).sourceIds.includes(loss.sourceId)));
    await observed(service, "lossDecision", {lossId:loss.lossId,groupId:group.id,revision:s.revision,targetPath:loss.targets[0].path,pageNo:group.pageNos[0],decision:"meaning-preserved",note:"Deterministic expression decision"});
  }
  assert.equal((await service.progress()).gate.ready,true);
  await service.finalize({revision:s.revision});
  assert.equal((await loadHandoff(root,{requireReviewed:true})).marker.schemaVersion,"1.3.0");
  const before = await service.progress();
  await service.stop(); await service.resume();
  s = await service.progress();
  assert.deepEqual(s.scopes,before.scopes);
  assert.deepEqual(s.humanDecisions,before.humanDecisions);
  assert.deepEqual(s.lossConfirmations,before.lossConfirmations);
  assert.equal(s.gate.ready,true);
  assert.equal(s.reviewComplete,false);
  await assert.rejects(loadHandoff(root,{requireReviewed:true}),/review-unavailable/);
  await service.finalize({revision:s.revision});
  assert.equal((await loadHandoff(root,{requireReviewed:true})).reviewComplete,true);
  const legacy = structuredClone(await service.progress());
  const legacyCompletion = structuredClone(legacy.completion);
  legacyCompletion.schemaVersion = "1.2.0";
  delete legacyCompletion.pageComparisons;
  delete legacyCompletion.ruleOpens;delete legacyCompletion.ruleDecisions;delete legacyCompletion.ruleReviews;
  for (const item of legacyCompletion.expressionReviews) delete item.ruleConfirmation;
  for (const scope of legacyCompletion.scopes) if (scope.checkpoint) delete scope.checkpoint.contentDigest;
  for (const record of [...legacyCompletion.humanDecisions,...legacyCompletion.lossConfirmations,...legacyCompletion.expressionReviews.map((r)=>r.confirmation)]) delete record.contentDigest;
  const legacyState = JSON.parse(await readFile(join(root,"correction-ledger.json")));
  delete legacyState.reviewVersion;
  legacyState.completion = legacyCompletion;
  legacyState.scopes = legacyCompletion.scopes;
  legacyState.humanDecisions = legacyCompletion.humanDecisions;
  legacyState.lossConfirmations = legacyCompletion.lossConfirmations;
  const marker = JSON.parse(await readFile(join(root,"complete.json")));
  const completionBytes = JSON.stringify(legacyCompletion);
  marker.schemaVersion = "1.2.0";
  marker.files.find((f)=>f.relativePath==="human-review.json").sha256 = digest(completionBytes);
  const currentLedgerBytes = await readFile(join(root,"correction-ledger.json")), currentMarkerBytes = await readFile(join(root,"complete.json")), currentCompletionBytes = await readFile(join(root,"human-review.json"));
  await writeFile(join(root,"correction-ledger.json"),JSON.stringify(legacyState));
  await writeFile(join(root,"complete.json"),JSON.stringify(marker));
  await writeFile(join(root,"human-review.json"),completionBytes);
  assert.equal((await loadHandoff(root,{requireReviewed:true})).reviewComplete,true);
  for (const [method,input] of [["checkpoint",{}],["humanDecision",{}],["lossDecision",{}],["finalize",{}],["stop",{}],["resume",{}],["reconcile",{}]])
    await assert.rejects(service[method](input),(error)=>error.code==="legacy-review-read-only");
  assert.equal((await loadHandoff(root,{requireReviewed:true})).reviewComplete,true);
  await rename(join(root,"correction-ledger.json"),join(root,"legacy-ledger-backup.json"));
  await assert.rejects(service.progress(),(error)=>error.code === "legacy-review-read-only");
  await assert.rejects(readFile(join(root,"correction-ledger.json")),{code:"ENOENT"});
  await rename(join(root,"legacy-ledger-backup.json"),join(root,"correction-ledger.json"));
  const invalidLegacy = structuredClone(legacyState);
  invalidLegacy.scopes[0].checkpoint.revision = "0".repeat(64);
  await writeFile(join(root,"correction-ledger.json"),JSON.stringify(invalidLegacy));
  await assert.rejects(loadHandoff(root,{requireReviewed:true}));
  await writeFile(join(root,"correction-ledger.json"),currentLedgerBytes);
  await writeFile(join(root,"complete.json"),currentMarkerBytes);
  await writeFile(join(root,"human-review.json"),currentCompletionBytes);
  const file = join(root,"correction-ledger.json"), ledger = JSON.parse(await readFile(file));
  ledger.scopes[0].checkpoint.contentDigest = "0".repeat(64);
  await writeFile(file,JSON.stringify(ledger));
  await assert.rejects(loadHandoff(root,{requireReviewed:true}));
  await assert.rejects(service.finalize({revision:s.revision}),/review-incomplete/);
});
