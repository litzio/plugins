// Opt-in live regressions: public source CLI, caller-created scratch folder only.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { sourceCli } from '../src/cli.mjs';
import { exportReqif } from '../src/reqif.mjs';

const [checkout, root] = process.argv.slice(2);
if (!checkout || !root) throw new Error('Usage: node validation/coverage.mjs <source-checkout> <existing-scratch-folder>');
const cli = sourceCli({ tsx: join(resolve(checkout), 'node_modules/tsx/dist/loader.mjs'), entry: join(resolve(checkout), 'packages/cli/src/cli.ts'), root });
copyFileSync(new URL('../test/fixtures/set-0.md', import.meta.url), cli.scoped('upper.md'));
const upper = cli.read('upper.md');
const baseline = readFileSync(new URL('../test/fixtures/set-1.md', import.meta.url), 'utf8');
const insert = (source, block) => source.replace('### 출처', block + '\n\n### 출처');
const variants = {
  caption(source) {
    const index = source.indexOf('| 조건'), start = source.lastIndexOf(':::{table}', index);
    assert.ok(start >= 0);
    return source.slice(0, start) + source.slice(start).replace(':::{table}', ':::{table} 이 표는 85 °C에서만 적용한다');
  },
  figure: s => insert(s, ':::{figure} synthetic-missing.png\n\n이 그림은 85 °C에서만 적용한다\n:::'),
  endnote: s => insert(s, '조건은 미주를 따른다[^scope]') + '\n[^scope]: 이 요구사항은 85 °C에서만 적용한다.\n',
  nestedList: s => insert(s, '- 정상 동작\n  - 85 °C에서만 적용한다'),
  equation: s => insert(s, '$$\nx = 85\n$$'),
  inlineMath: s => insert(s, '조건은 $T = 85$ 이다.'),
};
for (const [name, change] of Object.entries(variants)) {
  const file = cli.scoped(name + '.md'); writeFileSync(file, change(baseline), { flag: 'wx' });
  assert.equal(cli.run('check', file, '--format', 'json').validation.valid, true);
  const read = cli.read(name + '.md');
  assert.ok(read.diagnostics.some(d => d.severity === 'error'), name + ' silently accepted');
  assert.throws(() => exportReqif([upper, read]), name + ' formal export succeeded');
  assert.throws(() => exportReqif([upper, read], { testOnly: true }), name + ' test export succeeded');
  console.log('PASS native valid + diagnostic + export blocked: ' + name);
}
// Merged HTML tables are outside the public native admission contract itself.
const merged = cli.scoped('merged.md');
writeFileSync(merged, insert(baseline, '<table><tr><td colspan="2">85 °C only</td></tr></table>'), { flag: 'wx' });
assert.throws(() => cli.run('check', merged, '--format', 'json'));
assert.throws(() => cli.read('merged.md'));
console.log('PASS native admission rejects merged cells');
