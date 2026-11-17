// Development measurement against an author's oracle, not representative accuracy.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { extract } from './extract.mjs';
import { convert, suggestExcludedPages } from './rules.mjs';
import { authoring } from './authoring.mjs';

export const tableNorm = (s='') => s.normalize('NFKC').replace(/\s+/g,' ').trim();
const norm = (s = '') => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const image = (b) => ['table', 'figure'].includes(b.kind);
const kinds = { paragraph: ['paragraph'], section_header: ['heading', 'heading_unnumbered'],
  document_title: ['heading', 'heading_unnumbered'], footnote: ['footnote'],
  list_item: ['list'], caption: ['caption'], toc_entry: ['paragraph', 'list'] };
const overlaps = (e, x) => x.page === e.page - 1 && x.x0 < e.bbox[2] + 2 &&
  x.x1 > e.bbox[0] - 2 && x.top < e.bbox[3] + 2 && x.bottom > e.bbox[1] - 2;
const nearby = (e, b) => b.boxes.some((x) => overlaps(e, x));
const textOf = (b) => norm(b.text);

export function score(result, reference) {
  const tables = [], tableSummary = {text:0,same_grid:0,matched_spans:0,matched_text:0,math:0,cells:0}, summary = {}, elements = [], used = new Set(), matches = new Map();
  const byId = new Map(reference.elements.map((e) => [e.id, e]));
  const continuations = reference.relations.filter((r) => r.type === 'paragraph_continues');
  for (const e of reference.elements) {
    const row = summary[e.role] ||= { correct: 0, structure_differs: 0, missing: 0, as_image: 0, excluded_page: 0 };
    let status, reason = '', hits = [];
    const near = result.blocks.filter((b) => nearby(e, b));
    const key = norm(e.text);
    if ((result.excludedPages || []).includes(e.page)) status = 'excluded_page';
    else if (e.layer === 'furniture') {
      const excluded = result.excluded.some((x) => x.kind === 'margin' && overlaps(e, x.box));
      const leaked = near.some((b) => key && textOf(b).includes(key));
      status = excluded && !leaked ? 'correct' : leaked ? 'structure_differs' : 'missing';
      reason = leaked ? '본문에 남음' : '제외 영역 대조';
    } else if (['table', 'formula', 'picture'].includes(e.role)) {
      hits = near.filter(image);
      status = hits.length ? 'as_image' : 'missing';
      reason = hits[0]?.warning?.reason || '그림으로 들어감: 문자·셀·수식 의미는 확인 안 함';
      if(e.role==='table') {
        const b=hits.find(b=>b.kind==='table'&&b.grid), g=b?.grid, ref=e.table;
        const t={id:e.id,page:e.page,status:g?'text':status,reason:g?'':reason,cells:[]};
        if(g) {
          hits=[b];status='correct';reason='글자 표';tableSummary.text++;
          t.same_grid=g.rows===ref.num_rows&&g.cols===ref.num_cols;
          if(t.same_grid)tableSummary.same_grid++;
          for(const c of ref.cells) {
            const o=g.cells.find(o=>['r0','r1','c0','c1'].every(k=>o[k]===c[k]));
            const math=c.content_kind==='math';
            const same=!!o&&tableNorm(o.text)===tableNorm(c.text);
            if(o)tableSummary.matched_spans++;
            if(math)tableSummary.math++;else {tableSummary.cells++;if(same)tableSummary.matched_text++;}
            t.cells.push({id:c.id,span:!!o,math,same:math?null:same,expected:c.text,actual:o?.text});
          }
        }
        tables.push(t);
      }
    } else {
      hits = near.filter((b) => key && textOf(b) && (textOf(b).includes(key) || key.includes(textOf(b))));
      const exact = hits.find((b) => {
        if (!(kinds[e.role] || []).includes(b.kind)) return false;
        if (e.heading_level !== undefined && b.level !== e.heading_level) return false;
        if (textOf(b) === key) return true;
        // Only an explicitly authored continuation may share a paragraph block.
        return continuations.some((r) => {
          if (![r.from, r.to].includes(e.id)) return false;
          const a = byId.get(r.from), c = byId.get(r.to);
          return a && c && nearby(a, b) && nearby(c, b) && textOf(b) === norm(a.text + c.text);
        });
      });
      const complete = hits.some((b) => textOf(b).includes(key)) ||
        hits.map(textOf).join('').includes(key);
      status = exact ? 'correct' : complete ? 'structure_differs' : 'missing';
      reason = exact ? '' : hits.map((b) => `${b.kind}${b.level ? '/H' + b.level : ''}`).join(', ') || '대응하는 글자 없음';
      if (exact) hits = [exact];
    }
    row[status]++;
    for (const b of hits) used.add(b.id);
    matches.set(e.id, hits);
    elements.push({ id: e.id, role: e.role, page: e.page, status, reason, blocks: hits.map((b) => b.id) });
  }
  // Use the actual authoring plan for caption attachment, not geometric guesses.
  const units = authoring(structuredClone(result)).units;
  const relations = reference.relations.map((r) => {
    const a = matches.get(r.from) || [], b = matches.get(r.to) || [];
    let status = 'unchecked', reason = '출력으로 관계를 확인할 수 없음';
    if (a.length === 1 && b.length === 1) {
      if (['paragraph_continues', 'must_remain_distinct'].includes(r.type)) {
        const same = a[0].id === b[0].id;
        status = same === (r.type === 'paragraph_continues') ? 'correct' : 'incorrect';
        reason = same ? '같은 블록' : '서로 다른 블록';
      } else if (r.type === 'caption_of') {
        status = units.some((u) => u.sources.includes(a[0].id) && u.sources.includes(b[0].id)) ? 'correct' : 'incorrect';
        reason = '실제 작성 계획의 캡션 연결';
      } else if(r.type==='table_note_for') {
        const ni=result.blocks.indexOf(a[0]),ti=result.blocks.indexOf(b[0]);
        const peers=reference.relations.filter(x=>x.type==='table_note_for'&&x.to===r.to).flatMap(x=>(matches.get(x.from)||[]).map(b=>b.id));
        if(b[0].grid) {status=a[0].kind==='paragraph'&&ni>ti&&result.blocks.slice(ti+1,ni).every(b=>peers.includes(b.id))?'correct':'incorrect';reason='표 바로 뒤의 연속 주석 본문';} else reason='그림 영역에서 개별 표의 주석 관계는 확인 안 함';
      } else if (r.type === 'note_reference') {
        const marker = byId.get(r.to)?.note_marker;
        if (marker && b[0].kind === 'footnote') {
          status = a[0].text.includes(`[^${marker}]`) ? 'correct' : 'incorrect';
          reason = '호출 표지와 정의';
        }
      }
    }
    return { ...r, status, reason };
  });
  const extra = result.blocks.filter((b) => !used.has(b.id)).map((b) => ({ id: b.id, page: b.page + 1, kind: b.kind, text: b.text }));
  return { summary, tables, tableSummary, elements, relations, extra };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, oracle = new URL('./test/fixtures/standards.json', import.meta.url)] = process.argv.slice(2);
  if (!input) throw new Error('사용법: node score-answer-key.mjs <PDF 또는 변환 결과 JSON> [정답 JSON]');
  let result;
  if (/\.json$/i.test(input)) {
    result = JSON.parse(await readFile(input, 'utf8'));
    if (!Array.isArray(result.excludedPages)) throw new Error('쪽 제외 제안을 적용한 결과 JSON이 필요합니다.');
  } else {
    const raw = await extract(input);
    result = convert(raw, suggestExcludedPages(raw));
  }
  const report = score(result, JSON.parse(await readFile(oracle, 'utf8')));
  console.table(report.summary);
  const labels = { structure_differs: '글자는 있으나 구조가 다름', missing: '없음', as_image: '그림으로 들어감' };
  for (const e of report.elements.filter((e) => labels[e.status])) console.log(`${e.id} p${e.page} ${labels[e.status]} ${e.reason}`);
  for (const r of report.relations) console.log(`${r.type} ${r.from} → ${r.to}: ${{ correct: '맞음', incorrect: '틀림', unchecked: '확인 안 함' }[r.status]} (${r.reason})`);
  for (const b of report.extra) console.log(`정답에 없는 블록 ${b.id} p${b.page} ${b.kind} ${b.text}`);
}
