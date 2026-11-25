import { contentCuts, cutContent, trimInline, references, boxesFor } from './corrections.mjs';
import { sourceGrid, readingOrder } from './source-cells.mjs';
// Plans for corrections that change a block's structure: what the document gets and what the source
// mapping gets. The screen runs them to enable its actions; the handler runs them again on the saved
// document before writing. Each returns {reason} when it cannot be done.

export const HEADER_CHECK = '첫 행을 머리글로 두었습니다. 머리글이 아니면 문서 탭에서 고치세요.';
export const LIST_ITEMS = 100;
// A note's own mark in the source: a number, a bracketed number or one symbol, then a blank.
export const NOTE_MARK = /^\s*(?:\[[^\]\s]{1,8}\]|\d{1,4}|[*†‡§¶#a-z])\s+(?=\S)/u;
const top = (nodes, p) => nodes.find(n => n.path.length === 1 && n.path[0] === p);

// The selected paragraphs cut by the columns of their source lines.
// cells: [{row, col, content, text, box, block}] where row is the source line across the selection.
export function paragraphCells(selected, nodes, fragments) {
  const lines = selected.flatMap(b => (b.lines || []).map(l => ({...l, block: b})));
  if (!lines.length) return {reason: '원본 줄이 없는 블록이 있습니다.'};
  const grid = sourceGrid(lines, fragments);
  if (grid.reason) return {reason: grid.reason, pending: !fragments || lines.some(l => !fragments[l.page])};
  const cells = []; let row = 0;
  for (const b of selected) {
    const node = top(nodes, b.path[0]), rows = grid.rows.slice(row, row + b.lines.length);
    const starts = []; let base = 0;
    rows.forEach((r, i) => {
      for (const c of r.cells) starts.push({...c, row: row + i, line: r.line, index: base + c.start});
      base += r.line.text.replace(/\s/gu, '').length;
    });
    row += b.lines.length;
    let pieces;
    try { pieces = cutContent(node.content, contentCuts(b.lines, node.content, starts.slice(1).map(s => s.index))); }
    catch (e) { return {reason: e.message}; }
    starts.forEach((s, i) => cells.push({row: s.row, col: s.col, content: pieces[i], text: s.text, block: b,
      box: {page: s.line.page, x0: s.x0, x1: s.x1, top: s.line.box.top, bottom: s.line.box.bottom}}));
  }
  return {grid, cells, rows: grid.rows.length, columns: grid.columns, multi: grid.rows.some(r => r.cells.length > 1)};
}

// Items cut from one paragraph: the first keeps the paragraph's id and warning, the rest are new.
const itemBlock = (b, k, time, line) => ({...b, ...(k ? {id: b.id + ':' + time + ':' + k, warning: undefined} : {}),
  kind: 'list', documentKind: 'list', level: undefined, lines: [line], boxes: boxesFor([line])});

// Paragraphs → one bullet list. A cell grid with a row of two or more cells gives one item per cell
// in reading order; one paragraph of several lines gives one item per line; otherwise one item per
// paragraph. items: inline content; blocks: the mapping blocks, all at the list's path.
export function listPlan(selected, nodes, fragments, time = '') {
  const at = selected[0].path[0], cells = paragraphCells(selected, nodes, fragments);
  if (cells.pending) return {reason: cells.reason};
  let items, blocks, by = 'paragraph';
  if (!cells.reason && cells.multi) {
    const {order, by: read} = readingOrder(cells.grid);
    const ordered = order.map(([r, c]) => cells.cells.find(x => x.row === r && x.col === c));
    const seen = new Map();
    items = ordered.map(c => c.content);
    blocks = ordered.map(c => {
      const k = seen.get(c.block.id) || 0; seen.set(c.block.id, k + 1);
      return itemBlock(c.block, k, time, {page: c.box.page, box: c.box, text: c.text});
    });
    by = read;
  } else if (selected.length === 1 && selected[0].lines?.length > 1) {
    const b = selected[0], node = top(nodes, at), counts = b.lines.map(l => l.text.replace(/\s/gu, '').length);
    try { items = cutContent(node.content, contentCuts(b.lines, node.content, counts.slice(0, -1).map((_, i) => counts.slice(0, i + 1).reduce((s, n) => s + n, 0)))); }
    catch (e) { return {reason: e.message}; }
    blocks = b.lines.map((l, k) => itemBlock(b, k, time, l));
    by = 'line';
  } else {
    items = selected.map(b => top(nodes, b.path[0]).content);
    blocks = selected.map(b => ({...b, kind: 'list', documentKind: 'list', level: undefined, path: [at]}));
  }
  if (items.some(i => !i.length)) return {reason: '글자가 없는 항목이 생겨 목록으로 만들 수 없습니다.'};
  if (items.length > LIST_ITEMS) return {reason: '목록이 ' + LIST_ITEMS + '항목을 넘어 만들 수 없습니다.'};
  return {items, blocks: blocks.map(b => ({...b, path: [at]})), by};
}

// Paragraphs → one table: one row per source line, one column per blank-separated column.
// The first row is the header row a Litzio table must have.
export function tablePlan(selected, nodes, fragments, limits) {
  const at = selected[0].path[0], cells = paragraphCells(selected, nodes, fragments);
  if (cells.reason) return {reason: cells.reason};
  if (cells.columns < 2) return {reason: '원본 글자 사이에 세로 틈이 없어 열을 둘 이상으로 나눌 수 없습니다.'};
  if (cells.rows > limits.tableRows || cells.columns > limits.tableColumns || cells.rows * cells.columns > limits.tableCells)
    return {reason: '표 한도(' + limits.tableRows + '행·' + limits.tableColumns + '열·' + limits.tableCells.toLocaleString('en-US') + '칸)를 넘습니다.'};
  const rows = Array.from({length: cells.rows}, (_, r) => Array.from({length: cells.columns}, (_, c) =>
    cells.cells.find(x => x.row === r && x.col === c)?.content || []));
  const blocks = selected.map((b, i) => ({...b, kind: 'table', documentKind: 'table', level: undefined, path: [at],
    ...(i === 0 ? {warning: {reason: HEADER_CHECK}} : {})}));
  return {rows, blocks};
}

// One list → one paragraph per item. blocks: the list's mapping blocks, one per item.
export function unlistPlan(node, blocks) {
  if (node.items.some(i => i.list)) return {reason: '하위 목록이 있는 목록은 본문으로 풀 수 없습니다.'};
  if (blocks.length !== node.items.length) return {reason: '원본 상자와 목록 항목의 짝이 맞지 않아 본문으로 풀 수 없습니다.'};
  if (node.items.some(i => !i.content.length)) return {reason: '글자가 없는 항목이 있어 본문으로 풀 수 없습니다.'};
  const at = node.path[0];
  return {contents: node.items.map(i => i.content),
    blocks: blocks.map((b, i) => ({...b, kind: 'paragraph', documentKind: 'paragraph', level: undefined, path: [at + i]}))};
}

const words = content => (content || []).map(c => c.text ?? words(c.children)).join('');
const plainCell = c => words(c?.content).replace(/\s+/gu, ' ').trim();
// The rows of a table node from its cell nodes: rows[r][c] = content.
export function tableRows(allNodes, p) {
  const rows = [];
  for (const n of allNodes) if (n.type === 'cell' && n.path[0] === p) (rows[n.path[1]] ||= [])[n.path[2]] = n;
  return rows;
}
// Counts of references to a label, by whether the node holding them can be rewritten.
export function labelReferences(allNodes, label) {
  const count = v => v && typeof v === 'object'
    ? Number(v.kind === 'reference' && v.label === label) + Object.values(v).reduce((s, x) => s + count(x), 0) : 0;
  let movable = 0, fixed = 0;
  for (const n of allNodes)
    if (n.path.length === 1 && ['paragraph', 'heading', 'admonition'].includes(n.type)) movable += count(n.content); else fixed += count(n);
  return {movable, fixed};
}
// Adjacent tables → one. Later tables lose a first row equal to the first table's header row.
// The first table keeps its caption, label and number; references to a later table's label move to
// the first table when the first has a label and they sit in a paragraph, heading or note.
export function joinPlan(tables, allNodes) {
  const shapes = tables.map(t => tableRows(allNodes, t.path[0]));
  const width = shapes[0][0]?.length;
  if (shapes.some(rows => rows[0]?.length !== width)) return {reason: '열 수가 같은 표만 이을 수 있습니다.'};
  const header = shapes[0][0].map(plainCell).join('\u0000');
  const rows = [...shapes[0]], dropped = [];
  shapes.slice(1).forEach((r, i) => {
    const repeated = r[0].map(plainCell).join('\u0000') === header;
    if (repeated) dropped.push(i + 1);
    rows.push(...(repeated ? r.slice(1) : r));
  });
  const first = tables[0], later = tables.slice(1);
  const captions = later.filter(t => t.caption?.length).map(t => words(t.caption).trim());
  let moved = 0, broken = 0;
  for (const t of later.filter(t => t.label)) {
    const refs = labelReferences(allNodes, t.label);
    if (first.label) { moved += refs.movable; broken += refs.fixed; } else broken += refs.movable + refs.fixed;
  }
  return {rows: rows.map(r => r.map(c => c?.content || [])), dropped, captions, moved, broken,
    relabel: first.label ? later.filter(t => t.label).map(t => t.label) : []};
}
// Replace references to the given labels by references to `label` in inline content.
export function relabel(content, from, label) {
  const fix = c => c.kind === 'reference' && from.includes(c.label) ? {...c, label}
    : c.children ? {...c, children: c.children.map(fix)} : c;
  return content.map(fix);
}

// A note's words without the mark it had in the source; Litzio numbers endnotes itself.
export function noteBody(content) {
  const out = [...content], first = out[0];
  if (first?.kind === 'superscript' && /^\s*\S{1,4}\s*$/u.test(words(first.children))) out.shift();
  else if (first?.kind === 'text') {
    const m = first.text.match(NOTE_MARK);
    if (m) out[0] = {...first, text: first.text.slice(m[0].length)};
  }
  return trimInline(out);
}
const noteLike = (b, node) => b.kind === 'footnote' || node?.content?.[0]?.kind === 'superscript' ||
  NOTE_MARK.test(node?.content?.[0]?.kind === 'text' ? node.content[0].text : '');
// The note and the paragraph its endnote call goes to. One chosen paragraph: the last paragraph
// before it on its page that is not itself a note. Several: the first chosen gets the last's note.
export function footnotePlan(selected, allBlocks, nodes) {
  const note = selected.at(-1), last = top(nodes, note.path[0]);
  if ([selected[0], note].some(b => b.documentKind !== 'paragraph') || last?.type !== 'paragraph') return {reason: '본문 블록을 골라야 합니다.'};
  let target;
  if (selected.length === 1) {
    const page = note.boxes[0]?.page;
    const paths = new Set(allBlocks.filter(b => b.path[0] === note.path[0]).map(b => b.id));
    target = [...allBlocks].filter(b => !paths.has(b.id) && b.path[0] < note.path[0] && b.documentKind === 'paragraph' &&
      b.kind !== 'footnote' && b.boxes.some(x => x.page === page)).sort((a, b) => a.path[0] - b.path[0]).at(-1);
    if (!target) return {reason: '같은 쪽에서 앞에 있는 본문을 찾지 못했습니다. 미주를 붙일 본문과 주석 글을 함께 고르세요.'};
  } else {
    target = selected[0];
    if (target.path[0] === note.path[0]) return {reason: '미주를 붙일 본문과 주석 글을 하나씩 골라야 합니다.'};
    if (!noteLike(note, last)) return {reason: '마지막에 고른 블록이 앞에 번호나 기호가 있는 주석 글이어야 합니다.'};
  }
  if (references(last).length) return {reason: '미주 호출이 든 글은 미주로 만들 수 없습니다.'};
  const body = noteBody(last.content);
  if (!body.length) return {reason: '글자가 없는 주석은 미주로 만들 수 없습니다.'};
  const host = top(nodes, target.path[0]);
  if (host?.type !== 'paragraph') return {reason: '미주를 붙일 본문을 찾지 못했습니다.'};
  return {note, target, content: body, host};
}
// The column count of each table by its top-level path, for the screen to enable joining.
export function tableShapes(allNodes) {
  const shapes = {};
  for (const n of allNodes) if (n.type === 'cell' && n.path[1] === 0) shapes[n.path[0]] = Math.max(shapes[n.path[0]] || 0, n.path[2] + 1);
  return shapes;
}
