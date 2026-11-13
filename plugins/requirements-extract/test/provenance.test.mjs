import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { handoff, read, write, reseal } from './handoff-fixture.mjs';
import { loadProvenance, resolveSource } from '../src/provenance.mjs';
import { sample } from './sample.mjs';
import { digest } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';
const load = (root, opts = {}) => loadProvenance(root, { inspect: () => read(root, 'snapshot.json'), ...opts });
test('validated file chain remains unreviewed, including merged cells and multiple pages', () => {
  const bundle = load(handoff());
  const result = resolveSource(bundle, { sourceKey: 'synthetic', elementRef: '#/tables/0', selector: 'cell:1:1' });
  assert.equal(result.source.quote, '≤ 5 V'); assert.equal(result.eligibleConfirmed, false);
  assert.deepEqual(result.source.trace.regions.map(r => r.pageNo), [1, 2]);
  assert.equal(result.source.trace.precision, 'table');
  assert.ok(result.diagnostics.some(d => d.code === 'merged-table-review'));
  assert.equal(resolveSource(bundle, { elementRef: '#/texts/deleted' }).state, 'deleted');
});
test('uncertain/deleted bindings never become confirmed locations', () => {
  for (const bindingState of ['uncertain', 'deleted', 'no-source']) {
    const root = handoff(), p = read(root, 'provenance.json'); p.items[2].targets[0].bindingState = bindingState; write(root, 'provenance.json', p); reseal(root);
    if (bindingState !== 'uncertain') { assert.throws(() => load(root), e => e.diagnostics[0].code === 'unmapped-block'); continue; }
    const result = resolveSource(load(root), { sourceKey: 'synthetic', elementRef: '#/texts/0' });
    assert.equal(result.eligibleConfirmed, false); assert.equal(result.source.trace.bindingState, 'uncertain');
    assert.ok(result.diagnostics.some(d => d.code === 'source-binding'));
  }
});
test('v1 source traces block formal output and appear intact in marked trial ReqIF', () => {
  const source = resolveSource(load(handoff()), { sourceKey: 'synthetic', elementRef: '#/texts/0' }).source;
  const sets = sample(), r = sets[0].requirements[0]; r.sources = [source]; r.confirmedDigest = digest(r);
  assert.throws(() => exportReqif(sets), e => e.diagnostics.some(d => d.code === 'source-review-required'));
  const trial = exportReqif(sets, { testOnly: true }); assert.match(trial.xml, /TEST ONLY/); assert.match(trial.xml, /documentRevision/);
  source.trace.reviewState = 'reviewed'; assert.throws(() => exportReqif(sets, { testOnly: true }));
});
test('requireReviewed always rejects v1; source offsets are original code points', () => {
  const root = handoff(); assert.throws(() => load(root, { requireReviewed: true }), e => e.diagnostics[0].code === 'source-review-required');
  assert.equal(resolveSource(load(root), { elementRef: '#/texts/0', selector: 'text:8:9' }).source.quote, '≤');
});
for (const [name, mutate] of [
  ['missing marker', root => unlinkSync(join(root, 'complete.json'))],
  ['truncated marker', root => writeFileSync(join(root, 'complete.json'), '{')],
  ['unknown version', root => { const c = read(root, 'complete.json'); c.schemaVersion = '9'; write(root, 'complete.json', c); }],
  ['stale document bytes', root => writeFileSync(join(root, 'document.md'), 'edited by person')],
  ['mixed revision', root => { const p = read(root, 'provenance.json'); p.document.revision = '0'.repeat(64); write(root, 'provenance.json', p); reseal(root); }],
  ['mixed generation', root => { const p = read(root, 'provenance.json'); p.generationId = '00000000-0000-4000-8000-000000000002'; write(root, 'provenance.json', p); reseal(root); }],
  ['source bytes mismatch', root => { writeFileSync(join(root, 'source/source.pdf'), '%PDF changed'); reseal(root); }],
  ['invalid UTF8', root => { writeFileSync(join(root, 'losses.json'), Buffer.from([0xff])); reseal(root); }],
  ['duplicate file', root => { const c = read(root, 'complete.json'); c.files.push(c.files[0]); write(root, 'complete.json', c); }],
  ['unsafe path', root => { const c = read(root, 'complete.json'); c.files[0].relativePath = '../outside'; write(root, 'complete.json', c); }],
  ['inventory omission', root => { const p = read(root, 'provenance.json'); p.items.pop(); write(root, 'provenance.json', p); reseal(root); }],
  ['wrong cell span', root => { const p = read(root, 'provenance.json'); p.items[3].cells[1].sourceCell.col_span = 1; write(root, 'provenance.json', p); reseal(root); }],
  ['missing merged review', root => { const p = read(root, 'provenance.json'); p.items[3].structure.tableModel.reviewRequired = false; write(root, 'provenance.json', p); reseal(root); }],
  ['wrong target text', root => { const p = read(root, 'provenance.json'); p.items[2].targets[0].text = 'Voltage < 9 V'; write(root, 'provenance.json', p); reseal(root); }],
  ['broken selector', root => { const p = read(root, 'provenance.json'); p.items[3].cells[1].targets[0].selector.row = 999; write(root, 'provenance.json', p); reseal(root); }],
  ['wrong page box', root => { const p = read(root, 'provenance.json'); p.items[2].regions[0].bbox[0] = 999; write(root, 'provenance.json', p); reseal(root); }],
  ['lost loss report', root => { const l = read(root, 'losses.json'); l.items.push({}); write(root, 'losses.json', l); reseal(root); }],
]) test('handoff rejects ' + name, () => { const root = handoff(); mutate(root); assert.throws(() => load(root), e => Array.isArray(e.diagnostics)); });
test('official inspection and stable final marker are mandatory', () => {
  const root = handoff(); assert.throws(() => loadProvenance(root));
  assert.throws(() => load(root, { inspect: () => ({ ...read(root, 'snapshot.json'), nodes: [] }) }));
  assert.throws(() => load(root, { inspect: () => { const c = read(root, 'complete.json'); c.status = 'other'; write(root, 'complete.json', c); return read(root, 'snapshot.json'); } }), e => e.diagnostics[0].code === 'marker-changed');
});
test('documented additive content fields accept older checkpoints without regenerating source', () => {
  const root = handoff(), original = read(root, 'snapshot.json'), old = structuredClone(original);
  for (const n of old.nodes) delete n.content;
  write(root, 'snapshot.json', old); reseal(root);
  const result = load(root, { inspect: () => original });
  assert.deepEqual(result.snapshot.nodes, original.nodes);
  const unknown = structuredClone(original); unknown.nodes[0].hidden = 'condition';
  assert.throws(() => load(root, { inspect: () => unknown }), e => e.diagnostics[0].code === 'stale-snapshot');
});
test('original text check catches consistent forged target/snapshot text', () => {
  const root = handoff(), p = read(root, 'provenance.json'), s = read(root, 'snapshot.json');
  s.nodes[0].text = p.items[2].targets[0].text = 'Voltage < 9 V';
  s.nodes[0].content = [{kind:'text',text:s.nodes[0].text}];
  write(root, 'snapshot.json', s); write(root, 'provenance.json', p); reseal(root);
  assert.throws(() => load(root), e => e.diagnostics[0].code === 'source-native-text');
});
test('junction/symlink traversal is refused before reading file bytes', () => {
  const root = handoff(), outside = handoff();
  symlinkSync(join(outside, 'source'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const marker = read(root, 'complete.json'); marker.files.find(f => f.relativePath === 'source/document.json').relativePath = 'linked/document.json';
  write(root, 'complete.json', marker);
  assert.throws(() => load(root), e => e.diagnostics[0].code === 'unsafe-path');
});
