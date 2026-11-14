import {canonical} from './model.mjs';
import {lossCatalog,protectedDifferenceCount,actorLimitation} from './human-review.mjs';
import {evidenceBindings,pageComparisons,contentHash as H} from './review-bindings-v13.mjs';
import {ruleMaterials,approvedRules} from './review-rules-v13.mjs';
const equal=(a,b)=>canonical(a)===canonical(b);
const required=new Set(['formula-review-required','merged-table-review','heading-basis-low','meaning-loss']);

export function completionProofV13({ledger:l,report,evidence,provenance:p,baselineProvenance,baseline,snapshot,history,doc,coverage,losses,completion,project,need}) {
 const changes=history?.changes??[],revisions=[baseline.revision,...changes.map(c=>c.afterRevision)],known=new Set(revisions);
 const expected=[...report.groups.map(g=>g.id),...evidence.pages.map(p=>'page:'+p.pageNo)];
 need(l?.version===1&&l.reviewVersion==='1.3.0'&&l.generationId===p.generationId&&l.sourceHash===p.source.pdf.sha256&&l.revision===snapshot.revision&&equal(l.changes,changes)&&Array.isArray(l.submissions)&&Array.isArray(l.scopes),'review-ledger','v1.3 원장·교정 사슬 결합 불일치');
 need(equal([...l.scopes.map(s=>s.id)].sort(),[...expected].sort()),'review-scopes','v1.3 범위는 실제 묶음·물리 쪽 전부와 정확히 일치해야 합니다');
 const decisions=l.humanDecisions??[],confirmations=l.lossConfirmations??[],opens=l.ruleOpens??[],ruleDecisions=l.ruleDecisions??[];
 need([decisions,confirmations,opens,ruleDecisions].every(Array.isArray),'review-decisions','v1.3 판단 배열 필요');
 const args={report,evidence,doc,coverage};
 const context=(state,prefix)=>{
  const provenance=project(baselineProvenance,state,'1.3.0');
  const bindings=evidenceBindings({...args,provenance,snapshot:state,changes:prefix});
  return {provenance,bindings,catalog:lossCatalog(losses,provenance,state)};
 };
 const current=context(snapshot,changes),initial=context(baseline,[]);
 const materials=(state,c)=>ruleMaterials({...args,provenance:c.provenance,snapshot:state,baseline,catalog:c.catalog,bindings:c.bindings});
 const currentMaterials=materials(snapshot,current),historical=new Map([[changes.length,currentMaterials]]);
 // Replay the validated chain once. Historical rule witnesses use that exact
 // prefix; correction digests must describe the material BEFORE each write.
 const wanted=new Set(ruleDecisions.map(d=>d.changeCount)),replay=structuredClone(baseline),nodes=new Map(replay.nodes.map(n=>[JSON.stringify(n.path),n]));
 for(let count=0;count<=changes.length;count++){
  if(count===changes.length)break;
  const c=changes[count],old=context(replay,changes.slice(0,count));
  need(c.contentDigest===old.bindings[c.groupId],'history-material-digest','교정 전 자료 digest가 이력의 입력 영수증과 다릅니다');
  if(wanted.has(count))historical.set(count,materials(replay,old));
  const n=nodes.get(JSON.stringify(c.target.kind==='cell'?[...c.target.path,c.target.row,c.target.column]:c.target.path)),field=c.target.kind==='equation'?'latex':'text';
  n[field]=c.after;if(field==='text'&&n.content)n.content=c.afterContent??(c.after?[{kind:'text',text:c.after}]:[]);replay.revision=c.afterRevision;
 }
 const rules=approvedRules(l,currentMaterials,count=>historical.get(count));
 const currentRecord=(record,id)=>!!record&&!record.invalidatedAt&&known.has(record.revision)&&(record.changeCount===undefined||revisions[record.changeCount]===record.revision)&&current.bindings[id]===record.contentDigest;
 need(decisions.every(d=>expected.includes(d.groupId)&&d.actor==='human'&&['confirmed','deferred'].includes(d.decision)&&typeof d.note==='string'&&d.note.trim()&&d.time&&known.has(d.revision)&&/^[a-f0-9]{64}$/.test(d.contentDigest)),'review-decisions','사람 결정의 범위·자료·형식 불일치');
 const groups=new Map(report.groups.map(g=>[g.id,g])),catalog=current.catalog,catalogById=new Map(catalog.map(v=>[v.lossId,v]));
 for(const c of confirmations){
  const loss=catalogById.get(c.lossId),g=groups.get(c.groupId),findings=report.findings.filter(f=>g?.findingIds.includes(f.id));
  need(loss&&c.sourceId===loss.sourceId&&c.reasonCode===loss.reasonCode&&c.actor==='human'&&c.meaning==='expression-semantic-preservation'&&c.comparison==='source-and-current-side-by-side'&&['meaning-preserved','meaning-changed','deferred'].includes(c.decision)&&c.note?.trim()&&c.time&&Number.isInteger(c.changeCount)&&c.changeCount>=0&&revisions[c.changeCount]===c.revision&&/^[a-f0-9]{64}$/.test(c.contentDigest)&&loss.targets.some(t=>equal(t.path,c.targetPath))&&findings.some(f=>f.sourceIds.includes(c.sourceId)&&f.regions.some(r=>r.pageNo===c.pageNo)),'review-expression-binding','표현 확인의 대상·영역·자료·의미 불일치');
 }
 need(new Set(opens.map(o=>o.openId)).size===opens.length&&new Set(ruleDecisions.map(d=>d.decisionId)).size===ruleDecisions.length,'review-rule-ids','규칙 열람·결정 ID가 중복됩니다');
 const activeDecisions=new Map();for(const d of decisions)if(currentRecord(d,d.groupId))activeDecisions.set(d.groupId,d);
 const confirmed=id=>activeDecisions.get(id)?.decision==='confirmed';
 const comparisons=pageComparisons({provenance:p,report,coverage,current:current.bindings,baseline:initial.bindings}),pageByScope=new Map(comparisons.map(v=>[v.scopeId,v]));
 const scopes=new Map(l.scopes.map(s=>[s.id,s]));
 const uncovered=expected.filter(id=>{
  const s=scopes.get(id),page=pageByScope.get(id);if(page?.status==='machine-passed')return false;
  if(page?.status==='requires-human')return !confirmed(id);
  return !(currentRecord(s.checkpoint,id)&&s.checkpoint.note?.trim()&&(['차이없음','교정후재검사'].includes(s.state)||s.state==='판단불가'&&confirmed(id)));
 });
 const covered=new Set(rules.items.filter(v=>v.ruleConfirmation).map(v=>v.lossId));
 const ruleCovers=g=>{
  const findings=report.findings.filter(f=>g.findingIds.includes(f.id)&&required.has(f.kind));
  return findings.length>0&&findings.every(f=>{
   if(!['meaning-loss','merged-table-review'].includes(f.kind))return false;
   const related=catalog.filter(loss=>f.sourceIds.includes(loss.sourceId)&&(f.kind==='merged-table-review'||loss.reasonCode===f.evidence.reasonCode&&H(loss.originalValue)===H(f.evidence.originalValue)));
   return related.length>0&&related.every(loss=>covered.has(loss.lossId));
  });
 };
 const human=new Set(report.groups.filter(g=>g.kinds.some(k=>required.has(k))&&!ruleCovers(g)||scopes.get(g.id).state==='판단불가'||l.submissions.some(s=>s.groupId===g.id&&s.decision==='uncertain'&&s.revision===l.revision)).filter(g=>!confirmed(g.id)).map(g=>g.id));
 for(const page of comparisons)if(page.status==='requires-human'&&!confirmed(page.scopeId))human.add(page.scopeId);
 const last=new Map();for(const d of decisions)last.set(d.groupId,d);for(const [id,d] of last)if(d.decision==='deferred')human.add(id);
 const expressionReviews=catalog.filter(v=>v.classification==='expression').map(v=>({...v,ruleConfirmation:rules.items.find(i=>i.lossId===v.lossId)?.ruleConfirmation??null,confirmation:confirmations.filter(c=>c.lossId===v.lossId&&currentRecord(c,c.groupId)).at(-1)??null}));
 const counts={uncovered:uncovered.length,human:human.size,blocking:catalog.filter(v=>v.classification==='repair-required').length,expressionUnconfirmed:expressionReviews.filter(v=>v.confirmation?.decision!=='meaning-preserved'&&!(v.ruleConfirmation&&!v.confirmation)).length,failures:l.scopes.filter(s=>s.state==='실패').length,tokenDifferences:protectedDifferenceCount({report,evidence,provenance:p,snapshot,history})};
 const conditions={boundEvidence:p.generationId===l.generationId&&p.source.pdf.sha256===evidence.pdfSha256&&p.document.revision===snapshot.revision,noPending:l.pending===null,running:l.stopped===false,currentRevision:l.revision===snapshot.revision,coverage:counts.uncovered===0,humanDecisions:counts.human===0,contentLosses:counts.blocking===0,expressions:counts.expressionUnconfirmed===0,failureFree:counts.failures===0,protectedValues:counts.tokenDifferences===0};
 const ready=Object.values(conditions).every(v=>v===true);
 const receiptCurrent=!!completion&&completion.generationId===p.generationId&&completion.documentRevision===snapshot.revision&&equal(l.completion,completion)&&equal(l.scopes,completion.scopes)&&equal(decisions,completion.humanDecisions)&&equal(confirmations,completion.lossConfirmations)&&equal(expressionReviews,completion.expressionReviews)&&equal(comparisons,completion.pageComparisons)&&equal(opens,completion.ruleOpens)&&equal(ruleDecisions,completion.ruleDecisions)&&equal(rules,completion.ruleReviews)&&equal(completion.conditions,{ready,...counts});
 const groupSources=Object.fromEntries(report.groups.map(g=>[g.id,[...new Set(report.findings.filter(f=>g.findingIds.includes(f.id)).flatMap(f=>f.sourceIds))]]));
 return {reviewComplete:ready&&receiptCurrent,conditions,counts,receiptCurrent,expressionReviews,humanDecisions:structuredClone(decisions),lossConfirmations:structuredClone(confirmations),groupSources,completion:completion??null,actorLimitation,pageComparisons:comparisons,ruleOpens:structuredClone(opens),ruleDecisions:structuredClone(ruleDecisions),ruleReviews:rules};
}
