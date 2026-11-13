import test from 'node:test';
import assert from 'node:assert/strict';
import {handoff,read,write,reseal} from './handoff-fixture.mjs';
import {loadProvenance} from '../src/provenance.mjs';
import {checkProjectionConsistency} from '../src/projection-consistency.mjs';
const need=(v,code)=>{if(!v)throw new Error(code);};
for(const type of ['paragraph','cell','footnote','caption','heading'])test('resealed '+type+' text/content disagreement is refused',()=>{
 const root=handoff(),s=read(root,'snapshot.json');const node=type==='cell'?s.nodes.find(n=>n.type==='cell'):s.nodes[0];node.type=type;node.content=[{kind:'strong',children:[{kind:'text',text:'contradictory value'}]}];write(root,'snapshot.json',s);reseal(root);
 assert.throws(()=>loadProvenance(root,{inspect:()=>s}),e=>e.diagnostics[0].code==='projection-self-consistency');
});
test('inline marks and note atoms preserve the plain projection without inventing source markers',()=>{
 const v={text:'5 V ',content:[{kind:'strong',children:[{kind:'text',text:'5 V '}]},{kind:'footnote',label:'n'}]};checkProjectionConsistency(v,need);
 assert.throws(()=>checkProjectionConsistency({...v,text:'5 V a'},need));
});
