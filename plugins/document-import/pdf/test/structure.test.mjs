import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extract } from '../extract.mjs';
import { convert, suggestExcludedPages } from '../rules.mjs';
import { boxesFor, previewCorrection, assertMapping } from '../corrections.mjs';
import { pageFragments, sourceGrid, readingOrder, lineChars } from '../source-cells.mjs';
import { listPlan, tablePlan, unlistPlan, joinPlan, footnotePlan, noteBody, labelReferences, tableShapes, HEADER_CHECK } from '../structure.mjs';
import { blockActions } from '../block-actions.mjs';

const t = text => ({kind: 'text', text});
const limits = {tableRows: 500, tableColumns: 32, tableCells: 8000};
// The public LSR sample as the screen sees it: mapping blocks, saved nodes and page fragments.
const file = new URL('./fixtures/LSR-1.1-standards.pdf', import.meta.url);
const raw = await extract(file), result = convert(raw, suggestExcludedPages(raw));
const lsr = result.blocks.map((b, i) => ({id: b.id, path: [i + 1], kind: b.kind, documentKind: b.kind === 'footnote' ? 'paragraph' : b.kind,
  lines: (b.lines || []).map(({page, box, text}) => ({page, box, text})), boxes: b.boxes}));
const lsrNodes = lsr.map((b, i) => ({path: [i + 1], type: b.documentKind,
  content: [t(result.blocks[i].kind === 'footnote' ? result.blocks[i].text.replace(/^\[\^(\d+)\]:\s*/u, '[$1] ') : result.blocks[i].text)]}));
const pdf = await pdfjs.getDocument({data: new Uint8Array(readFileSync(file)), verbosity: 0}).promise;
const fragments = {};
for (const p of [2, 3]) { const page = await pdf.getPage(p + 1); fragments[p] = pageFragments((await page.getTextContent()).items, page.view); }
const roster = lsr.filter(b => b.boxes[0]?.page === 2 && b.lines.length === 1 && b.lines[0].text.split(' ').length === 6 && /^[A-Z][a-z]+ [A-Z]/.test(b.lines[0].text));

test('L-04 the three-column roster becomes 18 items read down each column', () => {
  assert.equal(roster.length, 6);
  const plan = listPlan(roster, lsrNodes, fragments, 'now');
  assert.equal(plan.by, 'column');
  assert.deepEqual(plan.items.map(i => i[0].text), ['Alex Rowan', 'Casey Marlow', 'Devin Solace', 'Ellis Parker', 'Finley Hart', 'Harper Vale',
    'Indigo Reed', 'Jordan Wren', 'Kendall Fox', 'Logan Birch', 'Morgan Lake', 'Noel Ash', 'Oakley Frost', 'Parker Dawn', 'Quinn Brook', 'Reese Field', 'Sage North', 'Taylor Moss']);
  // Every item has its own source box on its column; the first of each paragraph keeps the paragraph's id.
  assert.equal(new Set(plan.blocks.map(b => b.id)).size, 18);
  assert.deepEqual(plan.blocks.filter(b => roster.some(r => r.id === b.id)).map(b => b.id), roster.map(b => b.id));
  assert.ok(plan.blocks.every(b => b.path[0] === roster[0].path[0] && b.documentKind === 'list' && b.boxes.length === 1));
  assert.ok(plan.blocks[0].boxes[0].x1 < plan.blocks[6].boxes[0].x0);
});

test('L-04 the roster becomes a three-column table with the first row as its header', () => {
  const plan = tablePlan(roster, lsrNodes, fragments, limits);
  assert.equal(plan.rows.length, 6);
  assert.deepEqual(plan.rows[0].map(c => c[0].text), ['Alex Rowan', 'Indigo Reed', 'Oakley Frost']);
  assert.equal(plan.blocks[0].warning.reason, HEADER_CHECK);
  assert.ok(plan.blocks.every(b => b.documentKind === 'table' && b.path[0] === roster[0].path[0]));
  assert.match(tablePlan(roster, lsrNodes, fragments, {...limits, tableRows: 5}).reason, /표 한도\(5행·32열·8,000칸\)/);
  assert.match(tablePlan(roster, lsrNodes, fragments, {...limits, tableCells: 17}).reason, /17칸/);
  // A prose paragraph has no blank strip between its words: no columns, so no table.
  const prose = lsr.find(b => b.boxes[0]?.page === 2 && b.lines.length > 1);
  assert.match(tablePlan([prose], lsrNodes, fragments, limits).reason, /세로 틈이 없어/);
  // Without its page's fragments the table waits for them.
  assert.match(tablePlan(roster, lsrNodes, {}, limits).reason, /읽는 중/);
});

