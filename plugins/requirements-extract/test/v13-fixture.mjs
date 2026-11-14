import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {reviewedFixture,currentSnapshot} from './reviewed-fixture.mjs';
import {read,write,reseal,h} from './handoff-fixture.mjs';
import {completionProofV13} from '../src/human-review-v13.mjs';
import {evidenceBindings} from '../src/review-bindings-v13.mjs';
import {ruleMaterials} from '../src/review-rules-v13.mjs';
import {lossCatalog} from '../src/human-review.mjs';
export {read,write,reseal,currentSnapshot};
function project(p,s,version){
 const out=structuredClone(p);out.schemaVersion=version;out.document.revision=s.revision;
 const value=t=>s.nodes.find(n=>JSON.stringify(n.path)===JSON.stringify(t.selector.kind==='cell'?[...t.path,t.selector.row,t.selector.column]:t.path))?.text??null;
 for(const b of out.document.blocks)b.text=value({path:b.path,selector:{kind:'block'}});
 for(const item of out.items)for(const t of [...item.targets,...item.cells.flatMap(c=>c.targets),...item.losses.flatMap(l=>l.targets??[])]){t.text=value(t);t.documentRevision=s.revision;}
 return out;
}
// Explicitly synthetic file-contract fixture; official inspect is stubbed.
// Runtime interoperation with actual producer files is a separate Host check.
export function fixtureV13({history=false,rules=false,rulesBefore=false,humanPage=false,machine=false,human=false}={}){
 const root=reviewedFixture({history,expression:!machine,human}),p=read(root,'provenance.json'),baseline=read(root,'snapshot.json'),snapshot=currentSnapshot(root),c=read(root,'complete.json'),report=read(root,'review/review-targets.json'),evidence=read(root,'review/pdf-evidence.json'),l=read(root,'correction-ledger.json');
 c.schemaVersion='1.3.0';l.reviewVersion='1.3.0';l.ruleOpens=[];l.ruleDecisions=[];
 if(machine){report.groups=[];report.findings=[];report.statistics.findings=0;report.statistics.groups=0;report.statistics.groupsPerPage=0;report.statistics.foldedRows=0;report.statistics.byKind={};l.scopes=l.scopes.filter(s=>s.id.startsWith('page:'));l.scopes.forEach(s=>{s.state='미검사';s.checkpoint=null;});}
 const coverage={schemaVersion:'1.3.0',pdfSha256:p.source.pdf.sha256,reader:{name:'pdfjs-dist',version:'6.5.438'},pages:evidence.pages.map(page=>({pageNo:page.pageNo,textLayer:'available',operatorScan:humanPage?'unavailable':'complete',rasterObjects:0,vectorPaints:0,notCompared:humanPage?['operator-scan-unavailable']:[]})),semanticLimits:['heading-hierarchy','reading-order','meaning'],regionPrecision:'whole-page',method:'pdfjs-6.5.438-text-and-optimized-paint-v3'};
 const doc=read(root,'source/document.json');
 if(history){
  const hist=read(root,'correction-history.json');hist.schemaVersion='1.3.0';const old=evidenceBindings({provenance:project(p,baseline,'1.3.0'),snapshot:baseline,report,evidence,doc,coverage});hist.changes[0].contentDigest=old[hist.changes[0].groupId];l.changes=hist.changes;l.submissions[0].contentDigest=hist.changes[0].contentDigest;write(root,'correction-history.json',hist);
 }
 const projected=project(p,snapshot,'1.3.0'),bindings=evidenceBindings({provenance:projected,snapshot,report,evidence,doc,coverage,changes:l.changes});
 for(const s of l.scopes)if(s.checkpoint)s.checkpoint.contentDigest=bindings[s.id];
 for(const d of l.humanDecisions)d.contentDigest=bindings[d.groupId];
 for(const d of l.lossConfirmations)d.contentDigest=bindings[d.groupId];
 if(humanPage)for(const page of evidence.pages)l.humanDecisions.push({groupId:'page:'+page.pageNo,revision:snapshot.revision,contentDigest:bindings['page:'+page.pageNo],decision:'confirmed',actor:'human',time:'synthetic',note:'Deterministic declaration, no actual human inspection'});
 const materials=ruleMaterials({provenance:projected,snapshot,baseline,doc,report,catalog:lossCatalog(read(root,'losses.json').items,projected,snapshot),bindings});
 if(rules){
  l.lossConfirmations=[];l.humanDecisions=l.humanDecisions.filter(d=>d.groupId!=='expression');
  const ruleTimeSnapshot=rulesBefore?baseline:snapshot,ruleCount=rulesBefore?0:l.changes.length;
  const approvalMaterials=rulesBefore?ruleMaterials({provenance:project(p,baseline,'1.3.0'),snapshot:baseline,baseline,doc,report,catalog:lossCatalog(read(root,'losses.json').items,project(p,baseline,'1.3.0'),baseline),bindings:evidenceBindings({provenance:project(p,baseline,'1.3.0'),snapshot:baseline,report,evidence,doc,coverage})}):materials;
  for(const view of approvalMaterials.rules){
   const openIds=[];
   for(const rep of view.representatives)for(const cmp of rep.comparisons){const openId='open-'+l.ruleOpens.length;openIds.push(openId);l.ruleOpens.push({openId,ruleId:view.ruleId,lossId:rep.lossId,...cmp,ruleContentDigest:view.contentDigest,revision:ruleTimeSnapshot.revision,changeCount:ruleCount,actor:'human',time:'synthetic',comparison:'source-and-current-side-by-side'});}
   l.ruleDecisions.push({decisionId:'decision-'+view.ruleId,ruleId:view.ruleId,policyDigest:view.policyDigest,memberIds:view.members.map(m=>m.lossId),contentDigest:view.contentDigest,revision:ruleTimeSnapshot.revision,changeCount:ruleCount,actor:'human',time:'synthetic',decision:'approved',note:'Deterministic declaration only',openIds});
  }
 }
 write(root,'review/review-targets.json',report);
 const marker=read(root,'review/review-complete.json');marker.reportSha256=h(readFileSync(join(root,'review/review-targets.json')));write(root,'review/review-complete.json',marker);
 write(root,'review/page-coverage.json',coverage);write(root,'review/page-coverage-complete.json',{schemaVersion:'1.3.0',generationId:p.generationId,baselineRevision:p.document.revision,pdfSha256:p.source.pdf.sha256,evidenceSha256:h(readFileSync(join(root,'review/pdf-evidence.json'))),coverageSha256:h(readFileSync(join(root,'review/page-coverage.json')))});
 const proof=completionProofV13({ledger:l,report,evidence,provenance:projected,baselineProvenance:p,baseline,snapshot,history:history?read(root,'correction-history.json'):undefined,doc,coverage,losses:read(root,'losses.json').items,project,need:(v,c)=>{if(!v)throw new Error(c);}});
 const completion={schemaVersion:'1.3.0',generationId:p.generationId,documentRevision:snapshot.revision,time:'synthetic',scopes:l.scopes,humanDecisions:l.humanDecisions,lossConfirmations:l.lossConfirmations,conditions:{ready:Object.values(proof.conditions).every(Boolean),...proof.counts},expressionReviews:proof.expressionReviews,pageComparisons:proof.pageComparisons,ruleOpens:l.ruleOpens,ruleDecisions:l.ruleDecisions,ruleReviews:proof.ruleReviews};
 l.completion=completion;write(root,'correction-ledger.json',l);write(root,'human-review.json',completion);
 for(const name of ['review/review-complete.json','review/page-coverage.json','review/page-coverage-complete.json'])if(!c.files.some(f=>f.relativePath===name))c.files.push({relativePath:name,sha256:'pending'});
 write(root,'complete.json',c);reseal(root);return root;
}
