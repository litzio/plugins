// Run after reviewed-flow consumer. Public producer writes, public consumer
// freshness checks, and independent readback. Test actor declarations only.
import {readFileSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sourceCli} from '../src/cli.mjs';
import {loadProvenance,resolveSource} from '../src/provenance.mjs';
const [entry,workspace,host,phase='change']=process.argv.slice(2),root=resolve(workspace),m=JSON.parse(readFileSync(join(root,'reviewed-flow.json'))),jobId=m.producerJobId,folder=join(root,m.handoff),file=join(root,'event-input.json');
const read=p=>JSON.parse(readFileSync(p));
function cli(...args){const r=spawnSync(process.execPath,[resolve(entry),...args],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});assert.equal(r.status,0,(r.stdout??'').slice(-2000));return JSON.parse(r.stdout);}
function call(plugin,op,value){writeFileSync(file,JSON.stringify(value));const r=cli('operation','invoke','local.'+plugin+'.'+op,'--input',file,'--host',host,'--json');assert.equal(r.receipt.outcome,'success',JSON.stringify(r));return r.result;}
const producer=(op,v)=>call('docling-to-litzio',op,{jobId,...v}),native=file=>cli('inspect',file,'--format','json'),load=(extra={})=>loadProvenance(folder,{inspect:native,...extra});
async function consumer(op,value){let row=call('requirements-extract',op,{requestId:randomUUID(),...value});while(['queued','running'].includes(row.state)){await new Promise(r=>setTimeout(r,200));row=call('requirements-extract','job',{id:row.id});}assert.equal(row.state,'succeeded',JSON.stringify(row));return row.result;}
const eventFile=join(root,'reviewed-event-state.json');
if(['change','human'].includes(phase)){
if(phase==='change'){
assert.equal(load({requireReviewed:true}).eligibleConfirmed,true);cpSync(folder,join(root,'completed-baseline'),{recursive:true,force:false,errorOnExist:true});
let s=producer('review-progress',{});producer('review-checkpoint',{scopeId:s.scopes[0].id,revision:s.revision,state:'검사중',note:'Deterministic reopen test; not actual review'});
assert.equal(load().eligibleConfirmed,false);assert.throws(()=>load({requireReviewed:true}));
const summary=await consumer('inspect',{method:'summary',payload:{jobId:m.consumerJobId}});assert.equal(summary.review.confirmedCount,0);assert.equal(summary.requirements.length,0);
await assert.rejects(consumer('start',{action:'export',payload:{jobId:m.consumerJobId,name:'must-not-export-stale-source',reviewRevision:summary.review.revision}}));
const saved=sourceCli({root,launcher:{bin:process.execPath,args:[resolve(entry)]}}).read('reviewed-proposal.md');assert.ok(saved.diagnostics.some(d=>d.code==='stale-source-evidence'));
}
assert.equal(load().eligibleConfirmed,false);assert.equal(load().history?.changes.length??0,0);
const report=read(join(folder,'review/review-targets.json')),p=read(join(folder,'provenance.json')),source=p.items.find(i=>i.cells.some(c=>c.sourceCell.text==='3 cycles')),cell=source.cells.find(c=>c.sourceCell.text==='3 cycles'),target=cell.targets[0],finding=report.findings.find(f=>f.sourceIds.includes(source.sourceId)&&f.regions.length),group=report.groups.find(g=>g.findingIds.includes(finding.id));
const s=producer('review-progress',{});const changeId='deterministic-human-cell',scope=finding.regions.map(r=>({pageNo:r.pageNo,bbox:r.bbox}));
producer('correction-submit',{changeId,generationId:p.generationId,revision:s.revision,groupId:group.id,actor:'human',decision:'correct',target:{kind:'cell',path:target.path,row:target.selector.row,column:target.selector.column},before:cell.sourceCell.text,after:'3\\,\\mathrm{cycles}',afterContent:[{kind:'math',value:'3\\,\\mathrm{cycles}'}],reason:'Deterministic declared-human correction test from the public source fixture; not business approval',evidence:{kind:'human-source-region',refs:[],scope}});
let bundle=load(),trace=resolveSource(bundle,{elementRef:source.selfRef,selector:'cell:'+cell.sourceCell.start_row_offset_idx+':'+cell.sourceCell.start_col_offset_idx}).source.trace;assert.equal(bundle.eligibleConfirmed,false);assert.equal(trace.corrections.at(-1).validation.evidenceRecheck,'human-source-region');assert.equal(trace.corrections.at(-1).validation.protectedTokens,false);assert.ok(trace.humanCorrectionNotice);assert.deepEqual(bundle.snapshot.nodes.find(n=>JSON.stringify(n.path)===JSON.stringify([...target.path,target.selector.row,target.selector.column])).content,[{kind:'math',value:'3\\,\\mathrm{cycles}'}]);
const check=report.checks.find(c=>c.sourceId===source.sourceId&&c.selectorKey==='cell:'+cell.cellIndex);assert.ok(check.pdfTokenIds.length);
writeFileSync(eventFile,JSON.stringify({changeId,scope,refs:check.pdfTokenIds,elementRef:source.selfRef,selector:'cell:'+cell.sourceCell.start_row_offset_idx+':'+cell.sourceCell.start_col_offset_idx}));console.log(JSON.stringify({phase,humanSourceRegion:true,inlineMathReadback:true,reviewed:false,confirmationsInvalidated:true,savedProposalBlocked:true}));
}else if(phase==='undo'){
const {changeId,scope,refs,elementRef,selector}=read(eventFile);
producer('correction-undo',{changeId:'deterministic-undo-cell',undoOf:changeId,actor:'human',reason:'Deterministic exact restoration, not a new semantic review',evidence:{refs,scope}});
const bundle=load(),trace=resolveSource(bundle,{elementRef,selector}).source.trace;assert.equal(bundle.eligibleConfirmed,false);assert.equal(trace.correctionNotice,undefined);assert.equal(trace.correctionState,'restored-to-conversion-value');assert.equal(trace.corrections.length,2);assert.ok(trace.corrections.at(-1).undoOf);
producer('review-stop',{});producer('review-resume',{});assert.equal(load().eligibleConfirmed,false);assert.throws(()=>load({requireReviewed:true}));
const result={reopenedSourceUnreviewed:true,consumerConfirmationsInvalidated:true,staleFormalExportBlocked:true,humanCorrection:{evidenceRecheck:trace.corrections[0].validation.evidenceRecheck,protectedTokens:false},exactUndoRetained:true,stopResumeCannotRestoreCompletion:true};writeFileSync(join(root,'reviewed-events-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));

}else throw new Error('phase must be change or undo');
