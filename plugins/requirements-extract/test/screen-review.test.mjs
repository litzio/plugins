import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {screenFixture} from './screen-fixture.mjs';
import {reviewLists} from '../src/screen-review.mjs';

test('public confirmation rejects an old displayed body even with the new summary hashes',async()=>{
 const f=await screenFixture(),s=f.summary(),id=s.requirements[0].id,old=f.service.detail({jobId:f.jobId,requirementId:id});
 const next=await f.rejudge(),fresh=f.service.detail({jobId:f.jobId,requirementId:id});
 assert.equal(fresh.requirement.id,id);assert.notDeepEqual(fresh.requirement.body,old.requirement.body);
 const payload={jobId:f.jobId,ids:[id],planDigest:next.planDigest,inputDigest:next.inputDigest};
 await assert.rejects(f.service.action('confirm',{...payload,reviewed:[old.review]}),/stale-displayed-review/);
 await assert.rejects(f.service.action('confirm',payload),/stale-displayed-review/);assert.equal(f.summary().review.confirmedCount,0);
 const result=await f.service.action('confirm',{...payload,reviewed:[fresh.review]});assert.equal(result.review.confirmedCount,1);
 const stored=JSON.parse(readFileSync(join(f.root,'.requirements-extract',f.jobId,'session.json')));assert.deepEqual(stored.confirmations[id].reviewed,fresh.review);
 // A pre-fix persisted confirmation has no displayed-detail receipt. Matching
 // body/plan hashes alone must not silently upgrade that legacy record.
 delete stored.confirmations[id].reviewed;writeFileSync(join(f.root,'.requirements-extract',f.jobId,'session.json'),JSON.stringify(stored));
 assert.equal(f.summary().review.confirmedCount,0);await assert.rejects(f.act('export',{name:'legacy-must-not-export'}));assert.equal(existsSync(join(f.root,'legacy-must-not-export.reqif')),false);
});

test('every displayed-detail binding field is mandatory and independently checked',async()=>{
 const f=await screenFixture(),s=f.summary(),id=s.requirements[0].id,d=f.service.detail({jobId:f.jobId,requirementId:id});
 for(const field of Object.keys(d.review))for(const mutation of ['missing','changed']){
  const review=structuredClone(d.review);if(mutation==='missing')delete review[field];else review[field]=field==='sourceRevisions'?[]:'modified';
  await assert.rejects(f.service.action('confirm',{jobId:f.jobId,ids:[id],planDigest:s.planDigest,inputDigest:s.inputDigest,reviewed:[review]}),/stale-displayed-review/,field+'/'+mutation);
 }
 assert.equal(f.summary().review.confirmedCount,0);
});

test('a gap reason change invalidates displayed evidence even when the plan body hash is equal',async()=>{
 const f=await screenFixture(),s=f.summary(),id=s.requirements[0].id,d=f.service.detail({jobId:f.jobId,requirementId:id}),gap=s.links.gaps.find(g=>g.id===id);
 const next=await f.act('gap',{response:{inputDigest:s.links.inputDigest,policyDigest:s.links.policyDigest,gapKey:gap.key,classification:'independent',reason:'A materially revised scope judgment'}});
 assert.equal(s.planDigest,next.planDigest);assert.notEqual(s.review.revision,next.review.revision);
 await assert.rejects(f.service.action('confirm',{jobId:f.jobId,ids:[id],planDigest:next.planDigest,inputDigest:next.inputDigest,reviewed:[d.review]}),/stale-displayed-review/);
 for(const action of ['links','unlinked','save','export'])await assert.rejects(f.service.action(action,{jobId:f.jobId,name:'old-view',reviewRevision:s.review.revision}),/stale-displayed-list/);
});

test('adopted requirements never remove held candidates from processing problem rows',async()=>{
 const f=await screenFixture({hold:true}),s=f.summary(),g=s.review.groupsByCode.hold;
 assert.equal(s.requirements.length,1);assert.equal(g.count,1);assert.equal(g.rows.length,1);assert.equal(g.rows[0].targets[0].candidateKey,f.state().corpus.sections.flatMap(s=>s.candidateKeys)[1]);
 assert.equal(g.rows[0].targets[0].status,'후보 · 보류');
});

test('every finding has one authoritative row, including compound and targetless diagnostics',async()=>{
 const f=await screenFixture({hold:true}),s=f.summary(),state=f.state(),[a,b]=Object.values(state.corpus.candidates),id=s.requirements[0].id;
 const problems=[{code:'by-requirement',requirementId:id},{code:'by-id',id},{code:'by-candidate',candidateKey:b.candidateKey},{kind:'compound',candidateKeys:[a.candidateKey,b.candidateKey]},
  {code:'by-source',sourceKey:b.sourceKeys[0]},{code:'by-section',sectionKey:b.sectionKey},{code:'by-sections',sectionKeys:[b.sectionKey]},{code:'by-unit',unitKey:b.occurrences[0].unitKey},
  {code:'empty-section',sectionKey:'no-candidate-section'},{code:'unknown-target',id:'unavailable'},...Array.from({length:23},(_,i)=>({code:'hold',candidateKey:b.candidateKey,reason:'Finding '+i}))];
 const value={...s,report:{...s.report,problems},links:null,diagnostics:[{code:'global-error',message:'No candidate target'}]},review=reviewLists({state,head:'test-head',s:{links:null}},value);
 assert.equal(review.problemCount,problems.length+1);
 for(const g of review.groups){assert.equal(g.count,g.rows.length);assert.deepEqual(g.pages.flatMap(p=>p.rows),g.rows);}
 assert.equal(review.groupsByCode.compound.rows[0].targets.length,2);assert.equal(review.groupsByCode['empty-section'].rows[0].targets.length,0);assert.equal(review.groupsByCode['global-error'].count,1);
});
