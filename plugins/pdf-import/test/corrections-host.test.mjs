import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {correctionHandler} from '../correct-host.mjs';
import {boxesFor} from '../corrections.mjs';
const args=process.env.PDF_IMPORT_TEST_CLI_ARGS;
test('official CLI integration: five corrections, repeated undo, saved-only reopening and revision refusal', {skip:!args},async()=>{
  const cli={bin:process.execPath,args:JSON.parse(args)}, exec=promisify(execFile);
  const run=async a=>JSON.parse((await exec(cli.bin,[...cli.args,...a],{windowsHide:true})).stdout || 'null');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pdf-import-integration-'));
  try {
    const doc=path.join(dir,'public.md'),side=path.join(dir,'public.pdf-source.json'),input=path.join(dir,'input.json');
    await writeFile(input,JSON.stringify({authoring:{inputs:[{key:'sample',blocks:[
      {kind:'paragraph',text:'First line. Next line.'},{kind:'paragraph',text:'Second paragraph.'},{kind:'paragraph',text:'Final paragraph.'}]}]}}));
    await run(['create',doc,'--input',input,'--format','json']);
    const initial=await readFile(doc,'utf8'), snapshot=await run(['inspect',doc,'--format','json']);
    const texts=[['First line.','Next line.'],['Second paragraph.'],['Final paragraph.']];
    const mapping={lineVersion:1,revision:snapshot.revision,excluded:[],blocks:texts.map((text,i)=>{
      const lines=text.map((text,j)=>({page:0,text,box:{page:0,x0:0,x1:100,top:i*50+j*12,bottom:i*50+j*12+10}}));
      return {id:'b'+i,path:[i+1],kind:'paragraph',documentKind:'paragraph',lines,boxes:boxesFor(lines)};
    })};
    await writeFile(side,JSON.stringify(mapping));
    let m=mapping, correct=correctionHandler(cli);
    const act=async(action,extra={})=>{
      const r=await correct({document:doc,revision:m.revision,historyId:'screen',action,ids:['b0'],...extra});
      assert.ok(r.mapping,JSON.stringify(r));m=r.mapping;return r;
    };
    await act('merge',{ids:['b0','b1']});await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('kind',{kind:'paragraph'});await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('split',{line:1});await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('kind',{kind:'heading',level:3});await act('kind',{kind:'heading',level:2});
    await act('undo');await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    await act('remove');await act('undo');assert.equal(await readFile(doc,'utf8'),initial);
    correct=correctionHandler(cli);await act('kind',{kind:'heading',level:3});await act('undo');
    assert.equal(await readFile(doc,'utf8'),initial);
    const stale=await correct({document:doc,revision:'0'.repeat(64),historyId:'screen',action:'remove',ids:['b0']});
    assert.equal(stale.stale,true);assert.equal(await readFile(doc,'utf8'),initial);
    const checked=await run(['check',doc,'--format','json']);assert.equal(checked.validation.valid,true);
  } finally {await rm(dir,{recursive:true,force:true});}
});
