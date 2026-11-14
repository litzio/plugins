import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureV13,read,write,reseal,currentSnapshot} from './v13-fixture.mjs';
import {loadProvenance,resolveSource,verifyReviewedSources} from '../src/provenance.mjs';
import {reviewedTrace,digest} from '../src/model.mjs';
import {prepare,refresh,report} from '../src/workflow.mjs';
import {sample} from './sample.mjs';
import {exportReqif} from '../src/reqif.mjs';
import profile from '../profiles/default.json' with {type:'json'};
const load=(root,extra={})=>loadProvenance(root,{inspect:()=>currentSnapshot(root),...extra});
for(const options of [{},{history:true},{rules:true},{rules:true,history:true},{machine:true},{machine:true,humanPage:true}])test('independent v1.3 completion '+JSON.stringify(options),()=>{
 const root=fixtureV13(options),b=load(root,{requireReviewed:true});assert.equal(b.reviewState,'reviewed');assert.deepEqual(Object.values(b.review.counts),[0,0,0,0,0,0]);
 assert.equal(b.review.receiptCurrent,true);assert.equal(b.review.pageComparisons.length,2);
 const src=resolveSource(b,{sourceKey:'synthetic',elementRef:options.rules?'#/tables/0':'#/texts/0',selector:options.rules?'cell:1:0':'full'}).source;
 assert.ok(reviewedTrace(src.trace));
 const first=report(prepare([{key:'synthetic',bundle:b}],profile)).reviewFirst;
 if(options.rules)assert.ok(first.some(row=>row.code==='source-rule-approved'&&row.ruleApprovals.length));
 if(options.machine&&!options.humanPage){assert.ok(first.some(row=>row.code==='source-machine-only'));assert.ok(first.filter(row=>row.code==='source-reviewed').every(row=>!row.message.includes('사람으로 기록된 확인')));}
 if(options.rules){assert.equal(src.trace.expressionReviews[0].confirmation,null);assert.equal(src.trace.ruleApprovals.length,1);assert.equal(src.trace.ruleOpenReceipts.length,1);assert.equal(src.trace.expressionReviews[0].ruleConfirmation.meaning,'rule-approved-representation');}
 if(options.machine&&!options.humanPage){assert.deepEqual(src.trace.machineOnlyPages,[1]);assert.ok(src.trace.diagnostics.some(d=>d.code==='source-machine-only'));}
 const sets=sample(),r=sets[0].requirements[0];r.sources=[src];sets[0].registry[0].nativeDigest='sha256:'+src.trace.documentRevision;r.confirmedDigest=digest(r);
 const xml=exportReqif(sets).xml;assert.ok(xml.includes('docling-to-litzio/1.3.0'));if(options.rules)for(const text of ['rule-approved-representation','ruleOpenReceipts','ruleApprovals'])assert.ok(xml.includes(text));if(options.machine)assert.ok(xml.includes('machineOnlyPages'));
});
const mutations={
 'C0 mixed generation':l=>l.generationId='other', 'C1 pending':l=>l.pending={},'C2 stopped':l=>l.stopped=true,'C3 stale revision':l=>l.revision='a'.repeat(64),
 'C4 missing scope':l=>l.scopes.pop(),'C4 extra scope':l=>l.scopes.push({...l.scopes[0],id:'invented'}),'C4 duplicate scope':l=>l.scopes.push(l.scopes[0]),
 'C4 stale digest':l=>l.scopes[0].checkpoint.contentDigest='a'.repeat(64),'C4 no note':l=>delete l.scopes[0].checkpoint.note,
 'C5 deferred':l=>l.humanDecisions.push({...l.humanDecisions[0],decision:'deferred'}),'C7 removed':l=>l.lossConfirmations=[],'C7 invalidated':l=>l.lossConfirmations[0].invalidatedAt='later','C8 failed':l=>l.scopes[0].state='실패','completion cleared':l=>l.completion=null,
};
for(const [name,mutate] of Object.entries(mutations))test('v1.3 refuses '+name,()=>{const root=fixtureV13(),l=read(root,'correction-ledger.json');mutate(l);write(root,'correction-ledger.json',l);assert.throws(()=>load(root,{requireReviewed:true}));});
for(const [name,mutate] of Object.entries({
 'no open receipt':l=>l.ruleOpens=[],'missing open ID':l=>l.ruleDecisions[0].openIds=[], 'duplicate open ID':l=>l.ruleDecisions[0].openIds.push(l.ruleDecisions[0].openIds[0]),
 'stale representative':l=>l.ruleOpens[0].contentDigest='a'.repeat(64),'stale full rule material':l=>l.ruleDecisions[0].contentDigest='a'.repeat(64),
 'wrong history count':l=>l.ruleDecisions[0].changeCount=100,'different member set':l=>l.ruleDecisions[0].memberIds=[], 'revoked approval':l=>l.ruleDecisions.push({...l.ruleDecisions[0],decisionId:'later',decision:'rejected'}),
 'invalid latest cannot revive old approval':l=>l.ruleDecisions.push({...l.ruleDecisions[0],decisionId:'later',invalidatedAt:'later'}),
}))test('rule approval refuses '+name+' even with resealed copies',()=>{
 const root=fixtureV13({rules:true}),l=read(root,'correction-ledger.json');mutate(l);const c=read(root,'human-review.json');for(const field of ['ruleOpens','ruleDecisions'])c[field]=l[field];l.completion=c;write(root,'correction-ledger.json',l);write(root,'human-review.json',c);reseal(root);assert.throws(()=>load(root,{requireReviewed:true}));
});
test('unassessed pages need human decisions, assistant checkpoints never suffice',()=>{
 const root=fixtureV13({humanPage:true,machine:true}),l=read(root,'correction-ledger.json'),c=read(root,'human-review.json');l.humanDecisions=[];c.humanDecisions=[];
 for(const s of l.scopes){s.state='차이없음';s.checkpoint={revision:l.revision,contentDigest:c.pageComparisons.find(p=>p.scopeId===s.id).contentDigest,time:'synthetic',note:'assistant checkpoint',rulesVersion:'1.0.0'};}
 c.scopes=l.scopes;l.completion=c;write(root,'correction-ledger.json',l);write(root,'human-review.json',c);reseal(root);assert.throws(()=>load(root,{requireReviewed:true}));
});
test('machine-only claim is independently derived from sealed coverage',()=>{
 const root=fixtureV13({machine:true}),c=read(root,'human-review.json'),l=read(root,'correction-ledger.json');c.pageComparisons[0].status='requires-human';l.completion=c;write(root,'human-review.json',c);write(root,'correction-ledger.json',l);reseal(root);assert.equal(load(root).eligibleConfirmed,false);
});
test('schema rejects development coverage methods, partial edits and missing proof files',()=>{
 for(const name of ['review/page-coverage.json','review/page-coverage-complete.json','review/review-complete.json']){
  const root=fixtureV13({machine:true}),c=read(root,'complete.json');c.files=c.files.filter(f=>f.relativePath!==name);write(root,'complete.json',c);assert.throws(()=>load(root,{requireReviewed:true}));
 }
 const root=fixtureV13({machine:true}),coverage=read(root,'review/page-coverage.json');coverage.method='pdfjs-6.5.438-text-and-optimized-paint-v2';write(root,'review/page-coverage.json',coverage);reseal(root);assert.throws(()=>load(root,{requireReviewed:true}));
});
test('v1.3 ledger-only revocation invalidates proposal fingerprint and saved export source',()=>{
 const root=fixtureV13({rules:true}),bundle=load(root),job=prepare([{key:'synthetic',bundle}],profile),source=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/texts/0'}).source;
 const set=sample()[0];set.requirements[0].sources=[source];Object.assign(set.registry[0],{nativeDigest:'sha256:'+bundle.provenance.document.revision,artifactDigest:'sha256:'+bundle.provenance.source.docling.sha256,nativeFile:'document.md',mapFile:'provenance.json'});set.file='proposal.md';
 const options={scope:p=>join(root,p),inspect:()=>currentSnapshot(root)};
 assert.deepEqual(verifyReviewedSources(set,options),[]);
 const l=read(root,'correction-ledger.json');l.completion=null;write(root,'correction-ledger.json',l);
 const next=refresh(job,[{key:'synthetic',bundle:load(root)}],profile);assert.notEqual(next.inputDigest,job.inputDigest);assert.deepEqual(next.responses,{});assert.ok(report(next).reviewFirst.some(p=>p.code==='source-review-required'));assert.equal(verifyReviewedSources(set,options)[0].code,'stale-source-evidence');
});
import {join} from 'node:path';

