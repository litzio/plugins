import test from 'node:test';
import assert from 'node:assert/strict';
import {boxesFor,previewCorrection,assertMapping} from '../corrections.mjs';
import {blockActions,keepTargets,keptNote,keepAction,pageOf} from '../block-actions.mjs';
import {blocksInRect,dragStarted} from '../../shared/marquee.mjs';
import {kindName,selectionKind} from '../../shared/block-kind.mjs';
import {sourcePagePositions,linkedItems} from '../../shared/linked-items.mjs';

const line=(text,top,page=0)=>({text,page,box:{page,x0:10,top,x1:100,bottom:top+10}});
const block=(id,at,kind,lines,extra={})=>({id,path:[at],kind,documentKind:kind,lines,boxes:boxesFor(lines),...extra});
const text=t=>[{kind:'text',text:t}];
// a and b both call footnote 7; a target precedes the heading; one list has two source items.
function sample() {
  const blocks=[block('a',1,'paragraph',[line('A',10)]),block('b',2,'paragraph',[line('B',30)]),
    block('h',4,'heading',[line('H',50)],{level:2}),block('l1',5,'list',[line('L1',70)]),block('l2',5,'list',[line('L2',80)]),
    block('z',6,'paragraph',[line('Z',100)]),block('note',7,'footnote',[line('N',120)])];
  const snapshotNodes=[{path:[1],type:'paragraph',content:[...text('A'),{kind:'footnote',label:'7'}]},
    {path:[2],type:'paragraph',content:[...text('B'),{kind:'footnote',label:'7'}]},{path:[3],type:'target',label:'sec'},
    {path:[4],type:'heading',level:2,content:text('H')},{path:[5],type:'list',items:[]},{path:[6],type:'paragraph',content:text('Z')},
    {path:[7],type:'footnote',label:'7',content:text('N')}];
  return {revision:'r',blocks,excluded:[],snapshotNodes};
}
const state=m=>({blocks:m.blocks,nodes:m.snapshotNodes,
  excluded:m.excluded.map(e=>JSON.stringify({...e,edited:{...e.edited,at:null}})).sort()});

test('V-06 removing several blocks at once leaves the mapping of removing them one by one',()=>{
  const m=sample(), ids=['a','b','h','l1','l2'];
  const together=previewCorrection(m,{action:'remove',ids,time:'t'});
  let single=m;
  for (const group of [['a'],['b'],['h'],['l1','l2']]) single=previewCorrection(single,{action:'remove',ids:group,time:'t'});
  assert.deepEqual(state(together),state(single));
  // The heading's target and the footnote only the removed blocks called are gone too.
  assert.deepEqual(together.snapshotNodes.map(n=>[n.type,n.path[0]]),[['paragraph',1]]);
  assert.deepEqual(together.blocks.map(b=>[b.id,b.path[0]]),[['z',1]]);
  assertMapping(together,{nodes:together.snapshotNodes});
  // One action, one history entry; undo restores everything at once.
  assert.equal(together.history.length,1);
  assert.equal(single.history.length,4);
  const undone=previewCorrection(together,{action:'undo',ids:['a'],time:'u'},m);
  assert.deepEqual(undone.blocks.map(({edited,...b})=>b),m.blocks);assert.deepEqual(undone.excluded,m.excluded);
  assert.deepEqual(undone.snapshotNodes,m.snapshotNodes);
});

test('V-06 removing blocks that are not next to each other keeps the ones between them',()=>{
  const m=sample();
  const r=previewCorrection(m,{action:'remove',ids:['a','z'],time:'t'});
  assert.deepEqual(r.blocks.map(b=>[b.id,b.path[0]]),[['b',1],['h',3],['l1',4],['l2',4],['note',5]]);
  assertMapping(r,{nodes:r.snapshotNodes});
});

test('V-06 the remove action takes several text blocks and names the kinds it cannot take',()=>{
  const m=sample(), all=m.blocks, get=id=>all.find(b=>b.id===id);
  const action=bs=>blockActions(bs,all,m.snapshotNodes).find(a=>a.id==='remove');
  assert.equal(action([get('a'),get('b'),get('h')]).disabled,false);
  assert.equal(action([get('l1'),get('l2'),get('z')]).disabled,false);
  const mixed=action([get('a'),get('note')]);
  assert.equal(mixed.disabled,true);assert.match(mixed.disabledReason,/각주 블록이 있어 뺄 수 없습니다/);
  assert.match(action([get('l1'),get('z')]).disabledReason,/모두/);
  assert.equal(action([]).disabled,true);
  assert.ok(blockActions([],all).every(a=>a.disabled));
});

