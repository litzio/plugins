import { createHash, randomUUID } from 'node:crypto';

export const policy = Object.freeze({
  kind: ['functional', 'performance', 'interface', 'constraint', 'safety', 'unknown'],
  level: ['stakeholder', 'system'], origin: ['quoted', 'derived'],
  strength: ['mandatory', 'recommended', 'permitted'],
  status: ['draft', 'reviewed', 'confirmed', 'obsolete'],
  verification: ['test', 'analysis', 'inspection', 'demonstration', 'undecided'],
});
export const strengthTerms = { mandatory: ['shall', 'must', '해야 한다'], recommended: ['should', '권고한다'], permitted: ['may', '허용한다'] };
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const canonical = value => JSON.stringify(sort(value));
function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]));
  return v;
}
export const sha256 = value => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
export function semantic(r) {
  return Object.fromEntries(['id', 'title', 'body', ...Object.keys(policy).filter(k => k !== 'status'), 'rationale', 'sources', 'relations'].map(k => [k, r[k]]));
}
export const digest = r => sha256(canonical(semantic(r)));
export const effectiveStatus = r => r.status === 'confirmed' && r.confirmedDigest !== digest(r) ? 'reviewed' : r.status;
export const newRequirement = values => ({ kind: 'unknown', level: 'system', origin: 'derived', strength: 'mandatory', status: 'draft', verification: 'undecided', rationale: '', confirmedDigest: '', body: [], sources: [], relations: [], ...values, id: 'req-' + randomUUID() });
export const newSet = values => ({ title: '요구사항 문서', profile: 'requirements-extract/1', defaultLevel: 'system', exportNamespace: randomUUID(), registry: [], requirements: [], ...values, setId: 'set-' + randomUUID() });

