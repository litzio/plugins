// Input is the public `inspect --format json` result, never an internal AST.
import { validate } from './model.mjs';
import { auditCoverage } from './coverage.mjs';
import { bodyFields, fromSnapshot, walkContent } from './body.mjs';
import { canonical } from './model.mjs';
export const fields = ['id', 'kind', 'level', 'origin', 'strength', 'status', 'verification', 'rationale', 'confirmedDigest'];
export const setFields = ['profile', 'setId', 'exportNamespace', 'defaultLevel'];
export const registryFields = ['sourceKey', 'artifactDigest', 'nativeFile', 'nativeDigest', 'mapFile'];
export const sourceFields = ['sourceKey', 'elementRef', 'selector', 'quote', 'quoteDigest'];
export const relationFields = ['role', 'targetId', 'rationale'];

function readProfile(input, file = '', snapshot) {
  if (!input.ok || !Array.isArray(input.nodes)) throw new Error('성공한 CLI inspect JSON이 필요합니다');
  if (snapshot) {
    if (!Array.isArray(snapshot.blocks)) throw new Error('snapshot blocks 배열이 필요합니다');
    for (const block of snapshot.blocks) fromSnapshot(block); // shape preflight for every location
  }
  const diagnostics = [];
  const issue = (node, code, message) => diagnostics.push({ file, location: node?.path ?? [1], code, severity: 'error', message });
  const top = input.nodes.filter(n => n.path.length === 1);
  const consumed = new Set();
  const consume = node => { if (node) consumed.add(JSON.stringify(node.path)); return node; };
  let at = 0;
  const take = () => consume(top[at++]);
  const bodyPaths = new Set();
  function table(columns) {
    const n = take();
    if (n?.type !== 'table') { issue(n, 'table-required', '정해진 위치에 표가 필요합니다'); return []; }
    const cells = input.nodes.filter(c => c.type === 'cell' && c.path[0] === n.path[0]);
    const rows = [];
    for (const c of cells) { consume(c); (rows[c.path[1]] ??= [])[c.path[2]] = c.text; }
    const actualColumns = columns === sourceFields && JSON.stringify(rows[0]) === JSON.stringify([...columns, 'trace']) ? [...columns, 'trace'] : columns;
    if (JSON.stringify(rows[0]) !== JSON.stringify(actualColumns) || rows.some(r => r.length !== actualColumns.length)) issue(n, 'table-columns', '표 열 또는 모양이 프로파일과 다릅니다');
    return rows.slice(1).map(r => {
      const row = Object.fromEntries(actualColumns.map((k, i) => [k, r[i] ?? '']));
      if (Object.hasOwn(row, 'trace')) { try { row.trace = JSON.parse(row.trace); } catch { issue(n, 'source-trace', '출처 trace JSON이 올바르지 않습니다'); } }
      return row;
    });
  }
  function properties(expected) {
    const rows = table(['필드', '값']); const result = {};
    for (const row of rows) {
      if (!expected.includes(row.필드)) issue(top[at - 1], 'unknown-field', '알 수 없는 속성: ' + row.필드);
      if (Object.hasOwn(result, row.필드)) issue(top[at - 1], 'duplicate-field', '중복 속성: ' + row.필드);
      result[row.필드] = row.값;
    }
    for (const k of expected) if (!Object.hasOwn(result, k)) issue(top[at - 1], 'missing-field', '필수 속성 누락: ' + k);
    return result;
  }
  const h1 = take();
  if (h1?.type !== 'heading' || h1.level !== 1) issue(h1, 'document-heading', '첫 블록은 H1이어야 합니다');
  const s = { ...properties(setFields), title: input.title ?? '', heading: h1?.text ?? '', file, revision: input.revision, registry: table(registryFields), requirements: [], diagnostics };
  while (at < top.length) {
    if (top[at].type === 'footnote') { take(); continue; }
    const target = take(), heading = take();
    if (target?.type !== 'target' || heading?.type !== 'heading' || heading.level !== 2) { issue(target, 'requirement-boundary', '요구사항은 레이블과 H2로 시작해야 합니다'); break; }
    const r = { ...properties(fields), title: heading.text, location: heading.path, body: [], sources: [], relations: [] };
    const titleContent = snapshot?.blocks?.find(b => b.path[0] === heading.path[0])?.content;
    if (titleContent?.some(c => c.kind !== 'text')) r.titleContent = titleContent;
    if (target.label !== r.id) issue(target, 'label-id', '레이블과 ID가 다릅니다');
    for (const name of ['본문', '출처', '연결']) {
      const section = take();
      if (section?.type !== 'heading' || section.level !== 3 || section.text !== name) issue(section, 'section', 'H3 구획이 필요합니다: ' + name);
      if (name === '출처') r.sources = table(sourceFields);
      else if (name === '연결') r.relations = table(relationFields);
      else while (at < top.length && top[at].type !== 'heading' && top[at].type !== 'target') {
        const b = top[at];
        const rich = snapshot?.blocks?.find(n => n.path[0] === b.path[0]);
        if (rich && bodyFields[b.type]) {
          take(); bodyPaths.add(b.path[0]);
          for (const node of input.nodes.filter(n => n.path[0] === b.path[0])) consume(node);
          r.body.push(fromSnapshot(rich));
          if (['figure', 'equation'].includes(b.type)) issue(b, b.type === 'figure' ? 'attachment-required' : 'formula-render-required', '캡션/수식은 보존했으며 PNG·첨부 내보내기는 이후 PR입니다');
        }
        else if (b.type === 'paragraph') {
          take();
          const rich = snapshot?.blocks?.find(n => n.path[0] === b.path[0]);
          const block = { kind: 'paragraph', text: b.text };
          if (rich?.content && rich.content.some(c => c.kind !== 'text')) block.content = rich.content;
          r.body.push(block);
        }
        else if (b.type === 'table') {
          const cells = input.nodes.filter(c => c.type === 'cell' && c.path[0] === b.path[0]);
          const rows = []; for (const c of cells) { consume(c); (rows[c.path[1]] ??= [])[c.path[2]] = c.text; }
          take(); r.body.push({ kind: 'table', rows });
        } else { take(); issue(b, 'unsupported-body', 'PR1 읽기는 평문 문단·직사각형 표만 지원합니다'); }
      }
    }
    s.requirements.push(r);
  }
  const definitions = snapshot?.blocks?.filter(b => b.block === 'footnote') ?? [];
  const usedDefinitions = new Set();
  for (const r of s.requirements) {
    const used = new Set(); walkContent([{ content: r.titleContent }, ...r.body], c => { if (c.kind === 'footnote') used.add(c.label); });
    for (const label of used) {
      const definition = definitions.find(b => b.label === label);
      if (!definition) issue({ path: r.location }, 'missing-footnote', '미주 정의가 없습니다: ' + label);
      else { (r.footnotes ??= []).push({ label, content: definition.content }); usedDefinitions.add(label); }
    }
  }
  for (const d of definitions) {
    consume(input.nodes.find(n => n.path[0] === d.path[0]));
    if (!usedDefinitions.has(d.label)) issue(d, 'unmapped-element', '요구사항에서 사용하지 않은 미주: ' + d.label);
  }
  // inspect omits inline marks/atoms. The same-revision public compare snapshot
  // supplies those semantic values before this model may be exported.
  if (!snapshot) diagnostics.push({ file, location: [1], code: 'projection-unverified', severity: 'error', message: '공식 CLI compare 의미 스냅샷이 필요합니다' });
  auditCoverage(input, snapshot, consumed, issue, bodyPaths);
  if (snapshot) for (const b of snapshot.blocks ?? []) {
    const contents = b.block === 'table' && !bodyPaths.has(b.path[0]) ? b.rows.flatMap(r => r.cells.map(c => c.content)) : [];
    if (b.block === 'heading' && !s.requirements.some(r => r.location[0] === b.path[0])) contents.push(b.content);
    if (contents.some(content => content?.some(c => c.kind !== 'text'))) issue(b, 'formatted-profile', '속성·표·제목의 인라인 서식은 PR1 프로파일에서 허용하지 않습니다');
  }
  return s;
}
export function readInspection(input, file = '', snapshot) {
  try { return readProfile(input, file, snapshot); }
  catch (error) {
    return { file, title: input?.title ?? '', profile: 'requirements-extract/1', registry: [], requirements: [], diagnostics: [{ file, location: Array.isArray(error.location) ? error.location : [1], code: 'projection-shape', severity: 'error', message: '지원하지 않는 공개 읽기 출력 모양입니다. 내보내기를 차단합니다' }] };
  }
}

