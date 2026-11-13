// Deterministic judgments, real official CLI, caller-owned isolated workspace.
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {screenService} from '../src/screen-service.mjs';
import {loadLedger} from '../src/ledger.mjs';
import {fake} from '../test/candidate-fixture.mjs';
import {sourceCli} from '../src/cli.mjs';
const [entry,root]=process.argv.slice(2).map(p=>resolve(p)),launcher={bin:process.execPath,args:[entry]},service=screenService({root,launcher}),cli=sourceCli({root,launcher});
async function candidates(upper=[],level='system') {
 let s=await service.action('prepare',{document:'public-input.md',upper}),jobId=s.jobId;
 let state=loadLedger(join(root,'.requirements-extract',jobId,'ledger')).state;
 for(const section of state.corpus.sections){const response=fake(state,section);for(const d of response.decisions)d.choices.level=level;await service.action('submit',{jobId,response});state=loadLedger(join(root,'.requirements-extract',jobId,'ledger')).state;}
 return service.action('links',{jobId});
}
let upper=await candidates([],'stakeholder');upper=await service.action('unlinked',{jobId:upper.jobId,ids:upper.linkRequirements.map(r=>r.id),classification:'independent',reason:'Synthetic public upper scope reviewed.'});
await service.action('confirm',{jobId:upper.jobId,ids:upper.requirements.map(r=>r.id),inputDigest:upper.inputDigest,planDigest:upper.planDigest});
const name='screen-linked-'+randomUUID().slice(0,8);await service.action('save',{jobId:upper.jobId,name:name+'-upper'});
let lower=await candidates([name+'-upper.md']),jobId=lower.jobId,id=lower.linkRequirements[0].id,b=service.linkBatch({jobId,lowerId:id});assert.equal(b.candidates.length,1);
lower=await service.action('link-submit',{jobId,response:{inputDigest:b.inputDigest,policyDigest:b.policyDigest,lowerId:id,scopeReview:{checked:true,reason:'Synthetic full selected catalog check'},choices:[{choice:'refines',upperId:b.candidates[0].requirement.id,reason:'Deterministic public processing sample; partial scope reviewed.',basis:'satisfies-obligation',coverage:'partial',covered:'Submitted record and source location',remaining:'Sequence remains to be implemented'}]}});
assert.ok(lower.links.problems.some(p=>p.code==='partial-fulfillment'));assert.ok(lower.planDigest);
const detail=service.detail({jobId,requirementId:id});assert.equal(detail.linkReview.previous.choices[0].coverage,'partial');
await service.action('confirm',{jobId,ids:[id],inputDigest:lower.inputDigest,planDigest:lower.planDigest});await service.action('save',{jobId,name});await service.action('export',{jobId,name});
assert.match(readFileSync(join(root,name+'.reqif'),'utf8'),/Sequence remains to be implemented/);
// A saved upper status change must invalidate existing judgments and confirmation.
const set=cli.read(name+'-upper.md'),snapshot=cli.run('inspect',cli.scoped(name+'-upper.md'),'--format','json');
const table=snapshot.nodes.find(n=>n.type==='table'&&snapshot.nodes.some(c=>c.type==='cell'&&c.path[0]===n.path[0]&&c.text==='confirmed'));
assert.ok(table);const status=snapshot.nodes.find(n=>n.type==='cell'&&n.path[0]===table.path[0]&&n.text==='status'),value=snapshot.nodes.find(n=>n.type==='cell'&&n.path[0]===table.path[0]&&n.path[1]===status.path[1]&&n.path[2]===1);
assert.ok(value); // Official edit is used; no direct document serialization.
const {writeFileSync}=await import('node:fs');const op=join(root,name+'-operations.json');writeFileSync(op,JSON.stringify([{command:'update-table-cell',path:value.path.join(','),text:'obsolete'}]));
cli.run('apply-batch',cli.scoped(name+'-upper.md'),'--operations',op,'--if-revision',snapshot.revision,'--format','json');
const changed=service.summary({jobId});assert.equal(Object.keys(changed.confirmations).length,0);assert.equal(changed.planDigest,null);
await assert.rejects(service.action('export',{jobId,name:name+'-obsolete'}));
console.log(JSON.stringify({ok:true,jobId,upperRevisionChangedInvalidates:true,partialScopePreserved:true,formalExport:name+'.reqif',upperRequirements:set.requirements.length}));
