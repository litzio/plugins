import {canonical,sha256,digest} from './model.mjs';

// A displayed review is a snapshot of judgments as well as input files. A new
// ledger head or gap/link decision invalidates it even when the body is equal.
export const reviewRevision=c=>sha256(canonical({head:c.head,input:c.state.inputDigest,policy:c.state.policyDigest,links:c.s.links}));
export function detailReview(value,{jobId,revision,planDigest,inputDigest,policyDigest}) {
 return {jobId,revision,planDigest,inputDigest,policyDigest,id:value.requirement?.id??null,
  requirementDigest:value.requirement?digest(value.requirement):null,
  sourceRevisions:value.views.map(v=>v.target),detailDigest:sha256(canonical(value))};
}
export function checkReviewed(payload,current) {
 const fail=()=>{throw new Error('stale-displayed-review');};
 if(!Array.isArray(payload.reviewed)||payload.reviewed.length!==payload.ids.length)fail();
 for(const [index,value] of current.entries())if(value.id!==payload.ids[index]||canonical(payload.reviewed[index])!==canonical(value))fail();
}
const labels={'source-review-required':'출처 검수 필요','source-corrected':'교정된 출처','output-context-excluded':'조건 제외','hold':'보류','context-needed':'문맥 부족','unprocessed-section':'미판단 구획','lower-without-upper':'상위 없음','upper-without-lower':'하위 없음','partial-fulfillment':'부분 충족','source-region-proof':'값·조건 보호 위반','source-region-order':'원문 순서 차이','incomplete-review':'비서 검토 대기','upper-changed-ineligible-status':'상위 상태 변경','unprocessed-lower':'연결 미판단','out-of-scope-unverified':'선택 범위 밖','more':'후보 추가 요청','judgment-difference':'판단 차이','possible-duplicate':'중복 후보','possible-conflict':'충돌 후보'};
const decisionLabels={adopt:'채택',hold:'보류','context-needed':'문맥 부족','non-requirement':'제외',duplicate:'중복'};
function list(rows) {
 const numbered=rows.map((r,i)=>({...r,number:i+1})),pages=[];
 for(let i=0;i<numbered.length;i+=20)pages.push({rows:numbered.slice(i,i+20),number:pages.length+1});
 if(!pages.length)pages.push({rows:[],number:1});
 return {rows:numbered,count:numbered.length,pages,pageCount:pages.length};
}
export function reviewLists(c,summary) {
 const decisions=Object.values(c.state.responses).flatMap(r=>r.decisions),candidates=Object.values(c.state.corpus.candidates);
 const target=(r,kind)=>({key:kind+':'+(r.id??r.candidateKey),kind,...(r.id?{id:r.id}:{candidateKey:r.candidateKey}),title:r.title??r.text,
  status:kind==='candidate'?'후보 · '+(decisionLabels[decisions.find(d=>d.candidateKey===r.candidateKey)?.decision]??'판단 대기'):kind==='upper'?'상위 요구사항':summary.confirmations[r.id]?'사람 확정':'요구사항 초안'});
 const catalog=[...(summary.requirements.length?summary.requirements:summary.linkRequirements).map(r=>target(r,'requirement')),...candidates.map(r=>target(r,'candidate')),...summary.upperRequirements.map(r=>target(r,'upper'))];
 const byId=id=>catalog.filter(t=>t.id===id),byCandidate=keys=>catalog.filter(t=>t.kind==='candidate'&&keys.includes(t.candidateKey));
 function targets(p) {
  if(p.requirementId)return byId(p.requirementId);
  if(p.id)return byId(p.id);
  if(p.candidateKey||p.candidateKeys)return byCandidate(p.candidateKeys??[p.candidateKey]);
  if(p.sourceKey)return byCandidate(candidates.filter(v=>v.sourceKeys.includes(p.sourceKey)).map(v=>v.candidateKey));
  if(p.unitKey)return byCandidate(candidates.filter(v=>v.occurrences.some(o=>o.unitKey===p.unitKey)).map(v=>v.candidateKey));
  if(p.sectionKey||p.sectionKeys){const keys=p.sectionKeys??[p.sectionKey];return byCandidate(candidates.filter(v=>v.occurrences.some(o=>keys.includes(o.sectionKey))).map(v=>v.candidateKey));}
  return [];
 }
 // One row per processing finding. Related targets stay together; findings with
 // no candidate (e.g. an empty section or global export error) stay visible too.
 const problems=[...summary.report.problems,...(summary.links?.problems??[]).filter(p=>p.code!=='unresolved-gap'),
  ...(summary.links?.gaps??[]).filter(g=>!g.classification||['missing','hold'].includes(g.classification.classification)),...summary.diagnostics];
 const grouped=new Map();
 for(const [index,problem] of problems.entries()) {
  const code=problem.code??problem.kind??'diagnostic',related=targets(problem),rows=grouped.get(code)??[];
  rows.push({key:sha256(canonical({index,problem})),title:related.map(t=>t.title).join(' / ')||problem.message||labels[code]||code,
   status:problem.reason??problem.message??labels[code]??code,problem,targets:related});grouped.set(code,rows);
 }
 const groups=[...grouped].map(([code,rows])=>({code,title:labels[code]??code,...list(rows)}));
 const all=list(catalog.filter(t=>t.kind!=='upper'&&!(t.kind==='candidate'&&(summary.requirements.length||summary.linkRequirements.length)&&decisions.find(d=>d.candidateKey===t.candidateKey)?.decision==='adopt')).map(t=>({key:t.key,title:t.title,status:t.status,targets:[t]})));
 return {revision:reviewRevision(c),problemCount:problems.length,confirmedCount:Object.keys(summary.confirmations).length,groups,
  groupsByCode:Object.fromEntries(groups.map(g=>[g.code,g])),all,
  groupList:list(groups.map(g=>({key:g.code,title:g.title,status:g.count+'개',targets:[]}))),empty:list([])};
}
