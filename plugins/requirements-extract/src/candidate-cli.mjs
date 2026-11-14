import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync, lstatSync, constants } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceCli } from './cli.mjs';
import { loadProvenance } from './provenance.mjs';
import { prepare, refresh, invalidate, batch, previewTokens, submit, supplement, reopen, report, proposal, reject, fingerprints } from './workflow.mjs';
import { selectionSchema } from './selection-schema.mjs';
import { loadLedger, createLedger, saveLedger } from './ledger.mjs';
import { normalizeEvidence } from './protected.mjs';
import { canonical, sha256, semantic } from './model.mjs';
const json = path => JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path)));
// Configuration is local runtime input, never authority for a handoff's bytes/revision.
export function configuration(path) {
  const base=dirname(resolve(path)), c=json(path), at=p=>resolve(base,p);
  const profile=json(c.profile ? at(c.profile) : fileURLToPath(new URL('../profiles/default.json',import.meta.url)));
  if(!Array.isArray(c.inputs) || !c.inputs.length || typeof c.cliEntry!=='string' || typeof c.job!=='string') reject('configuration','cliEntry, job, inputs가 필요합니다');
  return {...c,profile,job:at(c.job),inputs:c.inputs.map(i=>({...i,root:at(i.root)})),cliEntry:at(c.cliEntry),outputRoot:c.outputRoot?at(c.outputRoot):null};
}
function readInputs(c) {
  return c.inputs.map(i=>{
    const cli=sourceCli({entry:c.cliEntry,root:i.root});
    const bundle=loadProvenance(i.root,{inspect:file=>cli.run('inspect',file,'--format','json')});
    return {key:i.key,bundle};
  });
}
function fresh(c) {
  const current=loadLedger(c.job);
  if(current.diagnostics.length) reject('checkpoint-corrupt','손상된 원장에서는 변경하지 않습니다');
  let inputs;
  try { inputs=readInputs(c); }
  catch(e) { saveLedger(c.job,invalidate(current.state,e.diagnostics??[{code:'input-read',message:'입력을 읽을 수 없습니다'}]),current.head); throw e; }
  const state=refresh(current.state,inputs,c.profile);
  if(state.epoch!==current.state.epoch) return {...saveLedger(c.job,state,current.head),inputs};
  return {...current,inputs};
}
export function execute(args) {
  const [command,path,arg]=args;
  if(command==='schema') return selectionSchema(path?json(path):json(fileURLToPath(new URL('../profiles/default.json',import.meta.url))));
  if(command==='report') {const j=loadLedger(path); return {...report(j.state),ledgerDiagnostics:j.diagnostics,head:j.head};}
  if(command==='tokens') return previewTokens(loadLedger(path).state,json(arg));
  if(command==='batch') {const j=loadLedger(path); if(j.diagnostics.length) reject('checkpoint-corrupt','손상 원장의 묶음은 제출할 수 없습니다'); return batch(j.state,arg);}
  const c=configuration(path);
  if(command==='prepare') return {head:createLedger(c.job,prepare(readInputs(c),c.profile)).head,...report(loadLedger(c.job).state)};
  const current=fresh(c), job=current.state;
  let next;
  if(command==='resume') return {head:current.head,...report(job)};
  if(command==='submit') next=submit(job,json(arg));
  else if(command==='reopen') next=reopen(job,arg);
  else if(command==='supplement') {const r=json(arg);next=supplement(job,r.sectionKey,r.unitKeys);}
  else if(command==='propose') {
    if(!c.outputRoot || !/^[a-zA-Z0-9_-]+$/.test(arg??'')) reject('output-path','outputRoot와 새 제안 폴더 이름(영문/숫자/_/-)이 필요합니다');
    const set=proposal(job), cli=sourceCli({entry:c.cliEntry,root:c.outputRoot});
    const output=cli.scoped(arg); if(existsSync(output)) reject('output-exists','기존 결과는 덮어쓰지 않습니다');
    mkdirSync(output);
    // Copy only complete-marker listed, already verified files into a new proposal bundle.
    for(const input of current.inputs) {
      const from=c.inputs.find(i=>i.key===input.key).root;
      const target=join(output,input.key);mkdirSync(target);
      for(const f of input.bundle.complete.files) {
        const destination=join(target,f.relativePath);mkdirSync(dirname(destination),{recursive:true});
        copyFileSync(join(from,f.relativePath),destination,constants.COPYFILE_EXCL);
        if(sha256(readFileSync(destination)).slice(7)!==f.sha256) reject('source-changed','복사하는 동안 출처 bytes가 변경됐습니다');
      }
      copyFileSync(join(from,'complete.json'),join(target,'complete.json'),constants.COPYFILE_EXCL);
      if(input.bundle.history||['1.2.0','1.3.0'].includes(input.bundle.complete.schemaVersion)) {
        const ledger=join(from,'correction-ledger.json'),stat=lstatSync(ledger);
        if(!stat.isFile()||stat.isSymbolicLink()) reject('source-ledger','일반 교정 원장 파일이 필요합니다');
        copyFileSync(ledger,join(target,'correction-ledger.json'),constants.COPYFILE_EXCL);
        const reviewMarker=join(from,'review/review-complete.json'),reviewStat=lstatSync(reviewMarker);
        if(!reviewStat.isFile()||reviewStat.isSymbolicLink()) reject('source-review-marker','일반 검수 표지 파일이 필요합니다');
        copyFileSync(reviewMarker,join(target,'review/review-complete.json'),constants.COPYFILE_EXCL);
      }
      // Recheck marker and all bytes/revision after copying; no stale signed snapshot assumptions.
      const copiedCli=sourceCli({entry:c.cliEntry,root:target});
      loadProvenance(target,{inspect:file=>copiedCli.run('inspect',file,'--format','json')});
    }
    const outputCli=sourceCli({entry:c.cliEntry,root:output});outputCli.create(set,'proposal.md');
    const read=outputCli.read('proposal.md');
    const meaning=r=>({ ...semantic(r), body:normalizeEvidence(r.body),footnotes:normalizeEvidence(r.footnotes??[]),status:r.status,confirmedDigest:r.confirmedDigest });
    if(canonical(read.requirements.map(meaning))!==canonical(set.requirements.map(meaning)) || read.diagnostics.some(d=>d.severity==='error')) reject('proposal-roundtrip','생성 문서 재읽기가 일치하지 않습니다');
    const again=readInputs(c),f=fingerprints(again,c.profile);
    if(f.inputDigest!==job.inputDigest) reject('input-changed','생성 중 입력이 바뀌었습니다. 완료 결과로 게시하지 않습니다');
    const receipt={schemaVersion:1,protectionVersion:job.protectionVersion,jobId:job.jobId,epoch:job.epoch,inputDigest:job.inputDigest,policyDigest:job.policyDigest,proposalDigest:sha256(canonical(set)),file:'proposal.md',reviewState:'draft',report:report(job)};
    // CAS ledger first; a crashed/contended writer never publishes a success marker.
    next=structuredClone(job);next.proposals.push({...receipt,folder:arg});saveLedger(c.job,next,current.head);
    writeFileSync(join(output,'proposal-complete.json'),canonical(receipt),{flag:'wx'});
    return {folder:arg,...receipt};
  } else reject('command','명령: prepare/resume/batch/tokens/schema/submit/reopen/supplement/report/propose');
  const saved=saveLedger(c.job,next,current.head);return {head:saved.head,...report(next)};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.stdout.write(JSON.stringify({ok:true,result:execute(process.argv.slice(2))})+'\n');}
  catch(e) {process.stdout.write(JSON.stringify({ok:false,diagnostics:e.diagnostics??[{file:'candidate-job',location:[],code:'processing-error',severity:'error',message:'설정·파일·공개 CLI 처리를 완료할 수 없습니다'}]})+'\n');process.exitCode=1;}
}
