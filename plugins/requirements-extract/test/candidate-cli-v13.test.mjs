import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadLedger} from '../src/ledger.mjs';
import {sourceCli} from '../src/cli.mjs';
import {loadProvenance} from '../src/provenance.mjs';
import {fixtureV13,read} from './v13-fixture.mjs';
import {fake} from './candidate-fixture.mjs';

function execute(args){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../src/candidate-cli.mjs',import.meta.url)),...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 const response=JSON.parse(result.stdout);
 if(result.status!==0)throw Object.assign(new Error('file CLI command failed'),{diagnostics:response.diagnostics});
 assert.equal(response.ok,true);return response.result;
}

test('file CLI prepare → submit → propose completes with a sealed v1.3 review marker',()=>{
 const root=mkdtempSync(join(tmpdir(),'requirements-cli-v13-')),input=fixtureV13({machine:true}),entry=join(root,'public-cli-double.mjs'),config=join(root,'config.json'),job=join(root,'job');
 // Deterministic public CLI boundary double, not a Host/semantic-quality test.
 // Supports only the plain blocks emitted by this single regression.
 writeFileSync(entry,`
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
const [command,file]=process.argv.slice(2),args=process.argv.slice(2),json=p=>JSON.parse(readFileSync(p)),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function projection(){
 if(basename(file)==='document.md')return {inspection:json(join(dirname(file),'snapshot.json'))};
 const a=json(file),nodes=[],blocks=[];let index=0;
 for(const input of a.inputs)for(const b of input.blocks){
  const path=[++index];
  if(b.kind==='table'){
   nodes.push({path,type:'table'});
   const rows=b.rows.map((row,r)=>({cells:row.map((text,c)=>{const cell={path:[index,r,c],text,content:[{kind:'text',text}],header:r===0,editable:true};nodes.push({type:'cell',...cell});return cell;})}));
   blocks.push({block:'table',path,rows});
  }else if(b.kind==='target'){nodes.push({path,type:'target',label:b.label});blocks.push({block:'target',path,label:b.label});}
  else {
   if(!['heading','paragraph'].includes(b.kind))throw new Error('unsupported-boundary-double-block');
   const content=b.content??[{kind:'text',text:b.text??''}],text=content.map(c=>c.text).join(''),value={path,text,content,...(b.kind==='heading'?{level:b.level}:{})};
   nodes.push({type:b.kind,...value});blocks.push({block:b.kind,...value});
  }
 }
 return {inspection:{ok:true,revision:hash(file),title:a.title,nodes},snapshot:{title:a.title,blocks}};
}
let result;
if(command==='create'){writeFileSync(file,JSON.stringify(json(args[args.indexOf('--input')+1]).authoring),{flag:'wx'});result={revision:hash(file)};}
else if(command==='inspect')result=projection().inspection;
else if(command==='compare'){const p=projection();result={receipt:{beforeRevision:p.inspection.revision,afterRevision:p.inspection.revision},before:p.snapshot,after:p.snapshot};}
else if(command==='check')result={ok:true};
else throw new Error('unsupported-boundary-double-command');
process.stdout.write(JSON.stringify(result));
`);
 writeFileSync(config,JSON.stringify({cliEntry:entry,job,outputRoot:root,inputs:[{key:'source',root:input}]}));
 assert.ok(read(input,'complete.json').files.some(f=>f.relativePath==='review/review-complete.json'));
 execute(['prepare',config]);
 let state=loadLedger(job).state;
 const chosen=Object.values(state.corpus.candidates).find(c=>c.kind==='paragraph');assert.ok(chosen);
 for(const section of state.corpus.sections){
  const response=fake(state,section,{adopt:false}),selected=fake(state,{...section,candidateKeys:section.candidateKeys.filter(k=>k===chosen.candidateKey)});
  for(const decision of selected.decisions.filter(d=>d.candidateKey===chosen.candidateKey))response.decisions[response.decisions.findIndex(d=>d.candidateKey===decision.candidateKey)]=decision;
  const submission=join(root,'submission.json');writeFileSync(submission,JSON.stringify(response));execute(['submit',config,submission]);state=loadLedger(job).state;
 }
 const result=execute(['propose',config,'proposal']),output=join(root,'proposal'),cli=sourceCli({entry,root:output});
 assert.equal(result.report.counts.adopted,1);assert.ok(existsSync(join(output,'proposal-complete.json')));
 assert.deepEqual(read(output,'source/review/review-complete.json'),read(input,'review/review-complete.json'));
 assert.equal(loadProvenance(join(output,'source'),{inspect:file=>cli.run('inspect',file,'--format','json'),requireReviewed:true}).reviewState,'reviewed');
 const saved=cli.read('proposal.md');assert.equal(saved.requirements.length,1);assert.ok(!saved.diagnostics.some(d=>d.severity==='error'));
 assert.equal(read(output,'proposal-complete.json').proposalDigest,result.proposalDigest);
 assert.throws(()=>execute(['propose',config,'proposal']),e=>e.diagnostics?.some(d=>d.code==='output-exists'));
});
