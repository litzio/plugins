// Independent implementation of review-v13.md. No producer runtime imports.
import {createHash} from 'node:crypto';
export function contentHash(value) {
 const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='revision'&&k!=='documentRevision').sort().map(k=>[k,ordered(v[k])])):v;
 return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}
const targets=item=>[...item.targets,...item.cells.flatMap(c=>c.targets)];
const uniqueSorted=values=>[...new Set(values)].sort((a,b)=>a-b);
export function evidenceBindings({provenance:p,snapshot,report,evidence,doc,changes=[],coverage}) {
 // Every cache is confined to this captured read set.
 const memo=new WeakMap(),h=v=>{if(!v||typeof v!=='object')return contentHash(v);if(!memo.has(v))memo.set(v,contentHash(v));return memo.get(v);};
 const blocks=new Map(),checks=new Map(),pages=new Map(evidence.pages.map(v=>[v.pageNo,v]));
 for(const n of snapshot.nodes){if(!blocks.has(n.path[0]))blocks.set(n.path[0],[]);blocks.get(n.path[0]).push(n);}
 for(const c of report.checks){if(!checks.has(c.sourceId))checks.set(c.sourceId,[]);checks.get(c.sourceId).push(c);}
 const raw=item=>item.selfRef.slice(2).split('/').reduce((v,k)=>v?.[k],doc);
 const scopeDigests={};
 for(const group of report.groups){
  const findings=report.findings.filter(f=>group.findingIds.includes(f.id)),ids=new Set(findings.flatMap(f=>f.sourceIds));
  const indices=p.items.flatMap((i,n)=>ids.has(i.sourceId)?[n]:[]),neighbors=uniqueSorted(indices.flatMap(n=>[n-1,n+1]).filter(n=>n>=0&&n<p.items.length));
  const paths=new Set(findings.flatMap(f=>f.targets.map(t=>t.path[0]))),adjacent=new Set([...paths].flatMap(n=>[n-1,n+1]));
  const historyPaths=new Set([...paths,...adjacent,...[...indices,...neighbors].flatMap(n=>targets(p.items[n]).map(t=>t.path[0]))]);
  scopeDigests[group.id]=h({generationId:p.generationId,baselineRevision:report.baselineRevision,sourceHash:p.source.pdf.sha256,
   group:h(group),findings:findings.map(h),fragments:indices.map(n=>h({sourceId:p.items[n].sourceId,selfRef:p.items[n].selfRef,raw:raw(p.items[n]),mapping:p.items[n]})),
   sourceNeighbors:neighbors.map(n=>h({selfRef:p.items[n].selfRef,raw:raw(p.items[n])})),checks:report.checks.filter(c=>ids.has(c.sourceId)).map(h),
   current:snapshot.nodes.filter(n=>paths.has(n.path[0])).map(h),neighbors:snapshot.nodes.filter(n=>adjacent.has(n.path[0])).map(h),
   pdf:evidence.pages.filter(v=>group.pageNos.includes(v.pageNo)).map(h),history:changes.filter(c=>historyPaths.has(c.target.path[0])).map(h)});
 }
 for(const page of evidence.pages){
  const items=p.items.filter(i=>i.regions.some(r=>r.pageNo===page.pageNo)).sort((a,b)=>a.sourceId<b.sourceId?-1:a.sourceId>b.sourceId?1:0);
  const paths=uniqueSorted(items.flatMap(i=>targets(i).map(t=>t.path[0]))),extra=coverage?.pages.find(v=>v.pageNo===page.pageNo);
  scopeDigests['page:'+page.pageNo]=h({generationId:p.generationId,sourceHash:p.source.pdf.sha256,
   sources:items.map(i=>[i.sourceId,h(i),checks.has(i.sourceId)?h(checks.get(i.sourceId)):null]),
   blocks:paths.map(path=>[path,blocks.has(path)?h(blocks.get(path)):null]),pages:[[page.pageNo,h(pages.get(page.pageNo))]],extra:extra?{comparisonCoverage:extra}:null});
 }
 return scopeDigests;
}
export function pageComparisons({provenance:p,report,coverage,current,baseline}) {
 return [...coverage.pages].sort((a,b)=>a.pageNo-b.pageNo).map(page=>{
  const ids=new Set(p.items.filter(i=>i.regions.some(r=>r.pageNo===page.pageNo)).map(i=>i.sourceId)),checks=report.checks.filter(c=>ids.has(c.sourceId));
  const groupIds=report.groups.filter(g=>g.pageNos.includes(page.pageNo)).map(g=>g.id),scopeId='page:'+page.pageNo,notCompared=[...page.notCompared];
  if(p.items.some(i=>ids.has(i.sourceId)&&i.label==='picture'))notCompared.push('docling-picture');
  if(checks.some(c=>c.status!=='available'))notCompared.push('unavailable-protected-token-scope');
  return {pageNo:page.pageNo,scopeId,contentDigest:current[scopeId],baselineDigest:baseline[scopeId],status:notCompared.length?'requires-human':groupIds.length||current[scopeId]!==baseline[scopeId]?'candidates-or-content-change':'machine-passed',groupIds,
   checked:['protected-number-unit-sign-identifier-tokens','unmapped-pdf-text-detection'],checks:checks.length,pdfTokens:checks.reduce((n,c)=>n+c.pdfTokenIds.length,0),notCompared,semanticLimits:coverage.semanticLimits,regionPrecision:coverage.regionPrecision};
 });
}
