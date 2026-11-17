import test from 'node:test';
import assert from 'node:assert/strict';
import {boxesFor,splitOffset,transformMapping,restoreMapping,assertMapping,editableMapping} from '../corrections.mjs';
const line = (text,top,page=0) => ({text,page,box:{page,x0:10,top,x1:100,bottom:top+10}});
const block = (id,at,lines) => ({id,path:[at],kind:'paragraph',documentKind:'paragraph',lines,boxes:boxesFor(lines)});
const original = {lineVersion:1,revision:'before',blocks:[block('a',1,[line('First line',10),line('next line.',22)]),block('b',2,[line('Second paragraph.',40)]),block('c',3,[line('Last paragraph.',60)])],excluded:[]};
const apply = (m,action,options={}) => transformMapping(m,{action,ids:['a'],at:1,removeCount:1,newCount:1,time:'test',...options});
test('mapping merge/split/type/removal preserve lines, rebase paths and record user edits',()=>{
  const merged = apply(original,'merge',{ids:['a','b'],removeCount:2,newCount:1});
  assert.equal(merged.blocks.length,2); assert.deepEqual(merged.blocks[1].path,[2]);
  assert.equal(merged.blocks[0].lines.length,3); assert.equal(merged.blocks[0].boxes.length,1);
  const split = apply(merged,'split',{line:2,newCount:2});
  assert.deepEqual(split.blocks.map(b=>b.path),[[1],[2],[3]]);
  assert.deepEqual(split.blocks.flatMap(b=>b.lines),original.blocks.flatMap(b=>b.lines));
  const heading=apply(original,'kind',{kind:'heading',level:3});
  assert.equal(heading.blocks[0].level,3);
  const paragraph=apply(heading,'kind',{kind:'paragraph'});
  assert.equal(paragraph.blocks[0].documentKind,'paragraph');assert.equal(paragraph.blocks[0].level,undefined);
  const removed=apply(original,'remove',{newCount:0});
  assert.equal(removed.excluded[0].kind,'removed');assert.deepEqual(removed.blocks[0].path,[1]);
  assert.equal(removed.history[0].who,'user');assert.equal(original.history,undefined);
  assertMapping(heading,{nodes:[{type:'heading',path:[1]},{type:'paragraph',path:[2]},{type:'paragraph',path:[3]}]});
  assert.throws(()=>assertMapping(removed,{nodes:[]}));assert.equal(editableMapping({}),false);
  for(const changed of [merged,split,heading,removed]) {
    const undone=restoreMapping(original,changed,'a','undo-time');
    assert.deepEqual(undone.blocks.map(b=>({path:b.path,lines:b.lines,kind:b.kind})),original.blocks.map(b=>({path:b.path,lines:b.lines,kind:b.kind})));
    assert.deepEqual(undone.excluded,original.excluded);assert.equal(undone.history.at(-1).action,'undo');
  }
});
test('split offset handles complete footnote sequences and whitespace at line ends without guessing',()=>{
  const lines=[line('The public[^27] sample  ',0),line(' continues here.',15)];
  assert.equal(splitOffset(lines,1,[{kind:'text',text:'The public'},{kind:'footnote',label:'27'},{kind:'text',text:' sample   continues here.'}]),21);
  assert.equal(splitOffset([line('Alpha  ',0),line(' beta.',15)],1,[{kind:'text',text:'Alpha   beta.'}]),8);
  assert.throws(()=>splitOffset(lines,1,[{kind:'text',text:'The public sample continues here.'}]));
  assert.throws(()=>splitOffset(lines,0,[]));
  assert.throws(()=>splitOffset(lines,1,[{kind:'math',text:'x'}]));
});
