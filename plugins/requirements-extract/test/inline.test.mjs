import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create } from 'xmlbuilder2';
import { readInspection } from '../src/document.mjs';
import { digest, validate } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';

const fixture = i => JSON.parse(readFileSync(new URL('./fixtures/set-' + i + '.json', import.meta.url)));
const projections = JSON.parse(readFileSync(new URL('./fixtures/inline-projections.json', import.meta.url)));
function models(projection) {
  const x = fixture(1);
  x.inspection.nodes[x.inspection.nodes.findIndex(n => n.path.length === 1 && n.path[0] === 8)] = structuredClone(projection.node);
  x.snapshot.blocks[x.snapshot.blocks.findIndex(n => n.path[0] === 8)] = structuredClone(projection.block);
  const upper = fixture(0);
  return [readInspection(upper.inspection, 'upper.md', upper.snapshot), readInspection(x.inspection, 'inline.md', x.snapshot)];
}
test('actual native code.value survives reading, confirmation and XHTML', () => {
  const sets = models(projections.code), r = sets[1].requirements[0];
  assert.deepEqual(r.body[0].content, projections.code.block.content);
  for (const s of sets) for (const item of s.requirements) item.confirmedDigest = digest(item);
  assert.deepEqual(validate(sets, { formal: true }), []);
  const xml = exportReqif(sets).xml;
  const dom = create(xml).node;
  const code = dom.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'code');
  assert.equal(code[0].textContent, '0 ≤ t ≤ 10 ms');
});

const contentText = c => c.kind === 'text' ? c.text : c.kind === 'code' ? c.value : c.children.map(contentText).join('');
for (const [name, projection] of Object.entries(projections)) test('actual supported projection preserves complete mixed XHTML: ' + name, () => {
  const sets = models(projection), r = sets[1].requirements[0];
  if (name !== 'text') assert.deepEqual(r.body[0].content, projection.block.content);
  for (const s of sets) for (const item of s.requirements) item.confirmedDigest = digest(item);
  assert.deepEqual(validate(sets, { formal: true }), []);
  const xml = exportReqif(sets).xml, ns = 'http://www.w3.org/1999/xhtml';
  const object = [...create(xml).node.getElementsByTagNameNS('http://www.omg.org/spec/ReqIF/20110401/reqif.xsd', 'SPEC-OBJECT')].find(o => o.getAttribute('IDENTIFIER') === r.id);
  assert.equal(object.getElementsByTagNameNS(ns, 'p')[1].textContent, projection.block.content.map(contentText).join(''));
  for (const tag of ['strong', 'em', 'sub', 'sup', 'code']) {
    if (projection.block.content.some(c => ({ strong: 'strong', emphasis: 'em', subscript: 'sub', superscript: 'sup', code: 'code' }[c.kind]) === tag)) assert.ok(object.getElementsByTagNameNS(ns, tag).length);
  }
  if (name === 'codeEscape') {
    assert.equal(object.getElementsByTagNameNS(ns, 'code')[0].textContent, 'Signal_A < B & C > D | \\');
    assert.match(xml, /Signal_A &lt; B &amp; C &gt; D/);
  }
});

test('code requires the public value field and rejects dropped or unknown payloads', () => {
  for (const c of [{ kind: 'code', text: 'wrong field' }, { kind: 'code' }, { kind: 'code', value: 'correct', unknown: 'condition' }]) {
    const x = structuredClone(projections.code);
    x.block.content = [c];
    const sets = models(x);
    for (const s of sets) for (const r of s.requirements) r.confirmedDigest = digest(r);
    assert.throws(() => exportReqif(sets));
    assert.throws(() => exportReqif(sets, { testOnly: true }));
  }
});
