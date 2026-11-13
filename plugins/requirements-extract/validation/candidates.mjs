// Explicit integration: real public CLI + complete actual producer files, fake judgments only.
import { resolve,join } from 'node:path';
import { writeFileSync,readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { execute } from '../src/candidate-cli.mjs';
import { loadLedger } from '../src/ledger.mjs';
import { batch,outputTokens,proposal } from '../src/workflow.mjs';
import { exportReqif } from '../src/reqif.mjs';
import { sourceCli } from '../src/cli.mjs';
const [entry,handoff,scratch]=process.argv.slice(2).map(p=>resolve(p));
const config=join(scratch,'config.json'),job=join(scratch,'job');
writeFileSync(config,JSON.stringify({cliEntry:entry,job,outputRoot:scratch,inputs:[{key:'lsr',root:handoff}]}),{flag:'wx'});
execute(['prepare',config]);
let state=loadLedger(job).state;
const chosen=Object.values(state.corpus.candidates).find(c=>c.kind==='paragraph'&&!state.corpus.sections.find(s=>s.key===c.sectionKey).oversized&&!c.provisional&&c.tokens.length&&c.bodyBlocks.every(b=>b.kind==='paragraph'&&typeof b.text==='string'&&!b.content)&&c.contexts.every(c=>c.kind!=='unresolved-reference'));
assert.ok(chosen,'A plain sourced numeric LSR candidate is needed for the deterministic processing trial');
for(const section of state.corpus.sections) {
  const b=batch(state,section.key);
  const response={schemaVersion:1,requestId:b.requestId,inputDigest:b.inputDigest,policyDigest:b.policyDigest,epoch:b.epoch,sectionKey:section.key,sectionReview:{checked:true,reason:'Deterministic integration fixture; no AI/source-quality judgment',overlookedSegmentKeys:[]},decisions:b.candidates.map(c=>{
    const adopt=c.candidateKey===chosen.candidateKey;
    const d={candidateKey:c.candidateKey,decision:adopt?'adopt':'non-requirement',reason:'Fake processing decision; not an extraction judgment',choices:{kind:'constraint',level:'system',strength:'mandatory',verification:'inspection',origin:'derived',transformation:'keep',quality:'same'},duplicateOf:null,unresolved:[],contextAssessments:c.contexts.map(c=>({contextKey:c.key,outcome:'not-applicable',reason:'Deterministic fake context judgment, not validated semantics'})),outputs:[]};
    if(adopt) {
      const o={outputKey:'main',title:'결정적 처리 검사',bodyBlocks:c.bodyBlocks,sourceCandidateKeys:[c.candidateKey],contextKeys:[],rationale:'합성 표본의 파일 절차만 검사. 실제 도출·검수 판단이 아님.',relations:[],protectedTokenMappings:[]};
      const used=new Set();o.protectedTokenMappings=outputTokens(o,state.profile,0).map(t=>{const original=c.tokens.find(s=>!used.has(s.key)&&s.kind===t.kind&&s.value===t.value);assert.ok(original);used.add(original.key);return {outputTokenKey:t.key,sourceTokenKey:original.key};});d.outputs=[o];
    }
    return d;
  })};
  const path=join(scratch,'response-'+section.key+'.json');writeFileSync(path,JSON.stringify(response),{flag:'wx'});
  execute(['submit',config,path]);state=loadLedger(job).state;
}
const expected=proposal(state);assert.equal(expected.requirements.length,1);
execute(['resume',config]);assert.equal(proposal(loadLedger(job).state).requirements[0].id,expected.requirements[0].id);
const result=execute(['propose',config,'proposal']);
const cli=sourceCli({entry,root:join(scratch,'proposal')});const reread=cli.read('proposal.md');
assert.deepEqual(reread.requirements[0].body,expected.requirements[0].body);
assert.deepEqual(reread.requirements[0].sources,expected.requirements[0].sources);
assert.throws(()=>exportReqif([reread]),e=>e.diagnostics?.some(d=>d.code==='source-review-required'));
const trial=exportReqif([reread],{testOnly:true});writeFileSync(join(scratch,'candidates-test.reqif'),trial.xml,{flag:'wx'});
assert.throws(()=>execute(['propose',config,'proposal']),e=>e.diagnostics?.some(d=>d.code==='output-exists'));
assert.equal(JSON.parse(readFileSync(join(scratch,'proposal/proposal-complete.json'))).proposalDigest,result.proposalDigest);
const summary={sections:state.corpus.sections.length,candidateFree:state.corpus.sections.filter(s=>!s.candidateKeys.length).length,candidates:Object.keys(state.corpus.candidates).length,occurrences:state.corpus.units.filter(u=>u.candidateKey).length,chosenSource:chosen.sourceKeys.map(k=>state.corpus.sources[k]),checkedSections:result.report.counts.checkedSections,requirements:reread.requirements.length,reviewState:'draft-only',quality:'not-evaluated; deterministic fake decisions'};
writeFileSync(join(scratch,'integration-report.json'),JSON.stringify(summary,null,2),{flag:'wx'});
console.log(JSON.stringify({ok:true,...summary,chosenSource:undefined}));
