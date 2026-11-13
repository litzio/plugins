import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {correctedFixture} from './corrected-fixture.mjs';
import {handoff,read,write,reseal,h} from './handoff-fixture.mjs';
import {loadProvenance,resolveSource} from '../src/provenance.mjs';
import {prepare,report} from '../src/workflow.mjs';
import {sample} from './sample.mjs';
import {exportReqif} from '../src/reqif.mjs';
import {digest} from '../src/model.mjs';
import profile from '../profiles/default.json' with {type:'json'};
const load=root=>loadProvenance(root,{inspect:()=>read(root,'correction-history.json').currentSnapshot});
test('v1.0 bundle and source JSON bytes match pre-change consumer golden',()=>{
 const root=handoff(),bundle=loadProvenance(root,{inspect:()=>read(root,'snapshot.json')}),source=resolveSource(bundle,{elementRef:'#/texts/0'});
 assert.equal(h(JSON.stringify({bundle,source})),'1c256472b6edbe5f539eb7866813cca1156d87ec231aebb83267a2fd4ad83e85');
});
test('corrected current values retain original quote and evidence in review-first and ReqIF',()=>{
 const root=correctedFixture(),bundle=load(root),source=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/texts/0'}).source;
 assert.equal(bundle.snapshot.nodes[0].text,'Corrected voltage ≤ 5 V');assert.equal(source.quote,'Voltage ≤ 5 V');
 assert.equal(source.trace.correctionNotice,'원본 변환값과 다르게 교정됨(근거 있음)');assert.equal(source.trace.corrections[0].validation.evidenceRecheck,'verified-protected-tokens');
 assert.equal(report(prepare([{key:'synthetic',bundle}],profile)).reviewFirst[0].code,'source-corrected');
 const sets=sample(),r=sets[0].requirements[0];r.sources=[source];r.confirmedDigest=digest(r);
 assert.match(exportReqif(sets,{testOnly:true}).xml,/verified-protected-tokens/);assert.throws(()=>exportReqif(sets));
});
const mutations={
 'document only':root=>writeFileSync(join(root,'document.md'),'manual edit'),
 'history only':root=>{const h=read(root,'correction-history.json');h.changes[0].reason+='changed';write(root,'correction-history.json',h);},
 'ledger only':root=>{const l=read(root,'correction-ledger.json');l.changes[0].reason+='changed';write(root,'correction-ledger.json',l);},
 'pending':root=>{const l=read(root,'correction-ledger.json');l.pending={};write(root,'correction-ledger.json',l);},
 'missing submission':root=>{const l=read(root,'correction-ledger.json');l.submissions=[];write(root,'correction-ledger.json',l);},
};
for(const field of ['beforeRevision','afterRevision','before','after','groupId','sourceHash','inverse','receipt','validation','evidence','target']) mutations['history '+field]=root=>{const h=read(root,'correction-history.json');h.changes[0][field]=typeof h.changes[0][field]==='string'?'broken':{};write(root,'correction-history.json',h);const l=read(root,'correction-ledger.json');l.changes=h.changes;write(root,'correction-ledger.json',l);};
for(const [name,mutate] of Object.entries(mutations)) test('reject partial/resealed '+name,()=>{const root=correctedFixture();mutate(root);reseal(root);assert.throws(()=>load(root));});
test('unexplained whole-snapshot change and failed official readback are refused',()=>{
 const root=correctedFixture(),h=read(root,'correction-history.json');h.currentSnapshot.nodes[1].extra='unrecorded';write(root,'correction-history.json',h);reseal(root);assert.throws(()=>load(root));
 const other=correctedFixture();assert.throws(()=>loadProvenance(other,{inspect:()=>read(other,'snapshot.json')}));
});
function appendChange(root,after,{undo=false,protectedTokens=true,evidenceRecheck='verified-protected-tokens'}={}) {
 const history=read(root,'correction-history.json'),ledger=read(root,'correction-ledger.json'),last=history.changes.at(-1);
 const change=structuredClone(last);change.changeId='change-'+history.changes.length;change.beforeRevision=last.afterRevision;change.before=last.after;change.after=after;
 writeFileSync(join(root,'document.md'),'synthetic edit '+change.changeId+after);change.afterRevision=h('synthetic edit '+change.changeId+after);change.receipt.revision=change.afterRevision;change.undoOf=undo?last.changeId:null;change.inverse={command:'update-node-text',path:'1',from:after,to:change.before};
 history.changes.push(change);history.currentSnapshot.revision=change.afterRevision;history.currentSnapshot.nodes[0].text=after;history.currentSnapshot.nodes[0].content=[{kind:'text',text:after}];
 change.validation={readback:true,protectedTokens,evidenceRecheck};
 ledger.revision=change.afterRevision;ledger.changes=history.changes;ledger.submissions.push({changeId:change.changeId,status:protectedTokens?'applied':'uncertain',afterRevision:change.afterRevision});
 write(root,'correction-history.json',history);write(root,'correction-ledger.json',ledger);const complete=read(root,'complete.json');complete.documentRevision=change.afterRevision;write(root,'complete.json',complete);reseal(root);
}
test('multiple edits, exact undo, and undo then new edit describe current value only',()=>{
 for(const mode of ['multiple','undo','undo-redo']) {
  const root=correctedFixture();appendChange(root,mode==='multiple'?'Another voltage ≤ 5 V':'Voltage ≤ 5 V',{undo:mode!=='multiple'});
  if(mode==='undo-redo')appendChange(root,'New voltage ≤ 5 V');
  const bundle=load(root),source=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/texts/0'}).source;
  const restored=mode==='undo';assert.equal(source.trace.correctionState,restored?'restored-to-conversion-value':'currently-corrected');
  assert.deepEqual(source.trace.corrections,bundle.history.changes);
  assert.equal(!!source.trace.correctionNotice,!restored);assert.equal(report(prepare([{key:'synthetic',bundle}],profile)).reviewFirst.some(p=>p.code==='source-corrected'),!restored);
  const sets=sample(),r=sets[0].requirements[0];r.sources=[source];r.confirmedDigest=digest(r);assert.equal(exportReqif(sets,{testOnly:true}).xml.includes('원본 변환값과 다르게 교정됨'),!restored);
 }
});
test('undo-restoration remains in complete source history and ReqIF without a current correction notice',()=>{
 const root=correctedFixture({before:'999'});appendChange(root,'999',{undo:true,protectedTokens:false,evidenceRecheck:'undo-restoration'});
 const bundle=load(root),source=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/texts/0'}).source;
 assert.equal(source.trace.correctionState,'restored-to-conversion-value');assert.deepEqual(source.trace.corrections,bundle.history.changes);assert.equal(source.trace.corrections.at(-1).validation.evidenceRecheck,'undo-restoration');assert.equal(source.trace.correctionNotice,undefined);
 assert.ok(!report(prepare([{key:'synthetic',bundle}],profile)).reviewFirst.some(p=>p.code==='source-corrected'));
 const sets=sample(),r=sets[0].requirements[0];r.sources=[source];r.confirmedDigest=digest(r);const xml=exportReqif(sets,{testOnly:true}).xml;assert.ok(xml.includes('undo-restoration'));assert.ok(!xml.includes('원본 변환값과 다르게 교정됨'));
});
