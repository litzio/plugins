// Source mapping transformations are independent of the Host and document engine.
export function boxesFor(lines) {
  const boxes = [];
  for (const l of lines) {
    const x = l.box, old = boxes.find(b => b.page === l.page);
    if (old) {
      old.x0 = Math.min(old.x0, x.x0); old.top = Math.min(old.top, x.top);
      old.x1 = Math.max(old.x1, x.x1); old.bottom = Math.max(old.bottom, x.bottom);
    } else boxes.push({ ...x, page: l.page });
  }
  return boxes;
}
export const editableMapping = m => m?.lineVersion === 1;
export function restoreMapping(original, current, targetId, time) {
  const m = structuredClone(original), edited = {action:'undo',at:time,who:'user'};
  m.history = [...(current.history || []),edited];
  const target = m.blocks.find(b=>b.id===targetId);
  if(target) target.edited=edited;
  return m;
}
export function assertMapping(mapping, snapshot) {
  const nodes = snapshot.nodes.filter(n => n.path.length === 1 && n.type !== 'caption');
  const groups = new Map();
  for (const b of mapping.blocks) {
    const key = b.path.join('.');
    if (!groups.has(key)) groups.set(key, b.documentKind);
    else if (groups.get(key) !== b.documentKind) throw Error('블록 종류가 대응 자료와 다릅니다.');
  }
  if (nodes.length !== groups.size || nodes.some(n => groups.get(n.path.join('.')) !== n.type))
    throw Error('블록 수나 종류가 대응 자료와 다릅니다.');
}
export function transformMapping(mapping, { action, ids, line, kind, level, at, removeCount, newCount, time }) {
  const m = structuredClone(mapping), selected = m.blocks.filter(b => ids.includes(b.id));
  if (!selected.length) throw Error('고칠 블록을 찾지 못했습니다.');
  const first = selected[0], edited = { action, at: time, who: 'user' };
  let replacements;
  if (action === 'merge') {
    const lines = selected.flatMap(b => b.lines);
    replacements = [{ ...first, kind:'paragraph', documentKind:'paragraph', lines, boxes:boxesFor(lines), edited }];
  } else if (action === 'split') {
    const a = first.lines.slice(0, line), b = first.lines.slice(line);
    if (!a.length || !b.length) throw Error('둘째 줄부터 고르세요.');
    replacements = [a,b].map((lines,i) => ({ ...first, id: i ? first.id + ':' + time : first.id,
      path:[at+i], lines, boxes:boxesFor(lines), edited }));
  } else if (action === 'kind') {
    replacements = [{ ...first, kind, documentKind:kind, level: kind === 'heading' ? level : undefined, edited }];
  } else if (action === 'remove') {
    replacements = [];
    for (const b of selected) for (const box of b.boxes)
      m.excluded.push({page:box.page, box, kind:'removed', lines:b.lines, edited});
  } else throw Error('지원하지 않는 고치기입니다.');
  const start = m.blocks.indexOf(first);
  m.blocks = m.blocks.filter(b => !ids.includes(b.id));
  for (const b of m.blocks) if (b.path[0] >= at + removeCount) b.path[0] += newCount - removeCount;
  m.blocks.splice(start, 0, ...replacements);
  m.history = [...(m.history || []), edited];
  return m;
}
// Compare the complete character sequence, allowing only whitespace differences.
// Footnote calls are one rendered position; never guess around unsupported atoms.
export function splitOffset(lines, lineIndex, content) {
  if (lineIndex < 1 || lineIndex >= lines.length) throw Error('둘째 줄부터 고르세요.');
  const chars = [], positions = []; let offset = 0;
  const add = (s, position) => { for (const c of s) if (!/\s/u.test(c)) {chars.push(c);positions.push(position);} };
  for (const c of content) {
    if (c.kind === 'text') {
      for (let i=0;i<c.text.length;i++) { add(c.text[i],offset); offset++; }
    } else if (c.kind === 'footnote') { add('[^'+c.label+']', offset); offset++; }
    else throw Error('줄의 시작 위치를 확실히 정할 수 없어 나누지 않았습니다.');
  }
  const normalized = lines.map(l => l.text.replace(/\s/gu,''));
  if (normalized.join('') !== chars.join('')) throw Error('줄의 시작 위치를 확실히 정할 수 없어 나누지 않았습니다.');
  const index = normalized.slice(0,lineIndex).join('').length;
  const result = positions[index];
  if (!result || result >= offset) throw Error('줄의 시작 위치를 확실히 정할 수 없어 나누지 않았습니다.');
  return result;
}
