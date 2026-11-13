// Plugin-owned immutable, hash-chained checkpoints. No implicit cleanup/recovery writes.
import { mkdirSync, readdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, unlinkSync, linkSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonical, sha256 } from './model.mjs';
import { reject } from './workflow.mjs';
function safeDirectory(path) {
  const root=resolve(path); let current=parse(root).root;
  for(const part of root.slice(current.length).split(/[\\/]/).filter(Boolean)) { current=join(current,part); const s=lstatSync(current); if(!s.isDirectory() || s.isSymbolicLink()) reject('ledger-path','원장 경로는 링크 없는 디렉터리여야 합니다'); }
  if(realpathSync(root).toLowerCase()!==root.toLowerCase()) reject('ledger-path','원장 경로가 링크입니다'); return root;
}
function json(path) {
  const stat=lstatSync(path); if(!stat.isFile() || stat.isSymbolicLink()) reject('ledger-path','원장 파일은 링크 없는 일반 파일이어야 합니다');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path)));
}
// Content references are tagged; user objects/arrays cannot masquerade as refs.
// Dictionaries are invocation-local, never a cache of a previous integrity verdict.
const storage=Symbol('verified ledger storage');
const owner='requirements-extract/candidates/2';
function encode(value,known,added) {
  if(value===null||typeof value!=='object') return value;
  const node=Array.isArray(value)?[1,value.map(v=>encode(v,known,added))]:[2,Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v,known,added)])];
  const bytes=canonical(node);
  if(bytes.length<512) return node;
  const key=sha256(bytes);
  if(!known.has(key)){known.set(key,node);added.push([key,node]);}
  return [3,key];
}
function decode(node,objects) {
  if(node===null||typeof node!=='object') return node;
  if(node[0]===3) return decode(objects.get(node[1]),objects);
  if(node[0]===1) return node[1].map(v=>decode(v,objects));
  if(node[0]===2) return Object.fromEntries(node[1].map(([k,v])=>[k,decode(v,objects)]));
  throw new Error('checkpoint-node');
}
function checkNode(node,objects) {
  if(node===null||typeof node!=='object') return;
  if(!Array.isArray(node)||node.length!==2) throw new Error('checkpoint-node');
  if(node[0]===3) {if(!objects.has(node[1]))throw new Error('checkpoint-reference');return;}
  if(node[0]===1&&Array.isArray(node[1])) {node[1].forEach(n=>checkNode(n,objects));return;}
  if(node[0]===2&&Array.isArray(node[1])) {const keys=new Set();for(const pair of node[1]){if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||keys.has(pair[0]))throw new Error('checkpoint-object');keys.add(pair[0]);checkNode(pair[1],objects);}return;}
  throw new Error('checkpoint-node');
}
// Mutable keyed collections use individual slots so an appended response does
// not rewrite the accumulated response map. Other fields are content references.
const maps=new Set(['responses','ids','tickets']);
function slots(state) {
  const result=new Map();
  for(const [field,value] of Object.entries(state)) {
    if(value===undefined)continue;
    if(maps.has(field)) {result.set(canonical([field]),{});for(const [key,v] of Object.entries(value))result.set(canonical([field,key]),v);}
    else result.set(canonical([field]),value);
  }
  return result;
}
function materialize(encoded,objects) {
  const state={};
  for(const [key,node] of encoded){const path=JSON.parse(key),v=decode(node,objects);if(path.length===1)state[path[0]]=v;else {state[path[0]]??={};Object.defineProperty(state[path[0]],path[1],{value:v,enumerable:true,writable:true,configurable:true});}}
  return state;
}
export function loadLedger(directory) {
  const root=safeDirectory(directory), marker=json(join(root,'owner.json'));
  if(marker.owner==='requirements-extract/candidates/1') reject('ledger-version','이전 원장 형식입니다. 새 작업 폴더에서 후보 준비부터 다시 시작하세요');
  if(marker.owner!==owner) reject('ledger-owner','이 플러그인의 작업 원장이 아닙니다');
  const names=readdirSync(root).filter(n=>/^\d{8}\.json$/.test(n)).sort(); let previous=null,last=null,encoded=new Map();
  const objects=new Map(),diagnostics=[];
  for(const [index,name] of names.entries()) {
    try {
      const entry=json(join(root,name)),{digest,...payload}=entry;
      if(payload.sequence!==index+1||payload.parent!==previous||payload.jobId!==marker.jobId||digest!==sha256(canonical(payload)))throw new Error('checkpoint-chain');
      for(const [key,node] of payload.objects){if(objects.has(key)||key!==sha256(canonical(node)))throw new Error('checkpoint-object-digest');checkNode(node,objects);objects.set(key,node);}
      const next=new Map(encoded);
      for(const [key,node] of payload.changes){const path=JSON.parse(key);if(!Array.isArray(path)||![1,2].includes(path.length)||path.some(k=>typeof k!=='string')||(path.length===2&&!maps.has(path[0])))throw new Error('checkpoint-slot');if(node===null)next.delete(key);else {checkNode(node[0],objects);next.set(key,node[0]);}}
      if(decode(next.get(canonical(['jobId'])),objects)!==marker.jobId)throw new Error('checkpoint-job');
      encoded=next;previous=digest;last=entry;
    } catch {diagnostics.push({file:name,location:[],code:'checkpoint-corrupt',severity:'error',message:'잘리거나 해시 사슬이 깨진 checkpoint. 마지막 유효 상태를 읽기 전용으로 복구했습니다'});break;}
  }
  if(!last) reject('checkpoint-missing','유효한 checkpoint가 없습니다');
  const state=materialize(encoded,objects);
  if(state.jobId!==marker.jobId)reject('checkpoint-corrupt','원장 작업 식별자가 다릅니다');
  return {state,head:last.digest,sequence:last.sequence,diagnostics,[storage]:{encoded,objects}};
}
function publish(root,state,parent,sequence,current) {
  const known=new Map(current?.[storage].objects),old=current?.[storage].encoded??new Map(),added=[],encoded=new Map();
  const previousValues=current?slots(current.state):new Map();
  // Compare against the state verified from disk in THIS save, not a prior call.
  // Equal immutable content needs no serialization; changed content is re-encoded.
  for(const [key,value] of slots(state)) encoded.set(key,old.has(key)&&isDeepStrictEqual(value,previousValues.get(key))?old.get(key):encode(value,known,added));
  const changes=[];
  for(const [key,value] of encoded)if(canonical(old.get(key))!==canonical(value))changes.push([key,[value]]);
  for(const key of old.keys())if(!encoded.has(key))changes.push([key,null]);
  const payload={sequence,parent,jobId:state.jobId,objects:added,changes},entry={...payload,digest:sha256(canonical(payload))};
  const temp=join(root,'.pending-'+randomUUID()),target=join(root,String(sequence).padStart(8,'0')+'.json');
  const fd=openSync(temp,'wx');try{writeFileSync(fd,canonical(entry));fsyncSync(fd);}finally{closeSync(fd);}
  linkSync(temp,target);unlinkSync(temp);
  return {state,head:entry.digest,sequence,diagnostics:[]};
}
export function createLedger(directory,state) {
  const absolute=resolve(directory); safeDirectory(resolve(absolute,'..'));
  mkdirSync(absolute); const root=safeDirectory(absolute);
  writeFileSync(join(root,'owner.json'),canonical({owner,jobId:state.jobId}),{flag:'wx'});
  return publish(root,state,null,1);
}
export function saveLedger(directory,state,expectedHead) {
  const root=safeDirectory(directory), lock=join(root,'.writer-lock'); let fd;
  try {fd=openSync(lock,'wx');} catch {reject('ledger-locked','동시 쓰기 또는 중단된 쓰기 잠금이 있습니다. 자동으로 잠금을 지우지 않습니다');}
  try {
    const current=loadLedger(root);
    if(current.diagnostics.length) reject('checkpoint-corrupt','손상 이력을 보존한 채 읽기만 가능합니다. 새 작업으로 재개하세요');
    if(current.head!==expectedHead || current.state.jobId!==state.jobId) reject('ledger-conflict','다른 응답이 먼저 저장됐습니다. 최신 묶음을 읽으세요');
    return publish(root,state,current.head,current.sequence+1,current);
  } finally {closeSync(fd);unlinkSync(lock);}
}
