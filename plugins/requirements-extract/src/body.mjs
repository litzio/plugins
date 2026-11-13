import { inlineFields, inlineKeys, validInlineValue } from './inline.mjs';
export const bodyFields = {
  paragraph: ['text', 'content'], table: ['rows', 'caption', 'label', 'align', 'enumerator'],
  list: ['ordered', 'start', 'style', 'delimiter', 'items'],
  quote: ['text', 'content'], admonition: ['variant', 'text', 'content'],
  divider: [], code: ['language', 'code'], equation: ['latex', 'label', 'enumerator'],
  figure: ['label', 'contentKind', 'imageUrl', 'imageAlt', 'caption', 'mermaidSource', 'enumerator'],
};
export function fromSnapshot(b) {
  const result = { kind: b.block };
  for (const key of bodyFields[b.block] ?? []) if (b[key] !== undefined) result[key] = structuredClone(b[key]);
  // Keep the original plain PR1 models stable; rich text always uses content.
  if (result.content?.every(c => c.kind === 'text')) delete result.content;
  if (b.block === 'table') result.rows = b.rows.map(row => row.cells.map(c => c.content?.some(v => v.kind !== 'text') ? structuredClone(c.content) : c.text));
  return result;
}
export function validateBody(r, add, labels = new Set()) {
  const notes = new Set((r.footnotes ?? []).map(f => f.label));
  const inline = value => {
    if (!Array.isArray(value)) { add('unsupported-inline', '인라인 배열이 필요합니다'); return; }
    for (const c of value) {
      if (!Object.hasOwn(inlineFields, c.kind) || !validInlineValue(c)) add('unsupported-inline', '인라인 kind/값 형식이 올바르지 않습니다');
      if (Object.keys(c).some(k => !inlineKeys(c.kind).includes(k))) add('unmapped-semantic', '미지원 인라인 필드');
      if (c.kind === 'math') add('formula-render-required', 'LaTeX는 보존했지만 검증된 수식 PNG가 없어 내보내기를 차단합니다');
      if (c.kind === 'citation') add('reference-mapping-required', '참고문헌 데이터 매핑이 필요합니다');
      if (c.kind === 'reference' && !labels.has(c.label)) add('reference-mapping-required', '내보내기 안에 참조 대상 레이블이 없습니다: ' + c.label);
      if (c.kind === 'footnote' && !notes.has(c.label)) add('missing-footnote', '미주 정의 누락: ' + c.label);
      if (Array.isArray(c.children)) inline(c.children);
    }
  };
  const list = l => {
    if (l.style?.endsWith('roman') && (l.start ?? 1) + (l.items?.length ?? 0) > 4000) add('list-format', '4000 이상 로마 숫자 표기는 지원하지 않습니다');
    if (Object.keys(l).some(k => !['kind', ...bodyFields.list].includes(k))) add('unmapped-semantic', '미지원 목록 필드');
    for (const i of l.items ?? []) { if (Object.keys(i).some(k => !['content', 'list'].includes(k))) add('unmapped-semantic', '미지원 목록 항목 필드'); inline(i.content); if (i.list) list(i.list); }
  };
  if (r.titleContent) inline(r.titleContent);
  for (const f of r.footnotes ?? []) { if (Object.keys(f).some(k => !['label', 'content'].includes(k))) add('unmapped-semantic', '미지원 미주 필드'); inline(f.content); }
  for (const b of r.body ?? []) {
    if (!bodyFields[b.kind]) { add('unsupported-body', '미지원 본문 kind'); continue; }
    if (Object.keys(b).some(k => !['kind', ...bodyFields[b.kind]].includes(k))) add('unmapped-semantic', '본문에 보존하지 못한 필드가 있습니다');
    if (['figure', 'equation'].includes(b.kind)) add(b.kind === 'equation' ? 'formula-render-required' : 'attachment-required', '수식 PNG/그림 첨부 패키징은 이후 PR입니다');
    if (b.content) inline(b.content);
    if (b.caption) inline(b.caption);
    if (b.kind === 'list') list(b);
    if (b.kind === 'table') {
      if (!b.rows?.length || !b.rows[0]?.length || b.rows.some(row => !Array.isArray(row) || row.length !== b.rows[0].length)) add('body-table', '직사각형 표가 필요합니다');
      for (const row of b.rows ?? []) for (const c of row) { if (Array.isArray(c)) inline(c); else if (typeof c !== 'string') add('body-table', '문자열/인라인 셀만 지원합니다'); }
    }
  }
}
export function walkContent(blocks, visit) {
  const inline = content => { for (const c of content ?? []) { visit(c); if (c.children) inline(c.children); } };
  const list = value => { for (const item of value.items ?? []) { inline(item.content); if (item.list) list(item.list); } };
  for (const b of blocks) {
    inline(b.content); inline(b.caption);
    if (b.kind === 'table') for (const row of b.rows) for (const c of row) if (Array.isArray(c)) inline(c);
    if (b.kind === 'list') list(b);
  }
}
