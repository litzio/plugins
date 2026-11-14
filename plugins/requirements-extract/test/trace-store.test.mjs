import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {traceStore,traceRecord} from '../src/trace-store.mjs';
import {authoring,readInspection} from '../src/document.mjs';
import {canonical,digest} from '../src/model.mjs';
import {fixtureV13,currentSnapshot} from './v13-fixture.mjs';
import {loadProvenance,resolveSource} from '../src/provenance.mjs';
import {referencedTrace} from './export-trace-fixture.mjs';
import {exportReqif} from '../src/reqif.mjs';
import {sample} from './sample.mjs';
const trace={contract:'docling-to-litzio/1.3.0',eligibleConfirmed:true,targets:[{path:[2]}],machineOnlyPages:[],ruleApprovals:[{ruleId:'merged-cell-repeated',decision:'approved'}],payload:'full evidence '.repeat(2500)};
function setup(){const root=mkdtempSync(join(tmpdir(),'requirements-trace-unit-')),scope=p=>p;return {root,store:traceStore({document:join(root,'proposal.md'),scope})};}
test('new authoring always uses short summary/reference; full trace stays in content-bound plugin data',()=>{
 const set=sample()[0];set.requirements[0].sources[0].trace=trace;
 const cells=authoring(set).inputs.flatMap(i=>i.blocks).filter(b=>b.kind==='table').flatMap(b=>b.rows.flat());
 assert.ok(cells.every(c=>typeof c==='string'&&c.length<=16384));assert.ok(!cells.some(c=>c.includes('full evidence')));assert.ok(cells.includes('traceRef'));assert.ok(cells.some(c=>c.includes('병합 값 반복')));
 const {store}=setup(),ref=store.put(trace),record=traceRecord(trace);assert.deepEqual(ref,record.ref);assert.deepEqual(store.resolve(ref,record.summary),trace);store.verify();assert.deepEqual(store.put(trace),ref);
});
for(const [name,mutate] of Object.entries({
 'changed bytes':(file)=>writeFileSync(file,'{}'), 'missing file':file=>unlinkSync(file), 'added BOM':(file,bytes)=>writeFileSync(file,Buffer.concat([Buffer.from([239,187,191]),bytes])),
 'added whitespace':(file,bytes)=>writeFileSync(file,Buffer.concat([bytes,Buffer.from('\n')])),
}))test('reference rejects '+name,()=>{
 const {root,store}=setup(),ref=store.put(trace),file=join(root,'.requirements-traces',ref.id+'.json'),bytes=readFileSync(file);mutate(file,bytes);assert.throws(()=>store.resolve(ref,traceRecord(trace).summary));
});
test('wrong ID/digest and misleading human summary are rejected',()=>{
 const {store}=setup(),ref=store.put(trace),summary=traceRecord(trace).summary;
 for(const bad of [{...ref,id:'../outside'},{...ref,digest:'sha256:'+'a'.repeat(64)},{...ref,extra:true},{...ref,kind:'unknown'}])assert.throws(()=>store.resolve(bad,summary));
 assert.throws(()=>store.resolve(ref,'사람이 모든 항목을 확인함'));
});
test('a sidecar changed after resolution is rejected before a read completes',()=>{
 const {root,store}=setup(),ref=store.put(trace);store.resolve(ref,traceRecord(trace).summary);writeFileSync(join(root,'.requirements-traces',ref.id+'.json'),'{}');assert.throws(()=>store.verify());
});
function inspectionWithReference(){
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/set-0.json',import.meta.url))),record=traceRecord(trace);
 const block=fixture.snapshot.blocks.find(b=>b.block==='table'&&b.rows[0].cells[1]?.text==='elementRef');
 for(const [row,r] of block.rows.entries())for(const [offset,text] of (row===0?['trace','traceRef']:[record.summary,canonical(record.ref)]).entries()){
  const path=[block.path[0],row,5+offset],cell={path,text,header:row===0,editable:true};r.cells.push({...cell,content:[{kind:'text',text}]});fixture.inspection.nodes.push({...cell,type:'cell'});
 }
 return fixture;
}
test('document reader resolves whole trace and rejects unresolved or broken references',()=>{
 const f=inspectionWithReference(),{store}=setup();store.put(trace);
 const parsed=readInspection(f.inspection,'proposal.md',f.snapshot,{resolveTrace:(ref,summary)=>store.resolve(ref,summary)});
 assert.deepEqual(parsed.requirements[0].sources[0].trace,trace);assert.equal(parsed.requirements[0].sources[0].traceRef,undefined);
 for(const options of [{},{resolveTrace:()=>{throw new Error('missing evidence');}}]){
  const broken=readInspection(f.inspection,'proposal.md',f.snapshot,options);assert.ok(broken.diagnostics.some(d=>d.code==='source-trace-reference'));assert.throws(()=>exportReqif([broken],{testOnly:true}));
 }
});

test('writer compares original bytes, never replacement-decoded UTF-8',()=>{
 const {root,store}=setup(),value={...trace,payload:'replacement: \uFFFD'},ref=store.put(value),file=join(root,'.requirements-traces',ref.id+'.json'),bytes=readFileSync(file),at=bytes.indexOf(Buffer.from([239,191,189]));
 assert.ok(at>=0);writeFileSync(file,Buffer.concat([bytes.subarray(0,at),Buffer.from([255]),bytes.subarray(at+3)]));assert.throws(()=>store.put(value));
});

test('large repeated evidence exports short references under the unchanged ReqIF string bound',()=>{
 const root=fixtureV13({rules:true}),bundle=loadProvenance(root,{inspect:()=>currentSnapshot(root),requireReviewed:true}),source=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/tables/0',selector:'cell:1:0'}).source;
 const sets=sample(),r=sets[0].requirements[0];r.sources=Array.from({length:30},()=>structuredClone(source));sets[0].registry[0].nativeDigest='sha256:'+source.trace.documentRevision;r.confirmedDigest=digest(r);
 assert.ok(canonical(r.sources).length>65535);const xml=exportReqif(sets).xml;assert.ok(xml.includes('MAX-LENGTH="65535"'));assert.ok(!xml.includes('ruleOpenReceipts'));assert.deepEqual(referencedTrace(xml,source),source.trace);
});
