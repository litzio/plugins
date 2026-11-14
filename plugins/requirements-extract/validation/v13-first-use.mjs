// v1.3 owner-guide rehearsal through public operations.
// Deterministic declarations exercise plumbing, not human or AI review quality.
// Conversion is intentionally external: use only a frozen bundle unless an already-running server was authorized.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadProvenance,resolveSource} from '../src/provenance.mjs';
import {loadLedger} from '../src/ledger.mjs';
import {fake} from '../test/candidate-fixture.mjs';
const [entry,workspace,host,phase='generate']=process.argv.slice(2),root=resolve(workspace),input=join(root,'operation-input.json'),marker=join(root,'reviewed-flow.json');
const read=p=>JSON.parse(readFileSync(p)),save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2));
function cli(...args){const r=spawnSync(process.execPath,[resolve(entry),...args],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});assert.equal(r.status,0,JSON.stringify({status:r.status,error:r.error?.message,stderr:r.stderr?.slice(-2000),stdout:r.stdout?.slice(-2000)}));return JSON.parse(r.stdout);}
function call(plugin,op,value){save(input,value);const response=cli('operation','invoke','local.'+plugin+'.'+op,'--input',input,'--host',host,'--json');assert.equal(response.receipt.outcome,'success',JSON.stringify(response));return response.result;}
const producer=(op,v)=>call('docling-to-litzio',op,v);
async function wait(row){while(['queued','running'].includes(row.state)){await new Promise(r=>setTimeout(r,200));row=call('requirements-extract','job',{id:row.id});}assert.equal(row.state,'succeeded',JSON.stringify(row));return row.result;}
const inspect=(method,payload)=>wait(call('requirements-extract','inspect',{requestId:randomUUID(),method,payload}));
const act=(action,payload)=>wait(call('requirements-extract','start',{requestId:randomUUID(),action,payload}));
const native=file=>cli('inspect',file,'--format','json');
if(phase==='generate'){
 const p=producer('preflight',{bundle:'lsr/converted'});assert.equal(p.supported,true,JSON.stringify(p));
 let job=producer('start',{bundle:'lsr/converted',fingerprint:p.fingerprint,requestId:randomUUID()});
 while(['queued','running'].includes(job.state)){await new Promise(r=>setTimeout(r,300));job=producer('job',{jobId:job.jobId});}
 assert.equal(job.state,'ready',JSON.stringify(job));save(marker,{producerJobId:job.jobId,handoff:job.output});
 const progress=producer('review-progress',{jobId:job.jobId});save(join(root,'producer-progress.json'),progress);
 console.log(JSON.stringify({phase,state:job.state,gate:progress.gate}));
}else{
 const m=read(marker),jobId=m.producerJobId;
 if(phase==='finalize'){
  let s=producer('review-progress',{jobId});const note='Deterministic workflow test declaration; not actual human review or business approval';
  for(const rule of s.ruleReviews.rules.filter(r=>r.decision?.decision!=='approved')){
   const view=producer('rule-material',{jobId,ruleId:rule.ruleId}).material,openIds=[];
   for(const rep of view.representatives)for(const comparison of rep.comparisons){
    const material=producer('material',{jobId,groupId:comparison.groupId});const openId=randomUUID();
    producer('rule-open',{jobId,openId,actor:'human',ruleId:view.ruleId,lossId:rep.lossId,groupId:comparison.groupId,pageNo:comparison.pageNo,revision:s.revision,ruleContentDigest:view.contentDigest,contentDigest:material.contentDigest});openIds.push(openId);
   }
   producer('rule-decision',{jobId,actor:'human',ruleId:view.ruleId,revision:s.revision,contentDigest:view.contentDigest,decision:'approved',note,openIds});
  }
  s=producer('review-progress',{jobId});
  for(const loss of s.expressionReviews.filter(l=>!l.ruleConfirmation&&l.confirmation?.decision!=='meaning-preserved')){
   const r=read(join(root,m.handoff,'review/review-targets.json')),g=r.groups.find(g=>g.findingIds.some(id=>r.findings.find(f=>f.id===id).sourceIds.includes(loss.sourceId))),f=r.findings.find(f=>g.findingIds.includes(f.id)&&f.sourceIds.includes(loss.sourceId)&&f.regions.length),material=producer('material',{jobId,groupId:g.id});
   producer('loss-decision',{jobId,lossId:loss.lossId,groupId:g.id,revision:s.revision,targetPath:loss.targets[0].path,pageNo:f.regions[0].pageNo,decision:'meaning-preserved',note,contentDigest:material.contentDigest});
  }
  s=producer('review-progress',{jobId});
  for(const scope of s.scopes){
   const page=s.pageComparisons.find(p=>p.scopeId===scope.id);
   if(page?.status==='machine-passed'||page?.status==='requires-human')continue;
   producer('review-checkpoint',{jobId,scopeId:scope.id,revision:s.revision,state:'차이없음',note,contentDigest:s.scopeDigests[scope.id]});
  }
  s=producer('review-progress',{jobId});
  for(const group of s.humanQueue){
   if(group.id.startsWith('page:'))producer('page-compare',{jobId,pageNo:Number(group.id.slice(5))});else producer('material',{jobId,groupId:group.id});
   producer('human-decision',{jobId,groupId:group.id,revision:s.revision,decision:'confirmed',note,contentDigest:s.scopeDigests[group.id]});
  }
  s=producer('review-progress',{jobId});assert.equal(s.gate.ready,true,JSON.stringify(s.gate));producer('review-finalize',{jobId,revision:s.revision});
  const bundle=loadProvenance(join(root,m.handoff),{inspect:native,requireReviewed:true});assert.equal(bundle.reviewState,'reviewed');save(join(root,'consumer-review.json'),bundle.review);save(marker,{...m,revision:s.revision});console.log(JSON.stringify({phase,reviewed:true,conditions:bundle.review.conditions}));
 }else if(phase==='consumer'){
  let s=m.consumerJobId?await inspect('summary',{jobId:m.consumerJobId}):await act('prepare',{document:m.handoff+'/document.md',handoff:m.handoff,upper:[]}),id=s.jobId;save(marker,{...m,consumerJobId:id});
  const state=()=>loadLedger(join(root,'.requirements-extract',id,'ledger')).state;
  const first=state(),machineKey=Object.values(first.corpus.candidates).find(c=>c.sourceKeys.some(k=>first.corpus.sources[k].trace?.machineOnlyPages?.length))?.candidateKey;
  const ruleKey=Object.values(first.corpus.candidates).find(c=>c.kind==='table-cell'&&c.sourceKeys.some(k=>first.corpus.sources[k].trace?.ruleApprovals?.length&&first.corpus.sources[k].trace.tableModel?.reviewRequired))?.candidateKey;
  assert.ok(machineKey&&ruleKey,'Machine-only and rule-approved merged-cell candidates are required');
  const selectedCandidate=c=>c.candidateKey===ruleKey||c.candidateKey===machineKey;
  for(const section of state().corpus.sections){if(state().responses[section.key])continue;const current=state();let response=fake(current,section,{adopt:false});const selected=fake(current,{...section,candidateKeys:section.candidateKeys.filter(k=>selectedCandidate(current.corpus.candidates[k]))});for(const d of selected.decisions.filter(d=>selectedCandidate(current.corpus.candidates[d.candidateKey])))response.decisions[response.decisions.findIndex(v=>v.candidateKey===d.candidateKey)]=d;await act('submit',{jobId:id,response});}
  s=await inspect('summary',{jobId:id});assert.equal(s.requirements.length,2); // One machine-only paragraph and one value from a rule-approved merged table.
  if(!s.links){s=await act('links',{jobId:id,reviewRevision:s.review.revision});s=await act('unlinked',{jobId:id,reviewRevision:s.review.revision,ids:s.linkRequirements.map(r=>r.id),classification:'independent',reason:'Isolated public fixture workflow test; separate machine-only paragraph and rule-approved table value'});}
  const details=[];
  await assert.rejects(act('export',{jobId:id,name:'must-not-export-before-confirm',reviewRevision:s.review.revision}));
  for(const req of s.requirements){const detail=await inspect('detail',{jobId:id,requirementId:req.id});assert.ok(detail.sources.every(v=>v.trace.reviewState==='reviewed'));details.push(detail);s=await act('confirm',{jobId:id,ids:[req.id],planDigest:detail.review.planDigest,inputDigest:detail.review.inputDigest,reviewed:[detail.review]});}
  assert.ok(details.some(d=>d.sources.some(v=>v.trace.ruleApprovals.length>0)));assert.ok(details.some(d=>d.sources.some(v=>v.trace.machineOnlyPages.length>0)));
  await act('save',{jobId:id,name:'v13-proposal',reviewRevision:s.review.revision});await act('export',{jobId:id,name:'v13-formal',reviewRevision:s.review.revision});
  save(marker,{...m,consumerJobId:id});save(join(root,'consumer-detail.json'),details);console.log(JSON.stringify({phase,candidates:s.report.counts.candidates,requirements:s.requirements.length,confirmed:s.review.confirmedCount,formal:true,machineOnlySource:true,ruleApprovedSource:true}));
 }else throw new Error('unknown-phase');
}
