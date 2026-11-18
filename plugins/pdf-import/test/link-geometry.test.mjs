import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ribbonPath,connectorBands} from '../link-geometry.mjs';
test('ribbons use horizontal cubic tangents, clip shared visibility and route only active unmatched ends out of view',()=>{
 const b={id:'a',path:[2]},sources=[{b,top:10,bottom:30},{b,top:210,bottom:240}],base={sources,sourceScroll:0,sourceHeight:100,documentHeight:100,width:64,documentBlocks:[{path:[2],top:-5,bottom:40}]};
 const quiet=connectorBands(base);assert.equal(quiet.length,1);assert.deepEqual(quiet[0].left,[10,30]);assert.deepEqual(quiet[0].right,[0,40]);assert.equal(quiet[0].d,'M0 10 C32 10 32 0 64 0 L64 40 C32 40 32 30 0 30 Z');
 const selected=connectorBands({...base,selected:new Set(['a'])});assert.equal(selected.length,2);assert.equal(selected[1].direction,'source-below');assert.ok(selected[1].left[0]>100);
 const above=connectorBands({...base,documentBlocks:[{path:[4],top:1,bottom:20}],selected:new Set(['a'])});assert.equal(above.length,1);assert.equal(above[0].direction,'document-above');assert.ok(above[0].right[1]<0);
 assert.equal(connectorBands({...base,documentBlocks:[]}).length,0);
 assert.equal(connectorBands({...base,documentBlocks:[{path:[1],top:0,bottom:20},{path:[3],top:30,bottom:40}],selected:new Set(['a'])}).length,0);
 assert.equal(connectorBands({...base,hoverPath:'2'})[0].emphasis,'hover');
 assert.deepEqual(connectorBands({...base,documentOffset:1})[0].right,[1,41]);
 assert.match(ribbonPath(64,0,1,2,3,15),/^M-15 0 L0 0 C/);
 assert.equal((ribbonPath(64,0,1,2,3).match(/C/g)||[]).length,2);
});
