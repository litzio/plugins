import {test} from 'node:test';import assert from 'node:assert/strict';
import {formulaRegions} from '../formula-regions.mjs';
const l=(text,x0,top,x1,bottom)=>({plain:text,x0,y0:top,x1,y1:bottom,page:0});
const region=(x0,top,x1,bottom)=>({kind:'figure',page:0,boxes:[{page:0,x0,top,x1,bottom}]});
test('T-09 H-05 right number floods touching fragments, stops before prose and ignores left list marker',()=>{
 const lines=[l('Full width prose.',10,10,190,20),l('numerator',60,30,85,40),l('x =',30,38,50,48),l('denominator',60,46,85,56),l('(A.1)',180,38,195,48),l('where',10,66,40,76),l('(1)',10,90,25,100),l('A real list item.',30,90,150,100)];
 const rs=[];const fs=formulaRegions(lines,rs,{});assert.equal(fs.length,1);assert.deepEqual([fs[0].top,fs[0].bottom],[30,56]);assert.equal(rs[0].formula,true);
});
test('T-09 shared drawing splits at the empty gap between anchor bands',()=>{
 const rs=[region(30,30,120,110)],ls=[l('Prose',10,10,200,20),l('(1)',180,40,195,50),l('(2)',180,90,195,100)];
 const fs=formulaRegions(ls,rs,{graphics:[{box:[30,30,120,60]},{box:[30,80,120,110]}]});
 assert.equal(fs.length,2);assert.equal(fs[0].bottom,70);assert.equal(fs[1].top,70);
});
test('T-05 T-09 formula below a ruled grid leaves the table for strict grid conversion',()=>{
 const rs=[region(10,30,150,120)],ls=[l('Prose',10,10,200,20),l('(1)',180,100,195,110)];
 const rulings=[30,70].map(pos=>({axis:'h',pos,a:10,b:150})).concat([10,150].map(pos=>({axis:'v',pos,a:30,b:70})));
 const fs=formulaRegions(ls,rs,{rulings});assert.equal(fs.length,1);assert.equal(rs[0].boxes[0].bottom,70);assert.ok(fs[0].top>70);
});
