// Fake judgments only, through the same public CLI operations used by the skill.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {loadLedger} from '../src/ledger.mjs';
import {fake} from '../test/candidate-fixture.mjs';
const [entry,workspace,host,jobId]=process.argv.slice(2),file=join(resolve(workspace),'validation-operation.json');
function call(op,input) {writeFileSync(file,JSON.stringify(input));const r=spawnSync(process.execPath,[resolve(entry),'operation','invoke','local.requirements-extract.'+op,'--input',file,'--host',host,'--json'],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout).result;}
async function wait(row) {let r=row;while(['queued','running'].includes(r.state)){await new Promise(resolve=>setTimeout(resolve,200));r=call('job',{id:r.id});}assert.equal(r.state,'succeeded',JSON.stringify(r));return r.result;}
const task=await wait(call('start',{requestId:randomUUID(),action:'task',payload:{jobId}}));assert.equal(JSON.parse(readFileSync(task.file)).jobId,jobId);
const schema=await wait(call('inspect',{requestId:randomUUID(),method:'schema',payload:{jobId}}));assert.ok(schema.selection??schema.type);
let state=loadLedger(join(resolve(workspace),'.requirements-extract',jobId,'ledger')).state;
for(const section of state.corpus.sections) {
 if(state.responses[section.key])continue; // Reconcile the already recorded decision; never replay an uncertain write.
 await wait(call('inspect',{requestId:randomUUID(),method:'batch',payload:{jobId,sectionKey:section.key}}));
 await wait(call('start',{requestId:randomUUID(),action:'submit',payload:{jobId,response:fake(state,section)}}));
 state=loadLedger(join(resolve(workspace),'.requirements-extract',jobId,'ledger')).state;
}
const summary=await wait(call('inspect',{requestId:randomUUID(),method:'summary',payload:{jobId}}));assert.equal(summary.requirements.length,1);assert.ok(summary.planDigest);assert.equal(Object.keys(summary.confirmations).length,0);
writeFileSync(join(resolve(workspace),'validation-summary.json'),JSON.stringify(summary));
console.log(JSON.stringify({ok:true,sections:summary.sections.length,candidates:summary.candidates.length,requirements:summary.requirements.length,quality:'deterministic fake decisions; no AI',jobId}));
