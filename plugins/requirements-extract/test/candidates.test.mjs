import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportReqif } from '../src/reqif.mjs';
import { collectCandidates } from '../src/candidates.mjs';
import { protectedTokens,bodyTokens } from '../src/protected.mjs';
import { prepare,submit,refresh,proposal,report,batch,supplement,reopen,outputTokens,checkProfile,invalidate } from '../src/workflow.mjs';
import { createLedger,loadLedger,saveLedger } from '../src/ledger.mjs';
import { profile,input,job,fake } from './candidate-fixture.mjs';
const code=(fn,value)=>assert.throws(fn,e=>e.diagnostics?.some(d=>d.code===value));
const temp=()=>mkdtempSync(join(tmpdir(),'requirements-candidates-unit-'));
test('collects ranges and table rows/cells with original source chains and shared headers',()=>{
  const j=job(), cs=Object.values(j.corpus.candidates);
  assert.equal(cs.length,3);assert.ok(cs.some(c=>c.kind==='table-row'));
  assert.ok(cs.filter(c=>c.kind==='table-cell').every(c=>c.contexts.some(c=>c.kind==='header')));
  assert.ok(cs.every(c=>c.sourceKeys.length));assert.ok(Object.values(j.corpus.sources).some(s=>s.trace.precision==='table'&&s.trace.tableModel.reviewRequired));
});
test('English/Korean obligations, empty headings, notes and nested parent contexts stay visible',()=>{
  const i=input();i.bundle.snapshot.nodes=[{path:[0],type:'heading',level:1,text:'Empty',content:[{kind:'text',text:'Empty'}]},{path:[1],type:'heading',level:1,text:'Text'},{path:[2],type:'paragraph',text:'Background'},{path:[3],type:'paragraph',text:'The signal shall settle.'},{path:[4],type:'paragraph',text:'응답해야 한다. 지연은 5 ms 이내'},{path:[5],type:'list',items:[{content:[{kind:'text',text:'Parent condition'}],list:{items:[{content:[{kind:'text',text:'must not exceed 5 V'}]}]}}]}];
  const c=collectCandidates([i],profile);assert.ok(c.sections.some(s=>s.heading[0].text==='Empty'&&!s.candidateKeys.length));
  assert.equal(Object.keys(c.candidates).length,3);assert.ok(c.units.some(u=>u.text==='Background'));
  assert.ok(c.units.find(u=>u.text==='must not exceed 5 V').contexts.some(c=>c.kind==='list-parent'&&c.text==='Parent condition'));
});
test('candidate-free sections can supplement only existing segments, invalidating old requests',()=>{
  const i=input(),p=structuredClone(profile);p.obligations={mandatory:[],recommended:[],permitted:[]};p.includeNumeric=false;
  let j=prepare([i],p);const s=j.corpus.sections[0],old=batch(j,s.key);assert.equal(s.candidateKeys.length,0);
  j=supplement(j,s.key,[s.units[0].key]);assert.equal(j.corpus.sections[0].candidateKeys.length,1);assert.notEqual(batch(j,s.key).requestId,old.requestId);
  code(()=>supplement(j,s.key,['invented']),'supplement');
});
test('candidate-free sections still require checked review before proposal',()=>{
  const i=input();i.bundle.snapshot.nodes.push({path:[3],type:'heading',level:1,text:'No candidates'},{path:[4],type:'paragraph',text:'Background only'});
  let j=prepare([i],profile);const s=j.corpus.sections[0];j=submit(j,fake(j,s));code(()=>proposal(j),'incomplete-review');
  j=submit(j,fake(j,j.corpus.sections[1],{adopt:false}));assert.equal(proposal(j).requirements.length,3);
});
test('new draft proposal retains stable code-issued IDs and source traces; exclusion/hold stay in ledger',()=>{
  let j=job(),r=fake(j);r.decisions[1].decision='non-requirement';r.decisions[1].outputs=[];r.decisions[2].decision='hold';r.decisions[2].outputs=[];r.decisions[2].choices.kind='unknown';
  j=submit(j,r);const a=proposal(j),b=proposal(j);assert.deepEqual(a,b);assert.equal(a.requirements.length,1);assert.ok(a.requirements.every(r=>r.status==='draft'&&r.id.startsWith('req-')&&r.sources[0].trace.eligibleConfirmed===false));assert.ok(report(j).problems.some(p=>p.code==='hold'));
});
for(const [label,mutate,expected] of [
  ['unknown field',r=>r.decisions[0].invented=true,'selection-schema'],
  ['blank exclusion reason',r=>{r.decisions[0].decision='non-requirement';r.decisions[0].outputs=[];r.decisions[0].reason=' ';},'reason'],
  ['unknown enum',r=>r.decisions[0].choices.level='component','selection-schema'],
  ['unknown on adopt',r=>r.decisions[0].choices.kind='unknown','unresolved'],
  ['conflict on adopt',r=>r.decisions[0].choices.quality='conflict','unresolved'],
  ['missing candidate',r=>r.decisions.pop(),'decision-coverage'],
  ['missing context',r=>r.decisions[0].contextAssessments.pop(),'context-coverage'],
  ['fabricated source',r=>r.decisions[0].outputs[0].sourceCandidateKeys=['invented'],'source-candidate'],
  ['changed numeric value',r=>r.decisions[0].outputs[0].bodyBlocks[0].text='Voltage ≤ 6 V','protected-token'],
  ['missing numeric token',r=>r.decisions[0].outputs[0].protectedTokenMappings.pop(),'protected-token'],
  ['changed inequality',r=>r.decisions[0].outputs[0].bodyBlocks[0].text='Voltage < 5 V','protected-token'],
  ['intended difference cannot bypass units',r=>{r.decisions[0].choices.quality='intended-difference';r.decisions[0].outputs[0].bodyBlocks[0].text='Voltage ≤ 5 A';},'protected-token'],
  ['invented token in title',r=>r.decisions[0].outputs[0].title='Voltage 6 V','protected-token'],
  ['quoted structure changed',r=>{r.decisions[0].choices.origin='quoted';r.decisions[0].outputs[0].bodyBlocks[0].text+=' extra';},'quoted-changed'],
  ['missed obligation',r=>r.sectionReview.overlookedSegmentKeys=['anything'],'supplement-required'],
]) test('rejects '+label,()=>{const j=job(),r=fake(j);mutate(r);code(()=>submit(j,r),expected);});
test('strict occurrence matching preserves decimals, signs, Unicode units, negation and typed exponents',()=>{
  const text='not ≤ −0.10 mg/L + 10³ m³/s';assert.deepEqual(protectedTokens(text,profile).map(t=>t.value),['not','≤','−0.10','mg/L','+','10','³','m³/s']);
  const a=bodyTokens([{kind:'paragraph',content:[{kind:'text',text:'10'},{kind:'superscript',children:[{kind:'text',text:'3'}]}]}],profile);
  assert.ok(a.some(t=>t.kind==='superscript'));assert.notDeepEqual(a.map(t=>[t.kind,t.value]),bodyTokens([{kind:'paragraph',text:'103'}],profile).map(t=>[t.kind,t.value]));
});
test('late, replayed and reopened responses are rejected; matching resume keeps IDs',()=>{
  let j=job(),r=fake(j);j=submit(j,r);code(()=>submit(j,r),'late-response');
  const next=reopen(j,r.sectionKey);code(()=>submit(next,r),'late-response');
  const again=submit(next,fake(next));assert.deepEqual(proposal(j).requirements.map(r=>r.id),proposal(again).requirements.map(r=>r.id));
});
test('policy changes including unversioned rules invalidate old decisions and late replies',()=>{
  const i=input(),j=prepare([i],profile),r=fake(j),p=structuredClone(profile);p.obligations.mandatory.push('required');
  const next=refresh(submit(j,r),[i],p);assert.equal(next.epoch,2);assert.equal(Object.keys(next.responses).length,0);code(()=>submit(next,r),'late-response');assert.equal(next.history[0].responses[r.sectionKey].decisions.length,3);
});
test('revision change invalidates all input decisions and no read failure leaves valid tickets',()=>{
  const i=input(),j=prepare([i],profile),r=fake(j);i.bundle.snapshot.revision='new';
  const next=refresh(j,[i],profile);code(()=>submit(next,r),'late-response');
  const blocked=invalidate(j,[{code:'digest'}]);code(()=>submit(blocked,r),'input-blocked');
});
test('duplicate decision must terminate in adopted item, never cycles or holds',()=>{
  const j=job(),r=fake(j);for(const [i,target] of [[1,2],[2,1]]){r.decisions[i].decision='duplicate';r.decisions[i].outputs=[];r.decisions[i].duplicateOf=r.decisions[target].candidateKey;}
  code(()=>submit(j,r),'duplicate-cycle');
});
test('split supports one source into several stable logical IDs',()=>{
  const j=job(),r=fake(j),d=r.decisions[0];d.choices.transformation='split';d.outputs.push({...structuredClone(d.outputs[0]),outputKey:'second'});d.outputs[1].protectedTokenMappings=outputTokens(d.outputs[1],profile,1).map((t,i)=>({outputTokenKey:t.key,sourceTokenKey:d.outputs[0].protectedTokenMappings[i].sourceTokenKey}));
  const result=proposal(submit(j,r));assert.equal(result.requirements.length,4);assert.equal(new Set(result.requirements.map(r=>r.id)).size,4);
});
test('merge preserves every selected source occurrence and requires duplicate partners',()=>{
  const j=job(),r=fake(j),d=r.decisions[1],partner=r.decisions[2],a=j.corpus.candidates[d.candidateKey],b=j.corpus.candidates[partner.candidateKey];
  d.choices.transformation='merge';const o=d.outputs[0];o.sourceCandidateKeys.push(b.candidateKey);o.bodyBlocks.push(...b.bodyBlocks);
  o.protectedTokenMappings=[];const pool=[...a.tokens,...b.tokens],used=new Set();for(const t of outputTokens(o,profile,0)){const s=pool.find(s=>!used.has(s.key)&&s.kind===t.kind&&s.value===t.value);used.add(s.key);o.protectedTokenMappings.push({outputTokenKey:t.key,sourceTokenKey:s.key});}
  partner.decision='duplicate';partner.duplicateOf=d.candidateKey;partner.outputs=[];
  assert.equal(proposal(submit(j,r)).requirements.length,2);
});
test('oversized context is retained with a blocking flag; no silent truncation',()=>{
  const i=input(),p=structuredClone(profile);p.limits.characters=5;const j=prepare([i],p);assert.ok(j.corpus.sections.every(s=>s.oversized));code(()=>submit(j,fake(j)),'candidate-blocked');
});
test('ledger resumes exact decisions, rejects concurrent writer and preserves interrupted pending files',()=>{
  const root=join(temp(),'job'),j=job(),first=createLedger(root,j);writeFileSync(join(root,'.pending-interrupted'),'partial');
  const state=submit(j,fake(j)),second=saveLedger(root,state,first.head);assert.deepEqual(loadLedger(root).state,state);code(()=>saveLedger(root,state,first.head),'ledger-conflict');
  writeFileSync(join(root,'.writer-lock'),'interrupted');code(()=>saveLedger(root,state,second.head),'ledger-locked');assert.equal(readFileSync(join(root,'.pending-interrupted'),'utf8'),'partial');
});
test('torn checkpoint returns last valid checkpoint with diagnostics and refuses new writes',()=>{
  const root=join(temp(),'job'),j=job(),first=createLedger(root,j);writeFileSync(join(root,'00000002.json'),'{');const recovered=loadLedger(root);assert.equal(recovered.head,first.head);assert.equal(recovered.diagnostics[0].code,'checkpoint-corrupt');code(()=>saveLedger(root,j,first.head),'checkpoint-corrupt');
});
test('rejects configuration outside document choice contract',()=>{const p=structuredClone(profile);p.choices.level.push('component');code(()=>checkProfile(p),'profile');});
test('same source rendered several times retains all occurrences and their different contexts',()=>{
  const j=job(),c=Object.values(j.corpus.candidates).find(c=>c.kind==='table-cell');
  assert.equal(c.occurrences.length,2);assert.ok(c.contexts.some(c=>c.kind==='alternate-occurrence'));
});
test('referenced table/caption, footnote and structured unit headers are supplied without flattening',()=>{
  const i=input();i.bundle.snapshot.nodes[0].content.push({kind:'footnote',label:'note'},{kind:'reference',label:'limits'});
  const table=i.bundle.snapshot.nodes[1];table.label='limits';table.caption=[{kind:'text',text:'At ≤ 25 °C'}];
  i.bundle.snapshot.nodes.push({path:[3],type:'footnote',label:'note',text:'Must remain below 5 V',content:[{kind:'text',text:'Must remain below 5 V'}]});
  const header=i.bundle.snapshot.nodes.find(n=>n.type==='cell');header.content=[{kind:'text',text:'m'},{kind:'superscript',children:[{kind:'text',text:'3'}]}];
  const c=collectCandidates([i],profile),p=Object.values(c.candidates).find(c=>c.kind==='paragraph'),cell=Object.values(c.candidates).find(c=>c.kind==='table-cell');
  assert.ok(p.contexts.some(c=>c.kind==='footnote'&&c.label==='note'));
  assert.ok(p.contexts.some(c=>c.kind==='reference'&&c.bodyBlocks[0].kind==='table'&&c.bodyBlocks[0].caption[0].text==='At ≤ 25 °C'));
  assert.ok(cell.contexts.find(c=>c.kind==='header').tokens.some(t=>t.kind==='superscript'));
});
test('numeric common conditions cannot be excluded to bypass protected tokens',()=>{
  const j=job(),c=Object.values(j.corpus.candidates)[0];c.contexts.push({key:'condition',kind:'caption',text:'≤ 25 °C',bodyBlocks:[{kind:'paragraph',text:'≤ 25 °C'}],tokens:protectedTokens('≤ 25 °C',profile,'condition')});
  const r=fake(j);code(()=>submit(j,r),'context-needed');
});
test('formatted exponents survive adoption and XHTML; flattening to plain digits is rejected',()=>{
  const i=input();const c=i.bundle.snapshot.nodes[0];c.content=[{kind:'text',text:'Must withstand 10'},{kind:'superscript',children:[{kind:'text',text:'3'}]},{kind:'text',text:' V'}];c.text='Must withstand 103 V';
  const j=prepare([i],profile),r=fake(j),next=submit(j,r);
  assert.ok(proposal(next).requirements[0].body[0].content.some(c=>c.kind==='superscript'));
  assert.match(exportReqif([proposal(next)],{testOnly:true}).xml,/<(?:xhtml:)?sup>3<\/(?:xhtml:)?sup>/);
  const broken=structuredClone(r);broken.decisions[0].outputs[0].bodyBlocks=[{kind:'paragraph',text:'Must withstand 103 V'}];code(()=>submit(j,broken),'protected-token');
});
test('detected contrasts remain explicit hints, not automatically resolved quality judgments',()=>{
  const i=input();i.bundle.snapshot.nodes.push({path:[3],type:'paragraph',text:'Voltage ≤ 6 V'});
  const j=prepare([i],profile);assert.ok(j.corpus.comparisons.some(h=>h.kind==='possible-conflict'));assert.ok(report(j).problems.some(p=>p.code==='possible-conflict'));
});
test('unsupported blocks stay in review inventory with diagnostics, malformed projection blocks preparation',()=>{
  const i=input();i.bundle.snapshot.nodes.push({path:[3],type:'future-block',text:'Must preserve 5 V'});const j=prepare([i],profile);assert.ok(report(j).problems.some(p=>p.code==='unsupported-segment'));
  const r=fake(j);r.decisions.at(-1).outputs[0].bodyBlocks=[{kind:'paragraph',text:'Must preserve 5 V'}];code(()=>submit(j,r),'candidate-blocked');
  i.bundle.snapshot.nodes[0].content={text:'wrong shape'};code(()=>prepare([i],profile),'projection-shape');
});
test('two independent source registries are retained when identical source occurrences are shared',()=>{
  const i=input(),second={...i,key:'other'},j=prepare([i,second],profile),c=Object.values(j.corpus.candidates)[0];
  assert.equal(c.occurrences.length,2);assert.equal(c.sourceKeys.length,2);assert.deepEqual(c.sourceKeys.map(k=>j.corpus.sources[k].sourceKey).sort(),['other','synthetic']);
});
test('split logical output keys preserve UUIDs when outputs move, and new parts receive new IDs',()=>{
  const j=job(),r=fake(j),d=r.decisions[0],c=j.corpus.candidates[d.candidateKey];d.choices.transformation='split';d.outputs.push({...structuredClone(d.outputs[0]),outputKey:'second'});
  const map=()=>d.outputs.forEach((o,i)=>{o.protectedTokenMappings=outputTokens(o,profile,i).map(t=>({outputTokenKey:t.key,sourceTokenKey:c.tokens.find(s=>s.value===t.value&&s.kind===t.kind).key}));});map();
  let saved=submit(j,r),ids=proposal(saved).requirements.slice(0,2).map(r=>r.id);
  saved=reopen(saved,r.sectionKey);r.requestId=saved.tickets[r.sectionKey];d.outputs.reverse();map();saved=submit(saved,r);
  assert.deepEqual(proposal(saved).requirements.slice(0,2).map(r=>r.id),ids.toReversed());
  saved=reopen(saved,r.sectionKey);r.requestId=saved.tickets[r.sectionKey];d.outputs[0].outputKey='new-part';saved=submit(saved,r);assert.notEqual(proposal(saved).requirements[0].id,ids[1]);
});
test('selected footnote definitions preserve exact protected tokens through model and trial XHTML',()=>{
  const j=job(),c=Object.values(j.corpus.candidates)[0],context={key:'note',kind:'footnote',label:'unit-note',text:'At ≤ 25 °C',bodyBlocks:[{kind:'paragraph',content:[{kind:'text',text:'At ≤ 25 °C'}]}],tokens:bodyTokens([{kind:'paragraph',text:'At ≤ 25 °C'}],profile,'note')};
  c.contexts.push(context);const r=fake(j),d=r.decisions[0],o=d.outputs[0];d.contextAssessments.find(a=>a.contextKey==='note').outcome='apply';o.contextKeys=['note'];o.bodyBlocks.push({kind:'paragraph',content:[{kind:'footnote',label:'unit-note'}]});
  const used=new Set(),pool=[...c.tokens,...context.tokens],notes=[{label:'unit-note',content:context.bodyBlocks[0].content}];o.protectedTokenMappings=outputTokens(o,profile,0,notes).map(t=>({outputTokenKey:t.key,sourceTokenKey:(()=>{const s=pool.find(s=>!used.has(s.key)&&s.kind===t.kind&&s.value===t.value);used.add(s.key);return s.key;})()}));
  const set=proposal(submit(j,r));assert.deepEqual(set.requirements[0].footnotes,notes);assert.ok(exportReqif([set],{testOnly:true}).xml.includes('At ≤ 25 °C'));
});
test('reopening a target invalidates the entire chain of dependent duplicate sections',()=>{
  const p=structuredClone(profile);p.limits.candidates=1;let j=prepare([input()],p);const sections=j.corpus.sections.filter(s=>s.candidateKeys.length);assert.equal(sections.length,3);
  let previous=null;
  for(const section of sections){const r=fake(j,section);if(previous){r.decisions[0].decision='duplicate';r.decisions[0].outputs=[];r.decisions[0].duplicateOf=previous;}j=submit(j,r);previous=r.decisions[0].candidateKey;}
  j=reopen(j,sections[0].key);assert.equal(Object.keys(j.responses).length,0);
});
test('unexpected proposed inline/list shapes return diagnostics rather than TypeError',()=>{
  const j=job(),r=fake(j);r.decisions[0].outputs[0].bodyBlocks=[{kind:'list',items:[{content:[null]}]}];code(()=>submit(j,r),'selection-shape');
});

