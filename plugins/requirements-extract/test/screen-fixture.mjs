// Official-CLI boundary double for offline tests, never an application launcher.
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {sourceCli} from '../src/cli.mjs';
import {screenService} from '../src/screen-service.mjs';
import {sha256,canonical} from '../src/model.mjs';
import {loadLedger} from '../src/ledger.mjs';
import {fake,withProof} from './candidate-fixture.mjs';
import {outputTokens} from '../src/workflow.mjs';

export async function screenFixture({hold=false,ready=true}={}) {
 const root=mkdtempSync(join(tmpdir(),'requirements-screen-test-')),models=new Map();
 const launcher={bin:process.execPath,args:[]},cli=sourceCli({root,launcher});
 const texts=['The controller shall retain 5 V.','The logger shall retain 8 A.'];
 writeFileSync(join(root,'source.md'),texts.join('\n'));
 const snapshot=()=>({ok:true,revision:sha256(readFileSync(join(root,'source.md'))).slice(7),nodes:texts.map((text,i)=>({type:'paragraph',path:[i+1],text,content:[{kind:'text',text}]}))});
 cli.run=(command,path)=>{
  if(command==='inspect')return relative(root,path)==='source.md'?snapshot():{revision:sha256(readFileSync(path)).slice(7),nodes:[]};
  if(command==='compare'){const s=snapshot();return {receipt:{beforeRevision:s.revision,afterRevision:s.revision},before:{blocks:s.nodes.map(n=>({block:'paragraph',...n}))}};}
  throw new Error('unsupported-test-cli-command');
 };
 cli.create=(set,file)=>{models.set(file,structuredClone(set));writeFileSync(cli.scoped(file),canonical(set),{flag:'wx'});};
 cli.read=file=>({...structuredClone(models.get(file)),file,revision:sha256(readFileSync(cli.scoped(file))).slice(7),diagnostics:[]});
 const service=screenService({root,launcher,cli});let s=await service.action('prepare',{document:'source.md'}),jobId=s.jobId;
 const state=()=>loadLedger(join(root,'.requirements-extract',jobId,'ledger')).state;
 const act=(action,payload={})=>service.action(action,{jobId,reviewRevision:service.summary({jobId}).review.revision,...payload});
 for(const section of state().corpus.sections){const response=fake(state(),section);if(hold){const d=response.decisions[1];d.decision='hold';d.outputs=[];d.reason='Needs independent context review';}await act('submit',{response});}
 if(ready&&!hold){s=await act('links');await act('unlinked',{ids:s.linkRequirements.map(r=>r.id),classification:'independent',reason:'Independent public fixture scope'});}
 async function rejudge() {
  const section=state().corpus.sections[0];await act('reopen',{sectionKey:section.key});
  const current=state(),response=fake(current,section),d=response.decisions[0],c=current.corpus.candidates[d.candidateKey],context=c.contexts.find(v=>v.kind==='after');
  d.contextAssessments.find(v=>v.contextKey===context.key).outcome='apply';
  const o=d.outputs[0];o.contextKeys.push(context.key);o.bodyBlocks.push(...structuredClone(context.bodyBlocks));o.rationale='Additional original context explicitly applied';
  const pool=[...c.tokens,...context.tokens],used=new Set();
  o.protectedTokenMappings=outputTokens(o,current.profile,0,[]).map(t=>{const s=pool.find(v=>!used.has(v.key)&&v.value===t.value&&v.kind===t.kind)??pool.find(v=>v.value===t.value&&v.kind===t.kind);used.add(s.key);return {outputTokenKey:t.key,sourceTokenKey:s.key};});
  await act('submit',{response:withProof(current,response)});s=await act('links');return act('unlinked',{ids:s.linkRequirements.map(r=>r.id),classification:'independent',reason:'Independent public fixture scope'});
 }
 return {root,service,jobId,act,state,rejudge,summary:()=>service.summary({jobId})};
}
