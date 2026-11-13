// Independent consumer of contracts/docling-to-litzio/corrections.md.
import { canonical } from './model.mjs';
import { createHash } from 'node:crypto';
const equal = (a,b) => canonical(a) === canonical(b);
const hash = v => createHash('sha256').update(v).digest('hex');
// This is the closed v1.1 evidence vocabulary, not a semantic correctness test.
const tokenPattern = /\d+(?:[.,]\d+)*(?:[eE][+-]?\d+)?|[≤≥<>±−+=%]|(?<![\p{L}])(?:MHz|kHz|Hz|kV|mV|mA|kW|ms|μs|µs|ns|cycles|V|A|W|s|u)(?![\p{L}])|(?<![\p{L}])-(?=\s*\d)/gu;
const tokens = text => [...text.matchAll(tokenPattern)].map(m=>m[0]);
function operation(t,before,after) {
  return t.kind === 'cell' ? {command:'update-table-cell',path:[...t.path,t.row,t.column].join(','),text:after} : {command:t.kind==='equation'?'update-equation-latex':'update-node-text',path:t.path.join(','),from:before,to:after};
}
export function correctedSnapshot({history:h, report:r, evidence:e, ledger:l, baseline, provenance:p, complete, files, actual, check}) {
  const need = (v,code) => check(v,code,'교정 인계 검증 실패: '+code);
  need(h.generationId===p.generationId && h.baselineRevision===baseline.revision, 'history-binding');
  need(r.generationId===p.generationId && r.baselineRevision===baseline.revision && r.documentRevision===baseline.revision && r.bindingState==='current' && r.pdfSha256===p.source.pdf.sha256 && e.pdfSha256===p.source.pdf.sha256,'review-binding');
  need(r.inputs.provenanceSha256===hash(files.get('provenance.json')) && r.inputs.snapshotSha256===hash(files.get('snapshot.json')) && r.evidenceFile.sha256===hash(files.get('review/pdf-evidence.json')),'review-digest');
  need(l?.version===1 && l.generationId===h.generationId && l.sourceHash===p.source.pdf.sha256 && !l.pending && l.revision===complete.documentRevision && equal(l.changes,h.changes) && Array.isArray(l.submissions) && Array.isArray(l.scopes),'history-ledger');
  let state=structuredClone(baseline); const seen=new Set();
  const allTokens=e.pages.flatMap(page=>page.tokens.map(t=>({...t,pageNo:page.pageNo})));
  need(new Set(allTokens.map(t=>t.id)).size===allTokens.length,'evidence-token-ids');
  for(const [index,c] of h.changes.entries()) {
    need(!seen.has(c.changeId),'history-duplicate'); seen.add(c.changeId);
    need(c.beforeRevision===state.revision && c.afterRevision!==c.beforeRevision && c.before!==c.after && c.receipt.revision===c.afterRevision,'history-chain');
    need(c.sourceHash===p.source.pdf.sha256 && equal(c.inverse,operation(c.target,c.after,c.before)),'history-inverse');
    const targetPath=c.target.kind==='cell'?[...c.target.path,c.target.row,c.target.column]:c.target.path;
    const n=state.nodes.find(n=>equal(n.path,targetPath));
    need(n?.type===c.target.kind && (c.target.kind==='cell' || (c.target.row===undefined && c.target.column===undefined)),'history-target');
    const field=c.target.kind==='equation'?'latex':'text';
    need(n[field]===c.before,'history-before');
    if(field==='text') { need(!n.content || equal(n.content,[{kind:'text',text:c.before}]),'history-rich-target'); if(n.content) n.content=c.after?[{kind:'text',text:c.after}]:[]; }
    n[field]=c.after; state.revision=c.afterRevision;
    const group=r.groups.find(g=>g.id===c.groupId); need(group,'history-group');
    const findings=r.findings.filter(f=>group.findingIds.includes(f.id));
    need(new Set(group.findingIds).size===group.findingIds.length && findings.length===group.findingIds.length,'history-findings');
    const ids=new Set(findings.flatMap(f=>f.sourceIds));
    const checks=p.items.filter(i=>ids.has(i.sourceId)).flatMap(i=>c.target.kind==='cell' ? i.cells.filter(cell=>cell.targets.some(t=>equal(t.path,c.target.path)&&t.selector.kind==='cell'&&t.selector.row===c.target.row&&t.selector.column===c.target.column)).flatMap(cell=>r.checks.filter(k=>k.sourceId===i.sourceId&&k.selectorKey==='cell:'+cell.cellIndex)) : i.targets.some(t=>equal(t.path,c.target.path)&&t.selector.kind==='block') ? r.checks.filter(k=>k.sourceId===i.sourceId) : []);
    const refs=[...new Set(checks.flatMap(k=>k.pdfTokenIds))];
    need(refs.length>0 && equal([...c.evidence.refs].sort(),[...refs].sort()),'history-evidence');
    const selected=allTokens.filter(t=>refs.includes(t.id)); need(selected.length===refs.length,'history-missing-token');
    need(selected.every(t=>c.evidence.scope.some(s=>s.pageNo===t.pageNo && s.bbox[0]<=t.bbox[0] && s.bbox[1]<=t.bbox[1] && s.bbox[2]>=t.bbox[2] && s.bbox[3]>=t.bbox[3])),'history-scope');
    const before=tokens(c.before), after=tokens(c.after), match=equal(after,selected.map(t=>t.value));
    const recheck=!before.length&&!after.length?'not-applicable':c.undoOf&&!match?'undo-restoration':match?'verified-protected-tokens':'unverified';
    need(c.validation.evidenceRecheck===recheck && c.validation.protectedTokens===(match&&c.target.kind!=='equation'),'history-validation');
    if(c.undoOf) { const prev=h.changes[index-1]; need(prev?.changeId===c.undoOf && prev.afterRevision===c.beforeRevision && equal(prev.target,c.target) && prev.after===c.before && prev.before===c.after,'history-undo'); }
    else need((!before.length&&!after.length)||match,'history-protected-tokens');
    const submissions=l.submissions.filter(s=>s.changeId===c.changeId);
    need(submissions.length===1 && submissions[0].afterRevision===c.afterRevision && submissions[0].status===(c.validation.protectedTokens?'applied':'uncertain') && l.scopes.some(s=>s.id===c.groupId),'history-submission');
  }
  need(state.revision===complete.documentRevision && equal(state,h.currentSnapshot) && equal(state,actual),'history-current');
  return state;
}
