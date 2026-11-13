import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createService} from '../service.mjs';
import {validateResult,decodePng,parseServerJson} from '../validation.mjs';
const root=new URL('../../../',import.meta.url);
const fixture=JSON.parse(await fs.readFile(new URL('fixtures/lsr-1.1/converted/document.json',root)));
const pdf=new URL('fixtures/lsr-1.1/LSR-1.1-standards.pdf',root);
const sourceHash=crypto.createHash('sha256').update(await fs.readFile(pdf)).digest('hex');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'docling-convert-test-'));console.log('Retained:',temporary);
test('contract copies are byte-identical',async()=>{for(const name of ['options.json','pdf-en-v2.json'])assert.deepEqual(await fs.readFile(new URL('../'+name,import.meta.url)),await fs.readFile(new URL('contracts/docling-convert/'+name,root)))});
test('decode real fixture, reject corruption and missing pages',()=>{assert.equal(validateResult(fixture,13).offline_images,true);assert.equal(validateResult(fixture,14).all_pages,false);const d=structuredClone(fixture);d.pages['1'].image.uri='data:image/png;base64,YQ==';assert.equal(validateResult(d,13).offline_images,false);assert.throws(()=>decodePng('https://example.test/a.png'))});
const request=JSON.parse(await fs.readFile(new URL('../pdf-en-v2.json',import.meta.url))).request;
const api={paths:{}};api.paths['/v1/convert/file/async']={post:{requestBody:{content:{}}}};api.paths['/v1/convert/file/async'].post.requestBody.content['multipart/form-data']={schema:{properties:Object.fromEntries(['files',...Object.keys(request)].map(k=>[k,{}]))}};
const capabilities={stages:Object.fromEntries(Object.entries(request).filter(([k])=>k.endsWith('_preset')).map(([k,v])=>[k,{option:k,presets:[{id:v}]}]))};
const responseCases={
 'name':r=>delete r.document.json_content.name,
 'table-data':r=>delete r.document.json_content.tables[0].data,
 'unreachable':r=>{const d=r.document.json_content,ref='#/groups/'+d.groups.length;d.groups.push({self_ref:ref,parent:{$ref:ref},children:[{$ref:ref}],label:'unspecified'})},
 'schema-missing':r=>delete r.document.json_content.schema_name,
 'version-missing':r=>delete r.document.json_content.version,
 'cycle':r=>r.document.json_content.groups[0].children.push({$ref:'#/body'}),
 'provenance-type':r=>r.document.json_content.texts[0].prov={},
 'bbox':r=>r.document.json_content.texts[0].prov[0].bbox.l=null,
 'duplicate-child':r=>r.document.json_content.body.children.push(r.document.json_content.body.children[0]),
 'result-status-missing':r=>delete r.status,
 'errors-null':r=>r.errors=null,
 'json-content-missing':r=>delete r.document.json_content,
 'no-result-id':r=>delete r.task_id,
 'filename':r=>r.document.json_content.origin.filename='other.pdf',
 'digest':r=>r.document.json_content.origin.binary_hash=0,
 'digest-rounded':r=>r.document.json_content.origin.binary_hash=Number(BigInt('0x'+sourceHash.slice(-16))),
 'origin-missing':r=>delete r.document.json_content.origin,
 'mime':r=>r.document.json_content.origin.mimetype='text/plain',
 'schema':r=>r.document.json_content.schema_name='OtherDocument',
 'version':r=>r.document.json_content.version='1.9.0',
 'body':r=>delete r.document.json_content.body,
 'body-children':r=>r.document.json_content.body.children={},
 'furniture':r=>delete r.document.json_content.furniture,
 'texts':r=>delete r.document.json_content.texts,
 'tables':r=>r.document.json_content.tables={},
 'pictures':r=>r.document.json_content.pictures=null,
 'groups':r=>delete r.document.json_content.groups,
 'key-values':r=>delete r.document.json_content.key_value_items,
 'forms':r=>delete r.document.json_content.form_items,
 'reference':r=>r.document.json_content.body.children[0].$ref='#/texts/999999',
 'self-ref':r=>r.document.json_content.texts[0].self_ref='#/texts/999999',
 'parent':r=>r.document.json_content.texts[0].parent.$ref='#/furniture',
 'text-value':r=>delete r.document.json_content.texts[0].text,
 'page-number':r=>r.document.json_content.pages['1'].page_no=2,
 'page-size':r=>delete r.document.json_content.pages['1'].size,
 'page-zero-size':r=>r.document.json_content.pages['1'].size.width=0,
 'provenance-page':r=>r.document.json_content.texts[0].prov[0].page_no=999,
 'page-image':r=>delete r.document.json_content.pages['1'].image,
 'picture-image':r=>delete r.document.json_content.pictures[0].image,
 'remote-image':r=>r.document.json_content.pages['1'].image.uri='https://example.test/page.png',
 'result-status':r=>r.status='failure',
 'errors-missing':r=>delete r.errors,
 'errors-object':r=>r.errors={},
 'document-missing':r=>delete r.document,
};
async function harness(mode,overrides={}){
 let posted='',polls=0,resultBytes;const server=http.createServer(async(req,res)=>{let body=[];for await(const b of req)body.push(b);if(req.method==='POST')posted=Buffer.concat(body).toString();res.setHeader('Content-Type','application/json');const url=req.url;if(url.startsWith('/v1/result')&&mode==='result-mime')res.setHeader('Content-Type','text/plain');let data={};if(url==='/version')data={'docling-serve':'1.38.2'};if(url==='/openapi.json')data=api;if(url==='/v1/capabilities')data=capabilities;if(url==='/v1/convert/file/async'){if(mode==='disconnect'){req.socket.destroy();return}data=mode==='no-submit-id'?{}:{task_id:'a/b'}}if(url.startsWith('/v1/status'))data={task_id:mode==='wrong-task'?'other-B':'a/b',task_status:++polls===1&&mode==='success'?'pending':mode==='failure'?'failure':mode==='partial-task'?'partial_success':'success'};if(url.startsWith('/v1/result'))data={task_id:mode==='wrong-result-task'?'other-B':'a/b',status:mode==='partial'?'partial_success':'success',errors:mode==='errors'?['bad']:[],document:{json_content:mode==='structure-missing'?{pages:fixture.pages,pictures:[]}:mode==='missing'?{...fixture,pages:{}}:mode==='broken'?{...fixture,pictures:[{image:{uri:'data:image/png;base64,YQ=='}}]}:fixture}};if(data.document?.json_content)data.document.json_content=JSON.parse(JSON.stringify(data.document.json_content));if(data.document?.json_content?.origin)data.document.json_content={...data.document.json_content,origin:{...data.document.json_content.origin,binary_hash:JSON.rawJSON(BigInt('0x'+sourceHash.slice(-16)).toString())}};if(url.startsWith('/v1/result')&&responseCases[mode])responseCases[mode](data);if(url.startsWith('/v1/status')&&mode==='no-poll-id')delete data.task_id;const encoded=JSON.stringify(data);if(url.startsWith('/v1/result'))resultBytes=Buffer.from(encoded);res.end(encoded)});await new Promise(r=>server.listen(0,'127.0.0.1',r));const service=createService({settings:{serverUrl:`http://127.0.0.1:${server.address().port}`}});try{const started=await service.operations.convert({source:(await import('node:url')).fileURLToPath(pdf),destination:temporary,pages:13,overrides});let job;for(let n=0;n<100;n++){job=(await service.operations.job({job_id:started.job_ids[0]})).jobs[0];if(['complete','incomplete','failed','uncertain'].includes(job.state))break;await new Promise(r=>setTimeout(r,30))}return {job,posted,resultBytes}}finally{service.dispose();await new Promise(r=>server.close(r))}}
