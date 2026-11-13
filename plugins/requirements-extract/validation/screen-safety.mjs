// Explicit isolated integration; fake review judgments, real source-built CLI.
import {copyFileSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {screenService} from '../src/screen-service.mjs';
import {sourceCli} from '../src/cli.mjs';
import {loadLedger} from '../src/ledger.mjs';
import {fake} from '../test/candidate-fixture.mjs';
import {digest} from '../src/model.mjs';
import {randomUUID} from 'node:crypto';
const [entry,root]=process.argv.slice(2).map(p=>resolve(p)),launcher={bin:process.execPath,args:[entry]},service=screenService({root,launcher}),cli=sourceCli({root,launcher});
const source='safety-'+randomUUID()+'.md';copyFileSync(join(root,'public-input.md'),join(root,source));
let s=await service.action('prepare',{document:source}),jobId=s.jobId;
const act=(action,payload)=>service.action(action,{reviewRevision:service.summary({jobId}).review.revision,...payload});
let state=loadLedger(join(root,'.requirements-extract',jobId,'ledger')).state;
for(const section of state.corpus.sections){await act('submit',{jobId,response:fake(state,section)});state=loadLedger(join(root,'.requirements-extract',jobId,'ledger')).state;}
s=await act('links',{jobId});assert.equal(s.planDigest,null);
s=await act('unlinked',{jobId,ids:s.linkRequirements.map(r=>r.id),classification:'independent',reason:'Public sample has no selected upstream scope; independent obligation explicitly reviewed.'});
const payload={jobId,ids:[s.requirements[0].id],planDigest:s.planDigest,inputDigest:s.inputDigest,reviewed:[service.detail({jobId,requirementId:s.requirements[0].id}).review]};
await assert.rejects(act('export',{jobId,name:'must-not-export'}));assert.equal(existsSync(join(root,'must-not-export.reqif')),false);
await assert.rejects(act('confirm',{...payload,planDigest:'stale'}));assert.equal(Object.keys(service.summary({jobId}).confirmations).length,0);
await act('confirm',payload);assert.equal(Object.keys(service.summary({jobId}).confirmations).length,1);
const name='safety-confirmed-'+jobId.slice(0,8);await act('save',{jobId,name});const saved=cli.read(name+'.md');for(const r of saved.requirements){assert.equal(r.confirmedDigest,digest(r));assert.ok(r.sources[0].nativeLocation);}
await act('export',{jobId,name});assert.ok(existsSync(join(root,name+'.reqif')));
await act('stop',{jobId});await assert.rejects(act('submit',{jobId,response:{}}),/job-stopped/);await act('resume',{jobId});
const snapshot=cli.run('inspect',cli.scoped(source),'--format','json'),p=snapshot.nodes.find(n=>n.type==='paragraph'),ops=join(root,'safety-operations.json');writeFileSync(ops,JSON.stringify([{command:'update-node-text',path:p.path.join(','),from:p.text,to:p.text+' Source changed.'}]));
cli.run('apply-batch',cli.scoped(source),'--operations',ops,'--if-revision',snapshot.revision,'--format','json');
await assert.rejects(act('confirm',payload));s=service.summary({jobId});assert.equal(Object.keys(s.confirmations).length,0);assert.equal(s.report.counts.checkedSections,0);
await assert.rejects(act('save',{jobId,name:'must-not-save'}));assert.equal(existsSync(join(root,'must-not-save.md')),false);
await assert.rejects(act('prepare',{document:'../outside.md'}));
console.log(JSON.stringify({ok:true,unconfirmedExportBlocked:true,staleConfirmationBlocked:true,sourceChangeInvalidates:true,stopResume:true,pathEscapeBlocked:true,confirmedDigestRoundtrip:true,formalExport:name+'.reqif'}));
