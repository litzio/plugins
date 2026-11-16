import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extract} from '../extract.mjs';
import {convert,footnoteContent} from '../rules.mjs';
const result=convert(await extract(new URL('./fixtures/LSR-1.1-standards.pdf',import.meta.url)));
test('public sample: headings, conservation, margins, and cross-page paragraph',()=>{
 assert.equal(result.stats.headings.detected,15);
 assert.equal(result.stats.headings.matched,15);
 assert.equal(result.stats.headings.level_correct,15);
 assert.equal(result.stats.chars_unaccounted,0);
 const excluded=result.excluded.filter(x=>x.kind==='margin');assert.ok(excluded.length);
 for(const b of result.blocks)for(const x of b.boxes)assert.ok(!excluded.some(e=>e.page===x.page&&e.box.top===x.top&&e.box.bottom===x.bottom));
 assert.equal(result.stats.paragraphs.cross_page_joined,1);
 assert.ok(result.blocks.some(b=>b.kind==='paragraph'&&b.boxes.length===2));
 assert.equal(result.pages.length,13);
 const ids=new Set();for(const b of result.blocks){assert.ok(!ids.has(b.id));ids.add(b.id);assert.equal(typeof b.text,'string');assert.ok(b.boxes.length);for(const x of b.boxes){assert.ok(x.x1>=x.x0&&x.bottom>=x.top);assert.ok(result.pages[x.page]);}}
});
test('public sample: unmatched superscript is retained as literal marker with warning',()=>{
 const b=result.blocks.find(b=>b.warning?.code==='footnote-pair');assert.ok(b);
 const n=result.stats.footnotes.refs_without_definition.find(n=>b.text.includes('[^'+n+']'));assert.ok(n);
 const content=footnoteContent(b.text,result.stats);
 assert.ok(content.some(c=>c.kind==='text'&&c.text==='['+n+']'));
 assert.ok(!content.some(c=>c.kind==='footnote'&&c.label===n));
});
