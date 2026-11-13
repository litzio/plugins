// Run the same resealed mutations through two independent readers; no producer imports.
import {resolve,join} from 'node:path';
import {cpSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mutations} from '../test/review-mutations.mjs';
import {loadProvenance} from '../src/provenance.mjs';
const [producer,cli,original,scratch]=process.argv.slice(2).map(p=>resolve(p)),hash=b=>createHash('sha256').update(b).digest('hex');
const json=(root,name)=>JSON.parse(readFileSync(join(root,name))),save=(root,name,v)=>writeFileSync(join(root,name),JSON.stringify(v));
const run=(entry,args)=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
mkdirSync(scratch);
assert.equal(run(producer,[original]).status,0,'Producer must accept control');
const inspect=root=>{const r=run(cli,['inspect',join(root,'document.md'),'--format','json']);assert.equal(r.status,0);return JSON.parse(r.stdout);};
loadProvenance(original,{inspect:()=>inspect(original)});
for(const [index,[name,mutate]] of Object.entries(mutations).entries()) {
 const root=join(scratch,String(index));cpSync(original,root,{recursive:true});const r=json(root,'review/review-targets.json');mutate(r);save(root,'review/review-targets.json',r);
 const marker=json(root,'review/review-complete.json');marker.reportSha256=hash(readFileSync(join(root,'review/review-targets.json')));save(root,'review/review-complete.json',marker);
 const c=json(root,'complete.json');for(const f of c.files)f.sha256=hash(readFileSync(join(root,f.relativePath)));save(root,'complete.json',c);
 assert.notEqual(run(producer,[root]).status,0,'Producer accepted '+name);
 assert.throws(()=>loadProvenance(root,{inspect:()=>inspect(root)}),'Consumer accepted '+name);
}
console.log(JSON.stringify({ok:true,control:'both accept',mutations:Object.keys(mutations).length,divergentAcceptances:0}));