test('unconfigured unit words adjacent to quantities cannot disappear',()=>{
  assert.ok(protectedTokens('5 rpm',profile).some(t=>t.kind==='quantity-word'&&t.value==='rpm'));
  const i=input();i.bundle.snapshot.nodes[0].text='Motor must reach 5 rpm';i.bundle.snapshot.nodes[0].content=[{kind:'text',text:'Motor must reach 5 rpm'}];
  const j=prepare([i],profile),r=fake(j);r.decisions[0].outputs[0].bodyBlocks[0].text='Motor must reach 5';code(()=>submit(j,r),'protected-token');
});
test('applied table header source chains reach both the batch catalog and new proposal',()=>{
  const j=job(),r=fake(j),index=r.decisions.findIndex(d=>j.corpus.candidates[d.candidateKey].kind==='table-cell'),d=r.decisions[index],c=j.corpus.candidates[d.candidateKey],header=c.contexts.find(c=>c.kind==='header');
  d.contextAssessments.find(a=>a.contextKey===header.key).outcome='apply';d.outputs[0].contextKeys=[header.key];d.outputs[0].bodyBlocks.push(...header.bodyBlocks);
  assert.ok(header.sourceKeys.every(k=>batch(j,r.sectionKey).sources[k]));
  const result=proposal(submit(j,r)).requirements[index];assert.ok(result.sources.some(s=>s.elementRef==='#/tables/0'&&s.selector==='cell:0:0'));
});
