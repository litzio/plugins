// Independent implementation of review-v13.md. No producer runtime imports.
import {createHash} from 'node:crypto';
export function contentHash(value) {
 const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>k!=='revision'&&k!=='documentRevision').sort().map(k=>[k,ordered(v[k])])):v;
 return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}
const targets=item=>[...item.targets,...item.cells.flatMap(c=>c.targets)];
const uniqueSorted=values=>[...new Set(values)].sort((a,b)=>a-b);
export function evidenceBindings({provenance:p,snapshot,report,evidence,doc,changes=[],coverage,groupIds,includePages=true}) {
 // Every cache is confined to this captured read set.
 const memo=new WeakMap(),h=v=>{if(!v||typeof v!=='object')return contentHash(v);if(!memo.has(v))memo.set(v,contentHash(v));return memo.get(v);};
 const blocks=new Map(),checks=new Map(),changesByBlock=new Map(),sourcePositions=new Map(),sourcesByPage=new Map();
 const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
 snapshot.nodes.forEach((value,index)=>add(blocks,value.path[0],{value,index}));
 report.checks.forEach((value,index)=>add(checks,value.sourceId,{value,index}));
 changes.forEach((value,index)=>add(changesByBlock,value.target.path[0],{value,index}));
 p.items.forEach((item,index)=>{sourcePositions.set(item.sourceId,index);for(const page of new Set(item.regions.map(r=>r.pageNo)))add(sourcesByPage,page,item);});
 const pages=new Map(evidence.pages.map((value,index)=>[value.pageNo,{value,index}])),findingsById=new Map(report.findings.map((value,index)=>[value.id,{value,index}]));
 const ordered=entries=>[...new Map(entries.map(e=>[e.index,e])).values()].sort((a,b)=>a.index-b.index).map(e=>e.value);
 const raw=item=>item.selfRef.slice(2).split('/').reduce((v,k)=>v?.[k],doc);
 const scopeDigests={},coverageByPage=new Map((coverage?.pages??[]).map(page=>[page.pageNo,page]));
 for(const group of report.groups.filter(g=>!groupIds||groupIds.has(g.id))){
  const findings=ordered(group.findingIds.map(id=>findingsById.get(id))),ids=new Set(findings.flatMap(f=>f.sourceIds));
  const indices=[...ids].map(id=>sourcePositions.get(id)).sort((a,b)=>a-b),neighbors=uniqueSorted(indices.flatMap(n=>[n-1,n+1]).filter(n=>n>=0&&n<p.items.length));
  const paths=new Set(findings.flatMap(f=>f.targets.map(t=>t.path[0]))),adjacent=new Set([...paths].flatMap(n=>[n-1,n+1]));
  const historyPaths=new Set([...paths,...adjacent,...[...indices,...neighbors].flatMap(n=>targets(p.items[n]).map(t=>t.path[0]))]);
  scopeDigests[group.id]=h({generationId:p.generationId,baselineRevision:report.baselineRevision,sourceHash:p.source.pdf.sha256,
   group:h(group),findings:findings.map(h),fragments:indices.map(n=>h({sourceId:p.items[n].sourceId,selfRef:p.items[n].selfRef,raw:raw(p.items[n]),mapping:p.items[n]})),
   sourceNeighbors:neighbors.map(n=>h({selfRef:p.items[n].selfRef,raw:raw(p.items[n])})),checks:ordered([...ids].flatMap(id=>checks.get(id)??[])).map(h),
   current:ordered([...paths].flatMap(path=>blocks.get(path)??[])).map(h),neighbors:ordered([...adjacent].flatMap(path=>blocks.get(path)??[])).map(h),
   pdf:ordered(group.pageNos.map(page=>pages.get(page))).map(h),history:ordered([...historyPaths].flatMap(path=>changesByBlock.get(path)??[])).map(h)});
 }
 for(const page of includePages?evidence.pages:[]){
  const items=[...(sourcesByPage.get(page.pageNo)??[])].sort((a,b)=>a.sourceId<b.sourceId?-1:a.sourceId>b.sourceId?1:0);
  const paths=uniqueSorted(items.flatMap(i=>targets(i).map(t=>t.path[0]))),extra=coverageByPage.get(page.pageNo);
  scopeDigests['page:'+page.pageNo]=h({generationId:p.generationId,sourceHash:p.source.pdf.sha256,
   sources:items.map(i=>[i.sourceId,h(i),checks.has(i.sourceId)?h(checks.get(i.sourceId).map(e=>e.value)):null]),
   blocks:paths.map(path=>[path,blocks.has(path)?h(blocks.get(path).map(e=>e.value)):null]),pages:[[page.pageNo,h(pages.get(page.pageNo).value)]],extra:extra?{comparisonCoverage:extra}:null});
 }
 return scopeDigests;
}
export function pageComparisons({provenance:p,report,coverage,current,baseline}) {
 const sourcesByPage=new Map(),groupsByPage=new Map(),checksBySource=new Map(),pictures=new Set();
 const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
 for(const item of p.items){if(item.label==='picture')pictures.add(item.sourceId);for(const page of new Set(item.regions.map(r=>r.pageNo)))add(sourcesByPage,page,item.sourceId);}
 for(const check of report.checks)add(checksBySource,check.sourceId,check);
 for(const group of report.groups)for(const page of group.pageNos)add(groupsByPage,page,group.id);
 return [...coverage.pages].sort((a,b)=>a.pageNo-b.pageNo).map(page=>{
  const ids=new Set(sourcesByPage.get(page.pageNo)??[]),checks=[...ids].flatMap(id=>checksBySource.get(id)??[]);
  const groupIds=groupsByPage.get(page.pageNo)??[],scopeId='page:'+page.pageNo,notCompared=[...page.notCompared];
  if([...ids].some(id=>pictures.has(id)))notCompared.push('docling-picture');
  if(checks.some(c=>c.status!=='available'))notCompared.push('unavailable-protected-token-scope');
  return {pageNo:page.pageNo,scopeId,contentDigest:current[scopeId],baselineDigest:baseline[scopeId],status:notCompared.length?'requires-human':groupIds.length||current[scopeId]!==baseline[scopeId]?'candidates-or-content-change':'machine-passed',groupIds,
   checked:['protected-number-unit-sign-identifier-tokens','unmapped-pdf-text-detection'],checks:checks.length,pdfTokens:checks.reduce((n,c)=>n+c.pdfTokenIds.length,0),notCompared,semanticLimits:coverage.semanticLimits,regionPrecision:coverage.regionPrecision};
 });
}
