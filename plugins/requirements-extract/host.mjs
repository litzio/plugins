import {Worker} from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sourceCli} from './src/cli.mjs';
import {canonical,sha256} from './src/model.mjs';
export function activate(context) {
 const workers=new Set(),activeIds=new Set();let closing=false;
 const root=context.settings.workspaceDirectory,launcher=context.cli;
 const directory=()=>{if(!launcher||typeof root!=='string'||!isAbsolute(root)||!context.isDirectory(root))throw new Error('작업 폴더와 Host CLI가 필요합니다');const cli=sourceCli({launcher,root}),path=cli.scoped('.requirements-extract-requests');mkdirSync(path,{recursive:true});return path;};
 const idPath=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('잘못된 요청 ID');return join(directory(),id+'.json');};
 const save=(path,value)=>{const done=path+'.done';if(!existsSync(done))writeFileSync(done,canonical(value),{flag:'wx'});};
 const launch=(method,args,id)=>{
  if(closing)throw new Error('플러그인을 종료하고 있습니다');
  const path=idPath(id),requestHash=sha256(canonical({method,args}));if(existsSync(path)){const old=JSON.parse(readFileSync(path));if(old.requestHash!==requestHash)throw new Error('같은 ID의 요청 내용이 다릅니다');return read({id});}
  const payload=args[method==='action'?1:0]??{};
  const row={id,state:'queued',message:'접수됨',requestHash,request:{jobId:payload.jobId,action:method==='action'?args[0]:method,sectionKey:payload.response?.sectionKey,inputDigest:payload.response?.inputDigest}};writeFileSync(path,canonical(row),{flag:'wx'});
  const worker=new Worker(new URL('./src/screen-worker.mjs',import.meta.url),{workerData:{context:{root,launcher},method,args},execArgv:[],stdout:true,stderr:true});workers.add(worker);activeIds.add(id);worker.stdout.on('data',()=>{});worker.stderr.on('data',()=>{});
  let replied=false;
  worker.on('message',value=>{replied=true;save(path,{...row,state:value.ok?'succeeded':'failed',message:value.ok?'처리됨':'확인 필요',...(value.ok?{result:value.result}:{diagnostics:value.diagnostics})});});
  worker.on('error',()=>{if(!replied)save(path,{...row,state:'failed',message:'처리를 완료하지 못했습니다'});});
  worker.on('exit',()=>{workers.delete(worker);activeIds.delete(id);if(!replied)save(path,{...row,state:'failed',message:'중단됨. 원장을 다시 확인하세요'});});return row;
 };
 const read=({id})=>{const p=idPath(id);if(!existsSync(p))return {id,state:'not_found',message:'조회 기록 없음'};if(existsSync(p+'.done'))return JSON.parse(readFileSync(p+'.done'));const row=JSON.parse(readFileSync(p));return activeIds.has(id)?{...row,state:'running',message:'처리 중'}:{...row,state:'failed',message:'이전 실행의 완료 응답이 없습니다. 원장을 다시 확인하세요'};};
 // Every potentially long read is also accepted then polled; no RPC timeout extension.
 return {operations:{
  health:()=>({ok:!!launcher&&typeof root==='string'&&isAbsolute(root)&&context.isDirectory(root),message:launcher?'작업 폴더 확인':'Host CLI 없음'}),
  start:({requestId,action,payload})=>launch('action',[action,payload],requestId),
  inspect:({requestId,method,payload})=>launch(method,[payload],requestId),
  job:input=>read(input),
  jobs:()=>({jobs:readdirSync(directory()).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>{const r=read({id:n.slice(0,-5)});return {id:r.id,state:r.state,message:r.message,jobId:r.result?.jobId??null,document:r.result?.document??'',checkedSections:r.result?.report?.counts.checkedSections??0,sections:r.result?.report?.counts.sections??0,createdAt:lstatSync(join(directory(),n)).birthtimeMs};}).sort((a,b)=>b.createdAt-a.createdAt)}),
 },status:()=>({available:!!launcher&&typeof root==='string'&&isAbsolute(root)&&context.isDirectory(root),message:launcher?'요구사항 작업':'Host CLI 없음'}),async dispose(){closing=true;await Promise.all([...workers].map(w=>new Promise(resolve=>w.once('exit',resolve))));}};
}
