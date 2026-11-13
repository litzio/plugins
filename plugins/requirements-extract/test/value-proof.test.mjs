import test from 'node:test';
import assert from 'node:assert/strict';
import { input,profile,fake,withProof } from './candidate-fixture.mjs';
import { prepare,submit,proposal,outputTokens,refresh,reopen } from '../src/workflow.mjs';
import { bodyTokens,evidenceRegions } from '../src/protected.mjs';
import { exportReqif } from '../src/reqif.mjs';

function attempt(original,changed) {
  // Processing fixture with an explicitly stubbed inspector, not an actual producer run.
  const i=input();Object.assign(i.bundle.snapshot.nodes[0],{text:original,content:[{kind:'text',text:original}]});
  const j=prepare([i],profile),r=fake(j),d=r.decisions[0],c=j.corpus.candidates[d.candidateKey],o=d.outputs[0];
  o.bodyBlocks=[{kind:'paragraph',text:changed}];
  const used=new Set();o.protectedTokenMappings=outputTokens(o,profile,0).map(t=>{const source=c.tokens.find(s=>!used.has(s.key)&&s.kind===t.kind&&s.value===t.value);if(!source)return {outputTokenKey:t.key,sourceTokenKey:'missing'};used.add(source.key);return {outputTokenKey:t.key,sourceTokenKey:source.key};});
  const result=proposal(submit(j,r));
  assert.ok(exportReqif([result],{testOnly:true}).xml.includes(changed));
}
for(const [name,original,changed] of [
  ['fullwidth digits','Voltage shall be １０ V','Voltage shall be ２０ V'],
  ['signal identifier','Signal_A shall be active','Signal_B shall be active'],
  ['range reversal','Voltage shall be 10~20 V','Voltage shall be 20~10 V'],
]) test('review regression rejects '+name,()=>assert.throws(()=>attempt(original,changed),e=>e.diagnostics?.some(d=>d.severity==='error')));


