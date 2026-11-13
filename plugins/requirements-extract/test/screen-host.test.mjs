import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readdirSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {activate} from '../host.mjs';
import {screenService} from '../src/screen-service.mjs';
test('profile catalog separates selectable valid policy from invalid or unrelated files',()=>{
 const root=mkdtempSync(join(tmpdir(),'requirements-profile-unit-'));mkdirSync(join(root,'profiles'));
 writeFileSync(join(root,'profiles','valid.json'),readFileSync(new URL('../profiles/default.json',import.meta.url)));writeFileSync(join(root,'profiles','invalid.json'),'{}');writeFileSync(join(root,'profiles','ignore.txt'),'{}');
 const list=screenService({root,launcher:{bin:process.execPath,args:[]}}).profiles().profiles;
 assert.equal(list.length,3);assert.equal(list.find(p=>p.path==='').available,true);assert.equal(list.find(p=>p.name==='valid.json').available,true);assert.equal(list.find(p=>p.name==='invalid.json').available,false);
});
test('public request acceptance, failed result, replay conflict and missing completion never imply success',async()=>{
 const root=mkdtempSync(join(tmpdir(),'requirements-host-unit-')),plugin=activate({settings:{workspaceDirectory:root},cli:{bin:process.execPath,args:[]},isDirectory:existsSync});
 assert.equal((await plugin.status()).available,true);const id=randomUUID(),input={requestId:id,action:'submit',payload:{jobId:randomUUID()}};
 const accepted=plugin.operations.start(input);assert.equal(accepted.state,'queued');let row;
 for(let i=0;i<100;i++){row=plugin.operations.job({id});if(!['queued','running'].includes(row.state))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(row.state,'failed');assert.equal(plugin.operations.start(input).state,'failed');assert.throws(()=>plugin.operations.start({...input,action:'stop'}));
 const missing=randomUUID();assert.equal(plugin.operations.job({id:missing}).state,'not_found');
 writeFileSync(join(root,'.requirements-extract-requests',missing+'.json'),JSON.stringify({id:missing,state:'running',message:'processing',requestHash:'test'}));assert.equal(plugin.operations.job({id:missing}).state,'failed');
 assert.equal(readdirSync(join(root,'.requirements-extract-requests')).filter(n=>n.endsWith('.done')).length,1);await plugin.dispose();
});
test('Host official CLI is required with no installed/PATH fallback',async()=>{
 const root=mkdtempSync(join(tmpdir(),'requirements-host-unit-')),p=activate({settings:{workspaceDirectory:root},isDirectory:existsSync});assert.equal((await p.status()).available,false);assert.throws(()=>p.operations.start({requestId:randomUUID(),action:'prepare',payload:{}}));await p.dispose();
});
test('resume catalog is deduplicated by processing, and task receipts cannot replace review counts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'requirements-host-unit-')),p=activate({settings:{workspaceDirectory:root},cli:{bin:process.execPath,args:[]},isDirectory:existsSync}),jobId=randomUUID();
 const dir=join(root,'.requirements-extract-requests');mkdirSync(dir);
 for(const [i,result] of [{jobId,document:'sample.md',report:{counts:{checkedSections:1,sections:2}}},{jobId,document:'sample.md',report:{counts:{checkedSections:2,sections:2}}},{jobId,name:'assistant-task.json'}].entries()){
  const id=randomUUID(),path=join(dir,id+'.json');writeFileSync(path,JSON.stringify({id,state:'queued'}));writeFileSync(path+'.done',JSON.stringify({id,state:'succeeded',result}));
 }
 const rows=p.operations.jobs().jobs;assert.equal(rows.length,1);assert.equal(rows[0].jobId,jobId);assert.equal(rows[0].checkedSections,2);await p.dispose();
});