test('P-03 one paragraph of several lines becomes one item per line; several paragraphs one item each', () => {
  const lines = [{page: 0, text: 'First item text', box: {page: 0, x0: 0, x1: 100, top: 0, bottom: 10}},
    {page: 0, text: 'Second[^4] item', box: {page: 0, x0: 0, x1: 80, top: 12, bottom: 22}}];
  const frags = {0: [{text: 'First item text', x0: 0, x1: 100, top: 0, bottom: 10}, {text: 'Second', x0: 0, x1: 40, top: 12, bottom: 22},
    {text: '4', x0: 40, x1: 43, top: 11, bottom: 16}, {text: 'item', x0: 46, x1: 80, top: 12, bottom: 22}]};
  const b = {id: 'p', path: [1], kind: 'paragraph', documentKind: 'paragraph', lines, boxes: boxesFor(lines)};
  const content = [t('First '), {kind: 'link', url: 'https://example.org', children: [t('item text Second')]}, {kind: 'footnote', label: '4'}, t(' item')];
  const plan = listPlan([b], [{path: [1], type: 'paragraph', content}], frags, 'now');
  assert.equal(plan.by, 'line');
  assert.deepEqual(plan.items, [[t('First '), {kind: 'link', url: 'https://example.org', children: [t('item text')]}],
    [{kind: 'link', url: 'https://example.org', children: [t('Second')]}, {kind: 'footnote', label: '4'}, t(' item')]]);
  assert.deepEqual(plan.blocks.map(x => [x.id, x.lines[0].text]), [['p', 'First item text'], ['p:now:1', 'Second[^4] item']]);
  const two = [b, {...b, id: 'q', path: [2], lines: [lines[0]]}];
  const nodes = [{path: [1], type: 'paragraph', content}, {path: [2], type: 'paragraph', content: [t('First item text')]}];
  const each = listPlan(two, nodes, frags, 'now');
  assert.equal(each.by, 'paragraph');assert.deepEqual(each.items, [content, [t('First item text')]]);
  assert.deepEqual(each.blocks.map(x => [x.id, x.path[0], x.documentKind]), [['p', 1, 'list'], ['q', 1, 'list']]);
});

test('L-04 reading order is down each column unless the last row alone is short at its right end', () => {
  const grid = (rows, columns) => ({columns, rows: rows.map(cols => ({cells: cols.map(col => ({col}))}))});
  const names = g => readingOrder(g).order.map(([r, c]) => r + '' + c).join(' ');
  assert.equal(names(grid([[0, 1], [0, 1]], 2)), '00 10 01 11');
  assert.equal(readingOrder(grid([[0, 1, 2], [0]], 3)).by, 'row');
  assert.equal(names(grid([[0, 1, 2], [0]], 3)), '00 01 02 10');
  // One empty cell at the end fits both; columns win. Gaps at the foot of columns read down.
  assert.equal(readingOrder(grid([[0, 1], [0]], 2)).by, 'column');
  assert.equal(names(grid([[0, 1, 2], [0, 1], [0, 1]], 3)), '00 10 20 01 11 21 02');
});

