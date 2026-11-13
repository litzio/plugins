import test from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'xmlbuilder2';
import { sample } from './sample.mjs';
import { validate, digest, newRequirement, newSet, effectiveStatus } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';
import { readInspection } from '../src/document.mjs';
import { readFileSync } from 'node:fs';

test('fixed official native inspections retain six complete models', () => {
  const sets = [0, 1].map(i => {
    const { inspection, snapshot } = JSON.parse(readFileSync(new URL('./fixtures/set-' + i + '.json', import.meta.url)));
    return readInspection(inspection, 'set-' + i + '.md', snapshot);
  });
  assert.deepEqual(validate(sets, { formal: true }), []);
  assert.deepEqual(sets.flatMap(s => s.requirements.map(digest)), sample().flatMap(s => s.requirements.map(digest)));
});

test('rich body is escaped and unsupported inline math blocks export', () => {
  const sets = sample(), r = sets[0].requirements[0];
  r.body[0].content = [{ kind: 'strong', children: [{ kind: 'text', text: '<A & B>' }] }];
  r.confirmedDigest = digest(r);
  assert.match(exportReqif(sets).xml, /strong>&lt;A &amp; B&gt;/);
  r.body[0].content = [{ kind: 'math', latex: 'x' }]; r.confirmedDigest = digest(r);
  assert.throws(() => exportReqif(sets), e => e.diagnostics.some(d => d.code === 'unsupported-inline'));
});

test('six synthetic requirements validate and export stable IDs and LAST-CHANGE', () => {
  const sets = sample(); assert.deepEqual(validate(sets, { formal: true }), []);
  const first = exportReqif(sets, { now: '2026-01-01T00:00:00Z' });
  const second = exportReqif(sets, { previous: first.manifest, now: '2026-02-01T00:00:00Z' });
  assert.deepEqual(first.manifest.entries, second.manifest.entries);
  const xml = create(first.xml); assert.ok(xml);
  assert.match(first.xml, /&amp;/); assert.match(first.xml, /&lt;/);
  assert.equal((first.xml.match(/<SPEC-OBJECT /g) ?? []).length, 6);
  assert.equal((first.xml.match(/<SPEC-RELATION /g) ?? []).length, 4);
});
test('code issues UUID v4 identities independent of content', () => {
  assert.notEqual(newRequirement({ title: 'same' }).id, newRequirement({ title: 'same' }).id);
  assert.match(newSet({}).setId, /^set-/);
});
test('confirmation digest ignores position/status but includes body/source/relation', () => {
  const r = sample()[0].requirements[0], original = digest(r);
  r.location = [99]; r.status = 'reviewed'; assert.equal(digest(r), original);
  r.status = 'confirmed'; r.body[0].text += '수정'; assert.equal(effectiveStatus(r), 'reviewed');
  assert.notEqual(digest(r), original);
});
const failures = [
  ['duplicate-id', s => s[1].requirements.push(structuredClone(s[0].requirements[0]))],
  ['duplicate-set', s => s[1].setId = s[0].setId],
  ['unknown-value', s => s[0].requirements[0].kind = 'invented'],
  ['broken-relation', s => s[1].requirements[0].relations[0].targetId = 'req-missing'],
  ['self-reference', s => s[1].requirements[0].relations[0].targetId = s[1].requirements[0].id],
  ['cycle', s => s[0].requirements[0].relations.push({ role: 'refines', targetId: s[1].requirements[0].id, rationale: 'cycle' })],
  ['relation-role', s => s[1].requirements[0].relations[0].role = 'verifies'],
  ['required', s => s[0].requirements[0].body = []],
  ['quote-digest', s => s[0].requirements[0].sources[0].quote += '!'],
  ['selector', s => s[0].requirements[0].sources[0].selector = 'text:9:1'],
  ['namespace', s => s[1].exportNamespace = '00000000-0000-4000-8000-000000000000'],
  ['confirmation-stale', s => s[0].requirements[0].body[0].text += '수정'],
  ['not-confirmed', s => s[0].requirements[0].status = 'draft'],
  ['formula-render-required', s => s[0].requirements[0].body.push({ kind: 'equation', latex: 'x=1' })],
];
for (const [code, change] of failures) test('reject ' + code, () => {
  const sets = sample(); change(sets);
  const d = validate(sets, { formal: true }); assert.ok(d.some(x => x.code === code), JSON.stringify(d));
  assert.ok(d.every(x => 'file' in x && Array.isArray(x.location) && x.message));
  assert.throws(() => exportReqif(sets));
});
test('test output is explicitly marked and cannot bypass structural errors', () => {
  const sets = sample(); sets[0].requirements[0].status = 'draft';
  assert.match(exportReqif(sets, { testOnly: true }).xml, /TEST ONLY/);
  sets[0].requirements[0].id = 'broken'; assert.throws(() => exportReqif(sets, { testOnly: true }));
});
test('symmetric related relation is stored once', () => {
  const sets = sample(), [a, b] = sets[1].requirements;
  b.relations.push({ role: 'relatesTo', targetId: a.id, rationale: '역방향' }); b.confirmedDigest = digest(b);
  assert.equal((exportReqif(sets).xml.match(/<SPEC-RELATION /g) ?? []).length, 4);
});
test('missing old IDs are reported without deletion directives', () => {
  const sets = sample(), first = exportReqif(sets);
  sets[1].requirements.pop();
  const next = exportReqif(sets, { previous: first.manifest });
  assert.ok(next.manifest.missing.length >= 2); assert.doesNotMatch(next.xml, /ForeignDeleted/);
});
test('reader diagnoses missing/unknown/duplicate fields at table paths', () => {
  const nodes = [{ path: [1], type: 'heading', level: 1, text: 'R' }, { path: [2], type: 'table' },
    ...[['필드', '값'], ['bogus', 'v'], ['bogus', 'v']].flatMap((row, i) => row.map((text, j) => ({ path: [2, i, j], type: 'cell', text })))];
  const result = readInspection({ ok: true, nodes });
  for (const c of ['unknown-field', 'duplicate-field', 'missing-field', 'projection-unverified']) assert.ok(result.diagnostics.some(d => d.code === c));
});
