// Explicit opt-in integration run; never starts a Host or daemon.
import { join, resolve } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { sourceCli } from '../src/cli.mjs';
import { sample } from '../test/sample.mjs';
import { digest, validate } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';

const [checkout, root] = process.argv.slice(2);
if (!checkout || !root) throw new Error('Usage: node validation/native.mjs <source-checkout> <existing-scratch-folder>');
const cli = sourceCli({ tsx: join(resolve(checkout), 'node_modules/tsx/dist/loader.mjs'), entry: join(resolve(checkout), 'packages/cli/src/cli.ts'), root });
const sets = sample();
for (let i = 0; i < 2; i++) cli.create(sets[i], 'set-' + i + '.md');
// Fixed human-authored model is the fixture authority; copy canonical outputs
// only when intentionally refreshing fixtures.
if (process.env.REQUIREMENTS_FIXTURE_OUTPUT) {
  const { copyFileSync } = await import('node:fs');
  for (let i = 0; i < 2; i++) copyFileSync(cli.scoped('set-' + i + '.md'), join(process.env.REQUIREMENTS_FIXTURE_OUTPUT, 'set-' + i + '.md'));
}
assert.throws(() => cli.create(sets[0], 'set-0.md'), /exists/);
let read = [cli.read('set-0.md'), cli.read('set-1.md')];
assert.deepEqual(validate(read, { formal: true }), []);
for (const [i, s] of read.entries()) assert.deepEqual(s.requirements.map(digest), sets[i].requirements.map(digest));
// Simulated person edits source text and moves an entire section between files.
const a = cli.scoped('set-0.md'), b = cli.scoped('set-1.md');
let source = readFileSync(a, 'utf8');
source = source.replace('10 ms 이하에 출력을 차단해야', '9 ms 이하에 출력을 차단해야');
const marker = '(' + sets[0].requirements[2].id + ')=';
const offset = source.indexOf(marker), moved = source.slice(offset);
writeFileSync(a, source.slice(0, offset)); writeFileSync(b, readFileSync(b, 'utf8') + '\n' + moved);
read = [cli.read('set-0.md'), cli.read('set-1.md')];
assert.equal(read[1].requirements.at(-1).id, sets[0].requirements[2].id);
assert.ok(validate(read).some(d => d.code === 'confirmation-stale'));
// Explicit fixture confirmation models the person's renewed approval, no runtime auto-confirm.
for (const s of read) for (const r of s.requirements) r.confirmedDigest = digest(r);
assert.deepEqual(validate(read, { formal: true }), []);
const first = exportReqif(read, { now: '2026-01-01T00:00:00Z' });
const again = exportReqif(read, { previous: first.manifest, now: '2026-02-01T00:00:00Z' });
assert.deepEqual(first.manifest.entries, again.manifest.entries);
writeFileSync(cli.scoped('sample.reqif'), first.xml);
writeFileSync(cli.scoped('manifest.json'), JSON.stringify(first.manifest, null, 2));
// Official canonical write is idempotent and retains all profile values.
for (let i = 0; i < 2; i++) {
  const file = cli.scoped('set-' + i + '.md'); cli.run('format', file);
  const before = readFileSync(file, 'utf8'); cli.run('format', file); assert.equal(readFileSync(file, 'utf8'), before);
  cli.run('check', file, '--format', 'json');
}
assert.throws(() => cli.scoped('../outside.md'));
// Body marks are recovered from the public compare snapshot, not flattened.
writeFileSync(a, readFileSync(a, 'utf8').replace('9 ms 이하에', '**9 ms** 이하에'));
const rich = cli.read('set-0.md');
assert.ok(rich.requirements[0].body[0].content.some(c => c.kind === 'strong'));
assert.ok(validate([rich, read[1]]).some(d => d.code === 'confirmation-stale'));
for (const r of rich.requirements) r.confirmedDigest = digest(r);
const richExport = exportReqif([rich, read[1]]);
assert.match(richExport.xml, /<(?:xhtml:)?strong>9 ms<\//);
writeFileSync(cli.scoped('rich.reqif'), richExport.xml);
console.log('PASS: official create/check/inspect/compare; duplicate creation refusal; six requirements, hand edit/move, confirmation downgrade, stable export; canonical idempotence');
