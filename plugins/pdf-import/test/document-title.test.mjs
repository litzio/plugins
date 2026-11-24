import test from 'node:test';
import assert from 'node:assert/strict';
import {boxesFor,titleText,previewCorrection,restoreMapping,assertMapping} from '../corrections.mjs';
import {blockActions,sourceOverlays} from '../block-actions.mjs';
const line = (text,top) => ({text,page:0,box:{page:0,x0:10,top,x1:100,bottom:top+10}});
const block = (id,at,kind,lines,extra={}) => ({id,path:[at],kind,documentKind:kind==='heading_unnumbered'?'heading':kind,lines,boxes:boxesFor(lines),...extra});
const text = t => [{kind:'text',text:t}];
const nodes = [
  {path:[1],type:'paragraph',content:text('Public  Sample\nStandard ')},
  {path:[2],type:'heading',level:1,content:text('1. Overview')},
  {path:[3],type:'paragraph',content:[{kind:'text',text:'Body'},{kind:'footnote',label:'1'}]},
  {path:[4],type:'table'},
  {path:[5],type:'footnote',label:'1',content:text('Note.')},
];
const mapping = {revision:'r',excluded:[],snapshotNodes:nodes,blocks:[
  block('t',1,'heading_unnumbered',[line('Public Sample',10),line('Standard',22)],{documentKind:'paragraph',warning:{code:'heading-candidate',reason:'제목 후보'}}),
  block('h',2,'heading',[line('1. Overview',40)],{level:1}),
  block('p',3,'paragraph',[line('Body',60)]),
  block('tb',4,'table',[],{boxes:[{page:0,x0:0,x1:100,top:80,bottom:120}]}),
  block('f',5,'footnote',[line('1 Note.',200)]),
]};

test('H-01 document title takes plain words: formatting dropped, line breaks one space, trimmed',()=>{
  assert.deepEqual(titleText({content:[{kind:'strong',children:text(' Public ')},{kind:'break'},{kind:'emphasis',children:text('Sample\n Standard  ')}]}),{text:'Public Sample Standard'});
  assert.deepEqual(titleText({content:[{kind:'text',text:'See '},{kind:'reference',role:'numref',label:'fig-3'}]}),{text:'See Figure 3'});
  assert.match(titleText(nodes[2]).reason,/미주 호출/);
  assert.match(titleText({content:[{kind:'math',value:'x'}]}).reason,/수식/);
  assert.match(titleText({content:text('   ')}).reason,/글자가 없는/);
});

test('H-01 sending a heading candidate to the document title removes it from the body and its warning',()=>{
  const next=previewCorrection(mapping,{action:'title',ids:['t'],time:'now'});
  assert.equal(next.blocks.length,mapping.blocks.length-1);
  assert.deepEqual(next.blocks.map(b=>[b.id,b.path[0]]),[['h',1],['p',2],['tb',3],['f',4]]);
  assert.equal(next.blocks.filter(b=>b.warning).length,0);
  assert.deepEqual(next.excluded.map(e=>[e.kind,e.page,e.lines.length]),[['title',0,2]]);
  const overlays=sourceOverlays([...next.excluded,{kind:'removed',page:0}]);
  assert.deepEqual(overlays.titles.map(e=>e.kind),['title']);
  assert.deepEqual(overlays.excluded.map(e=>e.kind),['removed']);
  assert.ok(blockActions([],next.blocks,next.snapshotNodes).every(a=>a.disabled));
  assert.equal(next.history.at(-1).action,'title');
  assert.deepEqual(next.snapshotNodes.map(n=>[n.type,n.path[0]]),[['heading',1],['paragraph',2],['table',3],['footnote',4]]);
  assertMapping(next,{nodes:next.snapshotNodes});
  // A second title (after confirmation) removes only the newly chosen block.
  const again=previewCorrection(next,{action:'title',ids:['h'],time:'later'});
  assert.deepEqual(again.excluded.map(e=>e.kind),['title','title']);
  assert.deepEqual(again.blocks.map(b=>b.path[0]),[1,2,3]);
  // Undo returns the block to its kind and place and the source box to the body.
  const undone=restoreMapping(mapping,next,'t','undo');
  assert.deepEqual(undone.blocks,mapping.blocks.map(b=>b.id==='t'?{...b,edited:undone.history.at(-1)}:b));
  assert.deepEqual(undone.excluded,[]);
  assert.equal(undone.history.at(-1).action,'undo');
});

test('H-01 document title is offered only for one paragraph or heading without footnote calls',()=>{
  const action=bs=>blockActions(bs,mapping.blocks,nodes).find(a=>a.id==='title');
  const [t,h,p,tb,f]=mapping.blocks;
  assert.equal(action([t]).disabled,false);
  assert.equal(action([h]).disabled,false);
  assert.equal(action([h]).label,'문서 제목으로');
  assert.match(action([p]).disabledReason,/미주 호출/);
  for(const bs of [[t,h],[tb],[f]]) {
    assert.equal(action(bs).disabled,true);
    assert.match(action(bs).disabledReason,/본문이나 제목 하나/);
  }
  const list={id:'l',path:[6],documentKind:'list'};
  assert.equal(blockActions([list],[list],[]).find(a=>a.id==='title').disabled,true);
});