test('source fragments match the line words, and a footnote call is never cut in the middle', () => {
  const view = [0, 0, 600, 800];
  const items = [{str: 'Alex Rowan   Indigo Reed', width: 240, transform: [10, 0, 0, 10, 50, 700]}];
  assert.deepEqual(pageFragments(items, view).map(f => [f.text, Math.round(f.x0), Math.round(f.x1), Math.round(f.top)]),
    [['Alex Rowan', 50, 150, 92], ['Indigo Reed', 180, 290, 92]]);
  assert.deepEqual(lineChars('ab [^12] c').bare.map(b => [b.c, b.norm, b.inside]), [['a', 0, false], ['b', 1, false], ['1', 2, false], ['2', 2, true], ['c', 7, false]]);
  const line = {page: 0, text: 'Value[^12]', box: {page: 0, x0: 0, x1: 300, top: 0, bottom: 10}};
  const split = {0: [{text: 'Value1', x0: 0, x1: 40, top: 0, bottom: 10}, {text: '2', x0: 200, x1: 205, top: 0, bottom: 10}]};
  assert.match(sourceGrid([line], split).reason, /미주 호출 가운데/);
  assert.match(sourceGrid([line], {0: [{text: 'Other', x0: 0, x1: 40, top: 0, bottom: 10}]}).reason, /맞지 않아/);
});

test('a list goes back to paragraphs only when every item has its own source block and no sub-list', () => {
  const node = {path: [3], type: 'list', items: [{content: [t('a')]}, {content: [t('b')]}]};
  const blocks = [{id: 'x', path: [3], documentKind: 'list', kind: 'list', level: 1}, {id: 'y', path: [3], documentKind: 'list', kind: 'list'}];
  const plan = unlistPlan(node, blocks);
  assert.deepEqual(plan.blocks.map(b => [b.id, b.path[0], b.documentKind, b.level]), [['x', 3, 'paragraph', undefined], ['y', 4, 'paragraph', undefined]]);
  assert.match(unlistPlan(node, blocks.slice(0, 1)).reason, /짝이 맞지 않아/);
  assert.match(unlistPlan({...node, items: [{content: [t('a')], list: {items: []}}, node.items[1]]}, blocks).reason, /하위 목록/);
});

test('T-07 joining keeps the first header, drops a repeated one and reports captions and references', () => {
  const cell = (p, r, c, text) => ({path: [p, r, c], type: 'cell', text, content: [t(text)]});
  const nodes = [{path: [1], type: 'table', label: 'tab-3', caption: [t('Bands')]}, ...['Band', 'Mode', 'a', 'b'].map((x, i) => cell(1, i >> 1, i & 1, x)),
    {path: [2], type: 'table', label: 'tab-3b', caption: [t('Bands (continued)')]}, ...['Band', 'Mode', 'c', 'd'].map((x, i) => cell(2, i >> 1, i & 1, x)),
    {path: [3], type: 'paragraph', content: [t('See '), {kind: 'reference', role: 'numref', label: 'tab-3b'}]},
    {path: [4], type: 'footnote', content: [{kind: 'reference', role: 'numref', label: 'tab-3b'}]}];
  const plan = joinPlan(nodes.filter(n => n.type === 'table'), nodes);
  assert.deepEqual(plan.rows.map(r => r.map(c => c[0].text)), [['Band', 'Mode'], ['a', 'b'], ['c', 'd']]);
  assert.deepEqual([plan.dropped, plan.captions, plan.moved, plan.broken, plan.relabel], [[1], ['Bands (continued)'], 1, 1, ['tab-3b']]);
  assert.deepEqual(labelReferences(nodes, 'tab-3b'), {movable: 1, fixed: 1});
  assert.deepEqual(tableShapes(nodes), {1: 2, 2: 2});
  // Without a label on the first table every reference to the later one breaks.
  assert.equal(joinPlan([{...nodes[0], label: undefined}, nodes[5]], nodes).broken, 2);
  const narrow = [{path: [5], type: 'table'}, cell(5, 0, 0, 'Only')];
  assert.match(joinPlan([nodes[0], narrow[0]], [...nodes, ...narrow]).reason, /열 수가 같은/);
});

