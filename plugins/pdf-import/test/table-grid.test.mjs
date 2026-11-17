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

test('T-08 horizontal header span stays one row when the next row does not subdivide it',()=>{
 const g={rows:4,cols:3,cells:[cell(0,1,0,2,'Group'),cell(0,1,2,3,'Value'),cell(1,2,0,2,'Body'),cell(1,2,2,3,'1'),cell(2,4,0,1,'X'),cell(2,3,1,2,'Y'),cell(2,3,2,3,'2'),cell(3,4,1,2,'Z'),cell(3,4,2,3,'3')]};
 const f=flattenGrid(g);assert.equal(f.headerRows,1);assert.deepEqual(f.rows,[['Group','Group','Value'],['Body','Body','1'],['X','Y','2'],['X','Z','3']]);
});

test('T-10 F-05 graphic cell keeps raised words as plain text and excludes footnote calls',async()=>{
 const {buildGrid}=await import('../table-grid.mjs');const {authoring}=await import('../authoring.mjs');const {reconcileFootnotes}=await import('../rules.mjs');
 const lines=[0,30,60].map(pos=>({axis:'h',pos,a:0,b:100}));lines.push(...[0,100].map(pos=>({axis:'v',pos,a:0,b:60})),{axis:'h',pos:45,a:20,b:80});
 const words=[{text:'Header',x0:5,x1:45,top:5,bottom:15,base:13,size:10},{text:'45',x0:5,x1:17,top:35,bottom:45,base:43,size:10},{text:'7',x0:17,x1:21,top:34,bottom:40,base:38,size:6,superscript:true}];
 const grid=buildGrid([0,0,100,60],lines,words);assert.equal(grid.cells[1].graphic,true);assert.equal(grid.cells[1].text,'45 7');assert.ok(grid.cells[1].tokens.every(t=>!t.superscript));
 const result={blocks:[{id:'t',kind:'table',page:0,text:'',boxes:[{top:0}],grid,table:flattenGrid(grid)},{id:'n',kind:'footnote',text:'[^7]: Definition',page:0}],stats:{}};
 reconcileFootnotes(result);assert.deepEqual(result.stats.footnotes.definitions_without_ref,['7']);
 const blocks=authoring(result).authoring.inputs[0].blocks;const table=blocks.find(b=>b.kind==='table');assert.ok(table.rows.flat(2).every(t=>t.kind==='text'));assert.equal(table.enumerated,false);
});
