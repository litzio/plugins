// Isolated real-CLI regression, split so the browser can display the old detail
// between setup and change. Decisions are deterministic, with no AI invocation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {screenService} from '../src/screen-service.mjs';
import {sourceCli} from '../src/cli.mjs';
import {loadLedger} from '../src/ledger.mjs';
import {fake,withProof} from '../test/candidate-fixture.mjs';
import {outputTokens} from '../src/workflow.mjs';
const [entry,workspace,phase]=process.argv.slice(2),root=resolve(workspace),launcher={bin:process.execPath,args:[resolve(entry)]},cli=sourceCli({root,launcher}),service=screenService({root,launcher}),marker=join(root,'.review-probe.json');
let jobId;
const state=()=>loadLedger(join(root,'.requirements-extract',jobId,'ledger')).state;
const act=(action,payload={})=>service.action(action,{jobId,reviewRevision:service.summary({jobId}).review.revision,...payload});
async function links(){const s=await act('links');return act('unlinked',{ids:s.linkRequirements.map(r=>r.id),classification:'independent',reason:'Explicitly reviewed independent public sample scope'});}
if(phase==='setup') {
 const texts=JSON.parse(readFileSync(new URL('../test/fixtures/upstream-public.json',import.meta.url))).items.slice(2,4).map(i=>i.text),input=join(root,'.review-authoring.json'),name='review-source-'+randomUUID().slice(0,8)+'.md';
 writeFileSync(input,JSON.stringify({authoring:{title:'공개 검증',inputs:[{key:'public',blocks:[{kind:'heading',level:1,text:'공개 검증'},...texts.map(text=>({kind:'paragraph',text}))]}]},images:[]}));
 cli.run('create',cli.scoped(name),'--input',input,'--format','json');const prepared=await service.action('prepare',{document:name});jobId=prepared.jobId;
 for(const section of state().corpus.sections)await act('submit',{response:fake(state(),section)});
 const s=await links(),id=s.requirements[0].id,detail=service.detail({jobId,requirementId:id});writeFileSync(marker,JSON.stringify({jobId,id,review:detail.review}));
 console.log(JSON.stringify({ok:true,phase,jobId,requirements:s.requirements.length}));
}else if(phase==='change') {
 const old=JSON.parse(readFileSync(marker));jobId=old.jobId;const section=state().corpus.sections[0];await act('reopen',{sectionKey:section.key});
 const current=state(),response=fake(current,section),d=response.decisions[0],c=current.corpus.candidates[d.candidateKey],context=c.contexts.find(v=>v.kind==='after'),o=d.outputs[0];
 d.contextAssessments.find(v=>v.contextKey===context.key).outcome='apply';o.contextKeys.push(context.key);o.bodyBlocks.push(...structuredClone(context.bodyBlocks));o.rationale='Another original paragraph explicitly applied as context';
 const pool=[...c.tokens,...context.tokens],used=new Set();o.protectedTokenMappings=outputTokens(o,current.profile,0,[]).map(t=>{const s=pool.find(v=>!used.has(v.key)&&v.value===t.value&&v.kind===t.kind)??pool.find(v=>v.value===t.value&&v.kind===t.kind);used.add(s.key);return {outputTokenKey:t.key,sourceTokenKey:s.key};});
 await act('submit',{response:withProof(current,response)});const s=await links(),fresh=service.detail({jobId,requirementId:old.id});assert.notEqual(fresh.review.requirementDigest,old.review.requirementDigest);
 await assert.rejects(act('confirm',{ids:[old.id],inputDigest:s.inputDigest,planDigest:s.planDigest,reviewed:[old.review]}),/stale-displayed-review/);assert.equal(service.summary({jobId}).review.confirmedCount,0);
 console.log(JSON.stringify({ok:true,phase,jobId,sameId:true,bodyChanged:true,oldDetailWithNewHashesRejected:true}));
}else if(phase==='hold') {
 const old=JSON.parse(readFileSync(marker)),session=JSON.parse(readFileSync(join(root,'.requirements-extract',old.jobId,'session.json'))),prepared=await service.action('prepare',{document:session.document});jobId=prepared.jobId;
 for(const section of state().corpus.sections){const response=fake(state(),section),held=response.decisions[1];held.decision='hold';held.reason='Independent context judgment still required';held.outputs=[];await act('submit',{response});}
 const s=service.summary({jobId}),group=s.review.groupsByCode.hold;assert.equal(s.requirements.length,1);assert.equal(group.count,1);assert.equal(group.rows.length,1);
 writeFileSync(join(root,'.hold-probe.json'),JSON.stringify({jobId}));console.log(JSON.stringify({ok:true,phase,jobId,adopted:1,heldCount:group.count,heldRows:group.rows.length}));
}else throw new Error('setup-change-or-hold-required');