test('fake HTTP success writes standalone bundle and complete record',async()=>{const {job,posted}=await harness('success',{images_scale:2});assert.equal(job.state,'complete');const r=JSON.parse(await fs.readFile(path.join(job.result.path,'conversion-record.json')));for(const k of ['source','server','profile','profile_sha256','execution_profile_sha256','task_id','task_status','started_at','completed_at','elapsed_ms','result','document','actual_request','overrides_from_default','openapi_sha256'])assert.ok(k in r,k);assert.equal(r.overrides_from_default.images_scale,2);assert.match(posted,/name="images_scale"\r\n\r\n2/);assert.match(posted,/application\/pdf/);assert.ok(await fs.stat(path.join(job.result.path,'source.pdf')));const again=await harness('success');assert.notEqual(again.job.result.path,job.result.path)});
for(const [mode,state] of [['partial','incomplete'],['missing','failed'],['broken','failed'],['errors','incomplete'],['failure','failed'],['disconnect','uncertain']])test('fake HTTP '+mode,async()=>assert.equal((await harness(mode)).job.state,state));
for(const overrides of [{include_images:false},{unknown:true},{images_scale:3},{force_ocr:true,do_ocr:false},{table_mode:'fast'},{pdf_heading_hierarchy_options:{}}])test('reject invalid options '+JSON.stringify(overrides),async()=>assert.equal((await harness('success',overrides)).job.state,'failed'));
test('stop aborts local wait, retains diagnostic and blocks further server submissions',async()=>{
 let posts=0;const server=http.createServer(async(req,res)=>{for await(const b of req){}res.setHeader('Content-Type','application/json');if(req.method==='POST'){posts++;res.end(JSON.stringify({task_id:'wait'}))}else if(req.url.startsWith('/v1/status'))res.end(JSON.stringify({task_id:'wait',task_status:'started'}));else res.end(JSON.stringify(req.url==='/version'?{'docling-serve':'1.38.2'}:req.url==='/openapi.json'?api:req.url==='/v1/capabilities'?capabilities:{}))});await new Promise(r=>server.listen(0,'127.0.0.1',r));const service=createService({settings:{serverUrl:`http://127.0.0.1:${server.address().port}`}});
 try{const ids=(await service.operations.convert({files:[{source:(await import('node:url')).fileURLToPath(pdf),pages:13},{source:(await import('node:url')).fileURLToPath(pdf),pages:13}],destination:temporary})).job_ids;
 for(let n=0;n<100;n++){if((await service.operations.job()).jobs[0].state==='started')break;await new Promise(r=>setTimeout(r,20))}
 await service.operations.stop({job_id:ids[0]});for(let n=0;n<100;n++){if((await service.operations.job()).jobs[1].state==='blocked')break;await new Promise(r=>setTimeout(r,20))}
 const jobs=(await service.operations.job()).jobs;assert.equal(jobs[0].state,'stopped');assert.equal(jobs[1].state,'blocked');assert.equal(posts,1);const record=JSON.parse(await fs.readFile(path.join(jobs[0].result.path,'conversion-record.json')));assert.equal(record.task_id,'wait');assert.equal(record.state,'stopped');
 }finally{service.dispose();await new Promise(r=>server.close(r))}
});

