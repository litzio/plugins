import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extract } from '../extract.mjs';
import { convert, suggestExcludedPages } from '../rules.mjs';
import { score } from '../score-answer-key.mjs';
const raw = await extract(new URL('./fixtures/LSR-1.1-standards.pdf', import.meta.url));
const result = convert(raw, suggestExcludedPages(raw));
const oracle = JSON.parse(await readFile(new URL('./fixtures/standards.json', import.meta.url), 'utf8'));

test('answer key: correct counts never fall below the recorded baseline', async () => {
  const baseline = JSON.parse(await readFile(new URL('../answer-key-baseline.json', import.meta.url), 'utf8'));
  const report = score(result, oracle);
  assert.deepEqual(Object.keys(report.summary).sort(), Object.keys(baseline.summary).sort());
  for (const [role, minimum] of Object.entries(baseline.summary))
    assert.ok(report.summary[role].correct >= minimum, `${role}: ${report.summary[role].correct} < ${minimum}`);
  assert.ok(report.formulaSummary.own_image >= baseline.formulas.own_image);
  for(const [metric,minimum] of Object.entries(baseline.tables)) assert.ok(report.tableSummary[metric]>=minimum,metric);
});

test('F-06 large gap ends the note; a wrapped continuation stays in the definition', () => {
  for (const page of [6, 7]) {
    const original = raw.pages[page].raw.find((l) => l.bbox[1] > 600 && /^\d+ /.test(l.spans[0].text));
    const sample = structuredClone(raw), wrapped = structuredClone(original);
    wrapped.bbox = wrapped.bbox.map((v, i) => i % 2 ? v + 11 : v);
    wrapped.spans[0].text = 'A wrapped continuation of the same note.';
    wrapped.metrics = wrapped.metrics.map((m) => ({ ...m, base: m.base + 11 }));
    sample.pages[page].raw.push(wrapped);
    sample.pages[page].nchars += wrapped.spans[0].text.replace(/\s/g, '').length;
    const r = convert(sample);
    const note = r.blocks.find((b) => b.kind === 'footnote' && b.page === page);
    assert.match(note.text, /A wrapped continuation/);
    const expected = oracle.elements.find((e) => e.page === page + 1 && /^(The archive retains|The literal label)/.test(e.text));
    assert.ok(r.blocks.some((b) => b.kind === 'paragraph' && b.text === expected.text));
    assert.ok(!note.text.includes(expected.text));
    assert.equal(r.stats.chars_unaccounted, 0);
  }
});

test('T-09 bare equation numbers extend crops; parenthesized list text stays a list', () => {
  for (const page of [7, 10]) {
    for (const l of raw.pages[page].raw.filter((l) => /^\(\d+\)$/.test(l.spans.map((s) => s.text).join('')))) {
      assert.ok(result.blocks.some((b) => ['table', 'figure'].includes(b.kind) && b.boxes.some((x) =>
        x.page === page && x.x0 <= l.bbox[0] && x.top <= l.bbox[1] && x.x1 >= l.bbox[2] && x.bottom >= l.bbox[3])));
      assert.ok(!result.blocks.some((b) => b.kind === 'list' && b.text === l.spans[0].text));
      const sample = structuredClone(raw);
      const row = sample.pages[page].raw.find((r) => r.bbox[1] === l.bbox[1]);
      row.spans[0].text += ' A real list item.';
      row.bbox[2] += 70;
      sample.pages[page].nchars += 'A real list item.'.replace(/\s/g, '').length;
      assert.ok(convert(sample).blocks.some((b) => b.kind === 'list' && b.text.endsWith('A real list item.')));
      // A separately extracted body segment on the same row also prevents absorption.
      const detached = structuredClone(raw), text = structuredClone(l);
      text.spans[0].text = 'A detached list body.';
      text.bbox[0] = l.bbox[2] + 20;
      text.bbox[2] = text.bbox[0] + 80;
      detached.pages[page].raw.push(text);
      assert.ok(convert(detached).blocks.some((b) => b.kind === 'list' && b.text.includes('A detached list body.')));

    }
  }
  assert.equal(result.stats.chars_unaccounted, 0);
});

test('scoring uses page, geometry and heading level, including short text', () => {
  const r = { blocks: [{ id: 'b0', kind: 'heading', text: 'A', level: 2, page: 0,
    boxes: [{ page: 0, x0: 10, top: 10, x1: 30, bottom: 20 }] }], stats: {}, excluded: [], excludedPages: [] };
  const g = { elements: [{ id: 'a', page: 1, role: 'section_header', text: 'A', heading_level: 2, bbox: [10,10,30,20] }], relations: [] };
  assert.equal(score(r,g).summary.section_header.correct, 1);
  r.blocks[0].text = 'AB';
  assert.equal(score(r,g).summary.section_header.structure_differs, 1);
  r.blocks[0].text = 'A';
  g.elements[0].heading_level = 1;
  assert.equal(score(r,g).summary.section_header.structure_differs, 1);
  g.elements[0].page = 2;
  assert.equal(score(r,g).summary.section_header.missing, 1);
  g.elements[0].page = 1; g.elements[0].bbox = [10,100,30,110];
  assert.equal(score(r,g).summary.section_header.missing, 1);
  r.excludedPages = [1];
  assert.equal(score(r,g).summary.section_header.excluded_page, 1);
});

test('T-09 scoring distinguishes independent image, merged image, text fragments and absence',()=>{
 const e={id:'formula',page:1,role:'formula',bbox:[10,10,50,30],text:''};
 const r={blocks:[{id:'b0',kind:'figure',text:'',page:0,boxes:[{page:0,x0:10,top:10,x1:50,bottom:30}]}],stats:{},excluded:[],excludedPages:[]};
 const ref={elements:[e],relations:[]};
 assert.equal(score(r,ref).formulas[0].status,'own_image');
 ref.elements.push({...e,id:'other',bbox:[40,20,60,40]});
 assert.equal(score(r,ref).formulas[0].status,'merged');
 r.blocks[0].kind='paragraph';
 assert.equal(score(r,ref).formulas[0].status,'fragmented_text');
 r.blocks=[];
 assert.equal(score(r,ref).formulas[0].status,'missing');
});
