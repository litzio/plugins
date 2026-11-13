import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from 'xmlbuilder2';
import {sample} from './sample.mjs';
import {exportReqif} from '../src/reqif.mjs';
import {bodyFields,listItemFields,footnoteFields} from '../src/body.mjs';
const nodes=(root,tag)=>[...root.getElementsByTagName(tag)];
function attributes(xml,name) {
 const root=create(xml).node,ids=new Set(nodes(root,'ATTRIBUTE-DEFINITION-STRING').filter(n=>n.getAttribute('LONG-NAME')===name).map(n=>n.getAttribute('IDENTIFIER')));
 return nodes(root,'ATTRIBUTE-VALUE-STRING').filter(n=>nodes(n,'ATTRIBUTE-DEFINITION-STRING-REF').some(ref=>ids.has(ref.textContent))).map(n=>JSON.parse(n.getAttribute('THE-VALUE')));
}
test('relation partial/full/topic judgments and symmetric assertions survive as relation attributes',()=>{
 const sets=sample(),r=sets[1].requirements[0],rel=r.relations[0];
 rel.rationale=JSON.stringify({reason:'Specific boundary is satisfied',coverage:'partial',covered:'Startup response',remaining:'Shutdown response',basis:'satisfies-obligation'});
 r.relations[1].rationale='Topic only; no satisfaction';sets[1].requirements[1].relations.push({role:'relatesTo',targetId:r.id,rationale:'Reverse assertion must survive'});
 const first=exportReqif(sets,{testOnly:true,now:'2026-11-13T00:00:00Z'}),judgments=attributes(first.xml,'RelationJudgments').flat();
 assert.deepEqual(judgments.find(j=>j.sourceId===r.id&&j.role==='refines'),{sourceId:r.id,...rel});
 assert.equal(JSON.parse(judgments.find(j=>j.sourceId===r.id&&j.role==='refines').rationale).remaining,'Shutdown response');
 assert.ok(judgments.some(j=>j.rationale==='Topic only; no satisfaction'));assert.ok(judgments.some(j=>j.rationale==='Reverse assertion must survive'));
 rel.rationale+=' Changed';const second=exportReqif(sets,{testOnly:true,previous:first.manifest,now:'2026-11-14T00:00:00Z'});
 const relationIds=Object.keys(first.manifest.entries).filter(id=>id in second.manifest.entries);assert.ok(relationIds.some(id=>first.manifest.entries[id].digest!==second.manifest.entries[id].digest));
 assert.deepEqual(attributes(first.xml,'SourceRegistry'),sets.map(s=>s.registry));
 assert.deepEqual(attributes(first.xml,'DocumentProfile'),sets.map(s=>({profile:s.profile,defaultLevel:s.defaultLevel,exportNamespace:s.exportNamespace})));
});
for(const scope of ['requirement','set'])for(const value of ['hidden',{},[]])test('unclassified '+scope+' fields block both modes '+JSON.stringify(value),()=>{
 const sets=sample();(scope==='set'?sets[0]:sets[0].requirements[0]).unmapped=value;
 for(const testOnly of [true,false])assert.throws(()=>exportReqif(sets,{testOnly}),e=>e.diagnostics.some(d=>d.code==='unmapped-export-field'));
});
test('unknown body/inline/footnote fields block; oversized relation evidence never truncates',()=>{
 for(const scope of ['body','inline','footnote']) {const sets=sample(),r=sets[0].requirements[0];if(scope==='body')r.body[0].hidden='x';if(scope==='inline')r.body[0].content=[{kind:'text',text:'x',hidden:'x'}];if(scope==='footnote')r.footnotes=[{label:'f',content:[{kind:'text',text:'x'}],hidden:'x'}];assert.throws(()=>exportReqif(sets,{testOnly:true}),e=>e.diagnostics.some(d=>d.code==='unmapped-semantic'));}
 const sets=sample();sets[1].requirements[0].relations[0].rationale='x'.repeat(65536);assert.throws(()=>exportReqif(sets,{testOnly:true}),e=>e.diagnostics.some(d=>d.code==='export-attribute-too-long'));
});
test('unmapped ordered list style is blocked rather than silently numbered differently',()=>{
 const sets=sample();sets[0].requirements[0].body=[{kind:'list',ordered:true,style:'unknown-numbering',items:[{content:[{kind:'text',text:'obligation'}]}]}];assert.throws(()=>exportReqif(sets,{testOnly:true}),e=>e.diagnostics.some(d=>d.code==='unsupported-export-list-style'));
});
for(const scope of ['paragraph','table','list-item','footnote'])test('model extension '+scope+'.condition requires independent export classification',()=>{
 const fields=scope==='list-item'?listItemFields:scope==='footnote'?footnoteFields:bodyFields[scope];fields.push('condition');
 try {
  const sets=sample();sets[0].requirements[0].body=[scope==='table'?{kind:'table',rows:[['value']],condition:'MUST NOT DISAPPEAR'}:{kind:'paragraph',text:'body',...(scope==='paragraph'?{condition:'MUST NOT DISAPPEAR'}:{})}];
  for(const testOnly of [true,false])assert.throws(()=>exportReqif(sets,{testOnly}),e=>e.diagnostics.some(d=>d.code==='unclassified-export-model-field'&&d.message.includes('.condition')));
 }finally{fields.pop();}
 assert.doesNotThrow(()=>exportReqif(sample(),{testOnly:true}));
});