test('F-08 the page note without a call goes to the last paragraph of its page, without its mark', () => {
  const note = lsr.find(b => b.kind === 'footnote' && b.boxes[0].page === 3);
  const plan = footnotePlan([note], lsr, lsrNodes);
  assert.equal(plan.target.lines[0].text, 'The observation matrix is retained with its notes.');
  assert.deepEqual(plan.content, [t('The page note belongs to this page, not to a table column or a numerical range.')]);
  // Chosen together, the first chosen paragraph gets the note.
  const first = lsr.find(b => b.boxes[0]?.page === 3 && b.documentKind === 'paragraph');
  assert.equal(footnotePlan([first, note], lsr, lsrNodes).target.id, first.id);
  const plain = lsr.find(b => b.boxes[0]?.page === 3 && b.documentKind === 'paragraph' && /^The observation/.test(b.lines[0].text));
  assert.match(footnotePlan([first, plain], lsr, lsrNodes).reason, /번호나 기호/);
  // A note on a page with no paragraph before it has nowhere to go.
  assert.match(footnotePlan([note], [note], lsrNodes).reason, /찾지 못했습니다/);
  const withCall = lsrNodes.map(n => n.path[0] === note.path[0] ? {...n, content: [...n.content, {kind: 'footnote', label: '9'}]} : n);
  assert.match(footnotePlan([note], lsr, withCall).reason, /미주 호출이 든/);
});

test('F-08 a note loses only its own mark: a number, a bracketed number or one symbol and a blank', () => {
  assert.deepEqual(noteBody([t('[18] The page note.')]), [t('The page note.')]);
  assert.deepEqual(noteBody([t('18 The page note.')]), [t('The page note.')]);
  assert.deepEqual(noteBody([t('* Starred.')]), [t('Starred.')]);
  assert.deepEqual(noteBody([{kind: 'superscript', children: [t('a')]}, t(' Lettered '), {kind: 'emphasis', children: [t('note')]}]), [t('Lettered '), {kind: 'emphasis', children: [t('note')]}]);
  assert.deepEqual(noteBody([t('A sentence.')]), [t('A sentence.')]);
  assert.deepEqual(noteBody([t('2026 was a year.')]), [t('was a year.')]);
});

test('new structure corrections keep the mapping in step with the predicted document', () => {
  const nodes = roster.map(b => lsrNodes[b.path[0] - 1]);
  const m = {revision: 'r', excluded: [], blocks: roster.map((b, i) => ({...b, path: [i + 1]})), snapshotNodes: nodes.map((n, i) => ({...n, path: [i + 1]}))};
  const after = previewCorrection(m, {action: 'list', ids: m.blocks.map(b => b.id), plan: listPlan(m.blocks, m.snapshotNodes, fragments, 'now'), time: 'now'});
  assert.deepEqual(after.snapshotNodes.map(n => n.type), ['list']);
  assertMapping(after, {nodes: after.snapshotNodes});
  assert.equal(after.blocks.length, 18);assert.equal(after.blocks[0].edited.action, 'list');
  const table = previewCorrection(m, {action: 'table', ids: m.blocks.map(b => b.id), plan: tablePlan(m.blocks, m.snapshotNodes, fragments, limits), time: 'now'});
  assertMapping(table, {nodes: table.snapshotNodes});
  const back = previewCorrection(after, {action: 'kind', kind: 'paragraph', ids: after.blocks.map(b => b.id),
    plan: unlistPlan({path: [1], type: 'list', items: after.snapshotNodes[0].items}, after.blocks), time: 'later'});
  assert.equal(back.snapshotNodes.length, 18);assertMapping(back, {nodes: back.snapshotNodes});
  const note = previewCorrection(m, {action: 'kind', kind: 'note', ids: [m.blocks[0].id], time: 'now'});
  assert.deepEqual([note.blocks[0].kind, note.blocks[0].documentKind, note.snapshotNodes[0].type], ['note', 'admonition', 'admonition']);
  assertMapping(note, {nodes: note.snapshotNodes});
});

