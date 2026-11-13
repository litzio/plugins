// Actual public CLI projections for every supported inline kind and the native
// boundary's other inline/block families. No Core implementation imports.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { create } from 'xmlbuilder2';
import { sourceCli } from '../src/cli.mjs';
import { readInspection } from '../src/document.mjs';
import { digest, validate } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';

const [checkout, root] = process.argv.slice(2);
if (!checkout || !root) throw new Error('Usage: node validation/inlines.mjs <source-checkout> <existing-scratch-folder>');
const cli = sourceCli({ tsx: join(resolve(checkout), 'node_modules/tsx/dist/loader.mjs'), entry: join(resolve(checkout), 'packages/cli/src/cli.ts'), root });
const base = readFileSync(new URL('../test/fixtures/set-1.md', import.meta.url), 'utf8');
const sentence = '차단 출력은 0 ≤ t ≤ 10 ms 동안 유지해야 한다.';
copyFileSync(new URL('../test/fixtures/set-0.md', import.meta.url), cli.scoped('upper.md'));
const upper = cli.read('upper.md'), projections = {}, inventory = {};
function capture(name, source, operation) {
  const file = cli.scoped(name + '.md'); writeFileSync(file, source, { flag: 'wx' });
  if (operation) operation(file);
  assert.equal(cli.run('check', file, '--format', 'json').validation.valid, true);
  const inspection = cli.run('inspect', file, '--format', 'json');
  const compared = cli.run('compare', file, file, '--json');
  assert.equal(compared.receipt.beforeRevision, inspection.revision);
  return { file, inspection, snapshot: compared.before };
}
const cases = {
  text: 'plain A & B < C > D 끝.',
  strong: '앞 **굵게** 뒤.', emphasis: '앞 *기울임* 뒤.',
  subscript: 'H{sub}`2`O', superscript: 'm{sup}`2`',
  code: '차단 출력은 `0 ≤ t ≤ 10 ms` 동안 유지해야 한다.',
  codeEscape: '앞 `Signal_A < B & C > D | \\` 뒤.',
  nested: '앞 **강조 안의 `Signal_A < B & C` 값** 뒤.',
};
for (const [name, text] of Object.entries(cases)) {
  const x = capture(name, base.replace(sentence, text));
  const block = x.snapshot.blocks.find(b => b.path[0] === 8);
  projections[name] = { node: x.inspection.nodes.find(n => n.path.length === 1 && n.path[0] === 8), block };
  const s = readInspection(x.inspection, name + '.md', x.snapshot), sets = [upper, s];
  for (const r of s.requirements) r.confirmedDigest = digest(r); // explicit synthetic reapproval
  assert.deepEqual(validate(sets, { formal: true }), []);
  const output = exportReqif(sets).xml;
  writeFileSync(cli.scoped(name + '.reqif'), output);
  const expected = c => c.kind === 'text' ? c.text : c.kind === 'code' ? c.value : c.children.map(expected).join('');
  const doc = create(output).node;
  const object = [...doc.getElementsByTagNameNS('http://www.omg.org/spec/ReqIF/20110401/reqif.xsd', 'SPEC-OBJECT')].find(o => o.getAttribute('IDENTIFIER') === s.requirements[0].id);
  const paragraphs = object.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'p');
  assert.equal(paragraphs[1].textContent, block.content.map(expected).join(''));
  if (name === 'codeEscape') assert.ok(output.includes('Signal_A &lt; B &amp; C &gt; D'));
  cli.run('format', x.file);
  const reopened = cli.read(name + '.md');
  assert.equal(digest(reopened.requirements[0]), digest(s.requirements[0]));
  console.log('PASS native inline preservation + XHTML + canonical reopen: ' + name);
}
const blocked = {
  otherInline: 'リンク [link](https://example.org) $x=1$ {ref}`missing` {eq}`eq-missing` {numref}`table-missing` note[^n]\n\n[^n]: condition',
  citation: '引用 {cite}`synthetic`',
  blocks: '> quote\n\n---\n\n:::{note}\ncondition\n:::\n\n```text\nblock value\n```\n\n- outer\n  - nested\n\n:::{figure} missing.png\ncaption\n:::',
  mermaid: ':::{figure}\n\n```{mermaid}\ngraph TD\nA-->B\n```\n\ncaption\n:::',
};
for (const [name, text] of Object.entries(blocked)) {
  const x = capture(name, base.replace(sentence, text));
  inventory[name] = x.snapshot;
  const s = readInspection(x.inspection, name + '.md', x.snapshot);
  assert.ok(s.diagnostics.some(d => d.severity === 'error'));
  assert.throws(() => exportReqif([upper, s], { testOnly: true }));
  console.log('PASS native other types diagnosed: ' + name);
}
for (const [name, command] of [
  ['delete', file => cli.run('insert-block', file, '--at', '8', '--content', JSON.stringify([{ kind: 'delete', children: [{ kind: 'text', text: 'deleted value' }] }]))],
  ['break', file => cli.run('insert-hard-break', file, '--path', '8', '--offset', '3')],
  ['equation', file => cli.run('insert-equation', file, '--at', '8', '--latex', 'x=85')],
]) {
  const x = capture(name, base, command); inventory[name] = x.snapshot;
  const s = readInspection(x.inspection, name + '.md', x.snapshot);
  assert.ok(s.diagnostics.some(d => d.severity === 'error'));
  assert.throws(() => exportReqif([upper, s], { testOnly: true }));
  console.log('PASS native operation type diagnosed: ' + name);
}
writeFileSync(cli.scoped('inline-projections.json'), JSON.stringify(projections, null, 2) + '\n');
writeFileSync(cli.scoped('inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
if (process.env.REQUIREMENTS_INLINE_FIXTURE_OUTPUT) copyFileSync(cli.scoped('inline-projections.json'), join(process.env.REQUIREMENTS_INLINE_FIXTURE_OUTPUT, 'inline-projections.json'));
