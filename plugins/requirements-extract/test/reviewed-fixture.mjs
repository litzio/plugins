import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {correctedFixture} from './corrected-fixture.mjs';
import {read,write,h,reseal} from './handoff-fixture.mjs';
import {lossCatalog,expressionReviews} from '../src/human-review.mjs';
// Synthetic file-contract fixture, with an explicitly stubbed official inspect.
export function reviewedFixture({history=true,human=false,expression=true,before}={}) {
 const root=correctedFixture({before}),p=read(root,'provenance.json'),hist=read(root,'correction-history.json'),c=read(root,'complete.json'),r=read(root,'review/review-targets.json'),e=read(root,'review/pdf-evidence.json');
 c.schemaVersion='1.2.0';c.reviewState='reviewed';hist.schemaVersion='1.2.0';
 if(!history){
  c.documentRevision=p.document.revision;
  // Document bytes must match the original generation snapshot.
  writeFileSync(join(root,'document.md'),'synthetic native bytes; official inspect is stubbed');
  c.files=c.files.filter(f=>f.relativePath!=='correction-history.json');
 }
 if(human){const change=hist.changes[0];change.after='Voltage ≤ 7 V';change.actor='human';change.evidence.kind='human-source-region';change.evidence.refs=[];change.validation={readback:true,protectedTokens:false,evidenceRecheck:'human-source-region'};change.inverse.from=change.after;hist.currentSnapshot.nodes[0].text=change.after;hist.currentSnapshot.nodes[0].content=[{kind:'text',text:change.after}];}
 if(human==='cell') {
  if(!expression)throw new Error('Cell fixture needs its expression group');
  const baseline=read(root,'snapshot.json'),node=baseline.nodes.find(n=>n.type==='cell'&&n.path[1]===1&&n.path[2]===0),change=hist.changes[0];
  Object.assign(change,{groupId:'expression',target:{kind:'cell',path:[2],row:1,column:0},before:node.text,after:'x^2',beforeContent:node.content,afterContent:[{kind:'math',value:'x^2'}],inverse:{command:'update-table-cell',path:'2,1,0',content:node.content}});
  hist.currentSnapshot=structuredClone(baseline);hist.currentSnapshot.revision=c.documentRevision;Object.assign(hist.currentSnapshot.nodes.find(n=>n.type==='cell'&&n.path[1]===1&&n.path[2]===0),{text:change.after,content:change.afterContent});
 }
 e.pages.push({...structuredClone(e.pages[0]),pageNo:2,tokens:[]});
 const table=p.items[3],loss={sourceId:table.sourceId,category:'native-format',reasonCode:'merged-cell-repeated',severity:'blocking',resolution:'unreviewed',originalValue:{cellIndex:1},targets:table.targets};
 if(expression){table.losses.push(loss);r.findings.push({id:'loss',kind:'meaning-loss',priority:'high',sourceIds:[table.sourceId],selfRefs:[table.selfRef],regions:[{pageNo:1,bbox:[10,10,120,30],unit:'pt',origin:'TOPLEFT'}],targets:table.targets,evidence:{reasonCode:loss.reasonCode,category:loss.category,originalValue:loss.originalValue},status:'candidate'});r.groups.push({id:'expression',scope:'synthetic',kinds:['meaning-loss'],priority:'high',pageNos:[1],findingIds:['loss'],representativeId:'loss',reviewState:'unreviewed'});}
 r.statistics={pages:2,findings:r.findings.length,groups:r.groups.length,groupsPerPage:r.groups.length/2,foldedRows:r.groups.length,byKind:{'protected-token-difference':1,...(expression?{'meaning-loss':1}:{})},unavailableChecks:0};
 write(root,'provenance.json',p);write(root,'losses.json',{schemaVersion:'1.0.0',generationId:p.generationId,documentRevision:p.document.revision,items:expression?[loss]:[]});write(root,'review/pdf-evidence.json',e);
 r.inputs.provenanceSha256=h(readFileSync(join(root,'provenance.json')));r.evidenceFile.sha256=h(readFileSync(join(root,'review/pdf-evidence.json')));write(root,'review/review-targets.json',r);
 write(root,'review/review-complete.json',{schemaVersion:'1.0.0',generationId:p.generationId,documentRevision:p.document.revision,status:'generated-unreviewed',reportSha256:h(readFileSync(join(root,'review/review-targets.json'))),evidenceSha256:r.evidenceFile.sha256});
 const current=history?hist.currentSnapshot:read(root,'snapshot.json'),ledger={version:1,generationId:p.generationId,sourceHash:p.source.pdf.sha256,revision:c.documentRevision,pending:null,stopped:false,changes:history?hist.changes:[],submissions:history?[{changeId:'c',status:'applied',afterRevision:hist.changes[0].afterRevision}]:[],scopes:[...r.groups.map(g=>g.id),'page:1','page:2'].map(id=>({id,state:'차이없음',checkpoint:{revision:c.documentRevision,time:'synthetic',note:'Synthetic deterministic submission; no actual human review',rulesVersion:'1.0.0'}})),humanDecisions:expression?[{groupId:'expression',revision:c.documentRevision,decision:'confirmed',actor:'human',time:'synthetic',note:'Synthetic declaration'}]:[],lossConfirmations:[]};
 const projected=structuredClone(p);projected.document.revision=current.revision;for(const i of projected.items)for(const t of i.targets)t.documentRevision=current.revision;
 if(expression){const catalog=lossCatalog([loss],projected,current);ledger.lossConfirmations=[{lossId:catalog[0].lossId,sourceId:table.sourceId,reasonCode:loss.reasonCode,groupId:'expression',revision:c.documentRevision,targetPath:[2],pageNo:1,decision:'meaning-preserved',note:'Synthetic expression confirmation only',actor:'human',time:'synthetic',changeCount:ledger.changes.length,meaning:'expression-semantic-preservation',comparison:'source-and-current-side-by-side'}];}
 const completion={schemaVersion:'1.2.0',generationId:p.generationId,documentRevision:c.documentRevision,time:'synthetic',scopes:ledger.scopes,humanDecisions:ledger.humanDecisions,conditions:{ready:true,uncovered:0,human:0,blocking:0,expressionUnconfirmed:0,failures:0,tokenDifferences:0},lossConfirmations:ledger.lossConfirmations,expressionReviews:expressionReviews(ledger,lossCatalog(expression?[loss]:[],projected,current),c.documentRevision)};
 ledger.completion=completion;write(root,'correction-history.json',hist);write(root,'correction-ledger.json',ledger);write(root,'human-review.json',completion);c.files.push({relativePath:'human-review.json',sha256:'pending'});write(root,'complete.json',c);reseal(root);return root;
}
export const currentSnapshot=root=>read(root,'complete.json').files.some(f=>f.relativePath==='correction-history.json')?read(root,'correction-history.json').currentSnapshot:read(root,'snapshot.json');
