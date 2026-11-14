// Independent file-contract verifier; definitions are fixed by review-rules-v13.md.
import {contentHash as H} from './review-bindings-v13.mjs';
import {canonical} from './model.mjs';
const definitions={
 'merged-cell-repeated':['병합 범위의 값을 출력 칸마다 반영','source-span-to-all-output-cells-with-ordered-header-composition'],
 'compound-header-flattened':['복합 머리를 순서대로 합침','ordered-unique-source-header-cells-joined-by-space-en-dash-space'],
 'table-header-role':['머리 역할을 평문 셀로 표현','source-cell-value-and-output-coordinate-preservation'],
};
const equal=(a,b)=>canonical(a)===canonical(b);
function tableGrid(raw,path,current,baseline) {
 const d=raw?.data;if(!d||!Array.isArray(d.table_cells))return null;
 const grid=Array.from({length:d.num_rows},()=>Array(d.num_cols).fill(null));
 for(const [i,c] of d.table_cells.entries())for(let r=c.start_row_offset_idx;r<c.end_row_offset_idx;r++)for(let col=c.start_col_offset_idx;col<c.end_col_offset_idx;col++){
  if(!grid[r]||col<0||col>=d.num_cols||grid[r][col]!==null)return null;grid[r][col]=i;
 }
 let headerRows=0;while(headerRows<grid.length&&grid[headerRows].every(i=>i!==null&&d.table_cells[i].column_header===true))headerRows++;
 if(headerRows===d.num_rows)headerRows=1;
 const collapsed=Math.max(1,headerRows),headers=Array.from({length:d.num_cols},(_,col)=>{
  const indices=[...new Set(grid.slice(0,collapsed).map(row=>row[col]).filter(i=>i!==null))];return {indices,text:indices.map(i=>d.table_cells[i].text).join(' – ')};
 });
 const at=(index,r,c)=>index.get(JSON.stringify([...path,r,c]));
 const check=(r,c)=>{const n=at(current,r,c),old=at(baseline,r,c),source=grid[r+collapsed-1]?.[c];return [r,c,r===0&&headerRows>1?headers[c].text:source===null?'':d.table_cells[source].text,n?.text??null,H(n?.content??null)===H(old?.content??null),n];};
 return {d,headerRows,collapsed,headers,check};
}
export function ruleMaterials({provenance:p,snapshot,baseline,doc,report,catalog,bindings}) {
 const cells=new Map(snapshot.nodes.filter(n=>n.type==='cell').map(n=>[JSON.stringify(n.path),n])),old=new Map(baseline.nodes.filter(n=>n.type==='cell').map(n=>[JSON.stringify(n.path),n]));
 const items=new Map(p.items.map(i=>[i.sourceId,i])),tables=new Map(),bySource=new Map(),findings=new Map(report.findings.map(f=>[f.id,f]));
 for(const g of report.groups)for(const id of new Set(g.findingIds.flatMap(id=>findings.get(id).sourceIds))){if(!bySource.has(id))bySource.set(id,[]);bySource.get(id).push(g);}
 const verifications=catalog.filter(l=>l.classification==='expression').map(loss=>{
  const ruleId=definitions[loss.reasonCode]?loss.reasonCode:null,item=items.get(loss.sourceId),base={lossId:loss.lossId,sourceId:loss.sourceId,ruleId};
  const unavailable=reason=>({...base,status:'unverifiable',reason,checkedCells:0,complexity:0,contentDigest:H(loss)});
  if(!ruleId||!item)return unavailable('rule-not-established');
  if(!tables.has(item.sourceId)){
   const raw=item.selfRef.slice(2).split('/').reduce((v,k)=>v?.[k],doc),path=item.targets.find(t=>t.role==='content')?.path;
   tables.set(item.sourceId,path?tableGrid(raw,path,cells,old):null);
  }
  const table=tables.get(item.sourceId);if(!table)return unavailable('table-source-unavailable');
  const cell=table.d.table_cells[loss.originalValue?.cellIndex],checks=[];
  if(ruleId==='compound-header-flattened'){
   if(table.headerRows<=1)return {...base,status:'failed',reason:'compound-header-missing',checkedCells:0,complexity:0,contentDigest:H(loss)};
   for(let col=0;col<table.d.num_cols;col++)checks.push(table.check(0,col));
  }else if(cell){
   const coordinates=new Set();for(let r=cell.start_row_offset_idx;r<cell.end_row_offset_idx;r++)for(let c=cell.start_col_offset_idx;c<cell.end_col_offset_idx;c++){
    const row=r<table.collapsed?0:r-table.collapsed+1,key=row+':'+c;if(!coordinates.has(key)){coordinates.add(key);checks.push(table.check(row,c));}
   }
  }
  const pass=checks.length>0&&checks.every(c=>c[2]===c[3]&&c[4]);
  return {...base,status:pass?'verified':'failed',reason:pass?'rule-matches-current-cells':'rule-output-mismatch',checkedCells:checks.length,complexity:ruleId==='compound-header-flattened'?table.headerRows*table.d.num_cols:(cell?.row_span??0)*(cell?.col_span??0),contentDigest:H({lossId:loss.lossId,source:cell??table.headers,checks})};
 });
 const catalogById=new Map(catalog.map(l=>[l.lossId,l])),rules=[];
 for(const [ruleId,[title,method]] of Object.entries(definitions)){
  const members=verifications.filter(v=>v.ruleId===ruleId).map(v=>v.status==='verified'&&!(bySource.get(v.sourceId)??[]).some(g=>g.pageNos.length)?{...v,status:'unverifiable',reason:'source-comparison-unavailable'}:v);
  if(!members.length)continue;
  const representatives=members.filter(m=>m.status==='verified').sort((a,b)=>b.complexity-a.complexity||(a.lossId<b.lossId?-1:a.lossId>b.lossId?1:0)).slice(0,3).map(v=>{
   const loss=catalogById.get(v.lossId),groups=bySource.get(v.sourceId)??[],pages=[...new Set(groups.flatMap(g=>g.pageNos))].sort((a,b)=>a-b);
   return {lossId:v.lossId,contentDigest:v.contentDigest,sourceId:v.sourceId,targetPaths:loss.targets.map(t=>t.path),comparisons:pages.map(pageNo=>{const group=groups.find(g=>g.pageNos.includes(pageNo));return {groupId:group.id,pageNo,contentDigest:bindings[group.id]};})};
  });
  const view={ruleId,version:'1.0.0',title,method,policyDigest:H({ruleId,version:'1.0.0',title,method}),members,representatives,generationId:p.generationId,documentRevision:snapshot.revision};
  rules.push({...view,contentDigest:H(view)});
 }
 return {rules,items:verifications.map(v=>rules.flatMap(r=>r.members).find(m=>m.lossId===v.lossId)??v)};
}
export function approvedRules(ledger,current,at) {
 const receipts=new Map((ledger.ruleOpens??[]).map(o=>[o.openId,o]));
 const rules=current.rules.map(view=>{
  const decision=(ledger.ruleDecisions??[]).filter(d=>d.ruleId===view.ruleId).at(-1);
  let valid=false;
  if(decision&&!decision.invalidatedAt&&decision.actor==='human'&&decision.note?.trim()&&decision.time){
   const old=at(decision.changeCount)?.rules.find(r=>r.ruleId===view.ruleId);
   valid=!!old&&decision.revision===old.documentRevision&&decision.contentDigest===old.contentDigest&&decision.policyDigest===view.policyDigest&&equal(decision.memberIds,view.members.map(m=>m.lossId));
   if(valid&&decision.decision==='approved'){
    const required=old.representatives.flatMap(rep=>rep.comparisons.map(c=>({rep,c})));
    valid=old.representatives.length>0&&old.representatives.every(rep=>rep.comparisons.length>0)&&required.length===decision.openIds.length&&new Set(decision.openIds).size===required.length&&required.every(({rep,c})=>decision.openIds.some(id=>{
     const o=receipts.get(id);return o?.actor==='human'&&o.time&&o.ruleId===old.ruleId&&o.lossId===rep.lossId&&o.changeCount===decision.changeCount&&o.revision===old.documentRevision&&o.ruleContentDigest===old.contentDigest&&o.groupId===c.groupId&&o.pageNo===c.pageNo&&o.contentDigest===c.contentDigest&&o.comparison==='source-and-current-side-by-side';
    }));
   }
  }
  return {...view,decision:valid?decision:null};
 });
 const decisions=new Map(rules.map(r=>[r.ruleId,r.decision]));
 return {rules,items:current.items.map(item=>{
  const d=decisions.get(item.ruleId);return {...item,ruleConfirmation:item.status==='verified'&&d?.decision==='approved'?{ruleId:item.ruleId,decisionId:d.decisionId,actor:'human',time:d.time,revision:d.revision,contentDigest:d.contentDigest,policyDigest:d.policyDigest,meaning:'rule-approved-representation'}:null};
 })};
}