export function validate(sets, { formal = false } = {}) {
  const diagnostics = [];
  if (!sets.length) return [{ file: '', location: [1], code: 'empty-set', severity: 'error', message: '하나 이상의 기준 문서가 필요합니다' }];
  const add = (s, r, code, message, severity = 'error') => diagnostics.push({ file: s.file ?? '', location: r?.location ?? [1], code, severity, message });
  const ids = new Map(), setIds = new Set();
  const ns = sets[0]?.exportNamespace;
  for (const s of sets) {
    diagnostics.push(...(s.diagnostics ?? []));
    if (s.profile !== 'requirements-extract/1') add(s, null, 'profile', '지원하지 않는 문서 프로파일');
    if (!uuid.test(s.setId?.slice(4)) || !s.setId?.startsWith('set-')) add(s, null, 'set-id', 'set-UUID v4가 필요합니다');
    if (setIds.has(s.setId)) add(s, null, 'duplicate-set', '문서 집합 ID가 중복됩니다');
    setIds.add(s.setId);
    if (!uuid.test(s.exportNamespace) || ns !== s.exportNamespace) add(s, null, 'namespace', '문서 전체에 같은 UUID v4 namespace가 필요합니다');
    if (!policy.level.includes(s.defaultLevel)) add(s, null, 'default-level', '기본 수준이 올바르지 않습니다');
    const keys = new Set();
    for (const src of s.registry) {
      if (!src.sourceKey || keys.has(src.sourceKey)) add(s, null, 'source-key', '출처 등록 키가 없거나 중복됩니다');
      keys.add(src.sourceKey);
      for (const k of ['artifactDigest', 'nativeDigest']) if (!/^sha256:[a-f0-9]{64}$/.test(src[k])) add(s, null, 'source-digest', '출처 등록 해시가 올바르지 않습니다');
      for (const k of ['nativeFile', 'mapFile']) if (!src[k] || /^(?:[a-z]:|[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)/i.test(src[k])) add(s, null, 'source-path', '출처 경로는 집합 안의 상대 경로여야 합니다');
    }
    for (const r of s.requirements) {
      if (!r.id?.startsWith('req-') || !uuid.test(r.id.slice(4))) add(s, r, 'id', 'req-UUID v4가 필요합니다');
      if (ids.has(r.id)) add(s, r, 'duplicate-id', '복제된 요구사항 ID: ' + r.id);
      ids.set(r.id, { s, r });
      for (const [k, values] of Object.entries(policy)) if (!values.includes(r[k])) add(s, r, 'unknown-value', k + ' 값이 허용 목록에 없습니다');
      if (!r.title?.trim() || !r.body?.length || r.body.every(b => b.kind === 'paragraph' && !b.text?.trim() && !b.content?.length)) add(s, r, 'required', '제목과 본문이 필요합니다');
      if (r.origin === 'derived' && !r.rationale?.trim()) add(s, r, 'rationale', '도출 근거가 필요합니다');
      if (!r.sources?.length) add(s, r, 'sources', '하나 이상의 출처가 필요합니다');
      for (const src of r.sources ?? []) {
        if (!keys.has(src.sourceKey) || !src.elementRef) add(s, r, 'broken-source', '출처 등록 또는 요소 참조가 없습니다');
        if (!/^(full|text:\d+:\d+|cell:\d+:\d+)$/.test(src.selector) || (src.selector.startsWith('text:') && Number(src.selector.split(':')[1]) >= Number(src.selector.split(':')[2]))) add(s, r, 'selector', '출처 범위가 올바르지 않습니다');
        if (!src.quote || src.quoteDigest !== sha256(src.quote)) add(s, r, 'quote-digest', '인용문 해시가 일치하지 않습니다');
      }
      const checkInline = content => {
        for (const c of content) {
          if (!['text', 'strong', 'emphasis', 'subscript', 'superscript', 'code'].includes(c.kind)) add(s, r, 'unsupported-inline', '수식·참조·기타 인라인 요소는 PR1 내보내기를 차단합니다');
          const allowed = ['text', 'code'].includes(c.kind) ? ['kind', 'text'] : ['kind', 'children'];
          if (Object.keys(c).some(k => !allowed.includes(k))) add(s, r, 'unmapped-semantic', '인라인 요소에 보존할 수 없는 필드가 있습니다');
          if (c.children) checkInline(c.children);
        }
      };
      for (const b of r.body ?? []) {
        if (!['paragraph', 'table'].includes(b.kind)) add(s, r, 'unsupported-body', '목록·첨부·수식·그림·기타 블록은 PR1에서 내보낼 수 없습니다');
        const allowed = b.kind === 'paragraph' ? ['kind', 'text', 'content'] : ['kind', 'rows'];
        if (Object.keys(b).some(k => !allowed.includes(k))) add(s, r, 'unmapped-semantic', '본문 요소에 보존할 수 없는 필드가 있습니다');
        if (b.content) checkInline(b.content);
        if (b.kind === 'table' && (!b.rows?.length || !b.rows[0]?.length || b.rows.some(row => !Array.isArray(row) || row.length !== b.rows[0].length || row.some(c => typeof c !== 'string')))) add(s, r, 'body-table', '본문 표는 평문 셀과 머리행이 있는 직사각형이어야 합니다');
      }
      if (r.status === 'confirmed' && effectiveStatus(r) !== 'confirmed') add(s, r, 'confirmation-stale', '내용 변경으로 유효 상태를 reviewed로 낮춥니다', formal ? 'error' : 'warning');
      if (formal && (!['confirmed', 'obsolete'].includes(effectiveStatus(r)) || r.kind === 'unknown' || r.verification === 'undecided')) add(s, r, 'not-confirmed', '미확정·미분류·검증 방법 미정 항목은 정식 내보내기를 막습니다');
    }
  }
  const edges = new Map();
  for (const { s, r } of ids.values()) {
    edges.set(r.id, []);
    for (const rel of r.relations ?? []) {
      if (!['refines', 'relatesTo'].includes(rel.role)) add(s, r, 'relation-role', '허용하지 않는 연결 역할');
      if (!ids.has(rel.targetId)) add(s, r, 'broken-relation', '대상 요구사항이 선택한 집합에 없습니다');
      if (rel.targetId === r.id) add(s, r, 'self-reference', '자기 참조는 허용하지 않습니다');
      if (!rel.rationale?.trim()) add(s, r, 'relation-rationale', '연결 근거가 필요합니다');
      if (rel.role === 'refines') {
        edges.get(r.id).push(rel.targetId);
        if (ids.has(rel.targetId) && !(r.level === 'system' && ids.get(rel.targetId).r.level === 'stakeholder')) add(s, r, 'level-order', '기본 수준 조합(system → stakeholder)이 아닙니다', 'warning');
      }
    }
  }
  const active = new Set(), done = new Set();
  function visit(id) {
    if (active.has(id)) { const { s, r } = ids.get(id); add(s, r, 'cycle', 'refines 연결이 순환합니다'); return; }
    if (done.has(id) || !ids.has(id)) return;
    active.add(id); for (const next of edges.get(id) ?? []) visit(next); active.delete(id); done.add(id);
  }
  for (const id of ids.keys()) visit(id);
  return diagnostics;
}
