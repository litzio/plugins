import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,unlinkSync,readdirSync} from 'node:fs';
import {join,dirname,relative,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sourceCli} from './cli.mjs';
import {loadProvenance} from './provenance.mjs';
import {nativeInput} from './native-input.mjs';
import {prepare,refresh,submit,batch,report,proposal,reopen,checkProfile} from './workflow.mjs';
import {createLedger,loadLedger,saveLedger} from './ledger.mjs';
import {selectionSchema} from './selection-schema.mjs';
import {prepareLinks,refreshLinks,submitLinks,linkReport,linkProposal,classifyGap,linkBatch,linkSchema,gapSchema,linkPolicy} from './upstream.mjs';
import {digest,canonical,sha256,validate,semantic} from './model.mjs';
import {normalizeEvidence,textOf} from './protected.mjs';
import {reviewRevision,reviewLists,detailReview,checkReviewed} from './screen-review.mjs';
import {exportReqif} from './reqif.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const need=(v,code)=>{if(!v)throw new Error(code);};
const uid=v=>need(/^[a-f0-9-]{36}$/.test(v),'invalid-id');
export function screenService({root,launcher,cli:providedCli}) {
 need(launcher?.bin&&Array.isArray(launcher.args),'official-cli-unavailable');
 const cli=providedCli??sourceCli({launcher,root,scratchDirectory:'.requirements-extract/.cli-inputs'}),store=cli.scoped('.requirements-extract');mkdirSync(store,{recursive:true});
 const at=id=>{uid(id);return cli.scoped(join('.requirements-extract',id));};
 const info=id=>json(join(at(id),'session.json')),save=(id,s)=>writeFileSync(join(at(id),'session.json'),canonical(s));
 const invalidate=(s,reason)=>{if(s.links)s.linkHistory=[...(s.linkHistory??[]),{reason,links:s.links}];s.links=null;s.confirmations={};};
 const profiles=()=>({profiles:[{path:'',name:'기본',available:true},...(existsSync(cli.scoped('profiles'))?readdirSync(cli.scoped('profiles')).filter(n=>n.endsWith('.json')).map(name=>{const path='profiles/'+name;try{const p=json(cli.scoped(path));checkProfile(p);linkPolicy(p);return {path,name,available:true};}catch{return {path,name,available:false};}}):[])]});
 const readUpper=file=>{
  const set=cli.read(file),cache=new Map();
  for(const r of set.requirements)for(const src of r.sources)if(src.nativeLocation){
   const n=src.nativeLocation,path=cli.scoped(join(dirname(file),n.file));
   if(!cache.has(path))cache.set(path,cli.run('inspect',path,'--format','json'));
   const read=cache.get(path),node=read.nodes.find(v=>canonical(v.path)===canonical(n.path));
   const quote=Number.isInteger(n.listItem)?textOf(node?.items?.[n.listItem]?.content??[]):node?.text??node?.latex??node?.code;
   need(read.revision===n.revision&&sha256(readFileSync(path)).slice(7)===n.revision&&quote===src.quote,'stale-upper-source');
  }
  return set;
 };
 function inputs(id,s) {
  const key='input';
  if(s.handoff) {
   const bundle=loadProvenance(cli.scoped(s.handoff),{inspect:p=>cli.run('inspect',p,'--format','json')});
   need(cli.scoped(join(s.handoff,bundle.provenance.document.relativePath))===cli.scoped(s.document),'handoff-document-mismatch');
   return [{key,bundle,registry:{sourceKey:key,artifactDigest:'sha256:'+bundle.provenance.source.docling.sha256,nativeDigest:'sha256:'+bundle.provenance.document.revision,nativeFile:s.document,mapFile:join(s.handoff,'provenance.json').replaceAll('\\','/')}}];
  }
  return [nativeInput(cli,s.document,key,join('.requirements-extract',id,'snapshot.json').replaceAll('\\','/'))];
 }
 function fresh(id) {
  const s=info(id),path=join(at(id),'ledger'),old=loadLedger(path);need(!old.diagnostics.length,'ledger-corrupt');
  const p=s.profile?json(cli.scoped(s.profile)):json(new URL('../profiles/default.json',import.meta.url));
  const next=refresh(old.state,inputs(id,s),p);
  if(next.inputDigest!==old.state.inputDigest||next.policyDigest!==old.state.policyDigest){saveLedger(path,next,old.head);invalidate(s,'input-or-policy-changed');save(id,s);}
  if(s.links) {
   const lower=s.links.job.lower[0];need(cli.run('inspect',cli.scoped(lower.file),'--format','json').revision===lower.revision,'link-baseline-changed');
   const links=refreshLinks(s.links.job,s.upper.map(readUpper),s.links.job.lower,next.profile);
   if(links.inputDigest!==s.links.job.inputDigest||links.policyDigest!==s.links.job.policyDigest){s.links.job=links;s.confirmations={};save(id,s);}
  }
  return {s,...loadLedger(path),path};
 }
 function plan(id,current) {
  const c=current??fresh(id);let set=proposal(c.state);
  for(const r of set.requirements)if(!r.footnotes?.length)delete r.footnotes;
  if(c.s.links) {need(c.s.links.lowerDigest===sha256(canonical(set)),'stale-link-plan');set=linkProposal(c.s.links.job).sets.at(-1);delete set.revision;delete set.file;delete set.diagnostics;}
  return {set,planDigest:sha256(canonical(set)),inputDigest:c.state.inputDigest,policyDigest:c.state.policyDigest};
 }
 function checkedPlan(id,current) {const c=current??fresh(id),revision=reviewRevision(c);need(c.s.links,'upper-links-required');const p=plan(id,c);for(const r of p.set.requirements){const record=c.s.confirmations[r.id];if(record&&record.reviewed?.revision===revision&&record.digest===digest(r)&&record.inputDigest===p.inputDigest&&record.planDigest===p.planDigest){r.status='confirmed';r.confirmedDigest=digest(r);}}return {...p,c};}
 function summary(id) {
  const c=fresh(id);let p=null,diagnostics=[];try{p=plan(id,c);}catch(e){diagnostics=e.diagnostics??[{code:e.message,severity:'error'}];}
  const requestRoot=cli.scoped('.requirements-extract-requests');
  const failures=existsSync(requestRoot)?readdirSync(requestRoot).filter(n=>n.endsWith('.json.done')).flatMap(name=>{const row=json(join(requestRoot,name)),m=row.request;if(row.state!=='failed'||m?.action!=='submit'||m.jobId!==id||m.inputDigest!==c.state.inputDigest||c.state.responses[m.sectionKey])return [];return (row.diagnostics??[]).map(d=>({...d,sectionKey:m.sectionKey,requestId:row.id}));}):[];
  const review=report(c.state);review.problems=[...failures,...review.problems];
  const revision=reviewRevision(c),confirmations=Object.fromEntries(Object.entries(c.s.confirmations).filter(([id,record])=>p&&record.reviewed?.revision===revision&&record.planDigest===p.planDigest&&record.inputDigest===p.inputDigest&&p.set.requirements.some(r=>r.id===id&&digest(r)===record.digest)));
  const requirements=p?.set.requirements??[];
  const value={jobId:id,upperCount:c.s.upper.length,stopped:c.s.stopped===true,document:basename(c.s.document),report:review,links:c.s.links?linkReport(c.s.links.job):null,linkRequirements:c.s.links?.job.lower[0].requirements??[],candidates:Object.values(c.state.corpus.candidates).map(c=>({candidateKey:c.candidateKey,sectionKey:c.sectionKey,sourceKeys:c.sourceKeys,text:c.text})),sections:c.state.corpus.sections.map(s=>({key:s.key,candidates:s.candidateKeys.length,checked:!!c.state.responses[s.key]})),upperRequirements:c.s.links?.job.upper.flatMap(set=>set.requirements.map(r=>({...r,isUpper:true})))??[],requirements,planDigest:p?.planDigest??null,inputDigest:c.state.inputDigest,confirmations,diagnostics};
  return {...value,review:reviewLists(c,value)};
 }
 function detail({jobId,candidateKey,requirementId},current) {
  const c=current??fresh(jobId);let r,upperSet;
  if(requirementId){r=proposal(c.state).requirements.find(r=>r.id===requirementId);if(c.s.links&&linkReport(c.s.links.job).readyForHumanReview)r=plan(jobId,c).set.requirements.find(r=>r.id===requirementId)??r;
   if(!r)for(const file of c.s.upper){const set=readUpper(file),found=set.requirements.find(r=>r.id===requirementId);if(found){r=found;upperSet=set;break;}}}
  const candidate=c.state.corpus.candidates[candidateKey];need(r||candidate,'missing-item');
  const sources=r?.sources??candidate.sourceKeys.map(k=>c.state.corpus.sources[k]);
  const views=upperSet?[{path:cli.scoped(upperSet.file),target:{revision:upperSet.revision,path:r.location},label:'상위 요구사항'}]:sources.flatMap(source=>{const t=source.trace?.targets?.[0],n=source.nativeLocation;if(!t&&!n)return [];
   const path=n?.path??(t.selector.kind==='cell'?[...t.path,t.selector.row,t.selector.column]:t.path);
   return [{path:cli.scoped(n?.file??c.s.document),target:{revision:n?.revision??source.trace.documentRevision,path},label:'입력 문서',source}];});
  const value={requirement:r??null,candidate:candidate??null,sources,views,linkReview:c.s.links&&r&&!upperSet?linkBatch(c.s.links.job,r.id):null,gaps:c.s.links?linkReport(c.s.links.job).gaps.filter(g=>g.id===r?.id):[]};
  let planDigest=null;try{planDigest=plan(jobId,c).planDigest;}catch{}
  return {...value,review:detailReview(value,{jobId,revision:reviewRevision(c),planDigest,inputDigest:c.state.inputDigest,policyDigest:c.state.policyDigest})};
 }
 async function action(action,payload) {
  if(action==='prepare') {
   const id=payload.jobId??randomUUID();uid(id);need(!existsSync(at(id)),'job-already-exists');mkdirSync(at(id));
   const rel=p=>relative(root,cli.scoped(p)).replaceAll('\\','/');
   const s={document:rel(payload.document),handoff:payload.handoff?rel(payload.handoff):'',upper:(payload.upper??[]).map(rel),profile:payload.profile?rel(payload.profile):'',confirmations:{},links:null};
   need(typeof s.document==='string'&&s.document&&!s.upper.some(p=>typeof p!=='string'),'invalid-inputs');cli.scoped(s.document);s.upper.forEach(p=>cli.scoped(p));
   const p=s.profile?json(cli.scoped(s.profile)):json(new URL('../profiles/default.json',import.meta.url)),job=prepare(inputs(id,s),p);
   if(s.upper.length){const upper=s.upper.map(readUpper);need(upper.every(set=>set.exportNamespace===upper[0].exportNamespace),'upper-namespace');job.set.exportNamespace=upper[0].exportNamespace;}
   createLedger(join(at(id),'ledger'),job);save(id,s);return summary(id);
  }
  const id=payload.jobId;uid(id);const lock=join(at(id),'mutation.lock'),fd=openSync(lock,'wx');
  try {
   const c=fresh(id);
   if(['links','unlinked','save','export'].includes(action))need(payload.reviewRevision===reviewRevision(c),'stale-displayed-list');
   need(!c.s.stopped||!['submit','links','link-submit','gap','unlinked'].includes(action),'job-stopped');
   if(action==='submit'||action==='reopen') {const next=action==='submit'?submit(c.state,payload.response):reopen(c.state,payload.sectionKey);saveLedger(c.path,next,c.head);invalidate(c.s,'candidate-judgment-changed');save(id,c.s);return summary(id);}
   if(action==='links') {
    need(!c.s.links,'link-job-already-exists');
    const p=plan(id,c),sets=c.s.upper.map(readUpper);
    // Create a new saved baseline to bind link decisions to an official revision.
    const file='.requirements-'+randomUUID()+'.md';cli.create(p.set,file);const lower=cli.read(file);
    c.s.links={lowerDigest:sha256(canonical(p.set)),job:prepareLinks(sets,[lower],c.state.profile)};c.s.unlinkedDecisions={};c.s.confirmations={};save(id,c.s);return summary(id);
   }
   if(action==='link-submit'||action==='gap') {need(c.s.links,'link-job-required');c.s.links.job=action==='gap'?classifyGap(c.s.links.job,payload.response):submitLinks(c.s.links.job,payload.response);c.s.confirmations={};save(id,c.s);return summary(id);}
   if(action==='unlinked') {
    need(c.s.links&&!c.s.upper.length,'empty-upper-scope-required');need(Array.isArray(payload.ids)&&payload.ids.length&&typeof payload.reason==='string'&&payload.reason.trim()&&['independent','out-of-scope'].includes(payload.classification),'unlinked-reason-required');
    let job=c.s.links.job;const decisions=Object.fromEntries(linkReport(job).gaps.filter(g=>g.classification).map(g=>[g.id,{classification:g.classification.classification,reason:g.classification.reason}]));
    for(const lowerId of payload.ids){
     need(!decisions[lowerId],'unlinked-already-decided');job=submitLinks(job,{inputDigest:job.inputDigest,policyDigest:job.policyDigest,lowerId,scopeReview:{checked:true,reason:payload.reason},choices:[{choice:'none',upperId:null,reason:payload.reason,basis:'scope-review',coverage:'not-applicable',covered:payload.reason,remaining:''}]});decisions[lowerId]={classification:payload.classification,reason:payload.reason};
    }
    for(const gap of linkReport(job).gaps){const d=decisions[gap.id];if(d)job=classifyGap(job,{inputDigest:job.inputDigest,policyDigest:job.policyDigest,gapKey:gap.key,...d});}
    c.s.links.job=job;c.s.unlinkedDecisions=decisions;c.s.confirmations={};save(id,c.s);return summary(id);
   }
   if(action==='task') {
    const file=join('.requirements-extract',id,'assistant-task-'+randomUUID()+'.json');writeFileSync(cli.scoped(file),canonical({version:1,jobId:id,inputDigest:c.state.inputDigest,policyDigest:c.state.policyDigest,sections:c.state.corpus.sections.map(s=>s.key),instructions:'Use the installed requirements skill and public operations. Read each batch/schema. Submit judgments via start, then poll job. Do not infer screen state or source review completion.'}),{flag:'wx'});return {file:cli.scoped(file),name:basename(file),jobId:id,reviewRevision:reviewRevision(c)};
   }
   if(action==='confirm') {
    need(c.s.links,'upper-links-required');
    const p=plan(id,c);need(payload.planDigest===p.planDigest&&payload.inputDigest===p.inputDigest&&Array.isArray(payload.ids)&&payload.ids.length&&new Set(payload.ids).size===payload.ids.length,'stale-confirmation');
    checkReviewed(payload,payload.ids.map(requirementId=>detail({jobId:id,requirementId},c).review));
    const unresolved=report(c.state).problems.filter(p=>['hold','context-needed','oversized-section','unprocessed-section'].includes(p.code));need(!unresolved.length,'unresolved-review');
    const records={...c.s.confirmations};for(const id of payload.ids){const r=p.set.requirements.find(r=>r.id===id);need(r,'unknown-requirement');records[id]={digest:digest(r),inputDigest:p.inputDigest,planDigest:p.planDigest,time:new Date().toISOString(),actor:'human',reviewed:payload.reviewed[payload.ids.indexOf(id)]};}
    // Re-read source and policy after checks, before recording a human decision.
    const last=fresh(id);need(last.state.inputDigest===p.inputDigest&&last.state.policyDigest===p.policyDigest&&plan(id,last).planDigest===p.planDigest&&reviewRevision(last)===reviewRevision(c),'input-changed');c.s.confirmations=records;c.s.confirmationHistory=[...(c.s.confirmationHistory??[]),{ids:payload.ids,records:Object.fromEntries(payload.ids.map(id=>[id,records[id]]))}];save(id,c.s);return summary(id);
   }
   if(action==='save'||action==='export') {
    need(/^[a-zA-Z0-9가-힣_-]{1,80}$/.test(payload.name??''),'invalid-output-name');const p=checkedPlan(id,c);
    const file=payload.name+(action==='save'?'.md':'.reqif');need(!existsSync(cli.scoped(file)),'output-exists');
    if(action==='save') {cli.create(p.set,file);const actual=cli.read(file),meaning=r=>({...semantic(r),body:normalizeEvidence(r.body),footnotes:normalizeEvidence(r.footnotes??[]),status:r.status,confirmedDigest:r.confirmedDigest});need(!actual.diagnostics.some(d=>d.severity==='error')&&canonical(actual.requirements.map(meaning))===canonical(p.set.requirements.map(meaning))&&actual.requirements.every(r=>r.status!=='confirmed'||r.confirmedDigest===digest(r)),'saved-roundtrip');}
    else {const upper=c.s.upper.map(readUpper),out=exportReqif([...upper,p.set],{testOnly:payload.testOnly===true});writeFileSync(cli.scoped(file),out.xml,{flag:'wx'});}
    const last=fresh(id);need(last.state.inputDigest===p.inputDigest&&plan(id,last).planDigest===p.planDigest&&reviewRevision(last)===reviewRevision(c),'input-changed');
    return {file:cli.scoped(file),name:basename(file),reviewState:action==='export'&&payload.testOnly?'test-only':'human-selection'};
   }
   if(action==='stop'||action==='resume'){c.s.stopped=action==='stop';save(id,c.s);return summary(id);}
   throw new Error('unknown-action');
  } finally{closeSync(fd);unlinkSync(lock);}
 }
 return {action,profiles,summary:({jobId})=>summary(jobId),detail,batch:({jobId,sectionKey})=>batch(fresh(jobId).state,sectionKey),schema:({jobId}={})=>({selection:selectionSchema(jobId?fresh(jobId).state.profile:json(new URL('../profiles/default.json',import.meta.url))),link:linkSchema,gap:gapSchema}),linkBatch:({jobId,lowerId})=>{const c=fresh(jobId);need(c.s.links,'link-job-required');return linkBatch(c.s.links.job,lowerId,{all:true});}};
}
