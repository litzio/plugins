import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { togglePageRange, firstPageTitles, readPageTitles, applyPageSuggestion } from '../page-selection.mjs';

test('page selection preserves target-directed Shift ranges and the input set', () => {
  const original=new Set([1,2]);
  assert.deepEqual([...togglePageRange(original,null,3,true)],[1,2,3]);
  assert.deepEqual([...togglePageRange(original,6,3,true)],[1,2,3,4,5,6]);
  assert.deepEqual([...togglePageRange(new Set([1,2,3,4,6]),6,3,true)],[1,2]);
  assert.deepEqual([...togglePageRange(original,6,2,false)],[1]);
  assert.deepEqual([...original],[1,2]);
});

test('public PDF bookmark destinations supply only the first title on each page', async () => {
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading=getDocument({data:new Uint8Array(await readFile(new URL('./fixtures/LSR-1.1-standards.pdf',import.meta.url))),verbosity:0,enableScripting:false});
  const doc=await loading.promise;
  try {
    const titles=await readPageTitles(doc);
    assert.equal(titles.length,13);
    assert.match(titles[1],/^1\. Exchange and record scope/);
    assert.equal(titles[0],'');
    assert.equal(firstPageTitles([{page:2,title:titles[1]},{page:2,title:'1.1 Capture boundary'},{page:14,title:'outside'}],13)[1],titles[1]);
    assert.equal(firstPageTitles([{page:2,title:''},{page:2,title:'Later bookmark'}],13)[1],'');
    assert.deepEqual(await readPageTitles({numPages:13,getOutline:async()=>null}),Array(13).fill(''));
  } finally {await loading.destroy();}
});


test('late suggestions keep explicit includes, excludes, and every touched Shift-range page',()=>{
  let selected=togglePageRange(new Set(),null,2,false);
  selected=togglePageRange(selected,2,4,true);
  const touched=new Set([2,3,4]);
  selected=togglePageRange(selected,4,3,false);
  assert.deepEqual([...applyPageSuggestion(selected,[1,3,5],touched)].sort(),[1,2,4,5]);
});
