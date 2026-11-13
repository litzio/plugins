import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';
import { canonical, sha256 } from './model.mjs';
import { correctedSnapshot } from './corrections.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => canonical(a) === canonical(b);
const parse = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
function fail(code, message, location = []) { throw Object.assign(new Error(message), { diagnostics: [{ file: 'complete.json', location, code, severity: 'error', message }] }); }
const check = (condition, code, message) => { if (!condition) fail(code, message); };
const schemas = Object.fromEntries(['complete', 'provenance', 'losses', 'correction-history', 'review-targets', 'pdf-evidence'].map(name => [name, new Ajv({ strict: true, allowUnionTypes: true }).compile(JSON.parse(readFileSync(new URL('../schema/handoff-' + name + '.schema.json', import.meta.url))))]));
function schema(name, value) { check(schemas[name](value), 'handoff-schema', name + ': ' + JSON.stringify(schemas[name].errors)); }
// The public CLI added content while preserving existing text fields. Accept
// only that documented additive field in old checkpoints, using the fresh
// same-revision projection afterwards; do not waive arbitrary schema changes.
function sameProjection(stored, actual) {
  if (Array.isArray(stored)) return Array.isArray(actual) && stored.length === actual.length && stored.every((v, i) => sameProjection(v, actual[i]));
  if (stored && typeof stored === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    return Object.keys(stored).every(k => Object.hasOwn(actual, k) && sameProjection(stored[k], actual[k])) && Object.keys(actual).every(k => Object.hasOwn(stored, k) || (k === 'content' && Array.isArray(stored.path) && ['paragraph', 'heading', 'quote', 'admonition', 'footnote', 'caption', 'cell'].includes(stored.type) && typeof stored.text === 'string' && Array.isArray(actual.content)));
  }
  return stored === actual;
}
function bundleFile(root, name) {
  check(typeof name === 'string' && /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*[\\:\x00])[A-Za-z0-9._/-]+$/.test(name), 'unsafe-path', '인계 경로는 POSIX 상대 경로여야 합니다');
  let path = root;
  for (const [i, part] of name.split('/').entries()) {
    check(part.length > 0, 'unsafe-path', '빈 경로 segment'); path = join(path, part);
    const stat = lstatSync(path);
    check(!stat.isSymbolicLink() && (i === name.split('/').length - 1 ? stat.isFile() : stat.isDirectory()), 'unsafe-path', '인계 파일·상위 경로는 일반 파일/디렉터리여야 합니다');
  }
  return path;
}
function text(node, snapshot) {
  if (node.text !== undefined) return node.text;
  if (node.type === 'equation') return node.latex;
  if (node.type === 'code') return node.code;
  if (node.type === 'figure') return snapshot.nodes.find(n => n.type === 'caption' && n.path[0] === node.path[0])?.text ?? null;
  return null;
}
function selected(snapshot, target) {
  const node = snapshot.nodes.find(n => equal(n.path, target.path));
  check(node, 'broken-target', 'snapshot에 target path가 없습니다');
  const s = target.selector;
  if (s.kind === 'block') return text(node, snapshot);
  if (s.kind === 'list-item') {
    const item = node.items?.[s.index]; check(item, 'broken-selector', '목록 항목 범위가 없습니다');
    check(item.content?.every(c => c.kind === 'text'), 'target-projection', 'rich 목록의 literal target 문자열 비교는 후속 계약이 필요합니다');
    return item.content.map(c => c.text).join('');
  }
  check(node.type === 'table', 'broken-selector', '셀 target이 표를 가리키지 않습니다');
  const cells = snapshot.nodes.filter(n => n.type === 'cell' && n.path[0] === target.path[0]);
  const values = [];
  for (let r = s.row; r < s.row + s.rowSpan; r++) for (let c = s.column; c < s.column + s.columnSpan; c++) {
    const cell = cells.find(n => n.path[1] === r && n.path[2] === c); check(cell, 'broken-selector', '셀 target 범위가 표 밖입니다'); values.push(cell.text);
  }
  check(values.every(v => v === values[0]), 'target-projection', 'range target의 값이 서로 다릅니다'); return values[0];
}

