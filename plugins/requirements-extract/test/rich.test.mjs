import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create } from 'xmlbuilder2';
import { readInspection, authoring } from '../src/document.mjs';
import { digest, validate } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';
const fixtures = () => [0, 1].map(i => JSON.parse(readFileSync(new URL('./fixtures/rich/rich-' + i + '.json', import.meta.url))));
const read = xs => xs.map((x, i) => readInspection(x.inspection, 'rich-' + i + '.md', x.snapshot));
function confirmed(sets) { for (const s of sets) for (const r of s.requirements) r.confirmedDigest = digest(r); return sets; }
test('new inspect content across positions passes exhaustive coverage', () => {
  const sets = confirmed(read(fixtures())); assert.deepEqual(validate(sets, { formal: true }), []);
  assert.ok(sets[1].requirements[0].footnotes[0].content.length);
  assert.ok(authoring(sets[1]).inputs.flatMap(i => i.blocks).some(b => b.kind === 'footnote'));
});
test('exponents, units, captions, nested lists and endnotes preserve meaning in XHTML', () => {
  const doc = create(exportReqif(confirmed(read(fixtures()))).xml).node, ns = 'http://www.w3.org/1999/xhtml';
  assert.ok([...doc.getElementsByTagNameNS(ns, 'sup')].some(n => n.textContent === '3'));
  assert.ok([...doc.getElementsByTagNameNS(ns, 'sub')].some(n => n.textContent === '2'));
  assert.equal(doc.getElementsByTagNameNS(ns, 'caption')[0].textContent, '이 표는 85 °C에서만 적용한다');
  assert.ok([...doc.getElementsByTagNameNS(ns, 'li')].some(n => n.textContent.startsWith('3. ')));
  assert.ok([...doc.getElementsByTagNameNS(ns, 'p')].some(n => n.textContent.startsWith('[limit-note] 공통 조건')));
  const ids = new Set([...doc.getElementsByTagNameNS(ns, '*')].map(n => n.getAttribute('id')));
  for (const a of doc.getElementsByTagNameNS(ns, 'a')) if (a.getAttribute('href').startsWith('#')) assert.ok(ids.has(a.getAttribute('href').slice(1)));
});
test('unknown fields in new rich positions remain blocked', () => {
  for (const mutate of [
    x => x.snapshot.blocks.find(b => b.block === 'list').items[0].condition = 'hidden',
    x => x.snapshot.blocks.find(b => b.block === 'footnote').condition = 'hidden',
    x => x.snapshot.blocks.find(b => b.block === 'table' && b.caption).caption[0].condition = 'hidden',
    x => x.inspection.nodes.find(n => n.type === 'paragraph' && n.content).content[0].condition = 'hidden',
  ]) { const xs = fixtures(); mutate(xs[1]); assert.throws(() => exportReqif(confirmed(read(xs)))); }
});
test('adding a rich caption changes confirmation digest rather than disappearing', () => {
  const sets = confirmed(read(fixtures())), r = sets[1].requirements[0];
  r.body.find(b => b.kind === 'table').caption[0].text += '수정';
  assert.ok(validate(sets, { formal: true }).some(d => d.code === 'confirmation-stale'));
});
test('formula source and figure captions remain in model but export requires PNG/assets', () => {
  for (const b of [{ kind: 'paragraph', content: [{ kind: 'math', value: '10^3' }] }, { kind: 'equation', latex: '10^3' }, { kind: 'figure', caption: [{ kind: 'text', text: '85 °C only' }], imageUrl: 'x.png' }]) {
    const sets = confirmed(read(fixtures())), r = sets[1].requirements[0]; r.body.push(b); r.confirmedDigest = digest(r);
    assert.deepEqual(r.body.at(-1), b);
    assert.throws(() => exportReqif(sets), e => e.diagnostics.some(d => ['attachment-required', 'formula-render-required'].includes(d.code)));
    assert.throws(() => exportReqif(sets, { testOnly: true }));
  }
});
