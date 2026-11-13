import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {reopen,submit} from '../src/workflow.mjs';
import {createLedger,saveLedger} from '../src/ledger.mjs';
import {fake} from '../test/candidate-fixture.mjs';
const [baseline,stateFile,outFile]=process.argv.slice(2),oldWorkflow=await import(pathToFileURL(resolve(baseline,'src/workflow.mjs'))),oldLedger=await import(pathToFileURL(resolve(baseline,'src/ledger.mjs'))),original=JSON.parse(readFileSync(stateFile));
const section=original.corpus.sections.find(s=>original.responses[s.key]),state=reopen(original,section.key),response=fake(state,section,{adopt:false}),results={};
for(const [name,workflow,ledger] of [['before',oldWorkflow,oldLedger],['after',{submit},{createLedger,saveLedger}]]){
 const folder=resolve(outFile+'.'+name);mkdirSync(folder);const first=ledger.createLedger(join(folder,'ledger'),state),t=performance.now(),next=workflow.submit(state,response),validated=performance.now();ledger.saveLedger(join(folder,'ledger'),next,first.head);results[name]={validationMs:validated-t,saveMs:performance.now()-validated,totalMs:performance.now()-t};
}
writeFileSync(outFile,JSON.stringify({sameState:true,sections:state.corpus.sections.length,candidates:Object.keys(state.corpus.candidates).length,results},null,2));console.log(JSON.stringify(results));
