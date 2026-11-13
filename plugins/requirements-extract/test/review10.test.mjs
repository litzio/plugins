import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create } from 'xmlbuilder2';
import { readInspection } from '../src/document.mjs';
import { digest } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';
const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/review10/' + name + '.json', import.meta.url)));
const read = (x, name) => readInspection(x.inspection, name + '.md', x.snapshot);
const confirmed = sets => { for (const s of sets) for (const r of s.requirements) r.confirmedDigest = digest(r); return sets; };
test('actual two native documents with local limits labels export unique IDs and local references', () => {
  const sets = confirmed([0, 1].map(i => read(fixture('scope-' + i), 'scope-' + i)));
  const doc = create(exportReqif(sets).xml).node;
  const ids = [...doc.getElementsByTagName('*')].flatMap(n => ['id', 'IDENTIFIER'].filter(a => n.hasAttribute(a)).map(a => n.getAttribute(a)));
  assert.equal(ids.length, new Set(ids).size);
  const ns = 'http://www.w3.org/1999/xhtml';
  const tables = [...doc.getElementsByTagNameNS(ns, 'table')].filter(n => n.getElementsByTagNameNS(ns, 'caption').length);
  assert.equal(tables.length, 2); assert.notEqual(tables[0].getAttribute('id'), tables[1].getAttribute('id'));
  for (const [i, s] of sets.entries()) {
    const object = [...doc.getElementsByTagName('SPEC-OBJECT')].find(n => n.getAttribute('IDENTIFIER') === s.requirements[0].id);
    const refs = [...object.getElementsByTagNameNS(ns, 'a')].filter(n => n.getAttribute('href').startsWith('#'));
    assert.ok(refs.some(n => n.getAttribute('href') === '#' + tables[i].getAttribute('id')));
  }
});
test('actual CLI figure caption object is preserved and attachment refusal is located', () => {
  const x = fixture('figure'); let s;
  assert.doesNotThrow(() => { s = read(x, 'figure'); });
  const b = x.snapshot.blocks.find(b => b.block === 'figure');
  assert.deepEqual(s.requirements[0].body[0].caption, b.caption.content);
  assert.ok(s.diagnostics.some(d => d.code === 'attachment-required' && d.file === 'figure.md' && d.location[0] === b.path[0]));
  assert.throws(() => exportReqif(confirmed([s])));
});
test('export final scan refuses duplicate XML IDs even when introduced by direct model input', () => {
  const sets = confirmed([0, 1].map(i => read(fixture('scope-' + i), 'scope-' + i)));
  const r = sets[0].requirements[0]; r.body.push(structuredClone(r.body.find(b => b.kind === 'table'))); r.confirmedDigest = digest(r);
  assert.throws(() => exportReqif(sets), e => e.diagnostics.some(d => d.code === 'duplicate-xml-id' && Array.isArray(d.location)));
  assert.throws(() => exportReqif(sets, { testOnly: true }), e => e.diagnostics.some(d => d.code === 'duplicate-xml-id'));
});
test('reference resolution cannot take a table label from another document', () => {
  const sets = confirmed([0, 1].map(i => read(fixture('scope-' + i), 'scope-' + i)));
  const a = sets[0].requirements[0], b = sets[1].requirements[0];
  b.body.find(b => b.kind === 'table').label = 'foreign';
  for (const r of [a, b]) { r.body.at(-1).content.find(c => c.kind === 'reference').label = 'foreign'; r.confirmedDigest = digest(r); }
  assert.throws(() => exportReqif(sets), e => e.diagnostics.some(d => d.code === 'reference-mapping-required'));
});
test('unrecognized projection shapes become located diagnostics instead of exceptions', () => {
  for (const change of [
    x => x.snapshot.blocks.find(b => b.block === 'figure').caption.content = {},
    x => x.snapshot.blocks.find(b => b.block === 'figure').caption = 'not a caption node',
    x => x.snapshot.blocks.find(b => b.block === 'paragraph').content = { bad: true },
    x => x.snapshot.blocks.find(b => b.block === 'table').rows = {},
  ]) {
    const x = fixture('figure'); change(x); let s;
    assert.doesNotThrow(() => { s = read(x, 'shape'); });
    assert.ok(s.diagnostics.some(d => d.code === 'projection-shape' && d.file === 'shape.md' && Array.isArray(d.location)));
    assert.throws(() => exportReqif([s], { testOnly: true }));
  }
});
