import Ajv from 'ajv';
import {randomUUID} from 'node:crypto';
import {canonical,sha256,digest,validate,policy,effectiveStatus} from './model.mjs';
const need=(value,code)=>{if(!value) throw Object.assign(new Error(code),{diagnostics:[{file:'upstream-links',location:[],severity:'error',code,message:code}]});};
const equal=(a,b)=>canonical(a)===canonical(b);
const str={type:'string',minLength:1,pattern:'\\S'};
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const linkSchema=obj({inputDigest:str,policyDigest:str,lowerId:str,scopeReview:obj({checked:{const:true},reason:str}),choices:{type:'array',minItems:1,items:obj({choice:{enum:['refines','relatesTo','none','more','hold']},upperId:{type:['string','null']},reason:str,basis:{enum:['satisfies-obligation','topic-only','scope-review','uncertain']},coverage:{enum:['full','partial','not-applicable']},covered:str,remaining:{type:'string'}})}});
export const gapSchema=obj({inputDigest:str,policyDigest:str,gapKey:str,classification:{enum:['missing','out-of-scope','independent','hold']},reason:str});
const ajv=new Ajv({strict:true}),checkLink=ajv.compile(linkSchema),checkGap=ajv.compile(gapSchema);
export function linkPolicy(profile) {
 const p=profile.linking;
 need(Array.isArray(p?.eligibleUpperStatuses)&&p.eligibleUpperStatuses.length&&p.eligibleUpperStatuses.every(s=>['draft','reviewed','confirmed'].includes(s)),'upper-status-profile');
 need(p&&Number.isInteger(p.topK)&&p.topK>0&&p.topK<=50&&equal(p.roles,['refines','relatesTo'])&&Array.isArray(profile.allowedRefinesLevels)&&profile.allowedRefinesLevels.length&&profile.allowedRefinesLevels.every(pair=>pair.length===2&&pair.every(l=>policy.level.includes(l)))&&p.synonyms&&typeof p.synonyms==='object'&&!Array.isArray(p.synonyms)&&Object.entries(p.synonyms).every(([k,v])=>k.trim()&&Array.isArray(v)&&v.every(s=>typeof s==='string'&&s.trim())),'link-profile');
 need(Array.isArray(p.allowedUnlinked)&&p.allowedUnlinked.every(v=>['out-of-scope','independent'].includes(v))&&equal(p.gapClasses,['missing','out-of-scope','independent','hold']),'gap-profile');return p;
}
const selected=sets=>sets.flatMap(s=>s.requirements.map(r=>({setId:s.setId,revision:s.revision,registry:s.registry,requirement:r})));
function checkInputs(upper,lower,profile) {
 linkPolicy(profile);need(Array.isArray(upper)&&lower.length,'link-inputs');
 const all=[...upper,...lower]; need(new Set(all.map(s=>s.setId)).size===all.length && all.every(s=>/^[a-f0-9]{64}$/.test(s.revision)),'document-revision');
 const errors=validate(all).filter(d=>d.severity==='error'&&!['broken-relation','cycle'].includes(d.code));need(!errors.length,'invalid-requirement-sets');
 const items=selected(all);need(new Set(items.map(i=>i.requirement.id)).size===items.length,'duplicate-id');
}
export function prepareLinks(upper,lower,profile) {
 checkInputs(upper,lower,profile);
 return {kind:'upstream-links/1',jobId:randomUUID(),inputDigest:sha256(canonical({upper,lower})),policyDigest:sha256(canonical(profile)),upper:structuredClone(upper),lower:structuredClone(lower),profile:structuredClone(profile),decisions:{},gapDecisions:{},history:[]};
}
export function refreshLinks(job,upper,lower,profile) {
 const next=prepareLinks(upper,lower,profile);
 if(next.inputDigest===job.inputDigest&&next.policyDigest===job.policyDigest)return structuredClone(job);
 return {...next,jobId:job.jobId,history:[...job.history,{inputDigest:job.inputDigest,policyDigest:job.policyDigest,decisions:job.decisions,gapDecisions:job.gapDecisions,reason:'input-or-policy-changed'}]};
}
function words(r,profile) {
 const text=[r.title,canonical(r.body),canonical(r.footnotes??[])].join(' ').toLowerCase();
 const result=new Set(text.match(/[\p{L}\p{N}_]+/gu)??[]);
 for(const [base,aliases] of Object.entries(profile.linking.synonyms)) if([base,...aliases].some(a=>result.has(a.toLowerCase())))result.add(base.toLowerCase());
 return result;
}
function sourceRefs(item) {return new Set(item.requirement.sources.map(s=>[item.registry.find(r=>r.sourceKey===s.sourceKey)?.artifactDigest,s.elementRef,s.selector,s.quoteDigest].join(':')));}
export function linkBatch(job,lowerId,{all=false}={}) {
 need(job.kind==='upstream-links/1','link-job');const lower=selected(job.lower).find(i=>i.requirement.id===lowerId);need(lower,'unknown-lower');
 const terms=words(lower.requirement,job.profile),refs=sourceRefs(lower);
 const eligible=r=>job.profile.linking.eligibleUpperStatuses.includes(effectiveStatus(r));
 const ranking=selected(job.upper).map(upper=>{const shared=[...words(upper.requirement,job.profile)].filter(t=>terms.has(t)).sort(),sources=[...sourceRefs(upper)].filter(s=>refs.has(s));return {...upper,eligible:eligible(upper.requirement),effectiveStatus:effectiveStatus(upper.requirement),score:shared.length+sources.length*5,reasons:{sharedTerms:shared,sharedSourceReferences:sources}};}).sort((a,b)=>b.score-a.score||a.requirement.id.localeCompare(b.requirement.id));
 return {inputDigest:job.inputDigest,policyDigest:job.policyDigest,lower,candidates:all?ranking:ranking.filter(i=>i.eligible).slice(0,job.profile.linking.topK),entireUpperCatalog:ranking.map(i=>({id:i.requirement.id,title:i.requirement.title,setId:i.setId,revision:i.revision,eligible:i.eligible,effectiveStatus:i.effectiveStatus})),previous:job.decisions[lowerId]??null,judgment:'ranking is not a relation or proof of satisfaction'};
}
function validateDecision(job,d) {
 need(checkLink(d),'link-schema');need(d.inputDigest===job.inputDigest&&d.policyDigest===job.policyDigest,'stale-link-decision');
 const b=linkBatch(job,d.lowerId,{all:true}),seen=new Set();
 const control=d.choices.filter(c=>['none','more','hold'].includes(c.choice));need(!control.length||d.choices.length===1,'mixed-link-control');
 for(const c of d.choices) {
   if(['refines','relatesTo'].includes(c.choice)) {
    const upper=b.candidates.find(i=>i.requirement.id===c.upperId);need(upper&&!seen.has(c.upperId),'unknown-or-duplicate-upper');need(upper.eligible,'ineligible-upper-status');seen.add(c.upperId);
    if(c.choice==='refines')need(c.basis==='satisfies-obligation'&&['full','partial'].includes(c.coverage)&&job.profile.allowedRefinesLevels.some(pair=>equal(pair,[b.lower.requirement.level,upper.requirement.level])),'refines-basis');
    else need(c.coverage==='not-applicable','related-not-satisfaction');
    need(c.coverage==='partial'?c.remaining.trim().length>0:c.remaining==='','remaining-scope');
   } else need(c.upperId===null&&c.coverage==='not-applicable'&&c.basis!== 'satisfies-obligation'&&c.remaining==='','control-shape');
 }
 // Existing references need explicit review; this slice never silently deletes links.
 for(const rel of b.lower.requirement.relations) need(d.choices.some(c=>c.choice===rel.role&&c.upperId===rel.targetId),'existing-relation-unreviewed');
}
export function submitLinks(job,decision) {
 validateDecision(job,decision);need(!job.decisions[decision.lowerId],'link-already-decided');
 const next=structuredClone(job);next.decisions[decision.lowerId]=structuredClone(decision);next.gapDecisions={};return next;
}
export function reopenLinks(job,lowerId) {
 need(job.decisions[lowerId],'missing-link-decision');const next=structuredClone(job);next.history.push({lowerId,decision:next.decisions[lowerId],reason:'reopened'});delete next.decisions[lowerId];next.gapDecisions={};return next;
}
function draft(job) {
 const lower=structuredClone(job.lower);
 for(const set of lower)for(const r of set.requirements) {
  const d=job.decisions[r.id];if(!d)continue;validateDecision(job,d);
  const relations=d.choices.filter(c=>['refines','relatesTo'].includes(c.choice)).map(c=>({role:c.choice,targetId:c.upperId,rationale:canonical({reason:c.reason,basis:c.basis,coverage:c.coverage,covered:c.covered,remaining:c.remaining})}));
  r.relations=relations;r.status='draft';r.confirmedDigest='';
 }
 return [...structuredClone(job.upper),...lower];
}
export function linkReport(job) {
 const sets=draft(job),upperIds=new Set(selected(job.upper).map(i=>i.requirement.id)),lowerIds=new Set(selected(job.lower).map(i=>i.requirement.id)),allIds=new Set(sets.flatMap(s=>s.requirements.map(r=>r.id))),incoming=new Map([...upperIds].map(id=>[id,[]])),gaps=[],problems=[];
 const add=(kind,id,extra={})=>gaps.push({key:sha256(canonical({kind,id,...extra})),kind,id,...extra});
 for(const s of sets)for(const r of s.requirements) {
  if(lowerIds.has(r.id)) {
   const refs=r.relations.filter(rel=>rel.role==='refines'&&upperIds.has(rel.targetId));
   if(!refs.length)add('lower-without-upper',r.id);
   for(const rel of refs)incoming.get(rel.targetId).push(r.id);
   for(const rel of r.relations.filter(rel=>upperIds.has(rel.targetId))) {const target=selected(job.upper).find(i=>i.requirement.id===rel.targetId).requirement;if(!job.profile.linking.eligibleUpperStatuses.includes(effectiveStatus(target)))problems.push({code:'upper-changed-ineligible-status',id:r.id,targetId:target.id,status:effectiveStatus(target)});}
   const d=job.decisions[r.id];if(!d)problems.push({code:'unprocessed-lower',id:r.id});
   for(const c of d?.choices??[])if(c.coverage==='partial'||['more','hold'].includes(c.choice))problems.push({code:c.coverage==='partial'?'partial-fulfillment':c.choice,id:r.id,...c});
  }
  for(const rel of r.relations)if(!allIds.has(rel.targetId))add('out-of-scope-unverified',r.id,{targetId:rel.targetId,role:rel.role});
 }
 for(const [id,children] of incoming)if(!children.length)add('upper-without-lower',id);
 for(const d of validate(sets).filter(d=>['cycle','duplicate-id','self-reference'].includes(d.code)))problems.push(d);
 for(const gap of gaps) {
  const d=job.gapDecisions[gap.key];gap.classification=d??null;
  if(!d||['missing','hold'].includes(d.classification))problems.push({code:'unresolved-gap',...gap});
 }
 return {inputDigest:job.inputDigest,policyDigest:job.policyDigest,scope:[...job.upper.map(s=>({setId:s.setId,revision:s.revision,role:'upper'})),...job.lower.map(s=>({setId:s.setId,revision:s.revision,role:'lower'}))],exclusionPolicy:job.profile.linking.allowedUnlinked,upper:[...incoming].map(([id,children])=>({id,children,count:children.length})),gaps,problems,readyForHumanReview:!problems.some(p=>p.code!=='partial-fulfillment'),fulfillmentComplete:false,reviewState:'draft-only'};
}
export function classifyGap(job,decision) {
 need(checkGap(decision),'gap-schema');need(decision.inputDigest===job.inputDigest&&decision.policyDigest===job.policyDigest,'stale-gap-decision');
 const gap=linkReport(job).gaps.find(g=>g.key===decision.gapKey);need(gap,'unknown-gap');
 if(gap.kind==='lower-without-upper'&&['out-of-scope','independent'].includes(decision.classification))need(job.profile.linking.allowedUnlinked.includes(decision.classification),'unlinked-policy');
 if(gap.kind!=='lower-without-upper')need(decision.classification!=='independent','independent-lower-only');
 // An unseen target is never classified as proven absent or satisfied.
 if(gap.kind==='out-of-scope-unverified')need(['out-of-scope','hold'].includes(decision.classification),'unverified-scope');
 const next=structuredClone(job);next.gapDecisions[gap.key]=structuredClone(decision);return next;
}
export function linkProposal(job) {
 const report=linkReport(job);need(report.readyForHumanReview,'link-work-incomplete');
 const sets=draft(job);need(!validate(sets).some(d=>d.severity==='error'),'link-proposal-invalid');
 return {sets,report,changes:selected(sets.slice(job.upper.length)).map(i=>({id:i.requirement.id,relations:i.requirement.relations,sourceDigest:digest(i.requirement)})),reviewState:'draft-only'};
}