for(const mode of ['wrong-task','wrong-result-task','structure-missing'])test('review regression '+mode,async()=>{const {job}=await harness(mode);assert.equal(job.state,'failed');assert.match(path.basename(job.result.path),/^\.docling-candidate-/);});

for(const mode of Object.keys(responseCases).filter(k=>k!=='no-result-id').concat('no-poll-id','result-mime'))test('reject response condition '+mode,async()=>{const {job}=await harness(mode);assert.notEqual(job.state,'complete');assert.match(path.basename(job.result.path),/^\.docling-candidate-/);const r=JSON.parse(await fs.readFile(path.join(job.result.path,'conversion-record.json')));assert.notEqual(r.complete,true);assert.ok(r.error);});
test('result task ID is optional in the public envelope',async()=>assert.equal((await harness('no-result-id')).job.state,'complete'));

test('missing submission ID is uncertain and is never published',async()=>assert.equal((await harness('no-submit-id')).job.state,'uncertain'));
test('partial task cannot be promoted by a success result',async()=>assert.equal((await harness('partial-task')).job.state,'incomplete'));

test('published bundle fields are derived from the exact sent and received bytes',async()=>{
 const {job,resultBytes}=await harness('success');const folder=job.result.path;
 const bytes=await fs.readFile(path.join(folder,'document.json')),source=await fs.readFile(path.join(folder,'source.pdf'));
 const record=JSON.parse(await fs.readFile(path.join(folder,'conversion-record.json')));
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 assert.equal(record.complete,true);assert.equal(record.state,'complete');
 assert.equal(record.source.basename,'LSR-1.1-standards.pdf');assert.equal(record.source.file,'source.pdf');assert.equal(record.source.bytes,source.length);assert.equal(record.source.sha256,sha(source));assert.equal(record.source.expected_page_count,13);
 const profileBytes=await fs.readFile(new URL('../pdf-en-v2.json',import.meta.url));
 assert.deepEqual(record.profile,JSON.parse(profileBytes));assert.equal(record.profile_id,'pdf-en-v2');assert.equal(record.profile_sha256,sha(Buffer.from(profileBytes.toString().replace(/\r\n/g,'\n'))));assert.equal(record.execution_profile_sha256,sha(profileBytes));
 assert.equal(record.server['docling-serve'],'1.38.2');assert.equal(record.openapi_sha256,sha(Buffer.from(JSON.stringify(api))));assert.deepEqual(record.actual_request,request);assert.deepEqual(record.overrides_from_default,{});
 assert.equal(record.task_id,'a/b');assert.equal(record.task.task_id,'a/b');assert.equal(record.task_status,'success');assert.equal(record.result.status,'success');assert.deepEqual(record.result.errors,[]);assert.equal(record.result.body_sha256,sha(resultBytes));
 for(const key of ['started_at','completed_at'])assert.match(record[key],/^\d{4}-.*Z$/);assert.ok(record.elapsed_ms>=0);
 assert.equal(record.document.sha256,sha(bytes));assert.equal(record.document.schema,'DoclingDocument');assert.equal(record.document.version,'1.10.0');assert.equal(record.document.page_count,13);
 assert.equal(parseServerJson(bytes).origin.binary_hash.rawJSON,BigInt('0x'+sourceHash.slice(-16)).toString());
});

test('recover refuses a status from another task',async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({task_id:'other',task_status:'success'}))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const candidate=await fs.mkdtemp(path.join(temporary,'recover-'));await fs.writeFile(path.join(candidate,'conversion-record.json'),JSON.stringify({task_id:'requested',server_url:`http://127.0.0.1:${server.address().port}`}));const service=createService({settings:{}});
 try{await assert.rejects(()=>service.operations.recover({candidate}),/task_id mismatch/)}finally{service.dispose();await new Promise(r=>server.close(r))}
});