export function authoring(s) {
  const p = (keys, value) => ({ kind: 'table', rows: [['필드', '값'], ...keys.map(k => [k, value[k] ?? ''])] });
  const t = (columns, rows) => {
    if (columns === sourceFields && rows.some(r => r.trace)) columns = [...columns, 'trace'];
    return { kind: 'table', rows: [columns, ...rows.map(r => columns.map(k => k === 'trace' ? canonical(r.trace ?? null) : r[k] ?? ''))] };
  };
  const h = (level, text) => ({ kind: 'heading', level, text });
  return { title: s.title, inputs: [
    { key: 'set', blocks: [h(1, s.heading ?? '요구사항 문서'), p(setFields, s), t(registryFields, s.registry)] },
    ...s.requirements.map(r => ({ key: r.id, blocks: [{ kind: 'target', label: r.id }, r.titleContent ? { kind: 'heading', level: 2, content: r.titleContent } : h(2, r.title), p(fields, r), h(3, '본문'), ...r.body.map(b => {
      const value = structuredClone(b); if (value.content) delete value.text; return value;
    }), h(3, '출처'), t(sourceFields, r.sources), h(3, '연결'), t(relationFields, r.relations)] })),
    { key: 'footnotes', blocks: [...new Map(s.requirements.flatMap(r => (r.footnotes ?? []).map(f => [f.label, { kind: 'footnote', ...f }]))).values()] },
  ] };
}

export function assertValid(sets, options) {
  const diagnostics = validate(sets, options);
  if (diagnostics.some(d => d.severity === 'error')) throw Object.assign(new Error('프로파일 검증 실패'), { diagnostics });
  return diagnostics;
}
