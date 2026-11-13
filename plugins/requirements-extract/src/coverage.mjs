// Fail closed over both public projections. Every source block/cell must have
// been consumed, and every semantic field must be mapped or explicitly rejected.
// Only snapshot coordinates/editability and derived display data are exempt.
export function auditCoverage(input, snapshot, consumed, issue) {
  const key = n => JSON.stringify(n.path);
  const extras = (value, allowed, owner, context) => {
    for (const field of Object.keys(value)) if (!allowed.includes(field)) {
      issue(owner, 'unmapped-semantic', context + '.' + field + '는 모델에 보존하지 못하므로 내보내기를 차단합니다');
    }
  };
  const inspectFields = {
    heading: ['level', 'text', 'editable', 'referenceText', 'section'],
    paragraph: ['text', 'editable'], target: ['label'],
    table: ['numbers', 'captionNumberText'], cell: ['text', 'header', 'editable'],
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
      const allowed = c.kind === 'text' || c.kind === 'code' ? ['kind', 'text']
        : ['strong', 'emphasis', 'subscript', 'superscript'].includes(c.kind) ? ['kind', 'children'] : ['kind'];
      if (allowed.length === 1) issue(owner, 'unmapped-semantic', context + ': 지원하지 않는 인라인 요소 ' + c.kind);
      extras(c, allowed, owner, context + '.' + c.kind);
      if (c.children) inline(c.children, owner, context);
    }
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
    return n;
  }
  for (const b of snapshot.blocks ?? []) {
    match(b, b.block);
    const common = ['block', 'path'];
    if (b.block === 'table') {
      extras(b, [...common, 'rows'], b, 'table');
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
    } else if (b.block === 'heading' || b.block === 'paragraph') {
      extras(b, [...common, 'text', 'content', 'editable', ...(b.block === 'heading' ? ['level'] : [])], b, b.block);
      inline(b.content, b, b.block);
      plainText(b, b);
    } else if (b.block === 'target') extras(b, [...common, 'label'], b, 'target');
    else issue(b, 'unmapped-element', '의미 스냅샷에서 지원하지 않는 블록: ' + b.block);
  }
  for (const n of input.nodes) if (!observed.has(key(n))) issue(n, 'projection-mismatch', 'inspect 요소가 의미 스냅샷에서 확인되지 않습니다');
}
