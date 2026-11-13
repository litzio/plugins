import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=b=>JSON.parse(b.toString('utf8'));
const stringify=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
export function activate(context) {
 const jobs=new Map();
 async function runConversion(input){
   const start=Date.now(), deadline=start+1800000; let task=null, stage='initial', candidate=null, record={started_at:new Date(start).toISOString()};
   const profileBytes=await fs.readFile(path.join(dir,'pdf-en-v2.json')), profile=json(profileBytes), options=json(await fs.readFile(path.join(dir,'options.json'))).options;
   const request=structuredClone(profile.request); const changes=input.overrides||{};
   for(const [k,v] of Object.entries(changes)){const def=options[k];if(!def||def.fixed) throw Error('고정 또는 알 수 없는 옵션: '+k); if(Array.isArray(def.allowed)&&!def.allowed.some(x=>JSON.stringify(x)===JSON.stringify(v)))throw Error('허용되지 않는 값: '+k);request[k]=v;}
   const h=request.pdf_heading_hierarchy_options, hd=options.pdf_heading_hierarchy_options.allowed;
   if(!h||Object.keys(h).sort().join()!=Object.keys(options.pdf_heading_hierarchy_options.default).sort().join()||hd.boolean_keys.some(k=>typeof h[k]!=='boolean')||!Number.isInteger(h.max_level)||h.max_level<1||h.max_level>6||['style_size_tolerance','bookmark_match_threshold'].some(k=>typeof h[k]!=='number'||h[k]<0||h[k]>1))throw Error('제목 옵션이 올바르지 않습니다');
   if(request.force_ocr&&!request.do_ocr)throw Error('강제 OCR에는 OCR이 필요합니다');
   if(!request.table_structure_preset.endsWith('_'+request.table_mode))throw Error('표 모델과 모드가 일치해야 합니다');
   if(!Number.isInteger(input.pages)||input.pages<1)throw Error('확인한 원본 쪽 수가 필요합니다');
   const source=await fs.readFile(input.source); if(source.subarray(0,5).toString()!=='%PDF-')throw Error('PDF 파일이 아닙니다');
   const parent=path.resolve(input.destination);await fs.mkdir(parent,{recursive:true});candidate=await fs.mkdtemp(path.join(parent,'.docling-candidate-'));await fs.writeFile(path.join(candidate,'source.pdf'),source);
   const base=(context.settings.serverUrl||'http://127.0.0.1:5001').replace(/\/$/,'');
   const get=async (url,init={})=>{const left=deadline-Date.now();if(left<=0)throw Error('전체 시간 초과'); const response=await fetch(base+url,{...init,signal:AbortSignal.timeout(left)});const bytes=Buffer.from(await response.arrayBuffer());if(!response.ok)throw Error('HTTP '+response.status+' '+bytes.toString().slice(0,1000));return bytes};
   const overrides={}; for(const k of Object.keys(request))if(JSON.stringify(request[k])!==JSON.stringify(profile.request[k]))overrides[k]=request[k];
   Object.assign(record,{source:{basename:path.basename(input.source),file:'source.pdf',bytes:source.length,sha256:hash(source),expected_page_count:input.pages},profile,profile_id:profile.profile_id,profile_sha256:hash(Buffer.from(profileBytes.toString('utf8').replace(/\r\n/g,'\n'))),execution_profile_sha256:hash(profileBytes),actual_request:request,overrides_from_default:overrides,server_url:base});
   try {
    stage='preflight';await get('/ready'); record.server=json(await get('/version'));const api=await get('/openapi.json');record.openapi_sha256=hash(api);record.capabilities=json(await get('/v1/capabilities'));
    const form=new FormData();form.append('files',new Blob([source],{type:'application/pdf'}),path.basename(input.source)); for(const [k,v] of Object.entries(request)){for(const item of Array.isArray(v)?v:[v])form.append(k,typeof item==='object'?JSON.stringify(item):String(item));}
    stage='submitting';const submitted=json(await get('/v1/convert/file/async',{method:'POST',body:form}));task=submitted.task_id;if(!task)throw Error('task_id가 없습니다');record.task_id=task;
    await fs.writeFile(path.join(candidate,'conversion-record.json'),stringify({...record,state:'running'}));
    stage='polling';let status;for(;;){status=json(await get('/v1/status/poll/'+encodeURIComponent(task)));record.task_status=status.task_status||status.status;record.task_response=status;if(!['pending','started'].includes(record.task_status))break;await new Promise(r=>setTimeout(r,1000));}
    if(!['success','partial_success'].includes(record.task_status))throw Error('서버 작업 상태: '+record.task_status);
    stage='result';const body=await get('/v1/result/'+encodeURIComponent(task));const result=json(body),doc=result.document?.json_content;record.result={status:result.status,errors:result.errors,body_sha256:hash(body),processing_time:result.processing_time,timings:result.timings,confidence:result.confidence};if(!doc||typeof doc!=='object')throw Error('DoclingDocument가 없습니다');
    const data=stringify(doc);await fs.writeFile(path.join(candidate,'document.json'),data);
    let images=0,bad=[];function scan(x,p){if(!x||typeof x!=='object')return;if(typeof x.uri==='string'){images++;if(!/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(x.uri)||Buffer.from(x.uri.split(',')[1]||'','base64').length===0)bad.push(p);}for(const [k,v] of Object.entries(x))scan(v,p+'/'+k)}scan(doc,'');
    const pages=doc.pages||{}, keys=Object.keys(pages);const allPages=Array.from({length:input.pages},(_,i)=>String(i+1)).every(k=>pages[k]);const pageImages=Object.values(pages).every(p=>typeof p.image?.uri==='string');
    record.document={sha256:hash(data),schema:doc.schema_name,version:doc.version,page_count:keys.length};record.validation={all_pages:allPages&&keys.length===input.pages,offline_images:bad.length===0&&pageImages,images,bad_images:bad};record.validation.image_decode_verified=false; record.validation.note='이미지 URI 형식만 확인했으며 실제 디코딩은 검증하지 않았습니다'; record.complete=false;
    record.state=record.complete?'complete':'incomplete';
   }catch(e){record.state=stage==='submitting'&&!task?'uncertain':'failed';record.error=String(e.message||e);record.stage=stage;}
   record.completed_at=new Date().toISOString();record.elapsed_ms=Date.now()-start;await fs.writeFile(path.join(candidate,'conversion-record.json'),stringify(record));
   if(record.complete){const dest=path.join(parent,path.parse(input.source).name+'-'+crypto.randomUUID());await fs.rename(candidate,dest);return {state:record.state,path:dest,validation:record.validation,task_id:task};}return {state:record.state,path:candidate,error:record.error,stage,task_id:task,validation:record.validation};
 }
 return {operations:{
  async defaults(){const p=json(await fs.readFile(path.join(dir,'pdf-en-v2.json')));const o=json(await fs.readFile(path.join(dir,'options.json')));return {request:p.request,options:o.options,server:context.settings.serverUrl||'http://127.0.0.1:5001'}},
  async convert(input){
   const id=crypto.randomUUID(); jobs.set(id,{state:'starting'});
   setTimeout(()=>{runConversion(input).then(result=>jobs.set(id,{state:'finished',result})).catch(e=>jobs.set(id,{state:'error',error:String(e.message||e)}));},0);
   return {job_id:id,state:'starting'};
  },
  async job(input){return jobs.get(input.job_id)||{state:'unknown',message:'Host가 다시 시작됐거나 작업을 찾지 못했습니다. 후보 폴더의 기록을 확인하고 재제출하지 마세요.'}},
  async recover(input){
   const record=json(await fs.readFile(path.join(input.candidate,'conversion-record.json')));
   if(!record.task_id)return {state:record.state, message:'작업 ID가 없어 서버 처리 여부를 확인할 수 없습니다. 재제출하지 마세요.'};
   const url=(record.server_url||'').replace(/\/$/,'')+'/v1/status/poll/'+encodeURIComponent(record.task_id);
   const res=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!res.ok)throw Error('상태 조회 HTTP '+res.status);
   return {candidate:input.candidate,record_state:record.state,task_id:record.task_id,server_status:await res.json()};
  }
 },status:()=>({available:true,message:'준비됨'}),dispose(){}};
}

