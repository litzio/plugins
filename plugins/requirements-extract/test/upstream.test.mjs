import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLinks,linkBatch,submitLinks,refreshLinks,linkReport,classifyGap,linkProposal,reopenLinks} from '../src/upstream.mjs';
import {upstreamFixture,linkDecision} from './upstream-fixture.mjs';
import {exportReqif} from '../src/reqif.mjs';
import {canonical} from '../src/model.mjs';
const fixture=()=>{const f=upstreamFixture();return {...f,job:prepareLinks(f.upper,f.lower,f.profile)};};
test('public synthetic 30/60 expected candidate inclusion and false links are measured separately',()=>{
 const f=fixture();let job=f.job,hit=0,top1False=0,falseCandidates=0;
 assert.equal(job.upper[0].requirements.length,30);assert.equal(job.lower[0].requirements.length,60);
 for(const [lowerId,expected] of Object.entries(f.expected)) {
  const b=linkBatch(job,lowerId);assert.equal(b.candidates.length,5);assert.equal(b.entireUpperCatalog.length,30);
  if(b.candidates.some(i=>i.requirement.id===expected))hit++;if(b.candidates[0].requirement.id!==expected)top1False++;
  falseCandidates+=b.candidates.filter(i=>i.requirement.id!==expected).length;
  assert.ok(b.candidates[0].requirement.body.length);job=submitLinks(job,linkDecision(job,lowerId,expected));
 }
 assert.equal(hit,60);assert.equal(top1False,0);assert.equal(falseCandidates,240);
 const report=linkReport(job);assert.equal(report.gaps.length,0);assert.equal(report.readyForHumanReview,true);assert.equal(report.fulfillmentComplete,false);
 const p=linkProposal(job);assert.equal(p.sets[1].requirements.length,60);assert.equal(p.sets[1].requirements.filter(r=>r.status==='confirmed').length,0);
 const trial=exportReqif(p.sets,{testOnly:true});assert.match(trial.xml,/SPEC-RELATION/);assert.throws(()=>exportReqif(p.sets));
 console.log(JSON.stringify({upper:30,lower:60,expectedCandidateInclusion:hit/60,top1False,falseCandidates,falseAcceptedLinks:0,quality:'deterministic synthetic judgments, not AI or real semantic evaluation'}));
});
test('search never creates a relation and more exposes full catalog without success',()=>{
 const f=fixture(),id=Object.keys(f.expected)[0];assert.equal(Object.keys(f.job.decisions).length,0);assert.equal(linkBatch(f.job,id,{all:true}).candidates.length,30);
 let d=linkDecision(f.job,id,null,{choice:'more',basis:'uncertain',coverage:'not-applicable'});const j=submitLinks(f.job,d);assert.ok(linkReport(j).problems.some(p=>p.code==='more'));assert.throws(()=>linkProposal(j));
});
for(const [field,value] of [['basis','topic-only'],['upperId','missing'],['reason',' '],['coverage','not-applicable'],['choice','unknown'],['remaining','unexplained']])test('refines refuses invalid '+field,()=>{
 const f=fixture(),[id,target]=Object.entries(f.expected)[0],d=linkDecision(f.job,id,target,{[field]:value});assert.throws(()=>submitLinks(f.job,d));
});
test('partial fulfillment is never promoted to coverage complete; missing remaining scope blocks',()=>{
 const f=fixture(),[id,target]=Object.entries(f.expected)[0];assert.throws(()=>submitLinks(f.job,linkDecision(f.job,id,target,{coverage:'partial'})));
 const j=submitLinks(f.job,linkDecision(f.job,id,target,{coverage:'partial',remaining:'Other implementation remains unfulfilled'}));assert.ok(linkReport(j).problems.some(p=>p.code==='partial-fulfillment'));assert.equal(linkReport(j).fulfillmentComplete,false);
});
test('two-way omissions retain reasons and scope; policy excludes unjustified independence',()=>{
 const f=fixture(),id=Object.keys(f.expected)[0],d=linkDecision(f.job,id,null,{choice:'none',basis:'scope-review',coverage:'not-applicable'});let j=submitLinks(f.job,d),r=linkReport(j);assert.equal(r.gaps.filter(g=>g.kind==='upper-without-lower').length,30);assert.equal(r.gaps.filter(g=>g.kind==='lower-without-upper').length,60);
 const gap=r.gaps.find(g=>g.id===id);const c={inputDigest:j.inputDigest,policyDigest:j.policyDigest,gapKey:gap.key,classification:'independent',reason:'Synthetic independent requirement'};
 j=classifyGap(j,c);assert.equal(linkReport(j).gaps.find(g=>g.key===gap.key).classification.reason,c.reason);
 assert.throws(()=>classifyGap(j,{...c,reason:' '}));assert.throws(()=>classifyGap(j,{...c,gapKey:'invented'}));
 const changed=structuredClone(f.profile);changed.linking.allowedUnlinked=[];const other=prepareLinks(f.upper,f.lower,changed);assert.throws(()=>classifyGap(other,{...c,policyDigest:other.policyDigest}));
});
test('upstream revision/policy/body changes invalidate judgments and late requests',()=>{
 const f=fixture(),[id,target]=Object.entries(f.expected)[0],d=linkDecision(f.job,id,target),j=submitLinks(f.job,d);
 for(const kind of ['revision','body','policy']) {const u=structuredClone(f.upper),p=structuredClone(f.profile);if(kind==='revision')u[0].revision='b'.repeat(64);if(kind==='body')u[0].requirements[0].body[0].text+=' Changed';if(kind==='policy')p.linking.topK=6;
 const next=refreshLinks(j,u,f.lower,p);assert.equal(Object.keys(next.decisions).length,0);assert.equal(next.history.length,1);assert.throws(()=>submitLinks(next,d));}
 assert.equal(canonical(refreshLinks(j,f.upper,f.lower,f.profile)),canonical(j));assert.throws(()=>submitLinks(j,d));assert.equal(Object.keys(reopenLinks(j,id).decisions).length,0);
});
test('duplicates, cycles, unseen targets and existing links cannot disappear',()=>{
 const f=fixture(),id=Object.keys(f.expected)[0],upper=f.expected[id];
 const duplicate=structuredClone(f.lower);duplicate[0].requirements[1].id=id;assert.throws(()=>prepareLinks(f.upper,duplicate,f.profile));
 f.lower[0].requirements[0].relations=[{role:'refines',targetId:upper,rationale:'existing'}];f.upper[0].requirements[0].relations=[{role:'refines',targetId:id,rationale:'cycle'}];let j=prepareLinks(f.upper,f.lower,f.profile);assert.ok(linkReport(j).problems.some(p=>p.code==='cycle'));
 assert.throws(()=>submitLinks(j,linkDecision(j,id,null,{choice:'none',basis:'scope-review',coverage:'not-applicable'})));
 f.upper[0].requirements[0].relations=[{role:'relatesTo',targetId:'req-1593c157-e436-422d-a7aa-999999999999',rationale:'outside selection'}];j=prepareLinks(f.upper,f.lower,f.profile);const gap=linkReport(j).gaps.find(g=>g.kind==='out-of-scope-unverified');assert.ok(gap);assert.throws(()=>classifyGap(j,{inputDigest:j.inputDigest,policyDigest:j.policyDigest,gapKey:gap.key,classification:'missing',reason:'Cannot prove absence'}));
});
for(const field of ['inputDigest','policyDigest','lowerId','scopeReview','choices'])for(const mutation of ['missing','unknown','null'])test('mechanical response mutation '+field+'/'+mutation,()=>{
 const f=fixture(),[id,target]=Object.entries(f.expected)[0],d=linkDecision(f.job,id,target);if(mutation==='missing')delete d[field];else if(mutation==='unknown')d[field]={unexpected:true};else d[field]=null;assert.throws(()=>submitLinks(f.job,d));
});
for(const field of ['choice','upperId','reason','basis','coverage','covered','remaining'])test('mechanical choice missing '+field,()=>{
 const f=fixture(),[id,target]=Object.entries(f.expected)[0],d=linkDecision(f.job,id,target);delete d.choices[0][field];assert.throws(()=>submitLinks(f.job,d));
});
test('related topics never count as refining children; exclusions need reasons for every omission',()=>{
 const f=fixture();let j=f.job;
 for(const [id,target] of Object.entries(f.expected))j=submitLinks(j,linkDecision(j,id,target,{choice:'relatesTo',basis:'topic-only',coverage:'not-applicable'}));
 assert.equal(linkReport(j).gaps.length,90);
 for(const gap of linkReport(j).gaps)j=classifyGap(j,{inputDigest:j.inputDigest,policyDigest:j.policyDigest,gapKey:gap.key,classification:gap.kind==='lower-without-upper'?'independent':'out-of-scope',reason:'Synthetic exclusion reviewed against entire selected scope'});
 const r=linkReport(j);assert.equal(r.readyForHumanReview,true);assert.equal(r.fulfillmentComplete,false);assert.ok(r.upper.every(u=>u.count===0));assert.ok(r.gaps.every(g=>g.classification.reason));assert.equal(linkProposal(j).sets[1].requirements[0].relations[0].role,'relatesTo');
});
test('level policy and unknown fields cannot be bypassed by a valid-looking relation',()=>{
 const f=fixture(),[id,target]=Object.entries(f.expected)[0];
 f.upper[0].requirements[0].level='system';let j=prepareLinks(f.upper,f.lower,f.profile);assert.throws(()=>submitLinks(j,linkDecision(j,id,target)));
 j=f.job;const d=linkDecision(j,id,target);d.choices[0].confidence=1;assert.throws(()=>submitLinks(j,d));
});
test('obsolete targets are excluded or marked, rejected on selection and invalidate existing judgments',()=>{
 const f=fixture(),[id,target]=Object.entries(f.expected)[0],decided=submitLinks(f.job,linkDecision(f.job,id,target)),upper=structuredClone(f.upper);upper[0].requirements[0].status='obsolete';
 const j=refreshLinks(decided,upper,f.lower,f.profile);assert.equal(Object.keys(j.decisions).length,0);assert.throws(()=>submitLinks(j,linkDecision(j,id,target)),/ineligible-upper-status/);
 assert.ok(!linkBatch(j,id).candidates.some(i=>i.requirement.id===target));assert.equal(linkBatch(j,id,{all:true}).candidates.find(i=>i.requirement.id===target).eligible,false);
 assert.throws(()=>linkProposal(j));assert.equal(linkReport(j).readyForHumanReview,false);
 const lower=structuredClone(f.lower);lower[0].requirements[0].relations=[{role:'refines',targetId:target,rationale:'existing'}];const existing=prepareLinks(upper,lower,f.profile);assert.ok(linkReport(existing).problems.some(p=>p.code==='upper-changed-ineligible-status'));assert.throws(()=>linkProposal(existing));
 const bad=structuredClone(f.profile);bad.linking.eligibleUpperStatuses=['obsolete'];assert.throws(()=>prepareLinks(upper,lower,bad));
});
