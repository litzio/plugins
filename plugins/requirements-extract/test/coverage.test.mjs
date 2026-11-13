import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readInspection } from '../src/document.mjs';
import { exportReqif } from '../src/reqif.mjs';
import { digest } from '../src/model.mjs';
import { sample } from './sample.mjs';

const fixture = i => JSON.parse(readFileSync(new URL('./fixtures/set-' + i + '.json', import.meta.url)));
const read = (x, name = 'set-1.md') => readInspection(x.inspection, name, x.snapshot);

test('review regression: table applicability caption blocks even with unchanged confirmation', () => {
  const x = fixture(1);
  const table = x.snapshot.blocks.find(b => b.block === 'table' && b.rows[0].cells[0].text === '조건');
  table.caption = [{ kind: 'text', text: '이 표는 85 °C에서만 적용한다' }];
  x.inspection.nodes.find(n => n.type === 'table' && n.path[0] === table.path[0]).caption = structuredClone(table.caption);
  const sets = [read(fixture(0), 'set-0.md'), read(x)];
  assert.ok(sets[1].diagnostics.some(d => d.code === 'unmapped-semantic' && d.file === 'set-1.md' && d.location[0] === table.path[0]));
  assert.throws(() => exportReqif(sets));
  assert.throws(() => exportReqif(sets, { testOnly: true }));
});

const bodyTable = x => x.snapshot.blocks.find(b => b.block === 'table' && b.rows[0].cells[0].text === '조건');
for (const [name, change] of [
  ['table rich caption', x => bodyTable(x).caption = [{ kind: 'strong', children: [{ kind: 'text', text: '85 °C only' }] }]],
  ['table merged cell', x => bodyTable(x).rows[1].cells[0].colspan = 2],
  ['unknown row content', x => bodyTable(x).rows[1].condition = '85 °C'],
  ['unknown block field', x => x.snapshot.blocks.find(b => b.block === 'paragraph').condition = '85 °C'],
  ['unknown inline field', x => x.snapshot.blocks.find(b => b.block === 'paragraph').content[0].condition = '85 °C'],
  ['unmapped snapshot element', x => x.snapshot.blocks.push({ block: 'footnote', path: [999], text: '85 °C only' })],
  ['unmapped inspect element', x => x.inspection.nodes.push({ type: 'footnote', path: [999], text: '85 °C only' })],
  ['extra document semantics', x => x.snapshot.endnotes = [{ text: '85 °C only' }]],
  ['inconsistent plain projection', x => x.snapshot.blocks.find(b => b.block === 'paragraph').content[0].text += '85 °C only'],
]) test('coverage audit blocks ' + name, () => {
  const x = fixture(1); change(x); const sets = [read(fixture(0)), read(x)];
  assert.ok(sets[1].diagnostics.some(d => ['unmapped-semantic', 'unmapped-element', 'projection-mismatch'].includes(d.code)));
  assert.throws(() => exportReqif(sets, { testOnly: true }));
});

for (const type of ['figure', 'footnote', 'list', 'equation', 'code', 'future-block']) test('reader blocks complete ' + type + ' element', () => {
  const x = fixture(1), p = x.snapshot.blocks.find(b => b.block === 'paragraph');
  p.block = type; p.caption = [{ kind: 'text', text: '85 °C only' }];
  if (type === 'list') p.items = [{ text: 'outer', items: [{ text: 'inner condition' }] }];
  x.inspection.nodes.find(n => JSON.stringify(n.path) === JSON.stringify(p.path)).type = type;
  const sets = [read(fixture(0)), read(x)];
  assert.ok(sets[1].diagnostics.some(d => d.code === 'unsupported-body'));
  assert.throws(() => exportReqif(sets));
});

test('direct model cannot bypass unsupported caption/merged cell/nested list policy', () => {
  for (const block of [
    { kind: 'table', rows: [['value'], ['10']], caption: '85 °C only' },
    { kind: 'table', rows: [[{ text: '10', colspan: 2 }]] },
    { kind: 'list', ordered: false, items: [{ text: 'outer', children: ['85 °C only'] }] },
  ]) {
    const sets = sample(), r = sets[0].requirements[0]; r.body.push(block); r.confirmedDigest = digest(r);
    assert.throws(() => exportReqif(sets));
  }
});
