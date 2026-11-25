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

test('T-08 F-03 exported full width notes retain separate correction source lines',async()=>{
 const sample=await extract(new URL('./fixtures/LSR-1.1-standards.pdf',import.meta.url)), p=sample.pages[3], box=p.tables[0]||p.figures[0];
 // Extend a real ruled table by one full-width note row using source text words.
 const bottom=box[3],left=box[0],right=box[2],y=bottom+35;
 box[3]=y;
 p.rulings.push({axis:'h',pos:y,a:left,b:right},{axis:'v',pos:left,a:bottom,b:y},{axis:'v',pos:right,a:bottom,b:y});
 const note={text:'a First note.',x0:left+5,x1:right-5,base:bottom+12,top:bottom+4,bottom:bottom+14,size:10,id:9999};
 const note2={...note,text:'b Second note.',base:bottom+27,top:bottom+19,bottom:bottom+29,id:10000};
 p.words=p.words.filter(w=>w.top<bottom||w.top>y);p.words.push(note,note2);
 const out=convert(sample,suggestExcludedPages(sample));const b=out.blocks.find(b=>b.tableNote&&b.text==='a First note.');
 const next=out.blocks[out.blocks.indexOf(b)+1];assert.equal(next.text,'b Second note.');
 assert.equal(b.lines[0].text,b.text);assert.deepEqual(b.lines[0].box,b.boxes[0]);assert.ok(b.boxes[0].bottom<next.boxes[0].top);
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

test('F-03 table note marker is superscript without changing ordinary paragraphs',async()=>{
 const {authoring}=await import('../authoring.mjs');
 const result={blocks:[{id:'n',kind:'paragraph',text:'a Explanation',tableNote:true,page:0},{id:'p',kind:'paragraph',text:'a Ordinary text',page:0},{id:'q',kind:'paragraph',text:'NOTE— Explanation',tableNote:true,page:0}],stats:{}};
 const blocks=authoring(result).authoring.inputs[0].blocks;
 assert.deepEqual(blocks[0].content,[{kind:'superscript',children:[{kind:'text',text:'a'}]},{kind:'text',text:' Explanation'}]);
 assert.deepEqual(blocks[1].content,[{kind:'text',text:'a Ordinary text'}]);
 assert.deepEqual(blocks[2].content,[{kind:'text',text:'NOTE— Explanation'}]);
});

test('F-03 T-15 LSR local table notes share the table path and retain individual boxes and superscript labels',async()=>{
 const {authoring}=await import('../authoring.mjs');
 const notes=result.blocks.filter(b=>b.tableNote);
 assert.deepEqual(notes.map(b=>b.page+1),[4,4,5,6,7]);
 const output=authoring(result);
 const pair=notes.filter(n=>n.page===3);
 assert.equal(pair.length,2);
 assert.ok(pair[0].boxes[0].bottom<=pair[1].boxes[0].top);
 for(const n of notes) {
   const index=output.units.findIndex(u=>u.sources.includes(n.id));
   const unit=output.units[index], authored=output.authoring.inputs[0].blocks[index];
   assert.equal(unit.kind,'table');
   assert.ok(unit.sources.includes(n.tableNoteFor));
   assert.equal(authored.notes[unit.tableNotes.indexOf(n.id)][0].kind,'superscript');
   assert.equal(output.units.filter(u=>u.sources.includes(n.id)).length,1);
   assert.ok(n.lines.every(l=>l.box.top>=n.boxes[0].top && l.box.bottom<=n.boxes[0].bottom));
 }
 assert.equal(result.stats.chars_unaccounted,0);
});

test('F-03 T-15 a recognized table note containing a body endnote stays in the body',async()=>{
 const {authoring}=await import('../authoring.mjs');
 const sample=structuredClone(result);
 const note=sample.blocks.find(b=>b.tableNoteFor);
 note.text+=' [^999]';
 sample.blocks.push({id:'endnote',kind:'footnote',text:'[^999]: Definition.',page:note.page});
 const {units,authoring:input}=authoring(sample);
 const at=units.findIndex(u=>u.sources.includes(note.id));
 assert.deepEqual(units[at],{kind:'paragraph',sources:[note.id],keptTableNote:true});
 assert.deepEqual(input.inputs[0].blocks[at].content.at(-1),{kind:'footnote',label:'999'});
});

test('F-03 F-05 local labels require raised small glyphs and leave ordinary values alone',async()=>{
 const {buildGrid,markTableLabels}=await import('../table-grid.mjs');
 const lines=[0,30,60].map(pos=>({axis:'h',pos,a:0,b:100}));lines.push(...[0,100].map(pos=>({axis:'v',pos,a:0,b:60})));
 const word=(text,x0,x1,top,bottom,base,size)=>({text,x0,x1,top,bottom,base,size,upright:true});
 const words=[word('Header',5,35,5,15,13,10),word('value',5,30,35,45,43,10),word('a',30,34,31,37,38,6),word(' 45',40,56,35,45,43,10),word('2',56,62,35,45,43,10)];
 const grid=buildGrid([0,0,100,60],lines,words);markTableLabels(grid,words,new Set(['a']),new Set());
 const tokens=grid.cells[1].tokens;assert.equal(tokens.find(t=>t.text.trim()==='a').superscript,true);assert.equal(tokens.find(t=>t.text.trim()==='2').superscript,false);
});

test('F-03 marker rejects list prefixes and the ordinary sentence a value of',async()=>{
 const {tableNoteMarker}=await import('../rules.mjs');
 for(const text of ['a) item','a. item','a value of 5']) assert.equal(tableNoteMarker(text),null);
 assert.equal(tableNoteMarker('a Explanation'),'a');assert.equal(tableNoteMarker('† Explanation'),'†');
});

test('F-03 separate note paragraphs at marked source lines, including separate marker tokens',async()=>{
 const {splitNoteTokens}=await import('../table-grid.mjs');const {tableNoteMarker}=await import('../rules.mjs');
 const tokens=[{text:'a',newLine:true},{text:' First note'},{text:'continued',newLine:true},{text:'b',newLine:true},{text:' Second note'}];
 const groups=splitNoteTokens(tokens,tableNoteMarker);
 assert.equal(groups.length,2);assert.equal(groups[0].map(t=>t.text).join(''),'a First notecontinued');assert.equal(groups[1].map(t=>t.text).join(''),'b Second note');
});

test('F-03 caption label uses the same baseline and size check as table cells',async()=>{
 const {captionTokens}=await import('../table-grid.mjs');
 const words=[{text:'Caption',x0:0,x1:40,top:10,bottom:20,base:18,size:10,upright:true},{text:'a',x0:40,x1:44,top:6,bottom:13,base:13,size:6,upright:true}];
 assert.equal(captionTokens(words,new Set(['a'])).at(-1).script,'superscript');
 words[1]={...words[1],size:10,base:18,top:10,bottom:20};
 assert.equal(captionTokens(words,new Set(['a'])).at(-1).superscript,false);
});
