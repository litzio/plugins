import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceCli} from './cli.mjs';
import {createLedger,loadLedger,saveLedger} from './ledger.mjs';
import {prepareLinks,refreshLinks,linkBatch,submitLinks,reopenLinks,linkReport,classifyGap,linkProposal,linkSchema,gapSchema} from './upstream.mjs';
import {canonical,semantic} from './model.mjs';
import {normalizeEvidence} from './protected.mjs';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
export function executeLinks([command,path,arg]) {
 if(command==='schema')return {link:linkSchema,gap:gapSchema};
 const base=dirname(resolve(path)),c=json(path),at=p=>resolve(base,p),entry=at(c.cliEntry),job=at(c.job),profile=json(c.profile?at(c.profile):fileURLToPath(new URL('../profiles/default.json',import.meta.url)));
 const read=items=>items.map(i=>{const cli=sourceCli({entry,root:at(i.root)});return cli.read(i.file);});
 const upper=read(c.upper),lower=read(c.lower);
 if(command==='prepare')return createLedger(job,prepareLinks(upper,lower,profile));
 let current=loadLedger(job);if(current.diagnostics.length||current.state.kind!=='upstream-links/1')throw new Error('invalid-link-ledger');
 const fresh=refreshLinks(current.state,upper,lower,profile);if(fresh.inputDigest!==current.state.inputDigest||fresh.policyDigest!==current.state.policyDigest)current=saveLedger(job,fresh,current.head);
 let next=current.state;
 if(command==='batch')return linkBatch(next,arg,{all:false});
 if(command==='all')return linkBatch(next,arg,{all:true});
 if(command==='report'||command==='resume')return linkReport(next);
 if(command==='submit')next=submitLinks(next,json(at(arg)));
 else if(command==='classify')next=classifyGap(next,json(at(arg)));
 else if(command==='reopen')next=reopenLinks(next,arg);
 else if(command==='propose') {
  if(!/^[a-zA-Z0-9_-]+$/.test(arg??''))throw new Error('new-proposal-name-required');
  const proposal=linkProposal(next),outputs=c.lower.map((i,index)=>({root:at(i.root),file:join(dirname(i.file),arg+'-'+index+'.md'),set:proposal.sets[c.upper.length+index]}));
  for(const o of outputs)if(existsSync(sourceCli({entry,root:o.root}).scoped(o.file)))throw new Error('output-exists');
  for(const o of outputs) {
   const cli=sourceCli({entry,root:o.root});cli.create(o.set,o.file);const actual=cli.read(o.file);
   const meaning=r=>{const s=semantic(r);return {...s,body:normalizeEvidence(r.body),footnotes:normalizeEvidence(r.footnotes??[])};};
   if(actual.diagnostics.some(d=>d.severity==='error')||canonical(actual.requirements.map(meaning))!==canonical(o.set.requirements.map(meaning)))throw new Error('link-proposal-roundtrip');
  }
  const final=prepareLinks(read(c.upper),read(c.lower),profile);
  if(final.inputDigest!==next.inputDigest||final.policyDigest!==next.policyDigest)throw new Error('input-changed');
  saveLedger(job,{...next,proposals:[...(next.proposals??[]),{name:arg,inputDigest:next.inputDigest}]},current.head);
  const marker=join(job,arg+'-complete.json');writeFileSync(marker,canonical({kind:'upstream-link-proposal/1',inputDigest:next.inputDigest,policyDigest:next.policyDigest,files:outputs.map(o=>basename(o.file)),report:proposal.report,reviewState:'draft-only'}),{flag:'wx'});
  return {files:outputs.map(o=>basename(o.file)),report:proposal.report};
 }else throw new Error('unknown-link-command');
 return {head:saveLedger(job,next,current.head).head,...linkReport(next)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{process.stdout.write(JSON.stringify({ok:true,result:executeLinks(process.argv.slice(2))})+'\n');}
 catch(error){process.stdout.write(JSON.stringify({ok:false,diagnostics:error.diagnostics??[{code:'link-processing-incomplete',severity:'error',message:'공식 입력 읽기·판단·새 제안 게시를 완료하지 못했습니다'}]})+'\n');process.exitCode=1;}
}
