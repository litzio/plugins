import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {boxesFor} from '../corrections.mjs';
const args=process.env.PDF_IMPORT_TEST_CLI_ARGS;
test('SDK integration: corrections, repeated undo, saved-only reopening and revision refusal', {skip:!args},async()=>{
  const {inspectDocument,applyCorrections}=await import('../document-io.mjs');
  const {writeDocument}=await import('@litzio/plugin-sdk/node');
  const {correctionHandler}=await import('../correct-host.mjs');
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-integration-'));
  try {
    const doc=path.join(dir,'public.md'),side=path.join(dir,'public.pdf-source.json'),input=path.join(dir,'input.json');
    await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks:[
      {kind:'paragraph',content:[{kind:'text',text:'First '},{kind:'strong',children:[{kind:'text',text:'line. Next'}]},{kind:'text',text:' line.'}]},{kind:'paragraph',text:'Second paragraph.'},{kind:'paragraph',text:'Final paragraph.'}]}]}}));
    await run(['create',doc,'--input',input,'--format','json']);
    const initial=await readFile(doc,'utf8'), snapshot=inspectDocument(doc);
    const texts=[['First line.','Next line.'],['Second paragraph.'],['Final paragraph.']];
    const mapping={convertedAt:"2026-11-23T00:00:00.123Z",snapshotNodes:snapshot.nodes,revision:snapshot.revision,excluded:[],blocks:texts.map((text,i)=>{
      const lines=text.map((text,j)=>({page:0,text,box:{page:0,x0:0,x1:100,top:i*50+j*12,bottom:i*50+j*12+10}}));
      return {id:'b'+i,path:[i+1],kind:'paragraph',documentKind:'paragraph',lines,boxes:boxesFor(lines)};
    })};
    await writeFile(side,JSON.stringify(mapping));
    let m=mapping, correct=correctionHandler();
    const act=async(action,extra={})=>{
      const r=await correct({document:doc,revision:m.revision,historyId:'screen',action,ids:['b0'],...extra});
      assert.ok(r.mapping,JSON.stringify(r));m=r.mapping;
      assert.equal(m.stale,false,JSON.stringify(r));
      assert.equal(m.verificationPending,false);
      m=JSON.parse(await readFile(side,'utf8'));
      assert.equal(m.convertedAt,mapping.convertedAt);
      return r;
    };
    await act('merge',{ids:['b0','b1']});await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('merge',{ids:['b0','b1']});
    const historyLength=m.history.length, blocks=structuredClone(m.blocks);
    const approved=await act('status',{status:'approved'});
    assert.equal(approved.status,'approved');
    assert.equal(approved.undoCount,1);
    assert.deepEqual(m.blocks,blocks);
    assert.equal(m.history.length,historyLength);
    assert.equal(inspectDocument(doc).status,'approved');
    await act('undo');
    assert.equal(inspectDocument(doc).status,'approved');
    assert.equal(inspectDocument(doc).nodes.length,snapshot.nodes.length);
    await act('status',{status:'draft'});
    assert.equal(inspectDocument(doc).status,'draft');
    await act('status',{status:null});
    assert.equal(await readFile(doc,'utf8'),initial);
    await act('kind',{kind:'paragraph'});await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('split',{line:1});await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('kind',{kind:'heading',level:3});await act('kind',{kind:'heading',level:2});
    await act('undo');await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('remove');await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    correct=correctionHandler();await act('kind',{kind:'heading',level:3});await act('undo');
    assert.equal(await readFile(doc,'utf8'),initial);
    const stale=await correct({document:doc,revision:'0'.repeat(64),historyId:'screen',action:'remove',ids:['b0']});
    assert.equal(stale.stale,true);assert.equal(await readFile(doc,'utf8'),initial);
    // External edits must be refused by the operation's own revision guard.
    const external=inspectDocument(doc);
    writeDocument(doc,applyCorrections(external.document,[{command:'convert-block',path:'3',to:'heading',level:2}]),external.revision);
    const refused=await correct({document:doc,revision:m.revision,historyId:'screen',action:'remove',ids:['b0']});
    assert.equal(refused.stale,true);
    // A kind mismatch must be refused before writing even at the current revision.
    const current=inspectDocument(doc);
    m.revision=current.revision;m.blocks[0].documentKind='heading';
    await writeFile(side,JSON.stringify(m));
    const unchanged=await readFile(doc,'utf8');
    await assert.rejects(()=>correct({document:doc,revision:m.revision,historyId:'screen',action:'remove',ids:['b0']}),/블록/);
    assert.equal(await readFile(doc,'utf8'),unchanged);
    const checked=await run(['check',doc,'--format','json']);assert.equal(checked.validation.valid,true);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('SDK integration: L-05 merging adjacent lists, undo, and P-07 note boxes as their own kind', {skip:!args},async()=>{
  const {inspectDocument}=await import('../document-io.mjs');
  const {correctionHandler}=await import('../correct-host.mjs');
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-lists-'));
  try {
    const doc=path.join(dir,'lists.md'),side=path.join(dir,'lists.pdf-source.json'),input=path.join(dir,'input.json');
    const ordered={ordered:true,style:'lower-alpha',delimiter:')'};
    await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks:[
      {kind:'list',...ordered,start:1,items:[{content:[{kind:'text',text:'First item.'}]},{content:[{kind:'text',text:'Second item.'}]}]},
      {kind:'list',...ordered,start:3,items:[{content:[{kind:'text',text:'Third item'},{kind:'footnote',label:'1'}]}]},
      {kind:'admonition',variant:'note',text:'NOTE 2—A remark.'},
      {kind:'footnote',label:'1',text:'A public note.'}]}]}}));
    await run(['create',doc,'--input',input,'--format','json']);
    const initial=await readFile(doc,'utf8'), snapshot=inspectDocument(doc);
    assert.deepEqual(snapshot.nodes.filter(n=>n.path.length===1).map(n=>n.type),['list','list','admonition','footnote']);
    const source=(id,at,top)=>{const lines=[{page:0,text:id,box:{page:0,x0:0,x1:100,top,bottom:top+10}}];
      return {id,path:[at],kind:'list',documentKind:'list',lines,boxes:boxesFor(lines)};};
    let m={snapshotNodes:snapshot.nodes.filter(n=>n.path.length===1),revision:snapshot.revision,excluded:[],blocks:[
      source('a1',1,0),source('a2',1,12),source('b1',2,30),
      {...source('n',3,50),kind:'note',documentKind:'admonition'},{...source('f',4,90),kind:'footnote',documentKind:'footnote'}]};
    await writeFile(side,JSON.stringify(m));
    const correct=correctionHandler();
    const act=async(action,ids)=>{
      const r=await correct({document:doc,revision:m.revision,historyId:'screen',action,ids});
      assert.ok(r.mapping,JSON.stringify(r));assert.equal(r.mapping.stale,false,JSON.stringify(r));
      m=JSON.parse(await readFile(side,'utf8'));return r;
    };
    await act('merge',['a1','a2','b1']);
    const merged=inspectDocument(doc).nodes.filter(n=>n.path.length===1);
    assert.deepEqual(merged.map(n=>n.type),['list','admonition','footnote']);
    assert.equal(merged[0].items.length,3);
    assert.deepEqual(m.blocks.map(b=>b.path[0]),[1,1,1,2,3]);
    assert.equal((await run(['check',doc,'--format','json'])).validation.valid,true);
    await act('undo',['a1']);
    assert.equal(await readFile(doc,'utf8'),initial);
    assert.deepEqual(m.blocks.map(b=>b.path[0]),[1,1,2,3,4]);
    await assert.rejects(()=>correct({document:doc,revision:m.revision,historyId:'screen',action:'merge',ids:['b1','n']}),/목록/);
    assert.equal(await readFile(doc,'utf8'),initial);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('SDK integration: S-02 figure/table references survive split, merge, kind, remove and undo', {skip:!args},async()=>{
  const {inspectDocument}=await import('../document-io.mjs');
  const {correctionHandler}=await import('../correct-host.mjs');
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-refs-'));
  try {
    const doc=path.join(dir,'refs.md'),side=path.join(dir,'refs.pdf-source.json'),input=path.join(dir,'input.json');
    const ref=label=>({kind:'reference',role:'numref',label});
    await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks:[
      {kind:'paragraph',content:[{kind:'text',text:'Limits are in '},ref('tab-B.2'),{kind:'text',text:'. The next line names '},ref('tab-B.2'),{kind:'text',text:' again.'}]},
      {kind:'paragraph',text:'Second paragraph.'},
      {kind:'table',label:'tab-B.2',enumerator:'B.2',rows:[['a','b'],['1','2']],caption:'Limits'}]}]}}));
    await run(['create',doc,'--input',input,'--format','json']);
    const initial=await readFile(doc,'utf8'), snapshot=inspectDocument(doc);
    const table=snapshot.nodes.find(n=>n.type==='table');
    assert.equal(table.referenceText.replace(/\s/g,' '),'Table B.2');
    const texts=[['Limits are in Table B.2. The next line','names Table B.2 again.'],['Second paragraph.']];
    const lines=texts.map((t,i)=>t.map((text,j)=>({page:0,text,box:{page:0,x0:0,x1:100,top:i*50+j*12,bottom:i*50+j*12+10}})));
    let m={snapshotNodes:snapshot.nodes.filter(n=>n.path.length===1),revision:snapshot.revision,excluded:[],blocks:[
      ...lines.map((l,i)=>({id:'b'+i,path:[i+1],kind:'paragraph',documentKind:'paragraph',lines:l,boxes:boxesFor(l)})),
      {id:'t',path:[3],kind:'table',documentKind:'table',lines:[],boxes:[{page:0,x0:0,x1:100,top:120,bottom:160}]}]};
    await writeFile(side,JSON.stringify(m));
    const correct=correctionHandler();
    const act=async(action,extra)=>{
      const r=await correct({document:doc,revision:m.revision,historyId:'screen',action,...extra});
      assert.ok(r.mapping,JSON.stringify(r));assert.equal(r.mapping.stale,false,JSON.stringify(r));
      m=JSON.parse(await readFile(side,'utf8'));return r;
    };
    const refs=()=>inspectDocument(doc).nodes.filter(n=>n.path.length===1&&n.content).flatMap(n=>n.content.filter(c=>c.kind==='reference').map(c=>c.label));
    const valid=async()=>{const c=await run(['check',doc,'--format','json']);assert.equal(c.validation.valid,true);assert.deepEqual(c.references.unresolved,[]);};
    await act('split',{ids:['b0'],line:1});
    const split=inspectDocument(doc).nodes.filter(n=>n.type==='paragraph');
    assert.equal(split[1].content[0].text.trim(),'names');
    assert.deepEqual(refs(),['tab-B.2','tab-B.2']);await valid();
    await act('undo',{ids:['b0']});assert.equal(await readFile(doc,'utf8'),initial);
    await act('merge',{ids:['b0','b1']});assert.deepEqual(refs(),['tab-B.2','tab-B.2']);await valid();
    await act('undo',{ids:['b0']});assert.equal(await readFile(doc,'utf8'),initial);
    await act('kind',{ids:['b0'],kind:'heading',level:2});assert.deepEqual(refs(),['tab-B.2','tab-B.2']);await valid();
    await act('undo',{ids:['b0']});assert.equal(await readFile(doc,'utf8'),initial);
    await act('remove',{ids:['b0']});assert.deepEqual(refs(),[]);await valid();
    await act('undo',{ids:['b0']});assert.equal(await readFile(doc,'utf8'),initial);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('SDK integration: H-01 document title through the official CLI, replacement, undo and later edits', {skip:!args},async()=>{
  const {inspectDocument}=await import('../document-io.mjs');
  const {correctionHandler}=await import('../correct-host.mjs');
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-title-'));
  try {
    const doc=path.join(dir,'title.md'),side=path.join(dir,'title.pdf-source.json'),input=path.join(dir,'input.json');
    await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks:[
      {kind:'paragraph',content:[{kind:'strong',children:[{kind:'text',text:'Public Sample'}]},{kind:'text',text:' Standard'}]},
      {kind:'heading',level:1,text:'1. Overview'},
      {kind:'paragraph',text:'First line. Next line.'},{kind:'paragraph',text:'Second paragraph.'}]}]}}));
    await run(['create',doc,'--input',input,'--format','json']);
    const initial=await readFile(doc,'utf8'), snapshot=inspectDocument(doc);
    assert.equal(snapshot.title,null);
    const texts=[['Public Sample','Standard'],['1. Overview'],['First line.','Next line.'],['Second paragraph.']];
    const kinds=['paragraph','heading','paragraph','paragraph'];
    let m={snapshotNodes:snapshot.nodes.filter(n=>n.path.length===1),revision:snapshot.revision,excluded:[],blocks:texts.map((text,i)=>{
      const lines=text.map((text,j)=>({page:0,text,box:{page:0,x0:0,x1:100,top:i*50+j*12,bottom:i*50+j*12+10}}));
      return {id:'b'+i,path:[i+1],kind:kinds[i],documentKind:kinds[i],...(i===1?{level:1}:{}),lines,boxes:boxesFor(lines)};
    })};
    await writeFile(side,JSON.stringify(m));
    const correct=correctionHandler({cli});
    const act=async(action,extra)=>{
      const r=await correct({document:doc,revision:m.revision,historyId:'screen',action,...extra});
      assert.ok(r.mapping,JSON.stringify(r));assert.equal(r.mapping.stale,false,JSON.stringify(r));
      m=JSON.parse(await readFile(side,'utf8'));return r;
    };
    const body=()=>inspectDocument(doc).nodes.filter(n=>n.path.length===1).map(n=>n.type);
    await act('title',{ids:['b0']});
    assert.equal(inspectDocument(doc).title,'Public Sample Standard');
    assert.match(await readFile(doc,'utf8'),/^---\n(.*\n)*title: Public Sample Standard\n/);
    assert.deepEqual(body(),['heading','paragraph','paragraph']);
    assert.deepEqual(m.blocks.map(b=>[b.id,b.path[0]]),[['b1',1],['b2',2],['b3',3]]);
    assert.deepEqual(m.excluded.map(e=>e.kind),['title']);
    await act('undo',{ids:['b0']});
    assert.equal(await readFile(doc,'utf8'),initial);
    assert.deepEqual(m.blocks.map(b=>[b.id,b.path[0]]),[['b0',1],['b1',2],['b2',3],['b3',4]]);
    assert.deepEqual(m.excluded,[]);
    await act('title',{ids:['b0']});
    // An existing title asks first; the replaced title does not return to the body.
    const asked=await correct({document:doc,revision:m.revision,historyId:'screen',action:'title',ids:['b1']});
    assert.deepEqual(asked,{requiresConfirm:true,title:'Public Sample Standard'});
    await act('title',{ids:['b1'],confirmed:true});
    assert.equal(inspectDocument(doc).title,'1. Overview');
    assert.deepEqual(body(),['paragraph','paragraph']);
    await act('undo',{ids:['b1']});
    assert.equal(inspectDocument(doc).title,'Public Sample Standard');
    assert.deepEqual(body(),['heading','paragraph','paragraph']);
    // Later structural edits keep the mapping aligned and undo past the title.
    await act('merge',{ids:['b2','b3']});
    assert.deepEqual(body(),['heading','paragraph']);
    await act('split',{ids:['b2'],line:2});
    assert.deepEqual(body(),['heading','paragraph','paragraph']);
    await act('undo',{ids:['b2']});await act('undo',{ids:['b2']});await act('undo',{ids:['b0']});
    assert.equal(await readFile(doc,'utf8'),initial);
    // Two blocks cannot become one title; nothing is written.
    await assert.rejects(()=>correct({document:doc,revision:m.revision,historyId:'screen',action:'title',ids:['b0','b1']}),/본문이나 제목 하나/);
    const checked=await run(['check',doc,'--format','json']);assert.equal(checked.validation.valid,true);
    assert.equal(await readFile(doc,'utf8'),initial);
  } finally {await rm(dir,{recursive:true,force:true});}
});
