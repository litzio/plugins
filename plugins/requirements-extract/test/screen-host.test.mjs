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
