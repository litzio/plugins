import test from 'node:test';
import assert from 'node:assert/strict';
import { job,fake,withProof } from './candidate-fixture.mjs';
import { bodyTokens } from '../src/protected.mjs';
import { submit,proposal,outputTokens,report } from '../src/workflow.mjs';
import { exportReqif } from '../src/reqif.mjs';

function fixture(kind='header') {
  const j=job(),c=Object.values(j.corpus.candidates).find(c=>c.kind==='table-cell');
  const text={header:'At ≤ 25 °C',heading:'Only while ignition is on',unit:'Voltage unit: V',footnote:'Except during startup',caption:'For mode B only','list-parent':'When the controller is enabled',row:'Limits apply during charging',reference:'Scope: auxiliary power only'}[kind];
  const context={key:'shared-condition',kind,label:'condition-note',text,bodyBlocks:[{kind:'paragraph',content:[{kind:'text',text}]}]};
  context.tokens=bodyTokens(context.bodyBlocks,j.profile,context.key);c.contexts=[context];
  const r=fake(j),d=r.decisions.find(d=>d.candidateKey===c.candidateKey);
  // Generic kinds are explicitly assessed as apply too.
  d.contextAssessments[0].outcome='apply';d.outputs[0].contextKeys=[context.key];d.outputs[0].bodyBlocks=[...c.bodyBlocks,...context.bodyBlocks];
  d.choices.transformation='split';d.outputs.push({...structuredClone(d.outputs[0]),outputKey:'second'});
  return {j,c,context,r,d};
}
function mapped(f) {
  for(const [i,o] of f.d.outputs.entries()) {
    const candidates=o.sourceCandidateKeys.map(k=>f.j.corpus.candidates[k]),contexts=[...new Map(candidates.flatMap(c=>c.contexts.filter(c=>o.contextKeys.includes(c.key))).map(c=>[c.key,c])).values()];
    const pool=[...candidates.flatMap(c=>c.tokens),...contexts.flatMap(c=>c.tokens)],used=new Set();
    const notes=contexts.filter(c=>c.kind==='footnote').map(c=>({label:c.label,content:c.bodyBlocks[0].content}));
    o.protectedTokenMappings=outputTokens(o,f.j.profile,i,notes).map(t=>{const s=pool.find(s=>!used.has(s.key)&&s.kind===t.kind&&s.value===t.value)??pool.find(s=>s.kind===t.kind&&s.value===t.value);used.add(s.key);return {outputTokenKey:t.key,sourceTokenKey:s.key};});
  }
  return withProof(f.j,f.r);
}
test('review regression: first split output cannot lose the applied temperature condition',()=>{
  const f=fixture();f.d.outputs[0].contextKeys=[];f.d.outputs[0].bodyBlocks=structuredClone(f.c.bodyBlocks);
  assert.throws(()=>{const set=proposal(submit(f.j,mapped(f)));assert.ok(exportReqif([set],{testOnly:true}).xml);},e=>e.diagnostics?.some(d=>d.severity==='error'));
});
const kinds=['header','heading','unit','footnote','caption','list-parent','row','reference'];
const hasCode=code=>e=>e.diagnostics?.some(d=>d.code===code);
for(const kind of kinds) {
  test(`split preserves ${kind} in every output`,()=>{
    const f=fixture(kind),saved=submit(f.j,mapped(f)),set=proposal(saved),d=saved.responses[f.r.sectionKey].decisions.find(d=>d.candidateKey===f.c.candidateKey);
    assert.equal(d.outputs.length,2);assert.ok(d.outputs.every(o=>o.contextKeys.includes(f.context.key)));
    assert.ok(exportReqif([set],{testOnly:true}).xml.includes(f.context.text));
  });
  for(const index of [0,1]) test(`mutation: split output ${index} drops ${kind}`,()=>{
    const f=fixture(kind),o=f.d.outputs[index];o.contextKeys=[];o.bodyBlocks=structuredClone(f.c.bodyBlocks);
    assert.throws(()=>submit(f.j,mapped(f)),hasCode('output-context-required'));
  });
  test(kind==='footnote'?'included footnote preserves the condition in the output endnote':`mutation: declaring ${kind} present without its material is rejected`,()=>{
    const f=fixture(kind);f.d.outputs[0].bodyBlocks=structuredClone(f.c.bodyBlocks);
    if(kind==='footnote') {const set=proposal(submit(f.j,mapped(f)));assert.ok(set.requirements.some(r=>r.footnotes?.some(n=>n.label===f.context.label)));}
    else assert.throws(()=>submit(f.j,mapped(f)),hasCode('output-context-proof'));
  });
  test(`explicit ${kind} exclusion is visible first with output ID and reason`,()=>{
    const f=fixture(kind),o=f.d.outputs[0];o.contextKeys=[];o.bodyBlocks=structuredClone(f.c.bodyBlocks);o.contextExclusions=[{contextKey:f.context.key,reason:'This logical part is outside the specified operating mode; human review required'}];
    const saved=submit(f.j,mapped(f)),r=report(saved),exception=r.reviewFirst[0];
    assert.equal(exception.outputKey,o.outputKey);assert.equal(exception.contextKind,kind);assert.equal(exception.contextText,f.context.text);assert.equal(exception.reason,o.contextExclusions[0].reason);assert.equal(exception.needsHumanReview,true);
    assert.equal(r.problems[0].code,'output-context-excluded');assert.ok(proposal(saved).requirements.some(r=>r.id===exception.requirementId&&r.status==='draft'));
  });
}
test('exclusions require a reason, an applied known key, uniqueness and absence from included keys',()=>{
  for(const exclusions of [[{contextKey:'shared-condition',reason:' '}],[{contextKey:'invented',reason:'outside mode'}],[{contextKey:'shared-condition',reason:'outside mode'},{contextKey:'shared-condition',reason:'duplicate'}]]) {
    const f=fixture(),o=f.d.outputs[0];o.contextKeys=[];o.bodyBlocks=structuredClone(f.c.bodyBlocks);o.contextExclusions=exclusions;
    assert.throws(()=>submit(f.j,mapped(f)),e=>e.diagnostics?.some(d=>['reason','output-context-exclusion'].includes(d.code)));
  }
  const f=fixture();f.d.outputs[0].contextExclusions=[{contextKey:f.context.key,reason:'contradictory inclusion'}];assert.throws(()=>submit(f.j,mapped(f)),hasCode('output-context-exclusion'));
});
test('each explicit exclusion remains visible when every output excludes a condition',()=>{
  const f=fixture();for(const o of f.d.outputs){o.contextKeys=[];o.bodyBlocks=structuredClone(f.c.bodyBlocks);o.contextExclusions=[{contextKey:f.context.key,reason:'Does not apply to this logical item; human must review'}];}
  const saved=submit(f.j,mapped(f));assert.equal(report(saved).reviewFirst.length,2);assert.equal(proposal(saved).requirements.length,4);
});
test('merge includes each source condition, or reports each explicit exclusion',()=>{
  const f=fixture('heading');f.d.choices.transformation='merge';f.d.outputs.length=1;
  const partnerDecision=f.r.decisions.find(d=>d.candidateKey!==f.c.candidateKey),partner=f.j.corpus.candidates[partnerDecision.candidateKey];
  const second={...structuredClone(f.context),key:'partner-condition',text:'Within operating mode B',bodyBlocks:[{kind:'paragraph',text:'Within operating mode B'}]};second.tokens=bodyTokens(second.bodyBlocks,f.j.profile,second.key);partner.contexts=[second];
  partnerDecision.decision='duplicate';partnerDecision.duplicateOf=f.c.candidateKey;partnerDecision.outputs=[];partnerDecision.contextAssessments=[{contextKey:second.key,outcome:'apply',reason:'Shared mode condition'}];
  const o=f.d.outputs[0];o.sourceCandidateKeys.push(partner.candidateKey);o.contextKeys.push(second.key);
  // Match the code's source order (the partner comes first in this fixture).
  o.bodyBlocks=[...partner.bodyBlocks,...f.c.bodyBlocks,...f.context.bodyBlocks,...second.bodyBlocks];
  assert.ok(proposal(submit(f.j,mapped(f))));
  const baseline=structuredClone(f.r);
  for(const context of [f.context,second]) {
    f.r=structuredClone(baseline);f.d=f.r.decisions.find(d=>d.candidateKey===f.c.candidateKey);const output=f.d.outputs[0];
    output.contextKeys=output.contextKeys.filter(k=>k!==context.key);output.bodyBlocks=output.bodyBlocks.filter(b=>JSON.stringify(b)!==JSON.stringify(context.bodyBlocks[0]));
    assert.throws(()=>submit(f.j,mapped(f)),hasCode('output-context-required'));
    output.contextExclusions=[{contextKey:context.key,reason:'This source condition does not apply to the merged logical item'}];
    const saved=submit(f.j,mapped(f));assert.equal(report(saved).reviewFirst[0].contextKey,context.key);assert.ok(proposal(saved));
  }
});

test('cached split with a missing per-output condition cannot publish a proposal',()=>{
  const f=fixture(),valid=submit(f.j,mapped(f)),stored=valid.responses[f.r.sectionKey].decisions.find(d=>d.candidateKey===f.c.candidateKey);
  stored.outputs[0].contextKeys=[];stored.outputs[0].bodyBlocks=structuredClone(f.c.bodyBlocks);
  assert.throws(()=>proposal(valid),hasCode('output-context-required'));
});
