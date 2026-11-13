// Independent implementation of contracts/docling-to-litzio/human-review.md.
// The seal is trusted for generation semantics; current completion is not.
import {createHash} from 'node:crypto';
import {canonical} from './model.mjs';
import {protectedValues} from './corrections.mjs';
const equal=(a,b)=>canonical(a)===canonical(b);
const required=new Set(['formula-review-required','merged-table-review','heading-basis-low','meaning-loss']);
const expressions=new Set(['merged-cell-repeated','compound-header-flattened','table-header-role','cell-block-structure']);
export const actorLimitation='actor는 비인증 자기 선언입니다. 사람으로 기록된 확인이며 인증된 승인·업무 승인·기계 검증을 뜻하지 않습니다';
export function lossCatalog(losses,p,snapshot) {
 return losses.filter(l=>l.severity==='blocking').map(l=>{
  const item=p.items.find(i=>i.sourceId===l.sourceId),targets=item?.targets.filter(t=>t.role==='content')??l.targets??[];
  const paragraph=['dedicated-table-note','footnote-as-paragraph'].includes(l.reasonCode)&&typeof l.originalValue?.text==='string'&&targets.some(t=>t.text===l.originalValue.text&&snapshot.nodes.some(n=>n.type==='paragraph'&&equal(n.path,t.path)));
  const numbered=l.reasonCode==='dedicated-table-note'&&l.originalValue?.reason==='Original table note placement/letter marker becomes a numbered endnote'&&typeof l.originalValue.text==='string'&&targets.some(t=>t.text===l.originalValue.text.replace(/^\S+\s+/,''));
  const expression=(expressions.has(l.reasonCode)&&targets.length>0)||paragraph||numbered;
  return {lossId:createHash('sha256').update(JSON.stringify([l.sourceId,l.reasonCode,l.originalValue])).digest('hex'),sourceId:l.sourceId,reasonCode:l.reasonCode,
   representation:paragraph?'unlinked-annotation':numbered?'numbered-endnote':'native-expression',sourceDefect:l.originalValue?.reason==='Repeated local marker within extracted table scope'?'duplicate-local-note-marker':'none',originalValue:l.originalValue,targets,
   classification:expression?'expression':'repair-required',basis:paragraph?'Note body retained as an unlinked annotation paragraph':numbered?'Note body retained as a numbered endnote':expression?'Declared native representation limit; source values retained':'Content preservation or ownership not established'};
 });
}
export function expressionReviews(l,catalog,revision) {
 return catalog.filter(v=>v.classification==='expression').map(v=>({...v,confirmation:(l.lossConfirmations??[]).filter(c=>c.lossId===v.lossId&&c.revision===revision&&c.changeCount===l.changes.length&&!c.invalidatedAt).at(-1)??null}));
}
function sourceText(snapshot,t,item,p) {
 let n=snapshot.nodes.find(n=>equal(n.path,t.selector.kind==='cell'?[...t.path,t.selector.row,t.selector.column]:t.path));
 if(!n)return null;
 const markers=new Map(p.items.filter(i=>i.structure.noteBinding).map(i=>[i.structure.noteBinding.label,i.structure.noteBinding.marker]));
 const inline=content=>(typeof content==='string'?content:(content??[]).map(c=>c.children?inline(c.children):c.kind==='footnote'?(markers.get(c.label)??''):c.kind==='text'?c.text:c.kind==='math'||c.kind==='code'?c.value:c.kind==='break'?'\n':'').join(''));
 if(item.structure.listProjection) {let entry;for(const index of item.structure.listProjection.indexPath){entry=n?.items?.[index];n=entry?.list;}return entry?inline(entry.content):null;}
 if(t.selector.kind==='list-item')return inline(n.items?.[t.selector.index]?.content);
 if(n.content)return inline(n.content);
 if(n.type==='table'&&item.label==='caption')return inline(n.caption);
 if(n.type==='figure'){const caption=snapshot.nodes.find(v=>v.type==='caption'&&v.path[0]===n.path[0]);return caption?.content?inline(caption.content):caption?.text??'';}
 return n.text??n.latex??n.code??null;
}
export function completionProof({ledger:l,report:r,evidence:e,provenance:p,snapshot,history,losses,completion,need}) {
 need(l?.version===1&&l.generationId===p.generationId&&l.sourceHash===p.source.pdf.sha256&&l.revision===snapshot.revision&&Array.isArray(l.scopes)&&Array.isArray(l.submissions)&&Array.isArray(l.changes)&&equal(l.changes,history?.changes??[]),'review-ledger','검수 원장 결합 불일치');
 // Open nested objects in the published schema are checked for the facts used here.
 need(new Set(l.scopes.map(s=>s.id)).size===l.scopes.length&&l.scopes.every(s=>typeof s.id==='string'&&['미검사','검사중','차이없음','교정후재검사','판단불가','실패'].includes(s.state)),'review-scopes','검수 범위 형식 불일치');
 const groups=new Map(r.groups.map(g=>[g.id,g]));
 const decisions=l.humanDecisions??[],confirmations=l.lossConfirmations??[];
 need(Array.isArray(decisions)&&Array.isArray(confirmations),'review-decisions','검수 판단 배열 필요');
 need(decisions.every(d=>groups.has(d.groupId)&&d.actor==='human'&&['confirmed','deferred'].includes(d.decision)&&typeof d.revision==='string'&&typeof d.note==='string'&&d.note.trim()&&typeof d.time==='string'&&d.time.length),'review-decisions','사람으로 기록된 결정 형식 불일치');
 const catalog=lossCatalog(losses,p,snapshot),reviews=expressionReviews(l,catalog,snapshot.revision);
 // Confirmations consumed in provenance have two representations; check both.
 for(const c of confirmations) {
  const loss=catalog.find(v=>v.lossId===c.lossId),g=groups.get(c.groupId),findings=r.findings.filter(f=>g?.findingIds.includes(f.id));
  need(loss&&c.sourceId===loss.sourceId&&c.reasonCode===loss.reasonCode&&c.actor==='human'&&c.meaning==='expression-semantic-preservation'&&c.comparison==='source-and-current-side-by-side'&&['meaning-preserved','meaning-changed','deferred'].includes(c.decision)&&typeof c.note==='string'&&c.note.trim()&&typeof c.time==='string'&&c.time.length&&typeof c.revision==='string'&&Number.isInteger(c.changeCount)&&c.changeCount>=0&&loss.targets.some(t=>equal(t.path,c.targetPath))&&findings.some(f=>f.sourceIds.includes(c.sourceId)&&f.regions.some(region=>region.pageNo===c.pageNo)),'review-expression-binding','표현 확인의 대상·영역·의미 불일치');
 }
 const revision=snapshot.revision,confirmed=id=>decisions.filter(d=>d.groupId===id&&d.revision===revision&&!d.invalidatedAt).at(-1)?.decision==='confirmed';
 const expected=[...groups.keys(),...e.pages.map(p=>'page:'+p.pageNo)];
 const uncovered=expected.filter(id=>!l.scopes.some(s=>s.id===id&&s.checkpoint?.revision===revision&&typeof s.checkpoint.note==='string'&&s.checkpoint.note.trim()&&(['차이없음','교정후재검사'].includes(s.state)||(s.state==='판단불가'&&confirmed(id)))));
 const human=new Set(r.groups.filter(g=>g.kinds.some(k=>required.has(k))||l.scopes.some(s=>s.id===g.id&&s.state==='판단불가')||l.submissions.some(s=>s.groupId===g.id&&s.decision==='uncertain'&&s.revision===revision)).filter(g=>!confirmed(g.id)).map(g=>g.id));
 const last=new Map();for(const d of decisions)if(d.revision===revision)last.set(d.groupId,d);for(const [id,d] of last)if(d.decision==='deferred')human.add(id);
 let tokenDifferences=0;
 for(const c of r.checks.filter(c=>c.status==='available')) {
  const item=p.items.find(i=>i.sourceId===c.sourceId),cell=c.selectorKey.startsWith('cell:')?item?.cells.find(v=>v.cellIndex===Number(c.selectorKey.slice(5))):null;
  const targets=cell?cell.targets.slice(0,1):item?.targets.filter(t=>t.role==='content')??[];
  const humanCorrected=targets.length>0&&targets.every(t=>{const change=(history?.changes??[]).filter(c=>equal(c.target.path,t.path)&&(c.target.kind!=='cell'||(t.selector.kind==='cell'&&c.target.row===t.selector.row&&c.target.column===t.selector.column))).at(-1);return change?.evidence.kind==='human-source-region'&&!change.undoOf;});
  if(humanCorrected)continue;
  const text=targets.map(t=>{let value=sourceText(snapshot,t,item,p);if(cell&&item.structure.tableModel?.headerRows>1&&cell.sourceCell.column_header)return cell.sourceCell.text;const n=snapshot.nodes.find(n=>equal(n.path,t.path));if(item.label==='caption'&&['table','figure'].includes(n?.type)&&n.enumerator)return `${n.enumerator} ${value??''}`;if(item.label==='footnote'&&item.structure.noteBinding)return `${item.structure.noteBinding.marker} ${value??''}`;return value;}).filter(v=>v!==null).join(' ');
  const actual=protectedValues(text),wanted=e.pages.flatMap(p=>p.tokens).filter(t=>c.pdfTokenIds.includes(t.id)).map(t=>t.value);
  for(const value of wanted){const index=actual.indexOf(value);if(index===-1){actual.push('__missing__');break;}actual.splice(index,1);}
  if(actual.length)tokenDifferences++;
 }
 const counts={uncovered:uncovered.length,human:human.size,blocking:catalog.filter(v=>v.classification==='repair-required').length,expressionUnconfirmed:reviews.filter(v=>v.confirmation?.decision!=='meaning-preserved').length,failures:l.scopes.filter(s=>s.state==='실패').length,tokenDifferences};
 const conditions={boundEvidence:p.generationId===l.generationId&&p.source.pdf.sha256===e.pdfSha256&&p.document.revision===revision,noPending:l.pending===null,running:l.stopped===false,currentRevision:l.revision===revision,coverage:counts.uncovered===0,humanDecisions:counts.human===0,contentLosses:counts.blocking===0,expressions:counts.expressionUnconfirmed===0,failureFree:counts.failures===0,protectedValues:counts.tokenDifferences===0};
 const ready=Object.values(conditions).every(v=>v===true);
 const receiptCurrent=!!completion&&completion.generationId===p.generationId&&completion.documentRevision===revision&&equal(l.completion,completion)&&equal(l.scopes,completion.scopes)&&equal(decisions,completion.humanDecisions)&&equal(confirmations,completion.lossConfirmations)&&equal(reviews,completion.expressionReviews);
 const groupSources=Object.fromEntries(r.groups.map(g=>[g.id,[...new Set(r.findings.filter(f=>g.findingIds.includes(f.id)).flatMap(f=>f.sourceIds))]]));
 return {reviewComplete:ready&&receiptCurrent,conditions,counts,receiptCurrent,expressionReviews:reviews,humanDecisions:structuredClone(decisions),lossConfirmations:structuredClone(confirmations),groupSources,completion:completion??null,actorLimitation};
}
