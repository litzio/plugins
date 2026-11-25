import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {boxesFor} from '../corrections.mjs';
const args=process.env.PDF_IMPORT_TEST_CLI_ARGS;
const t=text=>({kind:'text',text});
const blocks=[
  {kind:'paragraph',text:'First paragraph.'},{kind:'paragraph',text:'Second paragraph.'},
  {kind:'paragraph',text:'Third paragraph.'},{kind:'paragraph',text:'Fourth paragraph.'},
  {kind:'table',enumerated:false,caption:'',rows:[['Name','Value'],['Gain','']]},
  {kind:'paragraph',text:'Last paragraph.'}];
async function create(dir,name) {
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const doc=path.join(dir,name+'.md'),input=path.join(dir,name+'-input.json');
  await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks}]}}));
  await exec(cli.bin,[...cli.args,'create',doc,'--input',input,'--format','json'],{windowsHide:true});
  return {cli,doc};
}
// What the document view does when it saves content edits: one official, revision-checked write.
async function save(doc,change) {
  const {readDocument,writeDocument}=await import('@litzio/plugin-sdk/node');
  const {revision,document}=readDocument(doc);
  return writeDocument(doc,change(document),revision).revision;
}

test('SDK integration: T-10 a table cell filled in the view, content saves move the PDF correspondence, keep undo away from edited blocks, and stop on structure changes', {skip:!args},async()=>{
  const sdk=await import('@litzio/plugin-sdk');
  const {inspectDocument}=await import('../document-io.mjs');
  const {correctionHandler}=await import('../correct-host.mjs');
  const dir=await mkdtemp(path.join(os.tmpdir(),'document-import-content-'));
  try {
    const {cli,doc}=await create(dir,'public'), side=path.join(dir,'public.pdf-source.json');
    const snapshot=inspectDocument(doc), top=snapshot.nodes.filter(n=>n.path.length===1&&n.type!=='caption');
    const mapping={snapshotNodes:top,revision:snapshot.revision,excluded:[],blocks:top.map((n,i)=>{
      const lines=[{page:0,text:'line '+i,box:{page:0,x0:0,x1:100,top:i*30,bottom:i*30+10}}];
      return {id:'b'+i,path:n.path,kind:n.type==='table'?'table':'paragraph',documentKind:n.type,lines,boxes:boxesFor(lines)};
    })};
    await writeFile(side,JSON.stringify(mapping));
    const at=type=>top.filter(n=>n.type===type).map(n=>n.path[0]);
    const [p0,p1]=at('paragraph'), table=at('table')[0];
    const correct=correctionHandler({cli}), historyId='screen';
    let m=mapping;
    const follow=async revision=>correct.follow({document:doc,revision,historyId});
    // Nothing changed on disk.
    assert.deepEqual((await follow(m.revision)).unchanged,true);
    // A structure correction first: the first two paragraphs merge.
    let r=await correct({document:doc,revision:m.revision,historyId,action:'merge',ids:['b0','b1']});
    m=r.mapping; assert.equal(r.undoCount,1);
    // The view fills the empty table cell: the correspondence moves, undo stays (the merge is elsewhere).
    const first=m.revision;
    const filled=await save(doc,d=>sdk.updateTableCell(d,[table-1,1,1],[{kind:'math',value:'k_p'}]));
    r=await follow(first);
    assert.equal(r.revision,filled); assert.equal(r.undoCount,1);
    assert.equal(JSON.parse(await readFile(side,'utf8')).revision,filled);
    m=r.mapping;
    // The next structure correction does not see a changed document: undoing the merge keeps the cell.
    r=await correct({document:doc,revision:m.revision,historyId,action:'undo'});
    assert.ok(r.mapping && !r.mapping.stale,JSON.stringify(r)); m=r.mapping;
    let text=await readFile(doc,'utf8');
    assert.match(text,/k_p/); assert.match(text,/First paragraph\.\s*\n\s*\nSecond paragraph\./);
    // An edit inside the merged paragraph: undoing the merge would lose it, so the history goes.
    r=await correct({document:doc,revision:m.revision,historyId,action:'merge',ids:['b0','b1']});
    m=r.mapping; assert.equal(r.undoCount,1);
    await save(doc,d=>sdk.updateParagraphInlineContent(d,[p0],[t('First paragraph, corrected. Second paragraph.')]));
    r=await follow(m.revision);
    assert.equal(r.undoCount,0); m=r.mapping;
    // A save that did not start from the mapping's revision stops.
    await save(doc,d=>sdk.updateParagraphInlineContent(d,[p0],[t('Corrected again.')]));
    r=await follow(first);
    assert.equal(r.stale,true); assert.equal(JSON.parse(await readFile(side,'utf8')).revision,m.revision);
    r=await follow(m.revision); assert.ok(r.revision,JSON.stringify(r)); m=r.mapping;
    // A block removed elsewhere: the block count differs and the correspondence stops at once.
    await save(doc,d=>sdk.removeBlock(d,p1));
    r=await follow(m.revision);
    assert.equal(r.stale,true); assert.equal(r.message,'문서가 바뀌어 대응을 표시할 수 없음');
    assert.equal(JSON.parse(await readFile(side,'utf8')).revision,m.revision);
    // Refused once, the same file is not read again.
    r=await follow(m.revision);
    assert.equal(r.stale,true); assert.equal(r.timings.readMs,undefined);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('SDK integration: Word places follow content saves and stop on structure changes', {skip:!args},async()=>{
  const sdk=await import('@litzio/plugin-sdk');
  const {readDocument}=await import('@litzio/plugin-sdk/node');
  const {activate}=await import('../../word/host.mjs');
  const dir=await mkdtemp(path.join(os.tmpdir(),'document-import-word-content-'));
  const word=activate();
  try {
    const folder=path.join(dir,'sample');
    await mkdir(folder);
    const {doc}=await create(folder,'sample'), side=path.join(folder,'sample.word-source.json');
    const revision=readDocument(doc).revision;
    // A list written before kinds were kept, with prepared source places.
    await writeFile(side,JSON.stringify({word:{name:'sample.docx',sha256:'w'},revision,warnings:[{kind:'k',label:'l',detail:'d',path:[2]}],
      source:{revision,pdf:{sha256:'p',wordSha256:'w'},pages:[],blocks:[{path:[1],kind:'paragraph',boxes:[]}],excluded:[]}}));
    const {id}=await word.operations.load({path:path.join(dir,'sample.docx')});
    // Unchanged: the kinds are kept now, while the file is the list's.
    assert.equal((await word.operations.follow({id,revision})).unchanged,true);
    const kept=JSON.parse(await readFile(side,'utf8'));
    assert.deepEqual(kept.structure,['paragraph','paragraph','paragraph','paragraph','table','paragraph']);
    // A table cell filled in the view: the list and the source places move together.
    const all=sdk.machineNodes(sdk.getEditableDocument(readDocument(doc).document));
    const cell=all.find(n=>n.type==='cell'&&n.path[1]===1&&n.path[2]===1).path;
    const filled=await save(doc,d=>sdk.updateTableCell(d,cell,[{kind:'math',value:'0.5'}]));
    let r=await word.operations.follow({id,revision});
    assert.equal(r.revision,filled);
    const moved=JSON.parse(await readFile(side,'utf8'));
    assert.equal(moved.revision,filled); assert.equal(moved.source.revision,filled); assert.deepEqual(moved.warnings,kept.warnings);
    // A save that did not start from the list's revision stops.
    await save(doc,d=>sdk.updateParagraphInlineContent(d,[1],[t('Changed.')]));
    assert.equal((await word.operations.follow({id,revision})).stale,true);
    r=await word.operations.follow({id,revision:filled}); assert.ok(r.revision);
    // A paragraph removed elsewhere stops at once.
    await save(doc,d=>sdk.removeBlock(d,2));
    assert.equal((await word.operations.follow({id,revision:r.revision})).stale,true);
    assert.equal(JSON.parse(await readFile(side,'utf8')).revision,r.revision);
  } finally { await word.dispose(); await rm(dir,{recursive:true,force:true}); }
});