test('approved policy survives a later unrelated correction and changed representative context',()=>{
 const root=fixtureV13({history:true,rules:true,rulesBefore:true}),b=load(root,{requireReviewed:true}),rule=b.review.ruleReviews.rules[0];
 assert.equal(rule.decision.changeCount,0);assert.notEqual(rule.decision.revision,b.snapshot.revision);assert.notEqual(rule.decision.contentDigest,rule.contentDigest);assert.ok(b.review.ruleReviews.items.every(i=>i.ruleConfirmation));
});
test('a changed member failing machine verification falls back to individual confirmation',()=>{
 const root=fixtureV13({history:true,rules:true,rulesBefore:true,human:'cell'}),marker=read(root,'complete.json'),ledger=read(root,'correction-ledger.json');marker.reviewState='unreviewed';marker.files=marker.files.filter(f=>f.relativePath!=='human-review.json');ledger.completion=null;write(root,'complete.json',marker);write(root,'correction-ledger.json',ledger);const b=load(root);
 assert.equal(b.review.ruleReviews.rules[0].decision.decision,'approved');assert.equal(b.review.ruleReviews.items[0].status,'failed');assert.equal(b.review.ruleReviews.items[0].ruleConfirmation,null);assert.equal(b.review.counts.expressionUnconfirmed,1);assert.throws(()=>load(root,{requireReviewed:true}));
});
test('an explicit current negative expression decision overrides rule approval',()=>{
 const root=fixtureV13({rules:true}),l=read(root,'correction-ledger.json'),other=fixtureV13(),c=read(other,'correction-ledger.json').lossConfirmations[0];
 c.decision='meaning-changed';l.lossConfirmations=[c];write(root,'correction-ledger.json',l);const b=load(root);assert.ok(b.review.expressionReviews[0].ruleConfirmation);assert.equal(b.review.expressionReviews[0].confirmation.decision,'meaning-changed');assert.equal(b.review.counts.expressionUnconfirmed,1);assert.throws(()=>load(root,{requireReviewed:true}));
});
