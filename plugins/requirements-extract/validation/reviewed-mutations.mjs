// Mutations of a producer-issued, completed public fixture. No producer imports.
import {cpSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {loadProvenance} from '../src/provenance.mjs';
const [entry,input,output]=process.argv.slice(2),root=resolve(input),out=resolve(output),read=(dir,name)=>JSON.parse(readFileSync(join(dir,name))),write=(dir,name,v)=>writeFileSync(join(dir,name),JSON.stringify(v));
mkdirSync(out);const inspect=file=>{const r=spawnSync(process.execPath,[resolve(entry),'inspect',file,'--format','json'],{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});assert.equal(r.status,0);return JSON.parse(r.stdout);};
assert.equal(loadProvenance(root,{inspect,requireReviewed:true}).eligibleConfirmed,true);
const changes={
 'completion-cleared':l=>l.completion=null,'stopped':l=>l.stopped=true,'pending':l=>l.pending={},'revision':l=>l.revision='a'.repeat(64),
 'missing-page':l=>l.scopes=l.scopes.filter(s=>s.id!=='page:13'),'scope-restart':l=>l.scopes[0].state='검사중','failure':l=>l.scopes[0].state='실패','checkpoint-without-note':l=>delete l.scopes[0].checkpoint.note,
 'human-deferred':l=>l.humanDecisions.at(-1).decision='deferred','human-invalidated':l=>l.humanDecisions.forEach(d=>d.invalidatedAt='later'),
 'expression-withdrawn':l=>l.lossConfirmations.pop(),'expression-deferred':l=>l.lossConfirmations.at(-1).decision='deferred','expression-meaning-changed':l=>l.lossConfirmations.at(-1).decision='meaning-changed','expression-invalidated':l=>l.lossConfirmations.at(-1).invalidatedAt='later','expression-aba-count':l=>l.lossConfirmations.at(-1).changeCount++,
 'stop-resume':l=>{l.stopped=false;l.completion=null;l.scopes.forEach(s=>{s.state='미검사';s.checkpoint=null;});},
};
const results=[];
for(const [name,mutate] of Object.entries(changes)){
 const dir=join(out,name);cpSync(root,dir,{recursive:true});const l=read(dir,'correction-ledger.json');mutate(l);write(dir,'correction-ledger.json',l);
 let rejected=false,reviewed=false;try{reviewed=loadProvenance(dir,{inspect}).eligibleConfirmed;}catch{rejected=true;}assert.equal(reviewed,false,name);assert.throws(()=>loadProvenance(dir,{inspect,requireReviewed:true}),name);results.push({name,rejected,reviewed});
}
for(const name of ['document.md','human-review.json','review/pdf-evidence.json','review/review-targets.json']){
 const dir=join(out,'partial-'+name.replaceAll('/','-'));cpSync(root,dir,{recursive:true});writeFileSync(join(dir,name),Buffer.concat([readFileSync(join(dir,name)),Buffer.from('\nchanged')]));assert.throws(()=>loadProvenance(dir,{inspect}));results.push({name:'partial-'+name,rejected:true,reviewed:false});
}
writeFileSync(join(out,'results.json'),JSON.stringify({baselineReviewed:true,mutations:results},null,2));console.log(JSON.stringify({baselineReviewed:true,mutations:results.length,allRefusedReviewed:true}));
