// Deterministic public LSR processing benchmark. No AI, conversion or producer imports.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {loadProvenance} from '../src/provenance.mjs';
import {sourceCli} from '../src/cli.mjs';
import {prepare,submit,batch,report,proposal,refresh} from '../src/workflow.mjs';
import {createLedger,loadLedger,saveLedger} from '../src/ledger.mjs';
import {fake} from '../test/candidate-fixture.mjs';
import {canonical,sha256} from '../src/model.mjs';
import {authoring} from '../src/document.mjs';
import {exportReqif} from '../src/reqif.mjs';
const [entry,workspace,destination,factor='1']=process.argv.slice(2),root=resolve(workspace),out=resolve(destination),n=Number(factor);
mkdirSync(out,{recursive:true});
const cli=sourceCli({entry:resolve(entry),root}),m=JSON.parse(readFileSync(join(root,'reviewed-flow.json'))),times={};
function time(name,fn){const start=performance.now(),v=fn(),ms=performance.now()-start;(times[name]??=[]).push(ms);writeFileSync(join(out,'progress.json'),JSON.stringify({stage:name,calls:times[name].length,lastMs:ms,elapsedMs:performance.now()-started,times}));return v;}
const started=performance.now();
const bundle=time('handoff',()=>loadProvenance(join(root,m.handoff),{inspect:p=>cli.run('inspect',p,'--format','json'),requireReviewed:true}));
// Synthetic scale test only: repeat the verified read model, remapping source IDs
// per copy to prevent intentional cross-document candidate deduplication. This is
// NOT a newly verified 130-page completion bundle; the on-disk handoff is read-only.
const inputs=Array.from({length:n},(_,i)=>({key:'lsr'+i,bundle:n===1?bundle:JSON.parse(JSON.stringify(bundle,(key,value)=>key==='sourceId'&&typeof value==='string'?sha256('synthetic-copy/'+i+'/'+value).slice(7):key==='sourceIds'&&Array.isArray(value)?value.map(v=>sha256('synthetic-copy/'+i+'/'+v).slice(7)):value))})),profile=JSON.parse(readFileSync(new URL('../profiles/default.json',import.meta.url)));
let state=time('collect',()=>prepare(inputs,profile)),ledger=time('create',()=>createLedger(join(out,'ledger'),state));
for(const section of state.corpus.sections){const response=fake(state,section,{adopt:false}),chosen=fake(state,{...section,candidateKeys:section.candidateKeys.filter(k=>state.corpus.candidates[k].text==='0.12 s')});for(const d of chosen.decisions.filter(d=>state.corpus.candidates[d.candidateKey].text==='0.12 s'))response.decisions[response.decisions.findIndex(x=>x.candidateKey===d.candidateKey)]=d;
 time('submit',()=>{state=submit(state,response);ledger=saveLedger(join(out,'ledger'),state,ledger.head);});}
for(let i=0;i<3;i++){
 state=time('reload',()=>loadLedger(join(out,'ledger')).state);
 time('refresh',()=>refresh(state,inputs,profile));time('groups',()=>report(state));time('proposal',()=>proposal(state));
}
const set=proposal(state);time('document',()=>writeFileSync(join(out,'authoring.json'),canonical(authoring(set))));
const xml=time('export',()=>exportReqif([set],{testOnly:true,now:'2026-11-14T00:00:00.000Z'}).xml);writeFileSync(join(out,'output.reqif'),xml);
writeFileSync(join(out,'state.json'),canonical(state));
const files=readdirSync(join(out,'ledger')).map(file=>({file,bytes:statSync(join(out,'ledger',file)).size}));
const result={factor:n,pages:13*n,sections:state.corpus.sections.length,candidates:Object.keys(state.corpus.candidates).length,decisions:report(state).counts.decisions,requirements:set.requirements.length,stateBytes:Buffer.byteLength(canonical(state)),ledgerBytes:files.reduce((a,f)=>a+f.bytes,0),maxCheckpointBytes:Math.max(...files.map(f=>f.bytes)),files:files.length,times:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,{calls:v.length,totalMs:v.reduce((a,b)=>a+b,0),meanMs:v.reduce((a,b)=>a+b,0)/v.length,maxMs:Math.max(...v)}])),outputDigests:{document:sha256(canonical(authoring(set))),xml:sha256(xml)}};
writeFileSync(join(out,'measurement.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