const vectors=[
  {text:'Signal_A shall use 10~20 V and DOC-AB-123.',spans:['Signal_A','10~20 V','DOC-AB-123']},
  {text:'신호_A shall keep −０．１０ 볼트 to ＋２．５０ 볼트 per 문서-１２３.',spans:['신호_A','−０．１０ 볼트','＋２．５０ 볼트','문서-１２３']},
  {text:'Signal_A shall settle at 1e−3 V; 2×10⁻³ A; ratios 1/2 and ½.',spans:['1e−3 V','2×10⁻³ A','1/2','½']},
  {text:'X_Y.3 shall follow ISO-1234-5:2026; bounds < 3 and ≤ 5; fraction ⅔ 초.',spans:['X_Y.3','ISO-1234-5:2026','<','≤','⅔ 초']},
  {text:'Sig_é shall keep 𝟙𝟘 μΩ per DOC-Ⅳ; ratio ⁰⁵.',spans:['Sig_é','𝟙𝟘 μΩ','DOC-Ⅳ','⁰⁵']},
];
function prepared(text,origin='derived',title=false) {
  const i=input();Object.assign(i.bundle.snapshot.nodes[0],{text,content:[{kind:'text',text}]});
  const job=prepare([i],profile),response=fake(job),d=response.decisions[0];d.choices.origin=origin;
  if(title)d.outputs[0].title=text;
  return {i,job,response:remap(job,response)};
}
function remap(job,response) {
  const r=structuredClone(response),d=r.decisions[0],c=job.corpus.candidates[d.candidateKey];
  for(const [index,o] of d.outputs.entries()) {
    const pool=[...c.tokens,...c.contexts.filter(c=>o.contextKeys.includes(c.key)).flatMap(c=>c.tokens)],used=new Set();
    o.protectedTokenMappings=outputTokens(o,profile,index).map(t=>{const s=pool.find(s=>!used.has(s.key)&&s.kind===t.kind&&s.value===t.value)??pool.find(s=>s.kind===t.kind&&s.value===t.value);if(s)used.add(s.key);return {outputTokenKey:t.key,sourceTokenKey:s?.key??'unproven'};});
  }
  return withProof(job,r);
}
const protective=e=>e.diagnostics?.some(d=>['protected-token','source-region-proof','source-region-order','quoted-changed'].includes(d.code));
const mutants=[];
for(const [v,vector] of vectors.entries()) {
  const changes=new Set();
  for(const span of vector.spans) {
    const chars=Array.from(span);
    for(let i=0;i<chars.length;i++) {
      if(/\s/u.test(chars[i]))continue;
      const replacement=chars[i]==='Z'?'Y':/[0-9]/.test(chars[i])?String((Number(chars[i])+1)%10):/[０-９]/.test(chars[i])?String.fromCharCode(0xff10+(chars[i].charCodeAt(0)-0xff10+1)%10):'Z';
      changes.add(vector.text.replace(span,[...chars.slice(0,i),replacement,...chars.slice(i+1)].join('')));
      changes.add(vector.text.replace(span,[...chars.slice(0,i),...chars.slice(i+1)].join('')));
      if(i+1<chars.length&&chars[i]!==chars[i+1]&&!/\s/u.test(chars[i+1])) {const swap=[...chars];[swap[i],swap[i+1]]=[swap[i+1],swap[i]];changes.add(vector.text.replace(span,swap.join('')));}
    }
    changes.add(vector.text.replace(span,span+span));
  }
  for(const [from,to] of [['−','+'],['＋','−'],['⁻','⁺'],['<','≥'],['≤','<'],[' V',' A'],[' A',' V'],['볼트','암페어'],[' 초',' 밀리초'],['1/2','2/1'],['½','⅔'],['< 3 and ≤ 5','≤ 3 and < 5']]) if(vector.text.includes(from))changes.add(vector.text.replace(from,to));
  changes.add(vector.text.normalize('NFKC'));changes.add(vector.text.normalize('NFD'));
  if(vector.text.includes('10~20'))changes.add(vector.text.replace('10~20','20~10'));
  // Source indices remain literal; normalized width/sign/fractions are NOT presumed equal.
  if(/[０-９]/.test(vector.text))changes.add(vector.text.replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10)));
  for(const text of changes)if(text!==vector.text)mutants.push({v,text});
}
for(const origin of ['quoted','derived']) {
  const bases=vectors.map(v=>prepared(v.text,origin));
  for(const [v,base] of bases.entries())test(`unchanged source control ${origin}/${v}`,()=>assert.ok(proposal(submit(base.job,base.response))));
  for(const [index,{v,text}] of mutants.entries())test(`mechanical mutation ${origin}/${index}`,()=>{
    const base=bases[v],r=structuredClone(base.response);r.decisions[0].outputs[0].bodyBlocks[0].text=text;
    // Remap individual occurrences so a set/multiset check cannot hide the regression.
    assert.throws(()=>submit(base.job,remap(base.job,r)),protective);
  });
  for(const [v,base] of bases.entries())test(`allowed adjacent text-run serialization normalization ${origin}/${v}`,()=>{
    const r=structuredClone(base.response);const text=vectors[v].text,at=text.indexOf(' ')+1;r.decisions[0].outputs[0].bodyBlocks[0]={kind:'paragraph',content:[{kind:'text',text:text.slice(0,at)},{kind:'text',text:text.slice(at)}]};
    assert.ok(proposal(submit(base.job,remap(base.job,r))));
  });
  for(const [v,vector] of vectors.entries()) {
    const base=prepared(vector.text,origin,true);
    test(`sourced title control ${origin}/${v}`,()=>assert.ok(proposal(submit(base.job,base.response))));
    for(const [index,span] of vector.spans.entries())test(`title mutation ${origin}/${v}/${index}`,()=>{
      const r=structuredClone(base.response);r.decisions[0].outputs[0].title=vector.text.replace(span,span+'Z');assert.throws(()=>submit(base.job,remap(base.job,r)),protective);
    });
  }
}
test('CRLF is equivalent to LF; no Unicode compatibility, sign or fraction folding',()=>{
  const base=prepared('Signal_A shall keep １０ V.\nSecond condition remains ½ 초.');
  const r=structuredClone(base.response);r.decisions[0].outputs[0].bodyBlocks[0].text=r.decisions[0].outputs[0].bodyBlocks[0].text.replace(/\n/g,'\r\n');
  assert.ok(submit(base.job,remap(base.job,r)));
});
test('source region mappings cannot be omitted, invented, duplicated or used in reversed output order',()=>{
  const base=prepared('Signal_A shall keep 10~20 V.');
  for(const mutate of [o=>o.sourceRegionMappings=[],o=>o.sourceRegionMappings[0].sourceRegionKey='invented',o=>o.sourceRegionMappings.push(o.sourceRegionMappings[0])]) {const r=structuredClone(base.response);mutate(r.decisions[0].outputs[0]);assert.throws(()=>submit(base.job,r),protective);}
  const j=base.job,c=j.corpus.candidates[base.response.decisions[0].candidateKey];
  c.bodyBlocks=[{kind:'paragraph',text:'Signal_A shall keep 10 V'},{kind:'paragraph',text:'Signal_B shall keep 20 V'}];
  // Explicit multi-block synthetic source for the order guard, including full block moves.
  c.tokens=bodyTokens(c.bodyBlocks,profile,c.key);const r=fake(j);
  const o=r.decisions[0].outputs[0];o.bodyBlocks.reverse();const mapped=remap(j,r);
  assert.throws(()=>submit(j,mapped),e=>e.diagnostics?.some(d=>d.code==='source-region-order'));
});
test('cached decisions are rechecked at proposal time; old protection versions require re-review',()=>{
  const base=prepared('Signal_A shall keep １０ V.'),saved=submit(base.job,base.response);
  const stale=structuredClone(saved);stale.responses[base.response.sectionKey].decisions[0].outputs[0].bodyBlocks[0].text='Signal_B shall keep ２０ V.';
  assert.throws(()=>proposal(stale),protective);
  delete saved.protectionVersion;assert.throws(()=>proposal(saved),e=>e.diagnostics?.some(d=>d.code==='protection-version'));
  const renewed=refresh(saved,[base.i],profile);assert.equal(Object.keys(renewed.responses).length,0);assert.equal(renewed.epoch,saved.epoch+1);
});
console.log('Generated rejected mutation cases: '+(mutants.length*2+vectors.reduce((n,v)=>n+v.spans.length,0)*2));

test('horizontal spaces, code payloads, identifiers and link targets never receive prose normalization',()=>{
  const blocks=[{kind:'paragraph',content:[{kind:'code',value:'"10  20"'},{kind:'link',url:'https://example.org/10%20V',children:[{kind:'text',text:'spec'}]}]},{kind:'code',language:'text',code:'10  20\r\nSignal_A'},{kind:'paragraph',text:'Signal_A shall keep 10  20 V'}];
  for(const mutate of [b=>b[0].content[0].value='"10 20"',b=>b[0].content[1].url='https://example.org/20%20V',b=>b[1].code=b[1].code.replace('\r\n','\n'),b=>b[2].text=b[2].text.replace('10  20','10 20')]) {const changed=structuredClone(blocks);mutate(changed);assert.notDeepEqual(evidenceRegions(blocks,'proof').map(r=>r.value),evidenceRegions(changed,'proof').map(r=>r.value));}
});