test('the menu shows what fits the chosen kinds, in kind, structure and removal order', () => {
  const p = (id, at, extra = {}) => ({id, path: [at], kind: 'paragraph', documentKind: 'paragraph', lines: [{page: 0, text: id, box: {page: 0, x0: 0, x1: 10, top: at * 20, bottom: at * 20 + 10}}], boxes: [{page: 0, x0: 0, x1: 10, top: at * 20, bottom: at * 20 + 10}], ...extra});
  const all = [p('a', 1), p('b', 2), {id: 't1', path: [3], kind: 'table', documentKind: 'table', boxes: []}, {id: 't2', path: [4], kind: 'table', documentKind: 'table', boxes: []},
    {id: 'n', path: [5], kind: 'note', documentKind: 'admonition', boxes: []}, {id: 'l', path: [6], kind: 'list', documentKind: 'list', boxes: []}];
  const nodes = [{path: [1], type: 'paragraph', content: [t('a')]}, {path: [2], type: 'paragraph', content: [t('b')]}, {path: [3], type: 'table'}, {path: [4], type: 'table'},
    {path: [5], type: 'admonition', variant: 'note', content: [t('n')]}, {path: [6], type: 'list', items: [{content: [t('i')]}]}];
  const shown = (bs, extra) => blockActions(bs, all, nodes, {limits, fragments: {0: []}, ...extra}).filter(a => a.visible).map(a => a.id + (a.disabled && a.id !== 'keep' ? '-' : ''));
  assert.deepEqual(blockActions([all[0]], all, nodes).map(a => a.group), [...Array(9).fill('kind'), ...Array(6).fill('structure'), 'remove', 'remove']);
  assert.deepEqual(shown([all[0], all[1]]), ['paragraph-', 'h1-', 'h2-', 'h3-', 'h4-', 'h5-', 'h6-', 'note-', 'title-', 'merge', 'split-', 'list', 'table-', 'table-note-', 'footnote-', 'remove', 'keep']);
  // Two tables: joining only, as long as their column counts match.
  assert.deepEqual(shown([all[2], all[3]], {tables: {3: 4, 4: 4}}), ['merge', 'remove-', 'keep']);
  const narrow = blockActions([all[2], all[3]], all, nodes, {tables: {3: 4, 4: 3}}).find(a => a.id === 'merge');
  assert.equal(narrow.disabled, true);assert.match(narrow.disabledReason, /열 수가 같은/);
  // A note box turns back into a paragraph and can be taken out; a list unlists.
  assert.deepEqual(shown([all[4]]), ['paragraph', 'note-', 'remove', 'keep']);
  assert.deepEqual(shown([all[5]]), ['paragraph', 'merge-', 'remove', 'keep']);
  // While the page's fragments load, list and table wait.
  const waiting = blockActions([all[0], all[1]], all, nodes, {limits}).filter(a => ['list', 'table'].includes(a.id));
  assert.ok(waiting.every(a => a.disabled && /읽는 중/.test(a.disabledReason)));
});

test('T-07 synthetic sample: a table continued on the next page converts to two neighbouring tables that join into one', async () => {
  const {authoring} = await import('../authoring.mjs');
  const raw = await extract(new URL('./fixtures/table-pages.pdf', import.meta.url));
  const blocks = authoring(convert(raw, [])).authoring.inputs[0].blocks;
  assert.deepEqual(blocks.map(b => b.kind), ['heading', 'paragraph', 'paragraph', 'table', 'table', 'paragraph']);
  const nodes = [];
  blocks.forEach((b, i) => {
    if (b.kind !== 'table') return;
    nodes.push({path: [i + 1], type: 'table', ...(b.label ? {label: b.label} : {})});
    b.rows.forEach((row, r) => row.forEach((c, k) => nodes.push({path: [i + 1, r, k], type: 'cell', content: typeof c === 'string' ? [t(c)] : c})));
  });
  assert.deepEqual(tableShapes(nodes), {4: 4, 5: 4});
  const plan = joinPlan(nodes.filter(n => n.type === 'table'), nodes);
  assert.deepEqual(plan.dropped, [1]);
  assert.equal(plan.rows.length, 49);
  assert.deepEqual(plan.rows.slice(1).map(r => r[0][0].text), Array.from({length: 48}, (_, i) => 'S-' + String(i + 1).padStart(2, '0')));
});
