// Compare the pre-change consumer checkout against this plugin, fixed time and
// one normalized random job id. No conversions, source edits or AI.
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [baseline,current]=process.argv.slice(2);
async function outputs(directory,version){
 const root=resolve(directory),module=async file=>import(pathToFileURL(join(root,file)).href),{handoff,read}=await module('test/handoff-fixture.mjs'),{correctedFixture}=await module('test/corrected-fixture.mjs'),{loadProvenance,resolveSource}=await module('src/provenance.mjs'),{prepare,report}=await module('src/workflow.mjs'),{sample}=await module('test/sample.mjs'),{digest}=await module('src/model.mjs'),{exportReqif}=await module('src/reqif.mjs');
 const folder=version==='1.0'?handoff():correctedFixture(),inspect=()=>read(folder,version==='1.0'?'snapshot.json':'correction-history.json'),readback=()=>{const value=inspect();return value.currentSnapshot??value;},bundle=loadProvenance(folder,{inspect:readback}),source=resolveSource(bundle,{sourceKey:'synthetic',elementRef:'#/texts/0'}),profile=JSON.parse(readFileSync(join(root,'profiles/default.json'))),job=prepare([{key:'synthetic',bundle}],profile);job.jobId='normalized-random-job-id';
 const sets=sample();sets[0].requirements[0].sources=[source.source];sets[0].requirements[0].confirmedDigest=digest(sets[0].requirements[0]);
 let reviewedError;try{loadProvenance(folder,{inspect:readback,requireReviewed:true});}catch(e){reviewedError=e.diagnostics;}
 return JSON.stringify({bundle,source,report:report(job),export:exportReqif(sets,{testOnly:true,now:'2000-01-01T00:00:00.000Z'}),reviewedError});
}
for(const version of ['1.0','1.1']){const before=await outputs(baseline,version),after=await outputs(current,version);assert.equal(after,before,'legacy '+version+' bytes');console.log(JSON.stringify({version,byteIdentical:true,sha256:createHash('sha256').update(after).digest('hex')}));}
