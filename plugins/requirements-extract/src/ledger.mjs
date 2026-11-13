// Plugin-owned immutable, hash-chained checkpoints. No implicit cleanup/recovery writes.
import { mkdirSync, readdirSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, unlinkSync, linkSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
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
export function loadLedger(directory) {
  const root=safeDirectory(directory), marker=json(join(root,'owner.json'));
  if(marker.owner!=='requirements-extract/candidates/1') reject('ledger-owner','이 플러그인의 작업 원장이 아닙니다');
  const names=readdirSync(root).filter(n=>/^\d{8}\.json$/.test(n)).sort(); let previous=null, last=null;
  const diagnostics=[];
  for(const [index,name] of names.entries()) {
    try {
      const entry=json(join(root,name)), {digest,...payload}=entry;
      if(payload.sequence!==index+1 || payload.parent!==previous || digest!==sha256(canonical(payload)) || payload.state.jobId!==marker.jobId) throw new Error('checkpoint-chain');
      previous=digest; last=entry;
    } catch { diagnostics.push({file:name,location:[],code:'checkpoint-corrupt',severity:'error',message:'잘리거나 해시 사슬이 깨진 checkpoint. 마지막 유효 상태를 읽기 전용으로 복구했습니다'}); break; }
  }
  if(!last) reject('checkpoint-missing','유효한 checkpoint가 없습니다');
  return {state:last.state,head:last.digest,sequence:last.sequence,diagnostics};
}
function publish(root,state,parent,sequence) {
  const payload={sequence,parent,state}, entry={...payload,digest:sha256(canonical(payload))};
  const temp=join(root,'.pending-'+randomUUID()), target=join(root,String(sequence).padStart(8,'0')+'.json');
  const fd=openSync(temp,'wx'); try { writeFileSync(fd,canonical(entry)); fsyncSync(fd); } finally {closeSync(fd);}
  // Hard link publishes a fully written file exclusively; an interrupted pending file has no authority.
  linkSync(temp,target); unlinkSync(temp); return {state,head:entry.digest,sequence,diagnostics:[]};
}
export function createLedger(directory,state) {
  const absolute=resolve(directory); safeDirectory(resolve(absolute,'..'));
  mkdirSync(absolute); const root=safeDirectory(absolute);
  writeFileSync(join(root,'owner.json'),canonical({owner:'requirements-extract/candidates/1',jobId:state.jobId}),{flag:'wx'});
  return publish(root,state,null,1);
}
export function saveLedger(directory,state,expectedHead) {
  const root=safeDirectory(directory), lock=join(root,'.writer-lock'); let fd;
  try {fd=openSync(lock,'wx');} catch {reject('ledger-locked','동시 쓰기 또는 중단된 쓰기 잠금이 있습니다. 자동으로 잠금을 지우지 않습니다');}
  try {
    const current=loadLedger(root);
    if(current.diagnostics.length) reject('checkpoint-corrupt','손상 이력을 보존한 채 읽기만 가능합니다. 새 작업으로 재개하세요');
    if(current.head!==expectedHead || current.state.jobId!==state.jobId) reject('ledger-conflict','다른 응답이 먼저 저장됐습니다. 최신 묶음을 읽으세요');
    return publish(root,state,current.head,current.sequence+1);
  } finally {closeSync(fd);unlinkSync(lock);}
}
