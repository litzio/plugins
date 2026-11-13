import { loadProvenance, resolveSource } from '../src/provenance.mjs';
import { sourceCli } from '../src/cli.mjs';
import { newRequirement, newSet } from '../src/model.mjs';
import { exportReqif } from '../src/reqif.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const [entry, handoff, root] = process.argv.slice(2);
const cli = sourceCli({ entry: resolve(entry), root });
let bundle = loadProvenance(handoff, { inspect: file => cli.run('inspect', file, '--format', 'json') });
// Preserve verified relative references beside the requirement document. Copy
// only files named by the marker, then revalidate the actual copied bytes.
mkdirSync(cli.scoped('handoff'));
for (const file of [...bundle.complete.files, { relativePath: 'complete.json' }]) {
  const target = cli.scoped('handoff/' + file.relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(resolve(handoff, file.relativePath)), { flag: 'wx' });
}
bundle = loadProvenance(cli.scoped('handoff'), { inspect: file => cli.run('inspect', file, '--format', 'json') });
const p = bundle.provenance;
// Hand-selected public LSR examples; no candidate extraction or AI.
const picks = [
  ['정상 대역 경계', '#/tables/4', 'cell:2:0'],
  ['대역 유지 시간', '#/tables/4', 'cell:2:2'],
  ['병합 표의 범위 조건', '#/tables/2', 'cell:2:3'],
  ['합성 식의 적용 조건', '#/texts/74', 'full'],
];
const requirements = picks.map(([title, elementRef, selector]) => {
  const result = resolveSource(bundle, { sourceKey: 'lsr', elementRef, selector });
  assert.equal(result.eligibleConfirmed, false);
  const r = newRequirement({ title, body: [{ kind: 'paragraph', text: result.source.quote }], kind: 'constraint', verification: 'inspection', origin: 'derived', rationale: '공개 합성 규격에서 손으로 고른 시험용 후보. 미검수이며 실사용 요구사항이 아님.', sources: [result.source], status: 'draft' });
  if (elementRef === '#/texts/74') r.body = [{ kind: 'paragraph', content: [{ kind: 'text', text: '적용 식: ' }, { kind: 'math', value: result.source.quote }] }];
  return r;
});
// Many-to-many: first source is reused; one requirement includes both physical
// pages of the continued table, with two explicit immutable element references.
requirements[1].sources.push(structuredClone(requirements[0].sources[0]));
requirements[0].sources.push(resolveSource(bundle, { sourceKey: 'lsr', elementRef: '#/tables/5', selector: 'cell:2:0' }).source);
const set = newSet({ title: 'LSR 출처 연결 시험', requirements, registry: [{ sourceKey: 'lsr', artifactDigest: 'sha256:' + p.source.docling.sha256, nativeDigest: 'sha256:' + p.document.revision, nativeFile: 'handoff/document.md', mapFile: 'handoff/provenance.json' }] });
cli.create(set, 'sources.md');
const reread = cli.read('sources.md');
for (const [i, r] of reread.requirements.entries()) assert.deepEqual(r.sources, requirements[i].sources);
assert.throws(() => exportReqif([reread]), e => e.diagnostics.some(d => d.code === 'source-review-required'));
assert.throws(() => exportReqif([reread], { testOnly: true }), e => e.diagnostics.some(d => d.code === 'formula-render-required'));
const trialSet = structuredClone(reread); trialSet.requirements = trialSet.requirements.filter(r => !r.body.some(b => b.content?.some(c => c.kind === 'math')));
const trial = exportReqif([trialSet], { testOnly: true });
writeFileSync(cli.scoped('provenance-test.reqif'), trial.xml);
const report = { status: 'draft-only', sourceItemsChecked: p.items.length, requirements: requirements.map(r => ({ title: r.title, sources: r.sources })), excludedFromTrial: [requirements[3].id], exclusionReason: 'formula PNG unavailable; formula source chain remains in sources.md/report', sourcePdfSha256: p.source.pdf.sha256 };
writeFileSync(cli.scoped('source-report.json'), JSON.stringify(report, null, 2));
console.log('PASS actual handoff inventory + four hand-selected candidate chains, many-to-many/pages, native trace roundtrip; marked trial excludes formula explicitly');
