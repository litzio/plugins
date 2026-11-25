import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {outputPaths} from '../output-paths.mjs';
import {imageKeys} from '../output.mjs';
import {koreanTime} from '../../shared/time.mjs';
import {backupOutput,documentWithoutMapping,recordImages,finishReplacement} from '../output-files.mjs';
test('O-01 only a document without mapping needs recovery and can be replaced',async(t)=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'pdf-output-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const doc=path.join(root,'sample.md'), side=path.join(root,'sample.pdf-source.json');
  assert.equal(await documentWithoutMapping({doc,side}),false);
  await writeFile(side,'{}');
  assert.equal(await documentWithoutMapping({doc,side}),false);
  await writeFile(doc,'old');
  assert.equal(await documentWithoutMapping({doc,side}),false);
  await rm(side);
  assert.equal(await documentWithoutMapping({doc,side}),true);
  const previous=await backupOutput({doc,side});
  assert.equal(previous.side,null);
  assert.equal(await readFile(previous.doc,'utf8'),'old');
  assert.equal(await documentWithoutMapping({doc,side}),false);
  await writeFile(doc,'new');
  await writeFile(side,'{}');
  await finishReplacement({doc,previous},{ownedImages:[]});
  assert.deepEqual((await readdir(root)).sort(),['sample.md','sample.pdf-source.json']);
});
test('output folder and image names follow PDF and document order',()=>{
  const root=path.resolve('input');
  assert.equal(outputPaths(path.join(root,'Sample.PDF')).doc,path.join(root,'Sample','Sample.md'));
  assert.deepEqual([...imageKeys([{id:'a',kind:'table'},{id:'x',kind:'paragraph'},{id:'b',kind:'figure'}])], [['a','table-001'],['b','figure-002']]);
});
test('Korean date and edit time cross the UTC date boundary without timezone suffix',()=>{
  assert.equal(koreanTime('2026-11-17T16:55:42Z'),'2026-11-18 01:55:42');
  assert.equal(koreanTime('2026-11-17T16:55:42Z',true),'2026-11-18');
});
test('successful replacement removes only obsolete owned bytes and recovery copies',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'pdf-output-'));
  try {
    await mkdir(path.join(root,'assets'));
    const digest=createHash('sha256').update('png').digest('hex');
    const images=['table-001.png','figure-002.png','figure-003.png','unrelated.png'];
    for(const n of images) await writeFile(path.join(root,'assets',n),n==='figure-003.png'?'changed':'png');
    const doc=path.join(root,'sample.md'),previous={doc:path.join(root,'sample.previous-1.md'),side:path.join(root,'sample.pdf-source.json.previous-1'),data:{ownedImages:images.slice(0,3).map(name=>({name,sha256:digest}))}};
    await writeFile(doc,'new');await writeFile(previous.doc,'old');await writeFile(previous.side,'old');
    const s={doc,previous,assetsBefore:new Set(images)};
    const owned=await recordImages(s,[{key:'table-001',sha256:digest}]);
    assert.deepEqual(owned,[{name:'table-001.png',sha256:digest}]);
    await finishReplacement(s,{ownedImages:owned});
    assert.deepEqual((await readdir(path.join(root,'assets'))).sort(),['figure-003.png','table-001.png','unrelated.png']);
    assert.equal(await readFile(doc,'utf8'),'new');
    assert.deepEqual((await readdir(root)).sort(),['assets','sample.md']);
  } finally {await rm(root,{recursive:true,force:true});}
});
