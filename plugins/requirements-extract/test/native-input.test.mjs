import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativeInput} from '../src/native-input.mjs';
import {sourceCli} from '../src/cli.mjs';
import {sha256} from '../src/model.mjs';
import {prepare,submit,proposal,report} from '../src/workflow.mjs';
import {fake,profile} from './candidate-fixture.mjs';
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'requirements-native-unit-')),raw='test native bytes',text='The controller shall retain 5 V.';writeFileSync(join(root,'input.md'),raw);
 const snapshot={ok:true,revision:sha256(raw).slice(7),nodes:[{path:[1],type:'paragraph',text,content:[{kind:'text',text}]}]},cli=sourceCli({root,launcher:{bin:process.execPath,args:[]}});
 cli.run=command=>command==='inspect'?structuredClone(snapshot):{receipt:{beforeRevision:snapshot.revision,afterRevision:snapshot.revision},before:{blocks:[]}};
 return {root,cli,snapshot};
}
test('native adapter uses existing candidate/value proof and records native-only revision location',()=>{
 const f=fixture(),input=nativeInput(f.cli,'input.md','native','snapshot.json');let job=prepare([input],structuredClone(profile));
 const source=Object.values(job.corpus.sources)[0];assert.equal(source.trace,undefined);assert.equal(source.nativeLocation.revision,f.snapshot.revision);assert.equal(source.quote,'The controller shall retain 5 V.');
 for(const section of job.corpus.sections)job=submit(job,fake(job,section));
 const p=proposal(job);assert.equal(p.requirements.length,1);assert.deepEqual(p.requirements[0].body,[{kind:'paragraph',text:source.quote}]);assert.equal(report(job).problems.some(p=>p.code==='source-review-required'),false);
 assert.ok(input.registry.mapFile.includes(f.snapshot.revision));assert.equal(JSON.parse(readFileSync(join(f.root,input.registry.mapFile))).revision,f.snapshot.revision);
 assert.deepEqual(nativeInput(f.cli,'input.md','native','snapshot.json').registry,input.registry);
});
test('native adapter refuses mismatched read projections, changed bytes and path escapes',()=>{
 const f=fixture();f.snapshot.nodes[0].content[0].text='Different value';assert.throws(()=>nativeInput(f.cli,'input.md','native','snapshot.json'));
 const g=fixture();writeFileSync(join(g.root,'input.md'),'changed');assert.throws(()=>nativeInput(g.cli,'input.md','native','snapshot.json'));
 assert.throws(()=>nativeInput(g.cli,'../outside.md','native','snapshot.json'));
});
test('native list source retains the exact item index alongside block navigation',()=>{
 const f=fixture();f.snapshot.nodes=[{type:'list',path:[1],items:[{content:[{kind:'text',text:'The controller shall retain 5 V.'}]},{content:[{kind:'text',text:'The controller shall retain 6 V.'}]}]}];
 const i=nativeInput(f.cli,'input.md','native','snapshot.json'),a=i.nativeResolver(f.snapshot.nodes[0],{kind:'list-item',index:0})[0],b=i.nativeResolver(f.snapshot.nodes[0],{kind:'list-item',index:1})[0];
 assert.equal(a.nativeLocation.listItem,0);assert.equal(b.nativeLocation.listItem,1);assert.equal(b.quote,'The controller shall retain 6 V.');assert.notEqual(a.nativeLocation.sourceId,b.nativeLocation.sourceId);assert.deepEqual(b.nativeLocation.path,[1]);
});
