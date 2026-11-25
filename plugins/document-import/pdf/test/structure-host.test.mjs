import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {boxesFor} from '../corrections.mjs';
const args=process.env.PDF_IMPORT_TEST_CLI_ARGS;
const t=text=>({kind:'text',text});
const box=(page,top)=>({page,x0:0,x1:300,top,bottom:top+10});
const line=(text,page,top)=>({page,text,box:box(page,top)});
const block=(id,at,kind,documentKind,lines,page=0)=>({id,path:[at],kind,documentKind,lines,boxes:lines.length?boxesFor(lines):[box(page,200+at*20)]});
const order=[['b1',1],['b2',2],['b3',3],['b4',4],['b5',5],['t1',6],['n1',6],['t2',7],['n2',7],['b8',8],['f9',9]];
// Two source lines of two columns each; the footnote call shows as a small 1 after Marlow.
const fragments={0:[{text:'Alex Rowan',x0:0,x1:60,top:0,bottom:10},{text:'Indigo Reed',x0:150,x1:210,top:0,bottom:10},
  {text:'Casey Marlow',x0:0,x1:62,top:20,bottom:30},{text:'1',x0:62,x1:65,top:19,bottom:25},{text:'Jordan Wren',x0:150,x1:205,top:20,bottom:30}]};

async function sample(dir, run, inspectDocument) {
  const doc=path.join(dir,'structure.md'),side=path.join(dir,'structure.pdf-source.json'),input=path.join(dir,'input.json');
  await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks:[
    {kind:'paragraph',content:[t('Alex Rowan Indigo '),{kind:'strong',children:[t('Reed')]}]},
    {kind:'paragraph',content:[t('Casey Marlow'),{kind:'footnote',label:'1'},t(' Jordan Wren')]},
    {kind:'paragraph',text:'Body text that ends here.'},
    {kind:'paragraph',content:[t('[2] A page note '),{kind:'emphasis',children:[t('text')]},t('.')]},
    {kind:'admonition',variant:'note',content:[t('NOTE—A '),{kind:'strong',children:[t('remark')]},t('.')]},
    {kind:'table',label:'tab-1',enumerator:'1',caption:'Readings',rows:[['A','B'],['1','2']],notes:['First table note.']},
    {kind:'table',enumerated:false,caption:'',rows:[['A','B'],['3','4']],notes:['Second table note.']},
    {kind:'paragraph',content:[t('See '),{kind:'reference',role:'numref',label:'tab-1'},t('.')]},
    {kind:'footnote',label:'1',text:'First note.'}]}]}}));
  await run(['create',doc,'--input',input,'--format','json']);
  const snapshot=inspectDocument(doc);
  const mapping={snapshotNodes:snapshot.nodes.filter(n=>n.path.length===1),revision:snapshot.revision,excluded:[],blocks:[
    block('b1',1,'paragraph','paragraph',[line('Alex Rowan Indigo Reed',0,0)]),
    block('b2',2,'paragraph','paragraph',[line('Casey Marlow[^1] Jordan Wren',0,20)]),
    block('b3',3,'paragraph','paragraph',[line('Body text that ends here.',1,0)]),
    block('b4',4,'footnote','paragraph',[line('[2] A page note text.',1,300)]),
    block('b5',5,'note','admonition',[line('NOTE—A remark.',1,320)]),
    block('t1',6,'table','table',[],2),{...block('n1',6,'footnote','table',[line('First table note.',2,340)]),noteIndex:0},
    block('t2',7,'table','table',[],2),{...block('n2',7,'footnote','table',[line('Second table note.',2,360)]),noteIndex:0},
    block('b8',8,'paragraph','paragraph',[line('See Table 1.',2,400)]),block('f9',9,'footnote','footnote',[line('1 First note.',2,700)])]};
  await writeFile(side,JSON.stringify(mapping));
  return {doc,side,initial:await readFile(doc,'utf8')};
}

