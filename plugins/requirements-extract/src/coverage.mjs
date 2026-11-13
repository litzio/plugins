// Fail closed over both public projections. Every source block/cell must have
// been consumed, and every semantic field must be mapped or explicitly rejected.
// Only snapshot coordinates/editability and derived display data are exempt.
import { inlineFields, inlineKeys, validInlineValue } from './inline.mjs';
import { bodyFields } from './body.mjs';
export function auditCoverage(input, snapshot, consumed, issue, bodyPaths = new Set()) {
  const key = n => JSON.stringify(n.path);
  const extras = (value, allowed, owner, context) => {
    for (const field of Object.keys(value)) if (!allowed.includes(field)) {
      issue(owner, 'unmapped-semantic', context + '.' + field + '는 모델에 보존하지 못하므로 내보내기를 차단합니다');
    }
  };
  const inspectFields = {
    heading: ['level', 'text', 'content', 'editable', 'referenceText', 'section'],
    paragraph: ['text', 'content', 'editable'], target: ['label'],
    table: ['numbers', 'captionNumberText', 'referenceText', 'caption', 'label', 'align', 'enumerator'], cell: ['text', 'content', 'header', 'editable'],
    list: bodyFields.list, quote: ['text', 'content', 'editable'], admonition: ['variant', 'text', 'content', 'editable'],
    code: bodyFields.code, divider: [], footnote: ['label', 'text', 'content', 'editable'],
    figure: [...bodyFields.figure, 'editable', 'numbers', 'captionNumberText'], caption: ['text', 'content', 'editable'],
    equation: [...bodyFields.equation, 'editable', 'numbers', 'referenceText'],
  };
  for (const n of input.nodes) {
    if (!consumed.has(key(n))) issue(n, 'unmapped-element', '읽은 요소를 모델로 옮기지 못했습니다: ' + n.type);
    extras(n, ['path', 'type', ...(inspectFields[n.type] ?? [])], n, 'inspect.' + n.type);
    if (!inspectFields[n.type]) issue(n, 'unmapped-element', '지원하지 않는 요소: ' + n.type);
  }
  if (!snapshot) return;
  extras(snapshot, ['blocks', 'title'], { path: [1] }, 'snapshot');
  if (snapshot.title !== input.title) issue({ path: [1] }, 'projection-mismatch', '문서 제목의 의미 읽기가 일치하지 않습니다');
  const nodes = new Map(input.nodes.map(n => [key(n), n]));
  const observed = new Set();
  function inline(content, owner, context) {
    for (const c of content ?? []) {
      const allowed = Object.hasOwn(inlineFields, c.kind) ? inlineKeys(c.kind) : ['kind'];
      if (!Object.hasOwn(inlineFields, c.kind)) issue(owner, 'unmapped-semantic', context + ': 지원하지 않는 인라인 요소 ' + c.kind);
      else if (!validInlineValue(c)) issue(owner, 'unmapped-semantic', context + ': 인라인 값 형식이 올바르지 않습니다');
      extras(c, allowed, owner, context + '.' + c.kind);
      if (Array.isArray(c.children)) inline(c.children, owner, context);
    }
  }
  function caption(value, owner) {
    if (value === undefined) return;
    if (Array.isArray(value)) { inline(value, owner, 'caption'); return; }
    extras(value, ['path', 'text', 'content', 'editable'], owner, 'caption.node');
    inline(value.content, owner, 'caption.node'); plainText(value, owner);
  }
  function plainText(value, owner) {
    if (value.content?.every(c => c.kind === 'text') && value.content.map(c => c.text).join('') !== value.text) {
      issue(owner, 'projection-mismatch', '평문과 인라인 의미 값이 일치하지 않습니다');
    }
  }
  function match(value, type, owner = value) {
    const n = nodes.get(key(value)); observed.add(key(value));
    if (!n || n.type !== type || !consumed.has(key(value))) issue(owner, 'unmapped-element', '의미 스냅샷 요소가 모델에 대응하지 않습니다: ' + type);
    if (n && value.text !== undefined && value.text !== n.text) issue(owner, 'projection-mismatch', '텍스트 읽기 결과가 일치하지 않습니다');
    if (n) for (const field of ['label', 'level', 'header']) {
      if (value[field] !== undefined && value[field] !== n[field]) issue(owner, 'projection-mismatch', field + ' 의미 읽기가 일치하지 않습니다');
    }
    if (n) for (const field of ['content', 'caption', 'items']) {
      if (n[field] !== undefined && JSON.stringify(n[field]) !== JSON.stringify(value[field])) issue(owner, 'projection-mismatch', field + ' 구조가 일치하지 않습니다');
    }
    return n;
  }
  function list(value, owner) {
    extras(value, ['ordered', 'start', 'style', 'delimiter', 'items'], owner, 'list');
    for (const item of value.items ?? []) { extras(item, ['content', 'list'], owner, 'list.item'); inline(item.content, owner, 'list.item'); if (item.list) list(item.list, owner); }
  }
  for (const b of snapshot.blocks ?? []) {
    match(b, b.block);
    const common = ['block', 'path'];
    if (b.block === 'table') {
      extras(b, [...common, ...bodyFields.table], b, 'table');
      if (!bodyPaths.has(b.path[0]) && ['caption', 'label', 'align', 'enumerator'].some(k => b[k] !== undefined)) issue(b, 'unmapped-semantic', '프로파일 속성 표의 추가 의미 속성은 지원하지 않습니다');
      inline(b.caption, b, 'table.caption');
      for (const row of b.rows ?? []) {
        extras(row, ['cells'], b, 'table.row');
        for (const c of row.cells ?? []) {
          match(c, 'cell');
          if (c.header !== (c.path[1] === 0)) issue(c, 'unmapped-semantic', '첫 행 이외의 머리글 의미는 PR1 표 모델에 보존할 수 없습니다');
          extras(c, ['path', 'text', 'content', 'header', 'editable'], c, 'table.cell');
          inline(c.content, c, 'table.cell');
          plainText(c, c);
        }
      }
    } else if (['heading', 'paragraph', 'quote', 'admonition', 'footnote'].includes(b.block)) {
      extras(b, [...common, 'text', 'content', 'editable', ...(b.block === 'heading' ? ['level'] : b.block === 'footnote' ? ['label'] : b.block === 'admonition' ? ['variant'] : [])], b, b.block);
      inline(b.content, b, b.block);
      plainText(b, b);
    } else if (b.block === 'target') extras(b, [...common, 'label'], b, 'target');
    else if (bodyFields[b.block]) {
      extras(b, [...common, ...bodyFields[b.block], 'editable'], b, b.block);
      if (b.block === 'list') list(Object.fromEntries(Object.entries(b).filter(([k]) => !common.includes(k))), b);
      caption(b.caption, b);
      if (b.block === 'figure') for (const n of input.nodes.filter(n => n.type === 'caption' && n.path[0] === b.path[0])) {
        observed.add(key(n)); if (JSON.stringify(n.content) !== JSON.stringify(Array.isArray(b.caption) ? b.caption : b.caption?.content)) issue(n, 'projection-mismatch', '그림 캡션 내용이 일치하지 않습니다');
      }
    } else issue(b, 'unmapped-element', '의미 스냅샷에서 지원하지 않는 블록: ' + b.block);
  }
  for (const n of input.nodes) if (!observed.has(key(n))) issue(n, 'projection-mismatch', 'inspect 요소가 의미 스냅샷에서 확인되지 않습니다');
}
