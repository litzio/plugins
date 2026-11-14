import {referencedTrace} from './export-trace-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {read,write,reseal,h} from './handoff-fixture.mjs';
import {reviewedFixture,currentSnapshot} from './reviewed-fixture.mjs';
import {correctedFixture} from './corrected-fixture.mjs';
import {loadProvenance,resolveSource,verifyReviewedSources} from '../src/provenance.mjs';
import {reviewedTrace,digest} from '../src/model.mjs';
import {sample} from './sample.mjs';
import {exportReqif} from '../src/reqif.mjs';
import {prepare,report,refresh} from '../src/workflow.mjs';
import profile from '../profiles/default.json' with {type:'json'};
const load=(root,extra={})=>loadProvenance(root,{inspect:()=>currentSnapshot(root),...extra});
test('v1.1 bundle/source bytes remain identical',()=>{const root=correctedFixture(),bundle=load(root),source=resolveSource(bundle,{elementRef:'#/texts/0'});assert.equal(h(JSON.stringify({bundle,source})),'1a038b26d5016884352db1d2bae37bcebaddfc05096d141a32a246ec193218ce');});
for(const history of [false,true])test('v1.2 completion is recomputed, with or without correction history: '+history,()=>{
 const root=reviewedFixture({history}),bundle=load(root,{requireReviewed:true});assert.equal(bundle.reviewState,'reviewed');assert.ok(Object.values(bundle.review.conditions).every(v=>v===true));
 const src=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/tables/0',selector:'cell:1:0'}).source;assert.ok(reviewedTrace(src.trace));assert.match(src.trace.actorLimitation,/비인증/);assert.match(src.trace.mergedTableConfirmation,/요구사항 확정은 별도/);assert.equal(src.trace.expressionReviews[0].confirmation.meaning,'expression-semantic-preservation');assert.ok(!src.trace.diagnostics.some(d=>d.code==='merged-table-review'));
 const sets=sample(),r=sets[0].requirements[0];r.sources=[src];sets[0].registry[0].nativeDigest='sha256:'+r.sources[0].trace.documentRevision;r.confirmedDigest=digest(r);const xml=exportReqif(sets).xml;assert.deepEqual(referencedTrace(xml,src).expressionReviews,src.trace.expressionReviews);
 r.status='draft';assert.throws(()=>exportReqif(sets));
 const first=report(prepare([{key:'synthetic',bundle}],profile)).reviewFirst;assert.ok(first.some(p=>p.code==='source-reviewed'));assert.ok(first.some(p=>p.code==='source-expression-confirmed'));
});
test('human region correction is never promoted to machine verification',()=>{
 const root=reviewedFixture({human:true}),bundle=load(root,{requireReviewed:true}),src=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/texts/0'}).source;
 assert.equal(bundle.snapshot.nodes[0].text,'Voltage ≤ 7 V');assert.equal(src.quote,'Voltage ≤ 5 V');assert.match(src.trace.humanCorrectionNotice,/기계 토큰 검증 아님/);assert.equal(src.trace.corrections[0].validation.protectedTokens,false);assert.equal(src.trace.corrections[0].validation.evidenceRecheck,'human-source-region');
 const sets=sample(),r=sets[0].requirements[0];r.sources=[src];sets[0].registry[0].nativeDigest='sha256:'+r.sources[0].trace.documentRevision;r.confirmedDigest=digest(r);assert.equal(referencedTrace(exportReqif(sets).xml,src).corrections[0].evidence.kind,'human-source-region');
});
const mutations={
 'C0 generation':l=>l.generationId='different', 'C1 pending':l=>l.pending={}, 'C2 stopped':l=>l.stopped=true, 'C3 revision':l=>l.revision='a'.repeat(64),
 'C4 missing page':l=>l.scopes.pop(), 'C4 missing group':l=>l.scopes.shift(), 'C4 automatic checkpoint':l=>delete l.scopes[0].checkpoint.note, 'C4 stale checkpoint':l=>l.scopes[0].checkpoint.revision='a'.repeat(64),
 'C5 missing decision':l=>l.humanDecisions=[], 'C5 deferred':l=>l.humanDecisions[0].decision='deferred', 'C5 invalidated':l=>l.humanDecisions[0].invalidatedAt='later',
 'C7 missing':l=>l.lossConfirmations=[], 'C7 deferred':l=>l.lossConfirmations[0].decision='deferred','C7 meaning changed':l=>l.lossConfirmations[0].decision='meaning-changed','C7 invalidated':l=>l.lossConfirmations[0].invalidatedAt='later','C7 edit count':l=>l.lossConfirmations[0].changeCount=0,
 'C8 failure':l=>l.scopes[0].state='실패',
 'completion cleared':l=>l.completion=null, 'checkpoint restarted':l=>l.scopes[0].state='검사중',
 'stop then resume':l=>{l.stopped=false;l.completion=null;l.scopes.forEach(s=>{s.state='미검사';s.checkpoint=null;});},
 'normal checkpoint after issuance':l=>l.scopes[0].checkpoint.note+=' another inspection',
 'general group deferred':l=>l.humanDecisions.push({groupId:'g',revision:l.revision,decision:'deferred',actor:'human',time:'later',note:'Explicit general group deferral'}),
 'invalidated general deferral sticky':l=>l.humanDecisions.push({groupId:'g',revision:l.revision,decision:'deferred',actor:'human',time:'later',note:'Explicit deferral',invalidatedAt:'later'}),
};
for(const [name,mutate] of Object.entries(mutations))test('never reviewed after '+name,()=>{
 const root=reviewedFixture(),ledger=read(root,'correction-ledger.json');mutate(ledger);write(root,'correction-ledger.json',ledger);
 try{const bundle=load(root);assert.equal(bundle.eligibleConfirmed,false);assert.equal(bundle.reviewState,'unreviewed');const src=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/texts/0'}).source;assert.equal(reviewedTrace(src.trace),false);}catch(e){assert.ok(e.diagnostics);}
 assert.throws(()=>load(root,{requireReviewed:true}));
});
test('even consistently replaced issuance arrays do not bypass recomputation',()=>{
 for(const field of ['scopes','humanDecisions','lossConfirmations']){const root=reviewedFixture(),l=read(root,'correction-ledger.json'),c=read(root,'human-review.json');l[field]=[];c[field]=[];l.completion=c;write(root,'human-review.json',c);write(root,'correction-ledger.json',l);reseal(root);try{assert.equal(load(root).eligibleConfirmed,false);}catch(e){assert.ok(e.diagnostics);} }
});
function reviewSeal(root) {
 const p=read(root,'provenance.json'),r=read(root,'review/review-targets.json'),e=read(root,'review/pdf-evidence.json');
 r.inputs.provenanceSha256=h(fixtureFs.readFileSync(fixturePath.join(root,'provenance.json')));r.inputs.snapshotSha256=h(fixtureFs.readFileSync(fixturePath.join(root,'snapshot.json')));r.evidenceFile.sha256=h(fixtureFs.readFileSync(fixturePath.join(root,'review/pdf-evidence.json')));write(root,'review/review-targets.json',r);
 write(root,'review/review-complete.json',{schemaVersion:'1.0.0',generationId:p.generationId,documentRevision:p.document.revision,status:'generated-unreviewed',reportSha256:h(fixtureFs.readFileSync(fixturePath.join(root,'review/review-targets.json'))),evidenceSha256:r.evidenceFile.sha256});reseal(root);
}
test('C6 unknown content loss remains repair-required after resealing',()=>{
 const root=reviewedFixture({history:false}),p=read(root,'provenance.json'),losses=read(root,'losses.json'),r=read(root,'review/review-targets.json');
 p.items[3].losses[0].reasonCode=losses.items[0].reasonCode=r.findings.find(f=>f.kind==='meaning-loss').evidence.reasonCode='unknown-content-loss';
 write(root,'provenance.json',p);write(root,'losses.json',losses);write(root,'review/review-targets.json',r);reviewSeal(root);
 // The old expression confirmation now points to a different loss: hard refusal
 // is also an explicit refusal to promote this source.
 assert.throws(()=>load(root,{requireReviewed:true}));
});
test('C9 rereads current values instead of trusting saved nativeTokens or conditions',()=>{
 const root=reviewedFixture({history:false}),e=read(root,'review/pdf-evidence.json');e.pages[0].tokens[1].value='6';write(root,'review/pdf-evidence.json',e);reviewSeal(root);
 const b=load(root);assert.equal(b.review.counts.tokenDifferences,1);assert.equal(b.review.conditions.protectedValues,false);assert.equal(b.eligibleConfirmed,false);assert.throws(()=>load(root,{requireReviewed:true}));
});
test('a ledger-only completion invalidation changes input fingerprint and clears judgments',()=>{
 const root=reviewedFixture(),job=prepare([{key:'synthetic',bundle:load(root)}],profile),l=read(root,'correction-ledger.json');l.completion=null;write(root,'correction-ledger.json',l);
 const next=refresh(job,[{key:'synthetic',bundle:load(root)}],profile);assert.notEqual(next.inputDigest,job.inputDigest);assert.equal(next.epoch,job.epoch+1);assert.deepEqual(next.responses,{});assert.ok(Object.values(next.corpus.sources).every(s=>s.trace.reviewState==='unreviewed'));assert.ok(report(next).reviewFirst.some(p=>p.code==='source-review-required'));
});
test('saved proposals and upper sets re-read current handoff review instead of trusting stored reviewed trace',()=>{
 const root=reviewedFixture(),source=resolveSource(load(root),{sourceKey:'synthetic',elementRef:'#/texts/0'}).source,sets=sample(),set=sets[0],req=set.requirements[0];req.sources=[source];sets[0].registry[0].nativeDigest='sha256:'+req.sources[0].trace.documentRevision;req.confirmedDigest=digest(req);set.registry[0].mapFile='provenance.json';set.registry[0].nativeFile='document.md';set.registry[0].artifactDigest='sha256:'+load(root).provenance.source.docling.sha256;set.file='proposal.md';
 const options={scope:p=>fixturePath.join(root,p),inspect:()=>currentSnapshot(root)};
 assert.deepEqual(verifyReviewedSources(set,options),[]);
 for(const [field,value] of [['nativeDigest','sha256:'+'a'.repeat(64)],['artifactDigest','sha256:'+'b'.repeat(64)],['nativeFile','other.md'],['mapFile','other.json']]){
  const changed=structuredClone(set);changed.registry[0][field]=value;assert.equal(verifyReviewedSources(changed,options)[0].code,'stale-source-evidence',field);
 }
 const ledger=read(root,'correction-ledger.json');ledger.completion=null;write(root,'correction-ledger.json',ledger);
 const issues=verifyReviewedSources(set,options);assert.equal(issues[0].code,'stale-source-evidence');set.diagnostics=issues;assert.throws(()=>exportReqif(sets));
});
test('v1.2 packing includes final duplicate/context budget instead of blocking an otherwise bounded batch',()=>{
 const root=reviewedFixture(),bundle=load(root);let checked=0;
 for(const characters of [500,750,1000,1250,1500,2000]){
  const p=structuredClone(profile);p.limits.characters=characters;const job=prepare([{key:'synthetic',bundle}],p);
  for(const section of job.corpus.sections)if(section.units.length>1){assert.ok(section.inputCharacters<=characters,JSON.stringify({characters,actual:section.inputCharacters}));assert.equal(section.oversized,false);checked++;}
 }
 assert.ok(checked>0);
});
test('human inline cell correction and exact undo preserve content and every history record',()=>{
 const root=reviewedFixture(),hist=read(root,'correction-history.json'),l=read(root,'correction-ledger.json'),c=read(root,'complete.json'),snapshot=read(root,'snapshot.json');
 const original=snapshot.nodes.find(n=>n.type==='cell'&&n.path[1]===1&&n.path[2]===0),change=hist.changes[0];
 change.target={kind:'cell',path:[2],row:1,column:0};change.groupId='expression';change.actor='human';change.before=original.text;change.after='x^2';change.beforeContent=original.content;change.afterContent=[{kind:'math',value:'x^2'}];change.evidence={kind:'human-source-region',refs:[],scope:[{pageNo:1,bbox:[10,10,120,30]}]};change.validation={readback:true,protectedTokens:false,evidenceRecheck:'human-source-region'};change.inverse={command:'update-table-cell',path:'2,1,0',content:change.beforeContent};
 hist.currentSnapshot=structuredClone(snapshot);hist.currentSnapshot.revision=c.documentRevision;Object.assign(hist.currentSnapshot.nodes.find(n=>n.type==='cell'&&n.path[1]===1&&n.path[2]===0),{text:change.after,content:change.afterContent});
 l.changes=hist.changes;l.completion=null;c.reviewState='unreviewed';c.files=c.files.filter(f=>f.relativePath!=='human-review.json');write(root,'complete.json',c);write(root,'correction-history.json',hist);write(root,'correction-ledger.json',l);reseal(root);
 const edited=load(root);assert.equal(edited.snapshot.nodes.find(n=>n.type==='cell'&&n.path[1]===1&&n.path[2]===0).content[0].kind,'math');
 const candidates=Object.values(prepare([{key:'synthetic',bundle:edited}],profile).corpus.candidates).filter(c=>c.kind==='table-cell');
 assert.ok(candidates.some(c=>c.text==='x^2'));assert.ok(candidates.some(c=>c.text==='≤ 5 V'));assert.notEqual(candidates.find(c=>c.text==='x^2').candidateKey,candidates.find(c=>c.text==='≤ 5 V').candidateKey,'different corrected projections of one merged source cell cannot collapse');
 for(const field of ['actor','scope','refs','afterContent','beforeContent','inverse','protectedTokens']){
  const broken=structuredClone(hist);const b=broken.changes[0];if(field==='actor')b.actor='assistant';else if(field==='scope')b.evidence.scope[0].bbox=[0,0,1,1];else if(field==='refs')b.evidence.refs=['t0'];else if(field==='protectedTokens')b.validation.protectedTokens=true;else b[field]=[];
  write(root,'correction-history.json',broken);write(root,'correction-ledger.json',{...l,changes:broken.changes});reseal(root);assert.throws(()=>load(root),field);
 }
 const undo=structuredClone(change);undo.changeId='undo';undo.undoOf=change.changeId;undo.beforeRevision=change.afterRevision;undo.afterRevision=h('undo bytes');undo.receipt.revision=undo.afterRevision;undo.before=change.after;undo.after=change.before;undo.beforeContent=change.afterContent;undo.afterContent=change.beforeContent;undo.inverse={command:'update-table-cell',path:'2,1,0',content:undo.beforeContent};hist.changes.push(undo);hist.currentSnapshot=structuredClone(snapshot);hist.currentSnapshot.revision=undo.afterRevision;
 fixtureFs.writeFileSync(fixturePath.join(root,'document.md'),'undo bytes');c.documentRevision=undo.afterRevision;l.changes=hist.changes;l.revision=undo.afterRevision;l.submissions.push({changeId:'undo',afterRevision:undo.afterRevision,status:'applied'});write(root,'complete.json',c);write(root,'correction-history.json',hist);write(root,'correction-ledger.json',l);reseal(root);
 const b=load(root),s=resolveSource(b,{sourceKey:'synthetic',elementRef:'#/tables/0',selector:'cell:1:0'}).source;assert.equal(s.trace.correctionState,'restored-to-conversion-value');assert.equal(s.trace.corrections.length,2);assert.equal(s.trace.correctionNotice,undefined);assert.equal(b.review.conditions.protectedValues,true);assert.equal(b.review.reviewComplete,false);
});
for(const file of ['document.md','human-review.json','review/pdf-evidence.json','review/review-targets.json','correction-history.json'])test('partial bytes change blocks '+file,()=>{
 const root=reviewedFixture();if(file==='document.md'){fixtureFs.appendFileSync(fixturePath.join(root,file),' changed');}else{const v=read(root,file);v.mutation='changed';write(root,file,v);}assert.throws(()=>load(root));
});
test('unknown version and false reviewed trace without proof cannot export',()=>{
 const root=reviewedFixture(),c=read(root,'complete.json');c.schemaVersion='1.3.0';write(root,'complete.json',c);assert.throws(()=>load(root));
 const sets=sample(),r=sets[0].requirements[0];r.sources[0].trace={contract:'docling-to-litzio/1.2.0',reviewState:'reviewed',eligibleConfirmed:true};sets[0].registry[0].nativeDigest='sha256:'+r.sources[0].trace.documentRevision;r.confirmedDigest=digest(r);assert.throws(()=>exportReqif(sets));
});
test('every completion proof field is required by formal export',()=>{
 const root=reviewedFixture(),source=resolveSource(load(root),{sourceKey:'synthetic',elementRef:'#/texts/0'}).source;
 for(const field of Object.keys(source.trace.review.conditions)){
  const sets=sample(),r=sets[0].requirements[0];r.sources=[structuredClone(source)];delete r.sources[0].trace.review.conditions[field];sets[0].registry[0].nativeDigest='sha256:'+r.sources[0].trace.documentRevision;r.confirmedDigest=digest(r);assert.throws(()=>exportReqif(sets),field);
 }
 for(const field of ['receiptCurrent','completionRevision','completionDigest','reviewComplete','counts']){
  const sets=sample(),r=sets[0].requirements[0];r.sources=[structuredClone(source)];delete r.sources[0].trace.review[field];sets[0].registry[0].nativeDigest='sha256:'+r.sources[0].trace.documentRevision;r.confirmedDigest=digest(r);assert.throws(()=>exportReqif(sets),field);
 }
});
test('unreviewed marker does not waive schema/generation checks on a bound historical issuance',()=>{
 for(const patch of [{schemaVersion:'1.3.0'},{generationId:'other'},{documentRevision:'a'.repeat(64)}]){
  const root=reviewedFixture(),c=read(root,'complete.json'),issued=read(root,'human-review.json');c.reviewState='unreviewed';Object.assign(issued,patch);write(root,'complete.json',c);write(root,'human-review.json',issued);reseal(root);assert.throws(()=>load(root));
 }
});
test('undo of a human correction restores the ordinary token gate, even when original value was wrong',()=>{
 const root=reviewedFixture({human:true,before:'999'}),hist=read(root,'correction-history.json'),l=read(root,'correction-ledger.json'),c=read(root,'complete.json'),last=hist.changes[0],undo=structuredClone(last);
 undo.changeId='restore-wrong';undo.undoOf=last.changeId;undo.before=last.after;undo.after=last.before;undo.beforeRevision=last.afterRevision;undo.afterRevision=h('restore wrong bytes');undo.receipt.revision=undo.afterRevision;undo.inverse={command:'update-node-text',path:'1',from:undo.after,to:undo.before};hist.changes.push(undo);hist.currentSnapshot.revision=undo.afterRevision;hist.currentSnapshot.nodes[0].text=undo.after;hist.currentSnapshot.nodes[0].content=[{kind:'text',text:undo.after}];
 fixtureFs.writeFileSync(fixturePath.join(root,'document.md'),'restore wrong bytes');c.documentRevision=undo.afterRevision;c.reviewState='unreviewed';c.files=c.files.filter(f=>f.relativePath!=='human-review.json');l.revision=undo.afterRevision;l.changes=hist.changes;l.completion=null;l.submissions.push({changeId:undo.changeId,status:'applied',afterRevision:undo.afterRevision});write(root,'complete.json',c);write(root,'correction-history.json',hist);write(root,'correction-ledger.json',l);reseal(root);
 const b=load(root);assert.equal(b.review.counts.tokenDifferences,1);assert.equal(b.review.conditions.protectedValues,false);assert.equal(b.eligibleConfirmed,false);assert.equal(resolveSource(b,{sourceKey:'synthetic',elementRef:'#/texts/0'}).source.trace.correctionNotice,undefined);
});
test('human-filled gap retains an empty original quote and table-region provenance without inventing a source cell',()=>{
 const root=reviewedFixture(),p=read(root,'provenance.json'),raw=read(root,'source/document.json'),snapshot=read(root,'snapshot.json'),hist=read(root,'correction-history.json'),l=read(root,'correction-ledger.json'),c=read(root,'complete.json'),r=read(root,'review/review-targets.json');
 raw.tables[0].data.table_cells.pop();write(root,'source/document.json',raw);const docHash=h(fixtureFs.readFileSync(fixturePath.join(root,'source/document.json'))),record=read(root,'source/conversion-record.json');record.document.sha256=docHash;write(root,'source/conversion-record.json',record);p.source.docling.sha256=docHash;p.source.conversionRecord.sha256=h(fixtureFs.readFileSync(fixturePath.join(root,'source/conversion-record.json')));
 const ids=new Map();for(const i of p.items){const old=i.sourceId;i.sourceId=h(docHash+':'+i.selfRef);ids.set(old,i.sourceId);for(const cell of i.cells)cell.sourceId=h(docHash+':'+i.selfRef+':'+cell.cellIndex);for(const loss of i.losses)loss.sourceId=i.sourceId;}
 const table=p.items[3];table.cells.pop();table.structure.tableModel.mergedRanges.pop();for(const n of snapshot.nodes.filter(n=>n.type==='cell'&&n.path[1]===1)){n.text='';n.content=[];}write(root,'snapshot.json',snapshot);write(root,'provenance.json',p);write(root,'losses.json',{schemaVersion:'1.0.0',generationId:p.generationId,documentRevision:p.document.revision,items:table.losses});
 for(const f of r.findings){f.sourceIds=f.sourceIds.map(id=>ids.get(id));}for(const k of r.checks)k.sourceId=ids.get(k.sourceId);
 const target={path:[2],selector:{kind:'cell',row:1,column:0,rowSpan:1,columnSpan:1},role:'content',bindingState:'current',documentRevision:p.document.revision,text:''};r.findings.push({id:'gap',kind:'source-cell-unavailable',priority:'high',sourceIds:[table.sourceId],selfRefs:[table.selfRef],regions:r.findings[0].regions,targets:[target],evidence:{gaps:[{sourceRow:1,sourceColumn:0,outputRow:1,outputColumn:0}],reason:'Synthetic missing source cell'},status:'candidate'});const group=r.groups.find(g=>g.id==='expression');group.findingIds.push('gap');group.kinds.push('source-cell-unavailable');r.statistics.findings++;r.statistics.byKind['source-cell-unavailable']=1;write(root,'review/review-targets.json',r);
 const change=hist.changes[0];Object.assign(change,{groupId:'expression',actor:'human',target:{kind:'cell',path:[2],row:1,column:0},before:'',after:'7 V',beforeContent:[],afterContent:[{kind:'text',text:'7 V'}],evidence:{kind:'human-source-region',refs:[],scope:[{pageNo:1,bbox:[10,10,120,30]}]},validation:{readback:true,protectedTokens:false,evidenceRecheck:'human-source-region'},inverse:{command:'update-table-cell',path:'2,1,0',content:[]}});
 hist.schemaVersion='1.2.0';hist.currentSnapshot=structuredClone(snapshot);hist.currentSnapshot.revision=c.documentRevision;Object.assign(hist.currentSnapshot.nodes.find(n=>n.type==='cell'&&n.path[1]===1&&n.path[2]===0),{text:'7 V',content:change.afterContent});l.changes=hist.changes;l.completion=null;l.lossConfirmations=[];l.humanDecisions=[];c.reviewState='unreviewed';c.files=c.files.filter(f=>f.relativePath!=='human-review.json');write(root,'complete.json',c);write(root,'correction-history.json',hist);write(root,'correction-ledger.json',l);reviewSeal(root);
 const bundle=load(root),src=resolveSource(bundle,{sourceKey:'synthetic',elementRef:table.selfRef,selector:'cell:1:0'}).source;assert.equal(src.quote,'');assert.equal(src.trace.sourceId,table.sourceId);assert.equal(src.trace.sourceCell,undefined);assert.equal(src.trace.gapTarget.originalConversionValue,'');assert.equal(src.trace.corrections[0].after,'7 V');assert.equal(src.trace.precision,'table');
 const job=prepare([{key:'synthetic',bundle}],profile),candidate=Object.values(job.corpus.candidates).find(c=>c.text==='7 V');assert.ok(candidate);assert.ok(candidate.sourceKeys.some(k=>job.corpus.sources[k].trace.gapTarget));
 const sets=sample(),req=sets[0].requirements[0];req.sources=[src];sets[0].registry[0].nativeDigest='sha256:'+req.sources[0].trace.documentRevision;req.confirmedDigest=digest(req);assert.equal(referencedTrace(exportReqif(sets,{testOnly:true}).xml,src).gapTarget.originalConversionValue,'');assert.throws(()=>exportReqif(sets));
});
import * as fixtureFs from 'node:fs';
import * as fixturePath from 'node:path';
