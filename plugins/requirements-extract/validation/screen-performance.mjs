// Same fully judged LSR state; operation-local reuse, never retained verdicts.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {screenService} from '../src/screen-service.mjs';
import {loadLedger,saveLedger,createLedger} from '../src/ledger.mjs';
import {submit} from '../src/workflow.mjs';
import {fake} from '../test/candidate-fixture.mjs';
const [entry,workspace,resultFile,seedFile]=process.argv.slice(2),root=resolve(workspace),service=screenService({root,launcher:{bin:process.execPath,args:[resolve(entry)]}}),marker=JSON.parse(readFileSync(join(root,'reviewed-flow.json'))),times={};
async function time(name,fn){const t=performance.now(),r=await fn();times[name]=performance.now()-t;return r;}
let jobId,s;
if(seedFile){const seed=JSON.parse(readFileSync(seedFile));jobId=seed.id;const folder=join(root,'.requirements-extract',jobId);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'session.json'),JSON.stringify(seed.session));createLedger(join(folder,'ledger'),seed.state);}
else{
 s=await time('prepare',()=>service.action('prepare',{document:marker.handoff+'/document.md',handoff:marker.handoff,upper:[]}));jobId=s.jobId;
 const path=join(root,'.requirements-extract',jobId,'ledger'),old=loadLedger(path);let state=old.state;
 for(const section of state.corpus.sections){const r=fake(state,section,{adopt:false}),selected=fake(state,section);for(const d of selected.decisions.filter(d=>state.corpus.candidates[d.candidateKey].text==='0.12 s'))r.decisions[r.decisions.findIndex(v=>v.candidateKey===d.candidateKey)]=d;state=submit(state,r);}
 saveLedger(path,state,old.head);
 writeFileSync(resultFile+'.seed.json',JSON.stringify({id:jobId,state,session:JSON.parse(readFileSync(join(root,'.requirements-extract',jobId,'session.json')))}));
}
const act=(action,payload={})=>service.action(action,{jobId,reviewRevision:s?.review.revision,...payload});
s=await time('refresh',()=>service.summary({jobId}));
s=await time('links',()=>act('links'));s=await act('unlinked',{ids:s.linkRequirements.map(r=>r.id),classification:'independent',reason:'Deterministic performance fixture, not actual human review'});
let detail=await time('detail',()=>service.detail({jobId,requirementId:s.requirements[0].id}));
s=await time('confirm',()=>act('confirm',{ids:[detail.requirement.id],planDigest:detail.review.planDigest,inputDigest:detail.review.inputDigest,reviewed:[detail.review]}));
for(const r of s.requirements.filter(r=>!s.confirmations[r.id])){detail=service.detail({jobId,requirementId:r.id});s=await act('confirm',{ids:[r.id],planDigest:detail.review.planDigest,inputDigest:detail.review.inputDigest,reviewed:[detail.review]});}
const name='perf-'+jobId;
await time('save',()=>act('save',{name}));await time('export',()=>act('export',{name}));
writeFileSync(resultFile,JSON.stringify({jobId,times,confirmed:s.review.confirmedCount},null,2));console.log(JSON.stringify({times,confirmed:s.review.confirmedCount}));
