import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extract} from '../extract.mjs';
import {convert} from '../rules.mjs';
import {authoring} from '../authoring.mjs';
import {sourceForPath,sourceLocations,blockAtSource,sourceScrollTop,sourceVisibleTop,sourceAlignScrollTop} from '../scroll-sync.mjs';

const result=convert(await extract(new URL('./fixtures/LSR-1.1-standards.pdf',import.meta.url)));
const units=authoring(result).units;
const blocks=units.flatMap((u,i)=>u.sources.map(id=>({...result.blocks.find(b=>b.id===id),path:[i+1]})));
const positions=result.pages.map((p,i)=>({top:i*1200,scale:1}));
test('public source mapping finds exact top-level blocks, a preceding fallback only for scrolling, and cross-page locations',()=>{
  const first=blocks[0],last=blocks.at(-1);
  assert.equal(sourceForPath(blocks,first.path),first);
  assert.equal(sourceForPath(blocks,[first.path[0],1]),first);
  assert.equal(sourceForPath(blocks,[0],true),null);
  assert.equal(sourceForPath(blocks,[last.path[0]+1]),null);
  const prior=sourceForPath(blocks,[last.path[0]+1],true);
  assert.equal(prior.path[0],last.path[0]);
  const middle=blocks.find(b=>b.kind==='heading'&&b!==first);
  const gap=blocks.filter(b=>b.path[0]!==middle.path[0]);
  assert.equal(sourceForPath(gap,middle.path),null);
  assert.ok(sourceForPath(gap,middle.path,true).path[0]<middle.path[0]);
  const locations=sourceLocations(blocks,positions);
  const crossing=blocks.find(b=>b.boxes.length>1);
  const second=locations.find(x=>x.b===crossing&&x.top>=positions[crossing.boxes[1].page].top);
  assert.equal(blockAtSource(locations,(second.top+second.bottom)/2),crossing);
  assert.equal(blockAtSource(locations,-1),locations[0].b);
  assert.equal(blockAtSource(locations,Infinity),locations.at(-1).b);
  assert.equal(blockAtSource([],1),null);
  assert.equal(sourceScrollTop(crossing,positions,600),positions[crossing.boxes[0].page].top+crossing.boxes[0].top-200);
  assert.deepEqual(sourceLocations(blocks,[]),[]);
});

test('clicked source box gives the visible top the document pair is aligned to',()=>{
  const pages=[{top:0,scale:.5},{top:420,scale:.5}];
  const crossing={boxes:[{page:0,top:700,bottom:800},{page:1,top:60,bottom:200}]};
  // Inside: 350 - 100.
  assert.equal(sourceVisibleTop(crossing,pages,100,600),250);
  // Partly above the edge keeps the negative top.
  assert.equal(sourceVisibleTop(crossing,pages,370,600),-20);
  // First box gone above: the visible continuation on the next page.
  assert.equal(sourceVisibleTop(crossing,pages,410,600),40);
  // Nothing on screen.
  assert.equal(sourceVisibleTop(crossing,pages,600,600),null);
  assert.equal(sourceVisibleTop(crossing,pages,0,300),null);
  assert.equal(sourceVisibleTop({boxes:[{page:5,top:0,bottom:1}]},pages,0,600),null);
});

test('document block click moves the source so its first box meets the block top, within limits and 8px',()=>{
  const pages=[{top:0,scale:.5},{top:420,scale:.5}];
  const block={boxes:[{page:1,top:400,bottom:500},{page:0,top:0,bottom:1}]};
  // Box at 620 content px; document block at 200 visible px.
  assert.equal(sourceAlignScrollTop(block,pages,200,0,1000),420);
  // Block above the document edge: negative top scrolls further.
  assert.equal(sourceAlignScrollTop(block,pages,-30,0,1000),650);
  // Start and end limits.
  assert.equal(sourceAlignScrollTop(block,pages,700,300,1000),0);
  assert.equal(sourceAlignScrollTop(block,pages,0,0,500),500);
  assert.equal(sourceAlignScrollTop(block,pages,0,0,-5),null);
  // 8px or less does not move; 9px does.
  assert.equal(sourceAlignScrollTop(block,pages,200,428,1000),null);
  assert.equal(sourceAlignScrollTop(block,pages,200,412,1000),null);
  assert.equal(sourceAlignScrollTop(block,pages,200,429,1000),420);
  assert.equal(sourceAlignScrollTop(block,pages,0,495,500),null);
  assert.equal(sourceAlignScrollTop({boxes:[]},pages,0,0,500),null);
  assert.equal(sourceAlignScrollTop(block,pages,NaN,0,500),null);
});