test('SDK integration: L-04 F-08 P-07 T-07 T-15 table notes and other corrections restore the original bytes on undo', {skip:!args},async()=>{
  const {inspectDocument}=await import('../document-io.mjs');
  const {correctionHandler}=await import('../correct-host.mjs');
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-structure-'));
  try {
    const {doc,side,initial}=await sample(dir,run,inspectDocument);
    let m=JSON.parse(await readFile(side,'utf8'));
    const correct=correctionHandler({cli});
    const act=async(action,extra)=>{
      const r=await correct({document:doc,revision:m.revision,historyId:'screen',action,...extra});
      assert.ok(r.mapping,JSON.stringify(r));assert.equal(r.mapping.stale,false,JSON.stringify(r));
      m=JSON.parse(await readFile(side,'utf8'));
      assert.equal(m.tables,undefined);
      return r;
    };
    const top=()=>inspectDocument(doc).nodes.filter(n=>n.path.length===1);
    const valid=async()=>{const c=await run(['check',doc,'--format','json']);assert.equal(c.validation.valid,true);assert.deepEqual(c.references.unresolved,[]);};
    const back=async id=>{
      await act('undo',{ids:[id]});
      assert.equal(await readFile(doc,'utf8'),initial);
      assert.deepEqual(m.blocks.map(b=>[b.id,b.path[0]]),order);
    };
    // L-04: two source lines of two columns each become four items read column by column.
    const listed=await act('list',{ids:['b1','b2'],fragments});
    const list=top()[0];
    assert.equal(list.type,'list');
    assert.deepEqual(list.items.map(i=>i.content),[[t('Alex Rowan')],[t('Casey Marlow'),{kind:'footnote',label:'1'}],[t('Indigo '),{kind:'strong',children:[t('Reed')]}],[t('Jordan Wren')]]);
    assert.deepEqual(m.blocks.filter(b=>b.path[0]===1).map(b=>b.lines[0].text),['Alex Rowan','Casey Marlow[^1]','Indigo Reed','Jordan Wren']);
    assert.equal(listed.targetId,'b1');await valid();
    // A list goes back to one paragraph per item, each keeping its item's source box.
    await act('kind',{ids:m.blocks.filter(b=>b.path[0]===1).map(b=>b.id),kind:'paragraph'});
    assert.deepEqual(top().slice(0,4).map(n=>n.type),['paragraph','paragraph','paragraph','paragraph']);
    assert.deepEqual(m.blocks.slice(0,4).map(b=>[b.path[0],b.documentKind,b.lines[0].text]),
      [[1,'paragraph','Alex Rowan'],[2,'paragraph','Casey Marlow[^1]'],[3,'paragraph','Indigo Reed'],[4,'paragraph','Jordan Wren']]);
    await valid();
    await act('undo',{ids:['b1']});await back('b1');
    // L-04: the same lines as a table of one row per line; the first row is the header.
    const tabled=await act('table',{ids:['b1','b2'],fragments});
    assert.equal(top()[0].type,'table');assert.equal(top()[0].numbers,undefined);
    assert.deepEqual(inspectDocument(doc).nodes.filter(n=>n.type==='cell'&&n.path[0]===1).map(n=>n.content),
      [[t('Alex Rowan')],[t('Indigo '),{kind:'strong',children:[t('Reed')]}],[t('Casey Marlow'),{kind:'footnote',label:'1'}],[t('Jordan Wren')]]);
    assert.match(m.blocks[0].warning.reason,/머리글/);assert.equal(tabled.mapping.tables[1],2);
    await valid();await back('b1');
    // F-08: a page note without a call becomes the endnote of the last paragraph of its page.
    const noted=await act('footnote',{ids:['b4']});
    const nodes=top(), def=nodes.find(n=>n.type==='footnote'&&n.label!=='1');
    assert.deepEqual(nodes[2].content.at(-1),{kind:'footnote',label:def.label});
    assert.deepEqual(def.content,[t('A page note '),{kind:'emphasis',children:[t('text')]},t('.')]);
    assert.equal(nodes.length,9);assert.equal(noted.targetId,'b3');assert.equal(noted.undoCount,1);
    const moved=m.blocks.find(b=>b.id==='b4');
    assert.deepEqual([moved.path[0],moved.documentKind],[def.path[0],'footnote']);
    await valid();await back('b3');
    // The same with the paragraph and the note chosen together.
    await act('footnote',{ids:['b1','b2','b3','b4']});
    assert.deepEqual(top()[0].content.at(-1).kind,'footnote');await back('b1');
    // P-07: a paragraph becomes a note box and a note box a paragraph, keeping inline content.
    await act('kind',{ids:['b3'],kind:'note'});
    assert.deepEqual([top()[2].type,top()[2].variant,top()[2].content],['admonition','note',[t('Body text that ends here.')]]);
    assert.equal(m.blocks[2].documentKind,'admonition');await back('b3');
    await act('kind',{ids:['b5'],kind:'paragraph'});
    assert.deepEqual([top()[4].type,top()[4].content],['paragraph',[t('NOTE—A '),{kind:'strong',children:[t('remark')]},t('.')]]);await back('b5');
    await act('remove',{ids:['b5']});assert.equal(top().length,8);await back('b5');
    // T-08: move a paragraph with inline formatting to the preceding table and put it back.
    const paragraph=top()[7];
    await act('table-note',{ids:['b8']});
    assert.deepEqual(top()[6].notes,[[t('Second table note.')],paragraph.content]);
    assert.deepEqual(m.blocks.filter(b=>b.path[0]===7).map(b=>[b.id,b.noteIndex]),[['t2',undefined],['n2',0],['b8',1]]);
    await valid();await back('b8');
    await act('table-note-to-body',{ids:['n2']});
    assert.deepEqual(top()[7].content,[t('Second table note.')]);
    assert.deepEqual(m.blocks.filter(b=>b.path[0]===8).map(b=>[b.id,b.kind,b.noteIndex]),[['n2','paragraph',undefined]]);
    await act('table-note',{ids:['n2','b8']});
    assert.deepEqual(top()[6].notes,[[t('Second table note.')],paragraph.content]);
    assert.deepEqual(m.blocks.filter(b=>b.path[0]===7).map(b=>[b.id,b.noteIndex]),[['t2',undefined],['n2',0],['b8',1]]);
    await valid();
    await act('undo',{ids:['n2']});await back('n2');
    // T-07: adjacent tables join; the repeated header row goes and the first table's caption and label stay.
    const joined=await act('merge',{ids:['t1','t2']});
    const table=top()[5];
    assert.deepEqual([table.label,table.caption,table.enumerator],['tab-1',[t('Readings')],'1']);
    assert.deepEqual(inspectDocument(doc).nodes.filter(n=>n.type==='cell'&&n.path[0]===6).map(n=>n.text),['A','B','1','2','3','4']);
    assert.deepEqual(table.notes,[[t('First table note.')],[t('Second table note.')]]);
    assert.deepEqual(m.blocks.filter(b=>b.path[0]===6).map(b=>[b.id,b.noteIndex]),
      [['t1',undefined],['n1',0],['t2',undefined],['n2',1]]);
    assert.equal(joined.undoCount,1);await valid();await back('t1');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('SDK integration: 7 the remembered document is used only while the file keeps its revision', {skip:!args},async()=>{
  const {inspectDocument,applyCorrections}=await import('../document-io.mjs');
  const {writeDocument}=await import('@litzio/plugin-sdk/node');
  const {correctionHandler}=await import('../correct-host.mjs');
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-memory-'));
  try {
    const {doc,side,initial}=await sample(dir,run,inspectDocument);
    const initialSide=await readFile(side,'utf8');
    let m=JSON.parse(initialSide), correct=correctionHandler({cli});
    const ask=(action,extra)=>correct({document:doc,revision:m.revision,historyId:'screen',action,ids:['b3'],...extra});
    const act=async(action,extra)=>{const r=await ask(action,extra);assert.equal(r.mapping?.stale,false,JSON.stringify(r));m=JSON.parse(await readFile(side,'utf8'));return r;};
    assert.equal((await act('kind',{kind:'heading',level:2})).timings.remembered,false);
    assert.equal((await act('kind',{kind:'heading',level:3})).timings.remembered,true);
    // Undo uses it too and gives back the original bytes.
    await act('undo');await act('undo');
    assert.equal(await readFile(doc,'utf8'),initial);
    // Removing the only call of an endnote: the write drops the definition. The document the write
    // read back has it gone too, so the file is not read again and the mapping stays in step.
    const dropped=await correct({document:doc,revision:m.revision,historyId:'screen',action:'remove',ids:['b2'],confirmed:true});
    assert.equal(dropped.mapping.stale,false,JSON.stringify(dropped));assert.equal(dropped.timings.reread,undefined);
    assert.ok(!inspectDocument(doc).nodes.some(n=>n.type==='footnote'));
    m=JSON.parse(await readFile(side,'utf8'));
    assert.equal((await act('kind',{kind:'heading',level:2})).timings.remembered,true);
    await writeFile(doc,initial);await writeFile(side,initialSide);m=JSON.parse(initialSide);
    // Another document forgets it; so does the screen closing.
    correct.forget();
    assert.equal((await act('kind',{kind:'heading',level:2})).timings.remembered,false);
    // A change from outside: the file's revision differs from the remembered one and from the mapping.
    const outside=inspectDocument(doc);
    writeDocument(doc,applyCorrections(outside.document,[{command:'convert-block',path:'1',to:'heading',level:4}]),outside.revision);
    const changed=await readFile(doc,'utf8');
    assert.equal((await ask('kind',{kind:'paragraph'})).stale,true);
    assert.equal(await readFile(doc,'utf8'),changed);
    // Outside bytes that put back exactly the remembered revision are the same document.
    await writeFile(doc,initial);
    const original=inspectDocument(doc);
    m.revision=original.revision;m.blocks=m.blocks.map(b=>b.id==='b3'?{...b,kind:'paragraph',documentKind:'paragraph',level:undefined}:b);
    await writeFile(side,JSON.stringify(m));
    // A write that gives no document back: the file is read again and checked.
    correct=correctionHandler({cli,write:(...a)=>({revision:writeDocument(...a).revision})});
    assert.equal((await act('kind',{kind:'heading',level:2})).timings.reread,true);
    await act('undo');
    assert.equal(await readFile(doc,'utf8'),initial);
    // A write that leaves other content than the document made in memory stops the mapping and
    // the next correction reads the file again.
    const other=(file,document,revision)=>writeDocument(file,applyCorrections(document,[{command:'remove-block',at:8}]),revision);
    correct=correctionHandler({cli,write:other});
    const wrong=await ask('kind',{kind:'heading',level:2});
    assert.equal(wrong.mapping.stale,true);assert.match(wrong.message,/대응 표시를 멈췄습니다/);
    assert.equal(inspectDocument(doc).nodes.filter(n=>n.path.length===1).length,8);
    // The next correction reads the file again and refuses the mapping that no longer fits it.
    m=JSON.parse(await readFile(side,'utf8'));
    const kept=await readFile(doc,'utf8');
    await assert.rejects(()=>correct({document:doc,revision:m.revision,historyId:'screen',action:'kind',ids:['b8'],kind:'heading',level:2}),/블록 수나 종류/);
    assert.equal(await readFile(doc,'utf8'),kept);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('SDK integration: T-07 joining a table with a caption asks first and moves references to the first table', {skip:!args},async()=>{
  const {inspectDocument}=await import('../document-io.mjs');
  const {correctionHandler}=await import('../correct-host.mjs');
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-join-'));
  try {
    const doc=path.join(dir,'join.md'),side=path.join(dir,'join.pdf-source.json'),input=path.join(dir,'input.json');
    const ref=label=>({kind:'reference',role:'numref',label});
    await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks:[
      {kind:'table',label:'tab-3',enumerator:'3',caption:'Bands',rows:[['Band','Mode'],['u > 1','Reject']]},
      {kind:'table',label:'tab-3b',enumerator:'3b',caption:'Bands (continued)',rows:[['Band','Mode'],['u < 1','Review']]},
      {kind:'table',enumerated:false,caption:'',rows:[['Other','Head'],['x','y']]},
      {kind:'paragraph',content:[t('See '),ref('tab-3b'),t(' and '),ref('tab-3'),t('.')]},
      {kind:'table',enumerated:false,caption:'',rows:[['Cell'],[[t('In '),ref('tab-3b')]]]}]}]}}));
    await run(['create',doc,'--input',input,'--format','json']);
    const initial=await readFile(doc,'utf8'), snapshot=inspectDocument(doc);
    let m={snapshotNodes:snapshot.nodes.filter(n=>n.path.length===1),revision:snapshot.revision,excluded:[],blocks:[
      block('t1',1,'table','table',[],0),block('t2',2,'table','table',[],1),block('t3',3,'table','table',[],1),
      block('p',4,'paragraph','paragraph',[line('See Table 3b and Table 3.',1,300)]),block('t4',5,'table','table',[],1)]};
    await writeFile(side,JSON.stringify(m));
    const correct=correctionHandler({cli});
    const ask=(ids,extra={})=>correct({document:doc,revision:m.revision,historyId:'screen',action:'merge',ids,...extra});
    // A later table's caption and a reference in a table cell cannot stay: ask first, write nothing.
    const asked=await ask(['t1','t2']);
    assert.deepEqual(asked,{requiresConfirm:true,captions:['Bands (continued)'],broken:1,moved:1,irreversible:false});
    assert.equal(await readFile(doc,'utf8'),initial);
    const r=await ask(['t1','t2'],{confirmed:true});
    assert.equal(r.mapping.stale,false);assert.equal(r.brokenLinks,1);
    m=JSON.parse(await readFile(side,'utf8'));
    const nodes=inspectDocument(doc).nodes;
    assert.deepEqual(nodes.find(n=>n.path.join()==='3').content,[t('See '),ref('tab-3'),t(' and '),ref('tab-3'),t('.')]);
    assert.deepEqual(nodes.filter(n=>n.type==='cell'&&n.path[0]===1).map(n=>n.text),['Band','Mode','u > 1','Reject','u < 1','Review']);
    assert.deepEqual(m.blocks.map(b=>[b.id,b.path[0]]),[['t1',1],['t2',1],['t3',2],['p',3],['t4',4]]);
    await correct({document:doc,revision:m.revision,historyId:'screen',action:'undo',ids:['t1']});
    assert.equal(await readFile(doc,'utf8'),initial);
    // A different first row is a body row; a different column count cannot join.
    m=JSON.parse(await readFile(side,'utf8'));
    await assert.rejects(()=>ask(['t3','p']),/표/);
    const kept=await ask(['t2','t3'],{confirmed:true});
    assert.equal(kept.mapping.stale,false);
    assert.deepEqual(inspectDocument(doc).nodes.filter(n=>n.type==='cell'&&n.path[0]===2).map(n=>n.text),['Band','Mode','u < 1','Review','Other','Head','x','y']);
  } finally {await rm(dir,{recursive:true,force:true});}
});
