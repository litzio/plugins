import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {assertSchema} from '../schema.mjs';
import {decideComplete,publishComplete,parseServerJson,documentSchema} from '../validation.mjs';
const audit=JSON.parse(await fs.readFile(new URL('../schemas/consumer-fields.json',import.meta.url)));
const optional=JSON.parse(await fs.readFile(new URL('../schemas/optional-fields.json',import.meta.url))).fields['docling-document.json'];
const shapes=JSON.parse(await fs.readFile(new URL('./response-shapes.json',import.meta.url)));
function patch(x,path){const [k,...rest]=path,copy=Array.isArray(x)?[...x]:{...x};if(rest.length)copy[k]=patch(x[k],rest);else delete copy[k];return copy}
function input(doc,record){return {submitted:shapes.submitted,status:shapes.status,result:{...shapes.result,document:{...shapes.result.document,filename:doc.origin.filename,json_content:doc}},source:{basename:doc.origin.filename,sha256:record.source.sha256},count:record.document.page_count}}
test('every consumed field is required or has measured normal-omission evidence',()=>{
 for(const r of audit.rows){const s=r.definition==='$root'?documentSchema:documentSchema.$defs[r.definition];if(r.decision==='optional-normal-omission'){assert.ok(r.first_missing);continue}assert.ok(s.required.includes(r.field),r.definition+'.'+r.field);assert.ok(!optional[r.definition==='$root'?'#':'#/$defs/'+r.definition]?.includes(r.field))}
});
test('four fixed outputs pass; generated deletions of every observed promoted field refuse publication',async()=>{
 let count=0;const perFixture={};
 for(const sample of audit.samples){const file=new URL('../../../'+sample,import.meta.url),doc=parseServerJson(await fs.readFile(file)),record=JSON.parse(await fs.readFile(new URL('conversion-record.json',file)));
  // Fixed fixture exports predate lossless uint64 storage. Restore only the source hash token.
  doc.origin.binary_hash=JSON.rawJSON(BigInt('0x'+record.source.sha256.slice(-16)).toString());assert.equal(decideComplete(input(doc,record)).complete,true,sample);let n=0;
  for(const row of audit.rows.filter(r=>r.decision.startsWith('promote'))){const path=row.examples[sample];if(!path)continue;const changed=patch(doc,path.slice(1).split('/'));let published=false,complete=false;try{const verdict=decideComplete(input(changed,record));complete=verdict.complete;publishComplete(verdict,()=>published=true)}catch{}assert.equal(complete,false,row.definition+'.'+row.field+' '+sample);assert.equal(published,false);count++;n++}
  perFixture[sample]=n;
 }
 console.log('PROMOTED_DELETIONS',JSON.stringify({count,perFixture}));assert.ok(count>=50);
});
test('table 2 column_header deletion is rejected without changing any other field',async()=>{
 const file=new URL('../../../fixtures/lsr-1.1/converted/document.json',import.meta.url),doc=parseServerJson(await fs.readFile(file)),record=JSON.parse(await fs.readFile(new URL('conversion-record.json',file)));doc.origin.binary_hash=JSON.rawJSON(BigInt('0x'+record.source.sha256.slice(-16)).toString());
 const changed=patch(doc,['tables','2','data','table_cells','0','column_header']);assert.throws(()=>decideComplete(input(changed,record)),/Schema .*tables\/2\/data/);
});

// Unobserved node types cannot be claimed as four-fixture runtime coverage.
// Still prove that each promoted schema declaration actually rejects deletion.
test('unobserved type promotions reject all 53 schema-level deletion mutations',()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 function make(s){
  if(s.$ref)return make(documentSchema.$defs[s.$ref.split('/').at(-1)]);
  if('const'in s)return clone(s.const);if(s.enum)return clone(s.enum[0]);if('default'in s)return clone(s.default);
  for(const kind of ['anyOf','oneOf'])if(s[kind]){const nullable=s[kind].find(b=>b.type==='null');if(nullable)return null;for(const b of s[kind])try{const v=make(b);assertSchema(v,s,documentSchema);return v}catch{}throw Error('Cannot synthesize union')}
  if(s.type==='object'){const value={};for(const k of s.required||[])value[k]=make(s.properties[k]);return value}
  if(s.type==='array')return Array.from({length:s.minItems||0},(_,i)=>make(s.prefixItems?.[i]??s.items));
  if(s.type==='string')return s.pattern?'#/body':'';if(s.type==='integer'||s.type==='number')return s.minimum??0;if(s.type==='boolean')return false;if(s.type==='null')return null;throw Error('No synthetic schema instance');
 }
 let n=0;for(const r of audit.rows.filter(r=>r.decision==='promote-unobserved-type')){const schema=documentSchema.$defs[r.definition],value=make(schema);assertSchema(value,schema,documentSchema);delete value[r.field];assert.throws(()=>assertSchema(value,schema,documentSchema),r.definition+'.'+r.field);n++}assert.equal(n,53);
});
