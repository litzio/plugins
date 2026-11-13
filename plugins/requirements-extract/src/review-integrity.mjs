import {canonical} from './model.mjs';
const equal=(a,b)=>canonical(a)===canonical(b);
// File-contract validation, independently implemented; no producer imports.
export function validateReviewMeaning(r,p,snapshot,e,need) {
 const sources=new Set(p.items.map(i=>i.sourceId)),refs=new Set(p.items.map(i=>i.selfRef)),tokens=new Set(e.pages.flatMap(p=>p.tokens.map(t=>t.id)));
 const findings=new Map(r.findings.map(f=>[f.id,f])),groups=new Map(r.groups.map(g=>[g.id,g]));
 need(findings.size===r.findings.length,'review-duplicate-finding');need(groups.size===r.groups.length,'review-group-coverage');
 const required={
 'formula-review-required':['reason'],'meaning-loss':['reasonCode','category','originalValue'],
 'protected-token-difference':['selectorKey','pdfValues','nativeValues','missing','extra','confidence'],
 'text-layer-unavailable':['selectorKey','reason'],'formula-suspicion':['reasons','latex'],'formula-prose-suspect':['reason'],
 'picture-prose-suspect':['reason','text'],'merged-table-review':['mergedRanges','headerRows','reason'],
 'repeated-merged-values':['ranges','reason'],'empty-table-header':['columns'],'table-row-width':['rowWidths','expected'],
 'source-cell-unavailable':['gaps','reason'],'unmapped-table-tokens':['pdfValues','pdfTokenIds','reason'],
 'source-native-change':['selfRef','kind','reason'],'furniture-in-body':['matchedSourceRefs','text','reason'],
 'reading-order-backtrack':['previousSelfRef','reason'],'reading-order-caption':['captionRef','reason'],
 'unmapped-pdf-text':['text','pdfItemId','reason'],'heading-basis-low':['bookmarkPresence','reason'],'geometry-unavailable':['reason']};
 for(const i of p.items) {
  need(i.label!=='formula'||i.disposition!=='mapped'||r.findings.some(f=>f.kind==='formula-review-required'&&f.sourceIds.includes(i.sourceId)),'review-formula-coverage');
  for(const loss of i.losses.filter(l=>l.severity==='blocking'))need(r.findings.some(f=>f.kind==='meaning-loss'&&f.sourceIds.includes(i.sourceId)&&f.evidence.reasonCode===loss.reasonCode),'review-loss-coverage');
 }
 for(const f of r.findings) {
  need(required[f.kind]?.every(k=>Object.hasOwn(f.evidence,k)),'review-evidence-fields');
  need(f.sourceIds.every(id=>sources.has(id))&&f.selfRefs.every(ref=>refs.has(ref)),'review-source-ref');
  for(const region of f.regions)need(e.pages.some(p=>p.pageNo===region.pageNo)&&region.bbox.length===4&&region.bbox.every(Number.isFinite)&&region.bbox[0]<=region.bbox[2]&&region.bbox[1]<=region.bbox[3],'review-region');
  for(const t of f.targets) {need(t.documentRevision===r.documentRevision,'review-target-revision');need(t.bindingState!=='current'||snapshot.nodes.some(n=>equal(n.path,t.path)),'review-target-path');}
 }
 const used=new Set(),priority={high:0,medium:1,low:2};
 for(const g of r.groups) {
  need(g.findingIds.length&&g.findingIds.every(id=>findings.has(id))&&g.findingIds.includes(g.representativeId)&&g.pageNos.length<=3&&(!g.pageNos.length||g.pageNos.at(-1)-g.pageNos[0]<=2),'review-group');
  g.findingIds.forEach(id=>used.add(id));
  const members=g.findingIds.map(id=>findings.get(id));
  need(equal([...new Set(members.map(f=>f.kind))].sort(),[...g.kinds].sort()),'review-group-kinds');
  need(g.priority===[...members].sort((a,b)=>priority[a.priority]-priority[b.priority])[0].priority,'review-group-priority');
 }
 for(const f of r.findings)for(const region of f.regions)need(r.groups.some(g=>g.findingIds.includes(f.id)&&g.pageNos.includes(region.pageNo)),'review-page-coverage');
 need(used.size===findings.size,'review-group-coverage');
 const pattern=g=>[...new Set(g.findingIds.map(id=>{const f=findings.get(id);return f.kind+':'+(f.evidence.reasonCode??f.evidence.selectorKey?.split(':')[0]??f.kind);} ))].sort().join('+');
 const folded=new Set();
 for(const s of r.series) {
  need(s.groupIds.length>=2&&s.groupIds.every(id=>groups.has(id)&&!folded.has(id))&&s.groupIds.includes(s.representativeGroupId),'review-series');
  for(const id of s.groupIds) {folded.add(id);need(pattern(groups.get(id))===s.pattern,'review-series-pattern');}
 }
 for(const c of r.checks)need(sources.has(c.sourceId)&&c.pdfTokenIds.every(id=>tokens.has(id)),'review-check');
 const counts={};for(const f of r.findings)counts[f.kind]=(counts[f.kind]??0)+1;
 need(equal(counts,r.statistics.byKind)&&r.statistics.groupsPerPage===r.groups.length/e.pages.length&&r.statistics.foldedRows===r.groups.filter(g=>!folded.has(g.id)).length+r.series.length&&r.statistics.findings===findings.size&&r.statistics.groups===groups.size&&r.statistics.pages===e.pages.length&&r.statistics.unavailableChecks===r.checks.filter(c=>c.status!=='available').length,'review-statistics');
}