function readHandoff(root, { inspect, requireReviewed = false } = {}) {
  root = resolve(root); check(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink() && realpathSync(root).toLowerCase() === root.toLowerCase(), 'unsafe-path', '일반 인계 디렉터리만 읽습니다');
  const markerPath = bundleFile(root, 'complete.json'), markerBytes = readFileSync(markerPath);
  const complete = parse(markerBytes);
  check(['1.0.0', '1.1.0'].includes(complete.schemaVersion), 'handoff-schema', '지원하지 않는 인계 버전');
  schema('complete', { ...complete, schemaVersion: '1.0.0' });
  const corrected = complete.schemaVersion === '1.1.0';
  const files = new Map();
  for (const file of complete.files) {
    check(!files.has(file.relativePath), 'duplicate-file', '완료 표지의 중복 경로');
    const bytes = readFileSync(bundleFile(root, file.relativePath));
    check(hash(bytes) === file.sha256, 'file-digest', '파일 bytes digest 불일치: ' + file.relativePath); files.set(file.relativePath, bytes);
  }
  const json = name => { check(files.has(name), 'missing-file', '완료 표지에서 빠진 필수 파일: ' + name); return parse(files.get(name)); };
  const p = json('provenance.json'), losses = json('losses.json'), receipt = json('receipt.json');
  let snapshot = json('snapshot.json');
  schema('provenance', p); schema('losses', losses);
  check(p.generationId === complete.generationId && losses.generationId === p.generationId, 'generation-mismatch', 'generationId가 섞였습니다');
  const baselineRevision = corrected ? p.document.revision : complete.documentRevision;
  check(p.document.revision === baselineRevision && losses.documentRevision === baselineRevision && snapshot.revision === baselineRevision && receipt.revision === baselineRevision, 'revision-mismatch', '문서/대응/손실/receipt/snapshot revision 불일치');
  check(files.has(p.document.relativePath) && hash(files.get(p.document.relativePath)) === complete.documentRevision, 'revision-mismatch', '문서 bytes revision 불일치');
  for (const ref of Object.values(p.source).filter(v => typeof v === 'object')) check(files.has(ref.relativePath) && hash(files.get(ref.relativePath)) === ref.sha256, 'source-digest', '원본 사본 digest가 다릅니다');
  const doc = json(p.source.docling.relativePath), record = json(p.source.conversionRecord.relativePath);
  check(doc.schema_name === 'DoclingDocument' && doc.version === '1.10.0' && record.document?.version === doc.version && record.document.sha256 === p.source.docling.sha256 && record.document.page_count === Object.keys(doc.pages).length, 'source-schema', 'Docling/record schema 불일치');
  check(record.source.sha256 === p.source.pdf.sha256 && record.source.bytes === files.get(p.source.pdf.relativePath).length, 'source-record', 'PDF bytes와 변환 기록이 다릅니다');
  check(typeof inspect === 'function', 'inspection-required', '현재 문서의 공식 inspect 결과가 필요합니다');
  const actual = inspect(bundleFile(root, p.document.relativePath));
  check(actual.ok && actual.revision === complete.documentRevision && (corrected || sameProjection(snapshot.nodes, actual.nodes)), 'stale-snapshot', '공식 현재 문서와 인계 snapshot이 다릅니다');
  if (!corrected) snapshot = actual;
  const rawItems = [doc.body, doc.furniture, ...Object.values(doc).filter(Array.isArray).flat()].filter(v => v?.self_ref);
  const raw = new Map(rawItems.map(v => [v.self_ref, v]));
  check(raw.size === rawItems.length && p.items.length === raw.size && new Set(p.items.map(i => i.selfRef)).size === raw.size, 'inventory', '원본 selfRef 전수 inventory가 다릅니다');
  const pageMap = new Map(p.pages.map(page => [page.pageNo, page]));
  check(pageMap.size === p.pages.length && pageMap.size === Object.keys(doc.pages).length, 'pages', '쪽 inventory 불일치');
  for (const page of p.pages) {
    const source = doc.pages[page.pageNo]; check(source && page.width === source.size.width && page.height === source.size.height, 'pages', '쪽 크기가 원본과 다릅니다');
    check(page.rotation === null && page.printedLabel === null, 'unsupported-page-evidence', 'v1에 없는 회전/인쇄 쪽 증거를 추정하지 않습니다');
  }
  const receiptPaths = new Set(receipt.inputs.flatMap(input => input.targets.map(t => { check(t.documentRevision === baselineRevision, 'receipt-revision', 'receipt target revision 불일치'); return canonical(t.path); })));
  const covered = new Set(), targets = [];
  function target(t, expected) {
    check(t.documentRevision === baselineRevision && receiptPaths.has(canonical(t.path)), 'target-revision', 'target이 공식 receipt/revision에 결합되지 않았습니다');
    if (['deleted', 'no-source'].includes(t.bindingState)) return;
    const value = selected(snapshot, t);
    check(value === t.text, 'target-text', 'target literal text와 snapshot이 다릅니다: ' + canonical(t.path) + ' ' + canonical(t.selector));
    if (expected !== undefined && t.role === 'content') check(t.text === expected, 'source-native-text', '원본 문자와 출력 문자가 다릅니다');
    covered.add(canonical(t.path)); targets.push(t);
  }
  for (const item of p.items) {
    const source = raw.get(item.selfRef); check(source && item.sourceId === hash(p.source.docling.sha256 + ':' + item.selfRef), 'source-identity', 'selfRef/sourceId가 원본에 없습니다');
    check(item.label === source.label && item.sourceText === (source.text ?? null) && item.originalText === (source.orig ?? null), 'source-text', '원본 label/text/orig가 변경됐습니다');
    check((item.disposition === 'mapped') === (item.targets.length > 0), 'disposition', 'mapped/target 상태 불일치');
    const prov = source.prov ?? [];
    check(item.regions.length === prov.length, 'regions', '원문 영역이 누락됐습니다');
    for (const [i, region] of item.regions.entries()) {
      const original = prov[i], page = pageMap.get(original.page_no), b = original.bbox;
      check(['TOPLEFT', 'BOTTOMLEFT'].includes(b.coord_origin), 'regions', '알 수 없는 원본 좌표 원점');
      check(page && equal(region.original, original) && region.pageNo === original.page_no, 'regions', '원문 영역/쪽 근거 불일치');
      const bbox = b.coord_origin === 'BOTTOMLEFT' ? [b.l, page.height - b.t, b.r, page.height - b.b] : [b.l, b.t, b.r, b.b];
      check(equal(region.bbox, bbox) && bbox[0] >= 0 && bbox[1] >= 0 && bbox[2] <= page.width && bbox[3] <= page.height && bbox[0] <= bbox[2] && bbox[1] <= bbox[3], 'regions', 'PDF 좌표 변환/bounds 불일치');
    }
    for (const t of item.targets) {
      const kind = snapshot.nodes.find(n => equal(n.path, t.path))?.type;
      let expected;
      if (t.role === 'content' && ['paragraph', 'quote'].includes(kind)) expected = source.text;
      if (t.role === 'content' && kind === 'heading') expected = source.text;
      if (t.role === 'content' && kind === 'list' && t.selector.kind === 'list-item') expected = source.text;
      target(t, expected);
      if (kind === 'heading') check(source.level === undefined || snapshot.nodes.find(n => equal(n.path, t.path)).level === source.level, 'heading-level', '원본 제목 level 불일치');
      if (kind === 'code') check(snapshot.nodes.find(n => equal(n.path, t.path)).language === (source.code_language ?? ''), 'code-language', '원본 코드 언어 불일치');
      if (kind === 'code') check(snapshot.nodes.find(n => equal(n.path, t.path)).code === source.text, 'code-text', '원본 코드 본문 불일치');
      if (kind === 'equation') check(snapshot.nodes.find(n => equal(n.path, t.path)).latex === source.text, 'formula-text', '원본 LaTeX 불일치');
      if (kind === 'figure' && source.label === 'caption') {
        const node = snapshot.nodes.find(n => equal(n.path, t.path));
        check(source.text === t.text || ['Figure ', 'Fig. '].some(prefix => source.text === prefix + node.enumerator + '. ' + t.text), 'caption-text', '원본 캡션/명시 번호와 출력이 다릅니다');
      }
      if (kind === 'list' && source.enumerated && source.marker) { const marker = Number.parseInt(source.marker); const node = snapshot.nodes.find(n => equal(n.path, t.path)); if (t.selector.index === 0 && Number.isFinite(marker)) check(node.start === marker, 'list-start', '원본 목록 시작 번호 불일치'); }
    }
    const cells = source.data?.table_cells ?? [];
    check(item.cells.length === cells.length, 'cell-inventory', '원본 셀이 누락됐습니다');
    for (const h of item.structure.tableModel?.headerContributions ?? []) check(h.sourceCellIndices.every(i => cells[i]) && h.text === h.sourceCellIndices.map(i => cells[i].text).join(' – '), 'header-contribution', '복합 머리의 원본 셀 기여와 표시 문자열이 다릅니다');
    const merged = cells.map((c, index) => ({ ...c, index })).filter(c => c.row_span > 1 || c.col_span > 1);
    if (merged.length) check(item.structure.tableModel?.reviewRequired === true, 'merged-review', '병합 표의 검수 표시가 없습니다');
    if (cells.length) {
      const ranges = item.structure.tableModel?.mergedRanges ?? [];
      check(ranges.length === merged.length && merged.every(c => ranges.some(r => r.cellIndex === c.index && r.row === c.start_row_offset_idx && r.column === c.start_col_offset_idx && r.rowSpan === c.row_span && r.columnSpan === c.col_span)), 'merged-ranges', '원본 병합 범위와 인계 metadata가 다릅니다');
    }
    const occupied = new Set();
    for (const [index, cell] of item.cells.entries()) {
      const c = cell.sourceCell;
      check(Number.isInteger(c.row_span) && c.row_span > 0 && Number.isInteger(c.col_span) && c.col_span > 0 && c.start_row_offset_idx >= 0 && c.start_col_offset_idx >= 0 && c.end_row_offset_idx - c.start_row_offset_idx === c.row_span && c.end_col_offset_idx - c.start_col_offset_idx === c.col_span, 'source-cell', '원본 셀의 범위/span이 올바르지 않습니다');
      check([c.start_row_offset_idx, c.start_col_offset_idx, c.end_row_offset_idx, c.end_col_offset_idx].every(Number.isInteger) && c.end_row_offset_idx <= source.data.num_rows && c.end_col_offset_idx <= source.data.num_cols, 'source-cell', '원본 셀 범위가 원본 표 밖입니다');
      for (let row = c.start_row_offset_idx; row < c.end_row_offset_idx; row++) for (let col = c.start_col_offset_idx; col < c.end_col_offset_idx; col++) { const key = row + ':' + col; check(!occupied.has(key), 'source-cell-overlap', '원본 셀 범위가 겹칩니다'); occupied.add(key); }
      check(cell.cellIndex === index && equal(cell.sourceCell, cells[index]) && cell.sourceId === hash(p.source.docling.sha256 + ':' + item.selfRef + ':' + index), 'source-cell', '셀 index/span/text/sourceId 불일치');
      for (const t of cell.targets) {
        const header = item.structure.tableModel?.headerContributions?.find(h => h.column === t.selector.column && h.sourceCellIndices.includes(index));
        target(t, header?.text ?? cells[index].text);
      }
    }
  }
  const top = snapshot.nodes.filter(n => n.path.length === 1 && n.type !== 'caption');
  check(top.every(n => covered.has(canonical(n.path))), 'unmapped-block', '원본 target이 없는 출력 블록이 있습니다');
  check(p.document.blocks.length === top.length && p.document.blocks.every(b => top.some(n => equal(n.path, b.path) && n.type === b.kind && text(n, snapshot) === b.text)), 'block-inventory', '문서 블록 inventory 불일치');
  check(equal(losses.items, p.items.flatMap(i => i.losses)), 'loss-inventory', '손실 보고가 전수 항목 손실과 다릅니다');
  for (const asset of p.assets) {
    check(asset.sourceIds.length > 0, 'asset-original', '그림 원본 식별자가 없습니다');
    check(files.has(asset.relativePath) && hash(files.get(asset.relativePath)) === asset.sha256, 'asset-digest', '그림이 완료 표지에서 빠졌습니다');
    for (const sid of asset.sourceIds) {
      const item = p.items.find(i => i.sourceId === sid), uri = raw.get(item?.selfRef)?.image?.uri;
      check(typeof uri === 'string' && uri.startsWith('data:') && hash(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')) === asset.sha256, 'asset-original', '그림 원본 embedded bytes와 다릅니다');
    }
  }
  for (const n of snapshot.nodes.filter(n => n.type === 'figure' && n.imageUrl)) check(p.assets.some(a => a.relativePath === n.imageUrl.replace(/^\.\//, '')), 'asset-inventory', 'snapshot 그림이 자산 목록에서 빠졌습니다');
  let history, current;
  if (corrected) {
    history = json('correction-history.json'); const report = json('review/review-targets.json'), evidence = json('review/pdf-evidence.json');
    schema('correction-history', history); schema('review-targets', report); schema('pdf-evidence', evidence);
    const ledgerPath = bundleFile(root, 'correction-ledger.json'), ledgerBytes = readFileSync(ledgerPath);
    current = correctedSnapshot({history, report, evidence, ledger:parse(ledgerBytes), baseline:snapshot, provenance:p, complete, files, actual, check});
    check(readFileSync(ledgerPath).equals(ledgerBytes), 'ledger-changed', '읽는 동안 교정 원장이 바뀌었습니다');
  }
  check(readFileSync(markerPath).equals(markerBytes), 'marker-changed', '읽는 동안 완료 표지가 바뀌었습니다');
  check(!requireReviewed, 'source-review-required', 'v1 생성물은 unreviewed이므로 확정 출처로 채택할 수 없습니다');
  if (!corrected) return { provenance: p, snapshot, complete, reviewState: 'unreviewed', eligibleConfirmed: false };
  const projected = structuredClone(p); projected.schemaVersion = '1.1.0'; projected.document.revision = current.revision;
  for (const block of projected.document.blocks) block.text = selected(current, {path:block.path,selector:{kind:'block'}});
  for (const item of projected.items) for (const t of [...item.targets, ...item.cells.flatMap(c => c.targets)]) { t.documentRevision = current.revision; t.text = selected(current, t); }
  return { provenance: projected, baseline:p, snapshot:current, history, complete, reviewState:'unreviewed', eligibleConfirmed:false };
}
export function loadProvenance(root, options) {
  try { return readHandoff(root, options); }
  catch (error) { if (error.diagnostics) throw error; fail('handoff-read', '완료 표지·필수 파일 또는 UTF-8 JSON을 읽을 수 없습니다'); }
}

export function resolveSource(bundle, { sourceKey = 'source', elementRef, selector = 'full' }) {
  const p = bundle.provenance, item = p.items.find(i => i.selfRef === elementRef);
  if (!item) return { state: 'deleted', eligibleConfirmed: false, diagnostics: [{ file: p.document.relativePath, location: [], code: 'deleted-source', message: '원본에서 삭제되었거나 없는 요소', severity: 'error' }] };
  let quote = item.sourceText, sourceId = item.sourceId, targets = item.targets.filter(t => t.role === 'content'), cell;
  if (selector.startsWith('cell:')) {
    const [, row, column] = selector.split(':').map((s, i) => i ? Number(s) : s);
    cell = item.cells.find(c => row >= c.sourceCell.start_row_offset_idx && row < c.sourceCell.end_row_offset_idx && column >= c.sourceCell.start_col_offset_idx && column < c.sourceCell.end_col_offset_idx);
    check(cell, 'missing-cell', '원본 cell selector가 없습니다'); quote = cell.sourceCell.text; sourceId = cell.sourceId; targets = cell.targets.filter(t => t.role === 'content');
  } else if (selector.startsWith('text:')) {
    const [, start, end] = selector.split(':').map(Number), chars = Array.from(quote ?? '');
    check(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= chars.length, 'source-selector', '원문 code point 범위가 올바르지 않습니다'); quote = chars.slice(start, end).join('');
  } else check(selector === 'full', 'source-selector', '알 수 없는 원문 selector');
  check(typeof quote === 'string' && quote.length > 0, 'missing-quote', '원문 인용 문자열이 없습니다');
  const diagnostics = [{ code: 'source-review-required', severity: 'warning', message: '생성 완결은 검수 완료가 아닙니다. 출처 확인 필요' }];
  if (!targets.length || targets.some(t => t.bindingState !== 'current')) diagnostics.push({ code: 'source-binding', severity: 'warning', message: '현재 위치가 불확실하거나 삭제됨: 출처 확인 필요' });
  const table = item.structure.tableModel;
  if (cell && table?.reviewRequired) diagnostics.push({ code: 'merged-table-review', severity: 'warning', message: '병합/복합 머리 값이 반복됐을 수 있습니다. 숫자 확정 전에 사람이 원문 범위를 검토해야 합니다' });
  if (cell) diagnostics.push({ code: 'table-region-only', severity: 'warning', message: '셀별 쪽은 알 수 없어 표 전체 영역을 반환합니다' });
  if (!item.regions.length) diagnostics.push({ code: 'missing-source-region', severity: 'warning', message: '원본 PDF 영역 근거가 없습니다' });
  if (item.losses.some(l => l.severity === 'blocking')) diagnostics.push({ code: 'source-loss', severity: 'warning', message: '미검수 차단 손실이 출처에 있습니다' });
  for (const d of diagnostics) { d.file = p.document.relativePath; d.location = targets[0]?.path ?? []; }
  const trace = { contract: 'docling-to-litzio/1.0.0', generationId: p.generationId, documentRevision: p.document.revision, documentFile: p.document.relativePath, sourceId, sourceLabel: item.label, bindingState: targets.every(t => t.bindingState === 'current') && targets.length ? 'current' : 'uncertain', reviewState: 'unreviewed', eligibleConfirmed: false, targets: structuredClone(targets), regions: structuredClone(item.regions), pages: p.pages.filter(page => item.regions.some(r => r.pageNo === page.pageNo)), precision: cell ? 'table' : 'element', ...(cell ? { sourceCell: cell.sourceCell, tableModel: table } : {}), losses: item.losses, limitations: ['PDF text-layer correspondence not yet checked', 'rotation/printedLabel unavailable', 'no correction/review history', ...(cell ? ['no per-cell page attribution'] : [])], diagnostics };
  if(bundle.history) {
    trace.contract='docling-to-litzio/1.1.0'; trace.baselineRevision=bundle.history.baselineRevision;
    trace.limitations=['correction evidence is not semantic review completion','rotation/printedLabel unavailable',...(cell?['no per-cell page attribution']:[])];
    trace.corrections=bundle.history.changes.filter(c=>targets.some(t=>equal(t.path,c.target.path) && (c.target.kind==='cell'?t.selector.kind==='cell'&&t.selector.row===c.target.row&&t.selector.column===c.target.column:t.selector.kind==='block'))).map(c=>structuredClone(c));
    if(trace.corrections.length) { trace.correctionNotice='원본 변환값과 다르게 교정됨(근거 있음)'; diagnostics.push({code:'source-corrected',severity:'warning',message:trace.correctionNotice,file:p.document.relativePath,location:targets[0]?.path??[]}); }
  }
  return { state: 'needs-source-review', eligibleConfirmed: false, source: { sourceKey, elementRef, selector, quote, quoteDigest: sha256(quote), trace }, diagnostics };
}
