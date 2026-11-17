import {test} from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{extract}from'../extract.mjs';import{convert,suggestExcludedPages}from'../rules.mjs';import{flattenGrid,checkConservation}from'../table-grid.mjs';import{score,tableNorm}from'../score-answer-key.mjs';
const cell=(r0,r1,c0,c1,text)=>({r0,r1,c0,c1,text,tokens:[{text}],wordIds:[]});
test('T-08 cascading header spans flatten once per source cell',()=>{
 const g={rows:4,cols:3,cells:[cell(0,2,0,1,'Name'),cell(0,1,1,3,'Settings'),cell(1,2,1,2,'A'),cell(1,2,2,3,'B'),cell(2,3,0,1,'X'),cell(2,3,1,3,'same'),cell(3,4,0,3,'NOTE text')]};
 const f=flattenGrid(g);assert.deepEqual(f.rows,[['Name','Settings / A','Settings / B'],['X','same','same']]);assert.equal(f.headerRows,2);assert.deepEqual(f.notes.map(c=>c.text),['NOTE text']);
});
test('T-08 full width title, middle section and vertical body merge',()=>{
 const g={rows:5,cols:2,cells:[cell(0,1,0,2,'Title'),cell(1,2,0,1,'A'),cell(1,2,1,2,'B'),cell(2,3,0,2,'Section'),cell(3,5,0,1,'Value'),cell(3,4,1,2,'1'),cell(4,5,1,2,'2')]};
 assert.deepEqual(flattenGrid(g).rows,[['Title',''],['A','B'],['Section',''],['Value','1'],['Value','2']]);
});
test('T-08 header reaching bottom resets to one and removes trailing note rows',()=>{
 const g={rows:2,cols:2,cells:[cell(0,2,0,1,'A'),cell(0,1,1,2,'B'),cell(1,2,1,2,'C')]};assert.equal(flattenGrid(g).headerRows,1);
});
const raw=await extract(new URL('./fixtures/LSR-1.1-standards.pdf',import.meta.url));const result=convert(raw,suggestExcludedPages(raw));const ref=JSON.parse(await readFile(new URL('./fixtures/standards.json',import.meta.url),'utf8'));
test('T-08 T-11 F-05 original sample grids, strict values and source word conservation',()=>{
 const report=score(result,ref);for(const t of report.tables.filter(t=>t.status==='text')){assert.ok(t.same_grid,t.id);for(const c of t.cells){assert.ok(c.span,c.id);if(!c.math)assert.ok(c.same,JSON.stringify(c));}}
 for(const b of result.blocks.filter(b=>b.table))assert.deepEqual(checkConservation(b.grid),{missing:[],duplicated:[]});
 assert.notEqual(tableNorm('0.73'),tableNorm('073'));assert.notEqual(tableNorm('≥ 1'),tableNorm('> 1'));
 assert.ok(result.blocks.filter(b=>b.kind==='table').every(b=>b.table||b.warning?.code==='table-as-image'));
});
test('T-05 separated side-by-side tables stay one image with a reason',()=>{assert.ok(result.blocks.some(b=>b.page===10&&b.warning?.reason==='서로 닿지 않는 격자가 둘 이상임'));});
test('T-10 vector formula cells warn while retaining the text table',()=>{assert.ok(result.blocks.some(b=>b.page===4&&b.table&&b.warning?.code==='table-cell-graphic'));});

test('T-08 exported full width notes retain correction source lines',async()=>{
 const sample=await extract(new URL('./fixtures/LSR-1.1-standards.pdf',import.meta.url)), p=sample.pages[3], box=p.tables[0]||p.figures[0];
 // Extend a real ruled table by one full-width note row using source text words.
 const bottom=box[3],left=box[0],right=box[2],y=bottom+20;
 box[3]=y;
 p.rulings.push({axis:'h',pos:y,a:left,b:right},{axis:'v',pos:left,a:bottom,b:y},{axis:'v',pos:right,a:bottom,b:y});
 const note={text:'NOTE source text.',x0:left+5,x1:right-5,base:bottom+12,top:bottom+4,bottom:bottom+14,size:10,id:9999};
 p.words=p.words.filter(w=>w.top<bottom||w.top>y);p.words.push(note);
 const out=convert(sample,suggestExcludedPages(sample));const b=out.blocks.find(b=>b.tableNote&&b.text==='NOTE source text.');
 assert.ok(b);assert.equal(b.lines[0].text,b.text);assert.deepEqual(b.lines[0].box,b.boxes[0]);
 const table=out.blocks[out.blocks.indexOf(b)-1];assert.ok(table.boxes[0].bottom<=b.boxes[0].top);
});
