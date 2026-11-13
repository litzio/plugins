import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLedger,loadLedger,saveLedger} from '../src/ledger.mjs';
import {job,fake} from './candidate-fixture.mjs';
import {submit,reopen,proposal} from '../src/workflow.mjs';
import {canonical,sha256} from '../src/model.mjs';
const temp=()=>join(mkdtempSync(join(tmpdir(),'req-ledger-')),'ledger');
test('old internal ledger format gives explicit restart diagnostic',()=>{
 const root=temp();createLedger(root,job());writeFileSync(join(root,'owner.json'),canonical({owner:'requirements-extract/candidates/1'}));
 assert.throws(()=>loadLedger(root),e=>e.diagnostics?.some(d=>d.code==='ledger-version'));
});
test('content-addressed history preserves exact state and detects old corruption on every read',()=>{
 const root=temp(),j=job(),a=createLedger(root,j),next=submit(j,fake(j)),b=saveLedger(root,next,a.head);
 assert.deepEqual(loadLedger(root).state,next);
 const third=reopen(next,next.corpus.sections[0].key);saveLedger(root,third,b.head);assert.deepEqual(loadLedger(root).state,third);
 const file=join(root,'00000002.json'),bytes=readFileSync(file,'utf8');writeFileSync(file,bytes.replace('sha256:','sha256:0'));
 const bad=loadLedger(root);assert.equal(bad.head,a.head);assert.equal(bad.diagnostics[0].code,'checkpoint-corrupt');
 assert.throws(()=>saveLedger(root,j,a.head));
});
test('rehashed outer chain cannot hide bad object digest or missing reference',()=>{
 for(const mutate of [e=>e.objects[0][1][0]=9,e=>e.changes[0][1]=[[3,'sha256:missing']]]){
  const root=temp();createLedger(root,job());const file=join(root,'00000001.json'),entry=JSON.parse(readFileSync(file));mutate(entry);const {digest,...payload}=entry;writeFileSync(file,canonical({...payload,digest:sha256(canonical(payload))}));assert.throws(()=>loadLedger(root));
 }
});
test('unchanged corpus is not copied into later checkpoints and saved judgments are revalidated',()=>{
 const root=temp(),j=job(),a=createLedger(root,j),next=submit(j,fake(j));saveLedger(root,next,a.head);
 const entry=readFileSync(join(root,'00000002.json'),'utf8');assert.ok(!entry.includes('artifactDigest'));assert.deepEqual(proposal(loadLedger(root).state),proposal(next));
 const stale=loadLedger(root).state;stale.responses[stale.corpus.sections[0].key].decisions[0].outputs[0].bodyBlocks[0]={kind:'paragraph',text:'Changed 900 V'};assert.throws(()=>proposal(stale));
});
test('content reuse is bound to exact values and a changed corpus is encoded again',()=>{
 const root=temp(),j=job(),a=createLedger(root,j),next=structuredClone(j);next.corpus.units[0].text+=' changed';next.extra={nullValue:null,array:[null,{},[],3],literal:[3,'sha256:literal']};
 const b=saveLedger(root,next,a.head);assert.deepEqual(loadLedger(root).state,next);assert.notEqual(b.head,a.head);
 delete next.extra;delete next.tickets[Object.keys(next.tickets)[0]];saveLedger(root,next,b.head);assert.deepEqual(loadLedger(root).state,next);
});
test('every historical job identity is checked even with a recomputed outer digest',()=>{
 const root=temp(),j=job();createLedger(root,j);const file=join(root,'00000001.json'),entry=JSON.parse(readFileSync(file));entry.changes.find(([key])=>key===canonical(['jobId']))[1]=['another-job'];const {digest,...payload}=entry;writeFileSync(file,canonical({...payload,digest:sha256(canonical(payload))}));assert.throws(()=>loadLedger(root));
});
