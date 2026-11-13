import Ajv from 'ajv';
import { randomUUID } from 'node:crypto';
import { canonical, sha256, policy, newSet, newRequirement, validate } from './model.mjs';
import { collectCandidates, candidateKey, keyOf } from './candidates.mjs';
import { selectionSchema } from './selection-schema.mjs';
import { bodyTokens } from './protected.mjs';

export function reject(code, message, location = []) {
  throw Object.assign(new Error(message), { diagnostics: [{ file: 'candidate-job', location, code, severity: 'error', message }] });
}
export function checkProfile(p) {
  const check = (v, message) => { if (!v) reject('profile', message); };
  check(p && typeof p.id === 'string' && typeof p.version === 'string' && typeof p.ruleVersion === 'string', '프로파일 식별/버전이 필요합니다');
  check(Number.isSafeInteger(p.limits?.candidates) && p.limits.candidates > 0 && Number.isSafeInteger(p.limits?.characters) && p.limits.characters > 0, '구획 상한은 양의 정수입니다');
  for (const k of ['units', 'negations']) check(Array.isArray(p[k]) && p[k].length && p[k].every(s => typeof s === 'string' && s.trim()), '보호 토큰 목록이 필요합니다');
  for (const k of ['mandatory', 'recommended', 'permitted']) check(Array.isArray(p.obligations?.[k]) && p.obligations[k].every(s => typeof s === 'string' && s.trim()), '의무 탐지 목록이 필요합니다');
  for (const k of ['includeNumeric', 'includeTableRows', 'includeTableCells']) check(typeof p[k] === 'boolean', '탐지 스위치가 필요합니다');
  check(canonical(Object.keys(p.choices ?? {}).sort()) === canonical(['kind', 'level', 'origin', 'strength', 'verification']), '선택 분류 필드가 다릅니다');
  for (const [k, values] of Object.entries(p.choices)) check(Array.isArray(values) && values.length && new Set(values).size === values.length && values.every(v => policy[k].includes(v) || v === 'unknown'), '문서 프로파일에 없는 분류값');
  check(Array.isArray(p.transformations) && p.transformations.length && p.transformations.every(v => ['keep', 'split', 'merge'].includes(v)), '분해 정책이 올바르지 않습니다');
  check(Array.isArray(p.quality) && p.quality.length && p.quality.every(v => ['same', 'intended-difference', 'conflict', 'ambiguous', 'undetermined'].includes(v)), '품질 선택이 올바르지 않습니다');
  return p;
}
export function fingerprints(inputs, profile) {
  checkProfile(profile);
  if (!inputs.length || new Set(inputs.map(i => i.key)).size !== inputs.length || inputs.some(i => !/^[a-zA-Z0-9_-]+$/.test(i.key))) reject('inputs', '고유한 입력 키와 하나 이상의 문서가 필요합니다');
  return { policyDigest: sha256(canonical(profile)), inputDigest: sha256(canonical(inputs.map(i => ({ key: i.key, complete: i.bundle.complete, provenance: i.bundle.provenance, snapshot: i.bundle.snapshot })).sort((a,b) => a.key.localeCompare(b.key)))) };
}
function tickets(job) {
  return Object.fromEntries(job.corpus.sections.map(s => [s.key, randomUUID()]));
}
export function prepare(inputs, profile) {
  const f = fingerprints(inputs, profile);
  let corpus;
  try { corpus = collectCandidates(inputs, profile); }
  catch (e) { if (e.diagnostics) throw e; reject('projection-shape', '공개 읽기 구조를 후보로 보존할 수 없습니다', e.location); }
  const job = { schemaVersion: 1, jobId: randomUUID(), epoch: 1, ...f, profile, corpus, responses: {}, ids: {}, history: [], proposals: [], set: newSet({ title: '요구사항 제안' }), registry: inputs.map(i => ({ sourceKey: i.key, artifactDigest: 'sha256:' + i.bundle.provenance.source.docling.sha256, nativeDigest: 'sha256:' + i.bundle.provenance.document.revision, nativeFile: i.key + '/' + i.bundle.provenance.document.relativePath, mapFile: i.key + '/provenance.json' })) };
  job.tickets = tickets(job); return job;
}
export function refresh(job, inputs, profile) {
  const f = fingerprints(inputs, profile);
  if (f.inputDigest === job.inputDigest && f.policyDigest === job.policyDigest && !job.blocked) return structuredClone(job);
  const next = prepare(inputs, profile);
  return { ...next, jobId: job.jobId, epoch: job.epoch + 1, set: job.set, ids: job.ids, history: [...job.history, { epoch:job.epoch, inputDigest:job.inputDigest, policyDigest:job.policyDigest, responses:job.responses, reason:'input-or-policy-invalidated' }], proposals:job.proposals };
}
export function invalidate(job, diagnostics) {
  return { ...job, epoch: job.epoch + 1, tickets: {}, responses: {}, blocked: diagnostics, history: [...job.history, { epoch:job.epoch, responses:job.responses, reason:'input-unreadable' }] };
}
export function batch(job, sectionKey) {
  if (job.blocked) reject('input-blocked', '입력 무결성을 복구하고 resume해야 합니다');
  const section = job.corpus.sections.find(s => s.key === sectionKey);
  if (!section) reject('section', '없는 구획');
  return { schemaVersion:1, requestId:job.tickets[sectionKey], inputDigest:job.inputDigest, policyDigest:job.policyDigest, epoch:job.epoch, sectionKey, section, candidates:section.candidateKeys.map(k => job.corpus.candidates[k]), sources:Object.fromEntries([...new Set([...section.units,...section.candidateKeys.map(k=>job.corpus.candidates[k])].flatMap(u=>[...u.sourceKeys,...u.contexts.flatMap(c=>c.sourceKeys??[])]))].map(k=>[k,job.corpus.sources[k]])), profile:job.profile, comparisonHints:(job.corpus.comparisons??[]).filter(h=>h.candidateKeys.some(k=>section.candidateKeys.includes(k))), previous:job.responses[sectionKey] ?? null };
}
function outputNotes(output, candidate) {
  const notes=candidate.contexts.filter(c => c.kind === 'footnote' && output.contextKeys.includes(c.key)).map(c => ({label:c.label, content:c.bodyBlocks[0].content ?? [{kind:'text',text:c.text}]}));
  const byLabel=new Map();for(const note of notes) {if(byLabel.has(note.label)&&canonical(byLabel.get(note.label))!==canonical(note)) reject('footnote-collision','서로 다른 출처의 같은 미주 레이블을 먼저 구분해야 합니다');byLabel.set(note.label,note);}return [...byLabel.values()];
}
export const outputTokens = (output, profile, index, notes=[]) => bodyTokens([{kind:'paragraph',text:output.title},...output.bodyBlocks,...notes.map(n=>({kind:'paragraph',content:n.content}))],profile,'output/' + index);
export function previewTokens(job,response) { return response.decisions.filter(d=>d.decision==='adopt').map(d=>({candidateKey:d.candidateKey,outputs:d.outputs.map((o,i)=>outputTokens(o,job.profile,i,outputNotes(o,{contexts:[...new Map(o.sourceCandidateKeys.flatMap(k=>job.corpus.candidates[k].contexts).map(c=>[c.key,c])).values()]})))})); }
function mappingCheck(outputs, pool, required, profile, candidates, applied) {
  const covered = new Set();
  for (const [index, output] of outputs.entries()) {
    const tokens = outputTokens(output, profile, index, outputNotes(output,{contexts:applied}));
    const allowed = new Set([...output.sourceCandidateKeys.flatMap(k=>candidates[k].tokens), ...applied.filter(c=>output.contextKeys.includes(c.key)).flatMap(c=>c.tokens)].map(t=>t.key));
    const seen = new Set();
    for (const m of output.protectedTokenMappings) {
      const token = tokens.find(t => t.key === m.outputTokenKey), original = pool.get(m.sourceTokenKey);
      if (!token || !original || !allowed.has(original.key) || token.kind !== original.kind || token.value !== original.value || seen.has(token.key)) reject('protected-token', '수치·단위·부호·첨자의 추가/변경 또는 중복 대응');
      seen.add(token.key); covered.add(original.key);
    }
    if (seen.size !== tokens.length) reject('protected-token', '대응이 없는 출력 보호 토큰');
  }
  if (required.some(t => !covered.has(t.key))) reject('protected-token', '원문 보호 토큰이 누락됐습니다');
}
export function submit(job, response) {
  try {return submitChecked(job,response);}
  catch(e) {if(e.diagnostics) throw e;reject('selection-shape','제안 본문의 구조를 보존할 수 없습니다',[response?.sectionKey??'selection']);}
}
function submitChecked(job, response) {
  if (job.blocked) reject('input-blocked', '입력이 무효화됐습니다');
  const schemaCheck = new Ajv({ allErrors:true, strict:true }).compile(selectionSchema(job.profile));
  if (!schemaCheck(response)) reject('selection-schema', '선택 schema 위반: ' + new Ajv().errorsText(schemaCheck.errors));
  const b = batch(job, response.sectionKey);
  for (const k of ['requestId', 'inputDigest', 'policyDigest', 'epoch']) if (response[k] !== b[k]) reject('late-response', '입력·정책·구획 요청이 바뀐 늦은 응답');
  if (job.responses[response.sectionKey]) reject('late-response', '이미 처리한 구획입니다. reopen 뒤 새 요청을 읽으세요');
  const reason = value => { if (!value.trim()) reject('reason', '빈 이유는 허용하지 않습니다'); };
  reason(response.sectionReview.reason);
  if (response.sectionReview.overlookedSegmentKeys.length) reject('supplement-required', '놓친 구획을 supplement로 후보에 추가하고 새 묶음을 읽으세요');
  const keys = response.decisions.map(d => d.candidateKey);
  if (new Set(keys).size !== keys.length || canonical([...keys].sort()) !== canonical([...b.section.candidateKeys].sort())) reject('decision-coverage', '구획의 모든 후보를 정확히 한 번 판단해야 합니다');
  const decisions = new Map(response.decisions.map(d => [d.candidateKey, d]));
  for (const d of response.decisions) {
    reason(d.reason);
    const c = job.corpus.candidates[d.candidateKey];
    if (d.decision === 'duplicate') { if (!d.duplicateOf || d.duplicateOf === d.candidateKey || !job.corpus.candidates[d.duplicateOf]) reject('duplicate-target', '유효한 다른 중복 대상이 필요합니다'); }
    else if (d.duplicateOf !== null) reject('duplicate-target', '중복 결정에만 중복 대상을 기록합니다');
    if (d.decision !== 'adopt') { if (d.outputs.length) reject('decision-output', '채택에만 제안 본문을 기록합니다'); continue; }
    if (Object.values(d.choices).includes('unknown') || ['conflict','ambiguous','undetermined'].includes(d.choices.quality) || d.unresolved.length) reject('unresolved', '모르는 분류·충돌·미해결은 보류 또는 문맥 부족으로 남겨야 합니다');
    if (c.provisional || c.unsupported || b.section.oversized) reject('candidate-blocked', '출처 없는/미지원/구획 상한 초과 후보는 채택할 수 없습니다');
    const assessments = d.contextAssessments;
    if (new Set(assessments.map(a => a.contextKey)).size !== assessments.length || canonical(assessments.map(a => a.contextKey).sort()) !== canonical(c.contexts.map(a => a.key).sort())) reject('context-coverage', '모든 문맥의 적용 여부와 이유를 기록해야 합니다');
    for (const a of assessments) { reason(a.reason); const context=c.contexts.find(c=>c.key===a.contextKey); if(['header','caption','footnote','list-parent'].includes(context.kind)&&context.tokens.length&&a.outcome!=='apply') reject('context-needed','수치·단위·부정이 있는 공통 문맥을 생략할 수 없습니다'); if (a.outcome === 'needs-more' || c.contexts.find(c => c.key === a.contextKey).kind === 'unresolved-reference') reject('context-needed', '미확인 문맥·참조를 먼저 해결하세요'); }
    const applied = c.contexts.filter(c => assessments.some(a => a.contextKey === c.key && a.outcome === 'apply'));
    const selected = new Set(d.outputs.flatMap(o => o.sourceCandidateKeys));
    if (!selected.has(c.candidateKey) || [...selected].some(k => !decisions.has(k))) reject('source-candidate', '같은 묶음에서 제공한 출처 후보만 사용할 수 있습니다');
    if(new Set(d.outputs.map(o=>o.outputKey)).size!==d.outputs.length) reject('output-key','출력의 논리 항목 키가 중복됐습니다');
    const transformation = d.choices.transformation;
    if ((transformation === 'split' ? d.outputs.length < 2 : d.outputs.length !== 1) || (transformation === 'merge' ? selected.size < 2 : selected.size !== 1)) reject('transformation', '유지/분해/통합의 출력 수와 출처 수가 맞지 않습니다');
    for (const k of selected) if (k !== c.candidateKey && (decisions.get(k).decision !== 'duplicate' || decisions.get(k).duplicateOf !== c.candidateKey)) reject('merge-partner', '통합한 나머지 후보는 이 채택안의 중복으로 기록하세요');
    const originals = [...selected].map(k => job.corpus.candidates[k]);
    if (originals.some(o => o.provisional || o.unsupported)) reject('source-candidate', '통합 출처가 미지원/미확인입니다');
    for (const partner of originals.filter(o=>o.candidateKey!==c.candidateKey)) {
      const pd=decisions.get(partner.candidateKey);
      if(canonical(pd.contextAssessments.map(a=>a.contextKey).sort())!==canonical(partner.contexts.map(c=>c.key).sort())) reject('context-coverage','통합 출처의 문맥도 모두 판단해야 합니다');
      for(const a of pd.contextAssessments) {reason(a.reason); const context=partner.contexts.find(c=>c.key===a.contextKey); if(['header','caption','footnote','list-parent','unresolved-reference'].includes(context.kind)&&(context.tokens.length||context.kind==='unresolved-reference')&&a.outcome!=='apply') reject('context-needed','통합 출처의 공통 문맥을 생략할 수 없습니다'); if(a.outcome==='needs-more') reject('context-needed','통합 출처의 문맥이 부족합니다');}
      applied.push(...partner.contexts.filter(c=>pd.contextAssessments.some(a=>a.contextKey===c.key&&a.outcome==='apply')));
    }
    if(applied.some(a=>!d.outputs.some(o=>o.contextKeys.includes(a.key)))) reject('context-coverage','적용 문맥은 출력에 연결해야 합니다');
    const required = [...originals.flatMap(c => c.tokens), ...applied.flatMap(c => c.tokens)];
    const pool = new Map(required.map(t => [t.key,t]));
    for (const output of d.outputs) {
      reason(output.title); reason(output.rationale);
      if (!output.sourceCandidateKeys.length || output.sourceCandidateKeys.some(k => !selected.has(k))) reject('source-candidate', '각 결과에 출처 후보가 필요합니다');
      if (output.contextKeys.some(k => !applied.some(a => a.key === k))) reject('context-source', '적용했다고 판단한 문맥만 사용할 수 있습니다');
      if (d.choices.origin === 'quoted' && !originals.some(o => canonical(o.bodyBlocks) === canonical(output.bodyBlocks))) reject('quoted-changed', 'quoted는 원문 구조를 그대로 사용해야 합니다');
      const r = newRequirement({ ...d.choices, body:output.bodyBlocks, title:output.title, rationale:output.rationale, footnotes:outputNotes(output,{contexts:applied}), sources:[...new Set([...originals.flatMap(c=>c.sourceKeys),...applied.filter(c=>output.contextKeys.includes(c.key)).flatMap(c=>c.sourceKeys??[])])].map(k=>job.corpus.sources[k]) });
      const v = validate([{ ...job.set, registry:job.registry, requirements:[r] }]).filter(x => x.severity === 'error');
      if (v.length) throw Object.assign(new Error('제안 본문 프로파일 위반'), {diagnostics:v});
    }
    mappingCheck(d.outputs, pool, required, job.profile, job.corpus.candidates, applied);
  }
  // A duplicate must terminate at a real adopted item; cycles and chains to holds are rejected.
  for (const d of response.decisions.filter(d => d.decision === 'duplicate')) {
    const seen = new Set([d.candidateKey]); let target = d.duplicateOf;
    while (true) {
      if (seen.has(target)) reject('duplicate-cycle', '중복 판단 순환'); seen.add(target);
      const other = decisions.get(target) ?? Object.values(job.responses).flatMap(r => r.decisions).find(d => d.candidateKey === target);
      if (!other) reject('duplicate-pending', '중복 대상의 채택 판단이 아직 없습니다');
      if (other.decision === 'adopt') break;
      if (other.decision !== 'duplicate') reject('duplicate-pending', '중복 대상이 채택되지 않았습니다');
      target = other.duplicateOf;
    }
  }
  const next = structuredClone(job); next.responses[response.sectionKey] = response;
  for (const d of response.decisions.filter(d => d.decision === 'adopt')) for (let i=0;i<d.outputs.length;i++) {
    const key = identity(d,i); next.ids[key] ??= newRequirement({}).id;
  }
  return next;
}
const identity = (d,i) => keyOf({candidate:d.candidateKey, transformation:d.choices.transformation, sources:[...new Set(d.outputs.flatMap(o=>o.sourceCandidateKeys))].sort(), outputKey:d.outputs[i].outputKey});
export function reopen(job, sectionKey) {
  batch(job,sectionKey); const next = structuredClone(job);
  next.history.push({epoch:job.epoch, sectionKey, response:job.responses[sectionKey] ?? null, reason:'reopen'});
  delete next.responses[sectionKey]; next.tickets[sectionKey] = randomUUID();
  // Invalidate the complete dependency closure, including chains through other sections.
  const invalid=new Set([sectionKey]); let changed=true;
  while(changed) { changed=false;for(const [key,response] of Object.entries(next.responses)) if(response.decisions.some(d=>d.duplicateOf&&invalid.has(job.corpus.candidates[d.duplicateOf]?.sectionKey))) {next.history.push({epoch:job.epoch,sectionKey:key,response,reason:'dependency-reopened'});delete next.responses[key];next.tickets[key]=randomUUID();invalid.add(key);changed=true;} }
  return next;
}
export function supplement(job, sectionKey, unitKeys) {
  const next = reopen(job, sectionKey), section = next.corpus.sections.find(s=>s.key===sectionKey);
  if (!unitKeys.length || new Set(unitKeys).size!==unitKeys.length) reject('supplement', '고유한 기존 구획 항목 키가 필요합니다');
  for (const k of unitKeys) {
    const u = section.units.find(u=>u.key===k); if (!u) reject('supplement', '구획에서 제공한 항목만 추가할 수 있습니다');
    const key=candidateKey(u,next.corpus.sources,next.profile);
    if (next.corpus.candidates[key]) reject('supplement', '이미 존재하는 후보입니다');
    next.corpus.candidates[key]={...u, candidateKey:key, sectionKey, provisional:!u.sourceKeys.length, reasons:[...u.reasons,'assistant-discovered']}; section.candidateKeys.push(key);
  }
  return next;
}
export function report(job) {
  const problems=(job.corpus.comparisons??[]).map(h=>({code:h.kind,...h})), accepted=[];
  for (const s of job.corpus.sections) {
    const response=job.responses[s.key];
    if (!response) problems.push({sectionKey:s.key,code:'unprocessed-section',candidateCount:s.candidateKeys.length});
    if (s.oversized) problems.push({sectionKey:s.key,code:'oversized-section'});
    for (const u of s.units.filter(u=>u.unsupported)) problems.push({sectionKey:s.key,unitKey:u.key,code:'unsupported-segment',kind:u.kind});
    for (const d of response?.decisions ?? []) {
      if (d.decision==='adopt') {
        accepted.push({sectionKey:s.key,candidateKey:d.candidateKey,outputCount:d.outputs.length,decisionDigest:sha256(canonical(d))});
        problems.push({sectionKey:s.key,candidateKey:d.candidateKey,code:'source-review-required',message:'후보 판단은 출처 검수 완료가 아닙니다'});
        if(d.choices.quality!=='same') problems.push({sectionKey:s.key,candidateKey:d.candidateKey,code:'judgment-difference',reason:d.reason});
      } else if (!['non-requirement','duplicate'].includes(d.decision)) problems.push({sectionKey:s.key,candidateKey:d.candidateKey,code:d.decision,reason:d.reason,unresolved:d.unresolved});
      for (const key of job.corpus.candidates[d.candidateKey].sourceKeys) for (const diagnostic of job.corpus.sources[key].trace.diagnostics) if(diagnostic.code!=='source-review-required') problems.push({sectionKey:s.key,candidateKey:d.candidateKey,...diagnostic});
    }
  }
  return {jobId:job.jobId,epoch:job.epoch,inputDigest:job.inputDigest,policyDigest:job.policyDigest,blocked:job.blocked??null,counts:{sections:job.corpus.sections.length,checkedSections:Object.keys(job.responses).length,candidates:Object.keys(job.corpus.candidates).length,decisions:Object.values(job.responses).reduce((n,r)=>n+r.decisions.length,0),adopted:accepted.length},problems,accepted,reviewState:'draft-only'};
}
export function proposal(job) {
  if(job.blocked || job.corpus.sections.some(s=>!job.responses[s.key])) reject('incomplete-review','모든 구획(후보 없는 곳 포함)을 비서가 확인해야 새 제안 문서를 만들 수 있습니다');
  const requirements=[];
  for (const s of job.corpus.sections) for (const d of job.responses[s.key].decisions.filter(d=>d.decision==='adopt')) for (const [i,o] of d.outputs.entries()) {
    const selected=o.sourceCandidateKeys.map(k=>job.corpus.candidates[k]);
    const sourceKeys=[...new Set([...selected.flatMap(c=>c.sourceKeys),...selected.flatMap(c=>c.contexts.filter(c=>o.contextKeys.includes(c.key)).flatMap(c=>c.sourceKeys??[]))])];
    const sources=[...new Map(sourceKeys.map(k=>job.corpus.sources[k]).map(s=>[canonical(s),s])).values()];
    const {transformation,quality,...choices}=d.choices;
    requirements.push({...newRequirement({...choices,title:o.title,body:o.bodyBlocks,rationale:o.rationale,sources,footnotes:outputNotes(o,{contexts:[...new Map(o.sourceCandidateKeys.flatMap(k=>job.corpus.candidates[k].contexts).map(c=>[c.key,c])).values()]})}),id:job.ids[identity(d,i)]});
  }
  if(!requirements.length) reject('empty-proposal','채택된 항목이 없습니다. 보류·제외 원장은 보존됩니다');
  const result={...job.set,registry:job.registry,requirements};
  const errors=validate([result]).filter(d=>d.severity==='error'); if(errors.length) throw Object.assign(new Error('제안 문서 검증 실패'),{diagnostics:errors});
  return result;
}
