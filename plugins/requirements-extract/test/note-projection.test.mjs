import test from 'node:test';
import assert from 'node:assert/strict';
import {noteSourceText,verifyNotes} from '../src/note-projection.mjs';
const need=(v,code)=>{if(!v)throw new Error(code);};
test('source note marker is reconstructed only from reciprocal binding and exact native atom',()=>{
 const b={sourceRef:'#/tables/0',cellIndex:0,start:4,marker:'a',label:'docling-note-1',witness:{pageNo:1}},raw=new Map([['#/texts/1',{label:'footnote',text:'a Explanation'}],['#/tables/0',{data:{table_cells:[{text:'5 V a'}]}}]]);
 const p={pages:[{pageNo:1}],items:[{selfRef:'#/texts/1',structure:{noteBinding:b}},{selfRef:'#/tables/0',structure:{noteReferences:[b]}}]},snapshot={nodes:[{type:'footnote',label:b.label,text:'Explanation'},{type:'cell',path:[1,0,0],content:[{kind:'text',text:'5 V '},{kind:'footnote',label:b.label}]}]},t={path:[1],selector:{kind:'cell',row:0,column:0}};
 verifyNotes(p,raw,snapshot,need);assert.equal(noteSourceText(snapshot,t,[b],'5 V a',need),'5 V a');
 for(const edit of [s=>s.nodes[1].content.pop(),s=>s.nodes[1].content[1].label='unknown',s=>s.nodes[1].content[0].text='6 V ']){const s=structuredClone(snapshot);edit(s);assert.throws(()=>noteSourceText(s,t,[b],'5 V a',need));}
 const bad=structuredClone(p);bad.items[1].structure.noteReferences=[];assert.throws(()=>verifyNotes(bad,raw,snapshot,need));
});
