import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {assertSchema,resolveSchema} from '../schema.mjs';
import {decideComplete,publishComplete,parseServerJson,responseSchemas,documentSchema} from '../validation.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('../../../fixtures/lsr-1.1/converted/document.json',import.meta.url)));
const pdf=await fs.readFile(new URL('../../../fixtures/lsr-1.1/LSR-1.1-standards.pdf',import.meta.url));
const sha=crypto.createHash('sha256').update(pdf).digest('hex');
const shape=JSON.parse(await fs.readFile(new URL('./response-shapes.json',import.meta.url)));
shape.result.document.json_content=fixture;fixture.origin.binary_hash=JSON.rawJSON(BigInt('0x'+sha.slice(-16)).toString());
const source={basename:'LSR-1.1-standards.pdf',sha256:sha};
const decide=(s=shape)=>decideComplete({...s,source,count:13});
function patch(root,path,value,remove=false){
 const copy=Array.isArray(root)?[...root]:{...root};const [key,...rest]=path;
 if(rest.length)copy[key]=patch(root[key],rest,value,remove);else if(remove)delete copy[key];else copy[key]=value;return copy;
}
function merged(schema,value,root){
 let s=schema;if(s.$ref)s={...merged(resolveSchema(root,s.$ref),value,root),...s};
 for(const k of ['anyOf','oneOf','allOf'])if(s[k])for(const branch of s[k]){
  try{assertSchema(value,branch,root);const b=merged(branch,value,root);s={...s,...b,properties:{...s.properties,...b.properties},required:[...new Set([...(s.required||[]),...(b.required||[])])]};if(k!=='allOf')break}catch{}
 }
 return s;
}
function* variants(value,schema,root,path=[]){
 const s=merged(schema,value,root);
 if(value&&typeof value==='object'&&!JSON.isRawJSON(value)){
  if(Array.isArray(value)){
   for(let i=0;i<value.length;i++){const child=s.prefixItems?.[i]??s.items;if(child&&child!==true)yield* field(value[i],child,root,[...path,i],false)}
  }else for(const [key,v]of Object.entries(value)){
   const child=s.properties?.[key]??s.additionalProperties;
   if(child&&typeof child==='object')yield* field(v,child,root,[...path,key],s.required?.includes(key)||path.length===1&&path[0]==='pages');
  }
 }
}
function* field(value,schema,root,path,required){
 if(required)yield {path,remove:true,kind:'delete'};
 const candidates=[null,false,0,'__wrong_type__',[],{}];
 // Choose a genuinely disallowed JSON type for every field, including optional fields when present.
 for(const candidate of candidates){
  const type=x=>x===null?'null':Array.isArray(x)?'array':JSON.isRawJSON(x)?'number':typeof x;
  if(type(candidate)===type(value))continue;
  try{assertSchema(candidate,schema,root)}catch{yield {path,value:candidate,kind:'type'};break}
 }
 const s=merged(schema,value,root);
 if(s.enum||'const'in s){const bad=typeof value==='string'?'__invalid_enum__':-999;try{assertSchema(bad,schema,root)}catch{yield{path,value:bad,kind:'value'}}}
 yield* variants(value,schema,root,path);
}
test('actual server envelope shape and unmodified document pass the single completion gate',()=>{const verdict=decide();assert.equal(verdict.complete,true);assert.equal(publishComplete(verdict,()=>true),true)});
test('mechanically generated deletions and wrong types never pass the publication gate',()=>{
 let count=0,deletions=0,types=0,values=0;const byStage={};
 const roots={submitted:responseSchemas.components.schemas.TaskStatusResponse,status:responseSchemas.components.schemas.TaskStatusResponse,result:responseSchemas.components.schemas.ConvertDocumentResponse};
 // json_content has a separate complete document schema; visit it separately rather than treating it as an arbitrary object.
 for(const stage of ['submitted','status','result','document']){
  const value=stage==='document'?fixture:shape[stage],root=stage==='document'?documentSchema:responseSchemas,schema=stage==='document'?documentSchema:roots[stage];let stageCount=0;
  for(const variant of variants(value,schema,root)){
   const changed=patch(value,variant.path,variant.value,variant.remove);
   const input=stage==='document'?{...shape,result:{...shape.result,document:{...shape.result.document,json_content:changed}}}:{...shape,[stage]:changed};
   let complete=false,published=false;try{const verdict=decide(input);complete=verdict.complete;publishComplete(verdict,()=>{published=true})}catch{}
   assert.equal(published,false,'publication '+stage+' '+variant.kind+' /'+variant.path.join('/'));
   assert.equal(complete,false,stage+' '+variant.kind+' /'+variant.path.join('/'));
   count++;stageCount++;if(count%2000===0)console.log('mutation progress',count,stage);if(variant.kind==='delete')deletions++;else if(variant.kind==='type')types++;else values++;
  }
  byStage[stage]=stageCount;
 }
 console.log('MUTATIONS',JSON.stringify({count,deletions,types,values,byStage}));assert.ok(count>1000);
});

test('the production publisher rejects a fabricated complete flag',()=>{
 assert.throws(()=>publishComplete({complete:true},()=>assert.fail('published')),/publication refused/);
});
test('the completion gate does not synthesize defaults or mutate normal responses',()=>{
 const before=JSON.stringify(shape);assert.equal(decide().complete,true);assert.equal(JSON.stringify(shape),before);
});
