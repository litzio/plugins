import {validateResult,validateServer,validateTaskIdentity,validateDocument,parseServerJson} from './validation.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=b=>JSON.parse(b.toString('utf8'));
const stringify=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
export function createService(context) {
 const jobs=new Map(); let tail=Promise.resolve(); const controllers=new Map(); let disposed=false; let blocked=false;
 async function runConversion(input,job){
 const controller=new AbortController();controllers.set(job.id,controller);const progress=state=>{job.state=state};
   const start=Date.now(), deadline=start+1800000; let task=null, stage='initial', candidate=null, record={complete:false,started_at:new Date(start).toISOString()};
   const parent=path.resolve(input.destination);await fs.mkdir(parent,{recursive:true});candidate=await fs.mkdtemp(path.join(parent,'.docling-candidate-'));
   try {
   const profileBytes=await fs.readFile(path.join(dir,'pdf-en-v2.json')), profile=json(profileBytes), options=json(await fs.readFile(path.join(dir,'options.json'))).options;
   const request=structuredClone(profile.request); const changes=input.overrides||{};
   for(const [k,v] of Object.entries(changes)){const def=options[k];if(!def||def.fixed) throw Error('고정 또는 알 수 없는 옵션: '+k); if(Array.isArray(def.allowed)&&!def.allowed.some(x=>JSON.stringify(x)===JSON.stringify(v)))throw Error('허용되지 않는 값: '+k);request[k]=v;}
   const h=request.pdf_heading_hierarchy_options, hd=options.pdf_heading_hierarchy_options.allowed;
   if(!h||Object.keys(h).sort().join()!=Object.keys(options.pdf_heading_hierarchy_options.default).sort().join()||hd.boolean_keys.some(k=>typeof h[k]!=='boolean')||!Number.isInteger(h.max_level)||h.max_level<1||h.max_level>6||['style_size_tolerance','bookmark_match_threshold'].some(k=>typeof h[k]!=='number'||h[k]<0||h[k]>1))throw Error('제목 옵션이 올바르지 않습니다');
   if(!request.do_table_structure&&['table_structure_preset','table_mode','table_cell_matching'].some(k=>k in changes))throw Error('표 구조를 켜야 표 옵션을 조정할 수 있습니다');
   if(!request.do_pdf_heading_hierarchy&&'pdf_heading_hierarchy_options' in changes)throw Error('제목 추론을 켜야 세부 값을 조정할 수 있습니다');
   if(request.force_ocr&&!request.do_ocr)throw Error('강제 OCR에는 OCR이 필요합니다');
   if(!request.table_structure_preset.endsWith('_'+request.table_mode))throw Error('표 모델과 모드가 일치해야 합니다');
   if(!Number.isInteger(input.pages)||input.pages<1)throw Error('확인한 원본 쪽 수가 필요합니다');
   const source=await fs.readFile(input.source); if(source.subarray(0,5).toString()!=='%PDF-')throw Error('PDF 파일이 아닙니다');
   await fs.writeFile(path.join(candidate,'source.pdf'),source);
   const base=(context.settings.serverUrl||'http://127.0.0.1:5001').replace(/\/$/,'');
   const get=async (url,init={})=>{const left=deadline-Date.now();if(left<=0)throw Error('전체 시간 초과'); const response=await fetch(base+url,{...init,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(left)])});const bytes=Buffer.from(await response.arrayBuffer());if(url.startsWith('/v1/result/')&&response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('결과 Content-Type은 application/json이어야 합니다');if(!response.ok||(url==='/ready'&&response.status!==200))throw Error('HTTP '+response.status+' '+bytes.toString().slice(0,1000));return bytes};
   const overrides={}; for(const k of Object.keys(request))if(JSON.stringify(request[k])!==JSON.stringify(profile.request[k]))overrides[k]=request[k];
   Object.assign(record,{source:{basename:path.basename(input.source),file:'source.pdf',bytes:source.length,sha256:hash(source),expected_page_count:input.pages},profile,profile_id:profile.profile_id,profile_sha256:hash(Buffer.from(profileBytes.toString('utf8').replace(/\r\n/g,'\n'))),execution_profile_sha256:hash(profileBytes),actual_request:request,overrides_from_default:overrides,server_url:base});
    stage='preflight';progress('preflight');await get('/ready'); record.server=json(await get('/version'));const api=await get('/openapi.json');record.openapi_sha256=hash(api);record.capabilities=json(await get('/v1/capabilities'));validateServer(record.server,json(api),record.capabilities,request);
    const form=new FormData();form.append('files',new Blob([source],{type:'application/pdf'}),path.basename(input.source)); for(const [k,v] of Object.entries(request)){for(const item of Array.isArray(v)?v:[v])form.append(k,typeof item==='object'?JSON.stringify(item):String(item));}
    await fs.writeFile(path.join(candidate,'conversion-record.json'),stringify({...record,state:'preflight-complete'}));
    stage='submitting';progress('submitting');const submitted=json(await get('/v1/convert/file/async',{method:'POST',body:form}));task=submitted.task_id;if(typeof task!=='string'||!task)throw Error('task_id가 없습니다');record.task_id=task;job.task_id=task;
    await fs.writeFile(path.join(candidate,'conversion-record.json'),stringify({...record,state:'running'}));
    stage='polling';let status;for(;;){status=json(await get('/v1/status/poll/'+encodeURIComponent(task)));record.task_status=status.task_status||status.status;record.task_response=status;record.task=status;validateTaskIdentity(status,task,true);progress(record.task_status);if(!['pending','started'].includes(record.task_status))break;await new Promise(r=>setTimeout(r,1000));}
    if(!['success','partial_success'].includes(record.task_status))throw Error('서버 작업 상태: '+record.task_status);
    stage='result';progress('result');const body=await get('/v1/result/'+encodeURIComponent(task));const result=parseServerJson(body),doc=result.document?.json_content;record.result={status:result.status,errors:result.errors,body_sha256:hash(body),processing_time:result.processing_time,timings:result.timings,confidence:result.confidence};if(!doc||typeof doc!=='object')throw Error('DoclingDocument가 없습니다');
    validateTaskIdentity(result,task);validateDocument(doc,record.source);
    const data=stringify(doc);await fs.writeFile(path.join(candidate,'document.json'),data);
    record.document={sha256:hash(data),schema:doc.schema_name,version:doc.version,page_count:Object.keys(doc.pages||{}).length};
    record.validation=validateResult(doc,input.pages);
    record.complete=record.task_status==='success'&&result.status==='success'&&Array.isArray(result.errors)&&result.errors.length===0&&record.validation.all_pages&&record.validation.offline_images;
    record.state=record.complete?'complete':'incomplete';if(!record.complete)record.error=JSON.stringify({task_status:record.task_status,result_status:result.status,errors:result.errors,validation:record.validation});
   }catch(e){record.state=stage==='submitting'&&!task?'uncertain':controller.signal.aborted?'stopped':'failed';record.error=String(e.message||e);record.stage=stage;}
   record.completed_at=new Date().toISOString();record.elapsed_ms=Date.now()-start;await fs.writeFile(path.join(candidate,'conversion-record.json'),stringify(record));
   if(record.complete){const dest=path.join(parent,path.parse(input.source).name+'-'+crypto.randomUUID());await fs.rename(candidate,dest);return {state:record.state,path:dest,stage,validation:record.validation,task_id:task};}return {state:record.state,path:candidate,error:record.error,stage,task_id:task,validation:record.validation};
 }
 return {operations:{
  async defaults(){const p=json(await fs.readFile(path.join(dir,'pdf-en-v2.json')));const o=json(await fs.readFile(path.join(dir,'options.json')));return {request:p.request,options:o.options,server:context.settings.serverUrl||'http://127.0.0.1:5001'}},
  async convert(input){
   if(disposed)throw Error('서비스 종료 중');
   const items=input.files||[input],accepted=[];
   for(const item of items){
    const id=crypto.randomUUID(),job={id,state:'queued',started_at:new Date().toISOString()};jobs.set(id,job);accepted.push(id);
    tail=tail.then(async()=>{if(job.state==='stopped'||disposed)return;if(blocked){job.state='blocked';job.error='이전 작업의 서버 종료 여부가 불확실합니다. 자동 제출하지 않습니다.';return;}try{job.result=await runConversion({...input,...item},job);job.state=job.result.state;if(['uncertain','stopped','failed'].includes(job.state)&&!['initial','preflight'].includes(job.result.stage))blocked=true;}catch(e){job.state='failed';job.error=String(e.message||e)}finally{job.elapsed_ms=Date.now()-Date.parse(job.started_at);controllers.delete(id)}});
   }
   return {job_ids:accepted,state:'queued'};
  },
  async job(input={}){return {jobs:[...jobs.values()].filter(j=>!input.job_id||j.id===input.job_id).map(j=>({...j,elapsed_ms:j.elapsed_ms??Date.now()-Date.parse(j.started_at)}))}},
  async stop(input){const job=jobs.get(input.job_id);if(job){if(job.state==='queued')job.state='stopped';controllers.get(job.id)?.abort();}return {message:'로컬 기다리기만 멈춥니다. 서버 작업은 계속될 수 있습니다.'}},
  async recover(input){
   const record=json(await fs.readFile(path.join(input.candidate,'conversion-record.json')));
   if(!record.task_id)return {state:record.state, message:'작업 ID가 없어 서버 처리 여부를 확인할 수 없습니다. 재제출하지 마세요.'};
   const url=(record.server_url||'').replace(/\/$/,'')+'/v1/status/poll/'+encodeURIComponent(record.task_id);
   const res=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!res.ok)throw Error('상태 조회 HTTP '+res.status);
   const serverStatus=await res.json();validateTaskIdentity(serverStatus,record.task_id,true);
   return {candidate:input.candidate,record_state:record.state,task_id:record.task_id,server_status:serverStatus};
  }
 },status:()=>({available:true,message:'준비됨'}),dispose(){disposed=true;for(const c of controllers.values())c.abort()}};
}