test('V-06 keeping the chosen blocks of a page removes the rest of that page that can go',()=>{
  const two=(id,at,kind,tops,extra)=>({...block(id,at,kind,[],extra),boxes:tops.map(([page,top])=>({page,x0:10,x1:100,top,bottom:top+10}))});
  const all=[two('t',1,'paragraph',[[0,10]]),two('p1',2,'paragraph',[[0,30]]),two('p2',3,'heading',[[0,50]],{level:1}),
    two('tab',4,'table',[[0,70]]),two('span',5,'paragraph',[[0,90],[1,10]]),two('i1',6,'list',[[0,110]]),two('i2',6,'list',[[1,30]]),
    two('fn',7,'footnote',[[0,130]]),two('q',8,'paragraph',[[1,50]])];
  const {ids,kept}=keepTargets(0,['t'],all);
  assert.deepEqual(ids,['p1','p2']);
  assert.deepEqual(kept.map(b=>b.id),['tab','span','i1','fn']);
  assert.equal(keptNote(kept),'이 쪽의 표 1개, 다른 쪽으로 이어지는 블록 2개, 각주 1개는 뺄 수 없어 그대로 두었습니다.');
  assert.equal(keptNote([]),'');
  // A block that shares its document block with a chosen one stays without a note.
  assert.deepEqual(keepTargets(1,['i2'],all),{ids:['q'],kept:[two('span',5,'paragraph',[[0,90],[1,10]])]});
  // The document title's box keeps nothing of its own; every other block of the page that can go goes.
  assert.deepEqual(keepTargets(0,[],all).ids,['t','p1','p2']);
  assert.equal(pageOf(all.find(b=>b.id==='span').boxes),null);
  assert.equal(pageOf([...all[0].boxes,...all[1].boxes]),0);
  const spread=blockActions([all[0],all[8]],all).find(a=>a.id==='keep');
  assert.equal(spread.disabled,true);assert.match(spread.disabledReason,/한 쪽/);
  const keep=blockActions([all[0]],all).find(a=>a.id==='keep');
  assert.equal(keep.disabled,false);assert.deepEqual(keep.extra.ids,['p1','p2']);assert.equal(keep.danger,true);
  assert.equal(keepAction(1,['q'],[all[8]]).disabledReason,'이 쪽에 더 뺄 수 있는 블록이 없습니다.');
});

test('V-06 a dragged rectangle picks the boxes it crosses on every page it spans',()=>{
  const positions=sourcePagePositions([{width:100,height:200},{width:100,height:200}],200,8,8);
  assert.deepEqual(positions.map(p=>p.top),[8,416]);
  const b=(id,page,top)=>({id,boxes:[{page,x0:10,x1:90,top,bottom:top+10}]});
  const blocks=[b('p0',0,20),b('p1',0,150),b('q0',1,10),b('q1',1,100)];
  // Page 0 box p1 spans y 8+300..8+320; page 1 box q0 spans 416+20..416+40.
  assert.deepEqual(blocksInRect(blocks,positions,30,{x0:100,y0:300,x1:60,y1:440}),['p1','q0']);
  assert.deepEqual(blocksInRect(blocks,positions,30,{x0:0,y0:0,x1:49,y1:900}),[]);
  assert.deepEqual(blocksInRect(blocks,positions,30,{x0:0,y0:0,x1:51,y1:900}),['p0','p1','q0','q1']);
  assert.equal(dragStarted(3,3),false);assert.equal(dragStarted(4,3),true);
});

test('V-02 pages start below a gap and linked boxes follow the pages’ left edge',()=>{
  const positions=sourcePagePositions([{width:100,height:100}],100,8,8);
  assert.deepEqual(positions,[{top:8,height:100,scale:1}]);
  const [item]=linkedItems([{id:'a',path:[1],kind:'paragraph',boxes:[{page:0,x0:10,x1:20,top:5,bottom:15}]}],positions,100,108,{paragraph:'본문'},{paragraph:'info'});
  assert.deepEqual(item.boxes,[{left:18,top:13,width:10,height:10}]);
});

test('V-05 the toolbar names the kind of the chosen blocks',()=>{
  assert.equal(kindName({kind:'paragraph'}),'본문');
  assert.equal(kindName({kind:'heading',level:2}),'제목 2');
  assert.equal(kindName({kind:'heading_unnumbered',level:1}),'제목 1');
  assert.equal(kindName({kind:'heading'}),'제목');
  assert.equal(kindName({kind:'list',level:2}),'목록');
  assert.equal(kindName({id:'title-0',documentTitle:true}),'문서 제목');
  assert.equal(selectionKind([{kind:'footnote'}]),'각주');
  assert.equal(selectionKind([{kind:'paragraph'},{kind:'paragraph'}]),'본문');
  assert.equal(selectionKind([{kind:'heading',level:1},{kind:'heading',level:2}]),'여러 종류');
  assert.equal(selectionKind([{kind:'table'},{kind:'figure'}]),'여러 종류');
  assert.equal(selectionKind([]),'');
});
