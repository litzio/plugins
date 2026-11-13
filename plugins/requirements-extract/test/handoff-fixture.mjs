// Minimal synthetic processing fixture; inspect is explicitly stubbed in tests.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export const h = value => createHash('sha256').update(value).digest('hex');
export const read = (root, name) => JSON.parse(readFileSync(join(root, name)));
export const write = (root, name, value) => writeFileSync(join(root, name), JSON.stringify(value));
export function reseal(root) { const c = read(root, 'complete.json'); for (const f of c.files) f.sha256 = h(readFileSync(join(root, f.relativePath))); write(root, 'complete.json', c); }
export function handoff() {
  const root = mkdtempSync(join(tmpdir(), 'requirements-handoff-unit-')); mkdirSync(join(root, 'source'));
  const quote = 'Voltage ≤ 5 V', pdf = Buffer.from('%PDF-1.4\nsynthetic processing fixture\n'), document = Buffer.from('synthetic native bytes; official inspect is stubbed');
  const prov = [{ page_no: 1, bbox: { l: 10, t: 10, r: 120, b: 30, coord_origin: 'TOPLEFT' } }];
  const rawCells = [0, 1].map(row => ({ start_row_offset_idx: row, end_row_offset_idx: row + 1, start_col_offset_idx: 0, end_col_offset_idx: 2, row_span: 1, col_span: 2, text: row ? '≤ 5 V' : 'Parameter' }));
  const raw = { schema_name: 'DoclingDocument', version: '1.10.0', body: { self_ref: '#/body', label: 'body' }, furniture: { self_ref: '#/furniture', label: 'furniture' }, texts: [{ self_ref: '#/texts/0', label: 'text', text: quote, orig: quote, prov }], tables: [{ self_ref: '#/tables/0', label: 'table', data: { table_cells: rawCells, num_rows: 2, num_cols: 2 }, prov: [...prov, { ...prov[0], page_no: 2 }] }], pages: { 1: { size: { width: 200, height: 300 } }, 2: { size: { width: 200, height: 300 } } } };
  const docBytes = Buffer.from(JSON.stringify(raw)), docHash = h(docBytes), revision = h(document), generationId = '00000000-0000-4000-8000-000000000001';
  const source = { pdf: { relativePath: 'source/source.pdf', sha256: h(pdf) }, docling: { relativePath: 'source/document.json', sha256: docHash }, conversionRecord: { relativePath: 'source/conversion-record.json', sha256: '' }, documentSchemaVersion: '1.10.0' };
  const record = { source: { sha256: h(pdf), bytes: pdf.length }, document: { version: '1.10.0', sha256: docHash, page_count: 2 } }; source.conversionRecord.sha256 = h(Buffer.from(JSON.stringify(record)));
  const target = (path, selector, text) => ({ path, selector, text, role: 'content', bindingState: 'current', documentRevision: revision });
  const region = p => ({ pageNo: p.page_no, bbox: [10, 10, 120, 30], unit: 'pt', origin: 'TOPLEFT', original: p });
  const item = v => ({ sourceId: h(docHash + ':' + v.self_ref), selfRef: v.self_ref, label: v.label, sourceText: v.text ?? null, originalText: v.orig ?? null, reviewState: 'unreviewed', regions: (v.prov ?? []).map(region), disposition: v.text || v.data ? 'mapped' : 'container', targets: [], cells: [], losses: [], structure: {} });
  const items = [raw.body, raw.furniture, ...raw.texts, ...raw.tables].map(item);
  items[2].targets = [target([1], { kind: 'block' }, quote)];
  items[3].targets = [target([2], { kind: 'block' }, null)];
  items[3].structure.tableModel = { reviewRequired: true, mergedRanges: [0, 1].map(cellIndex => ({ cellIndex, row: cellIndex, column: 0, rowSpan: 1, columnSpan: 2, role: 'shared', risks: ['shared condition'] })), headerContributions: [] };
  items[3].cells = rawCells.map((c, index) => ({ sourceId: h(docHash + ':#/tables/0:' + index), cellIndex: index, sourceCell: c, regionPrecision: 'table', targets: [0, 1].map(column => target([2], { kind: 'cell', row: index, column, rowSpan: 1, columnSpan: 1 }, c.text)) }));
  const snapshot = { ok: true, revision, nodes: [{ path: [1], type: 'paragraph', text: quote, content: [{ kind: 'text', text: quote }] }, { path: [2], type: 'table' }, ...rawCells.flatMap((c, row) => [0, 1].map(column => ({ path: [2, row, column], type: 'cell', text: c.text, header: row === 0, content: [{ kind: 'text', text: c.text }] })))] };
  const receipt = { revision, inputs: [{ key: 'all', targets: [1, 2].map(n => ({ path: [n], documentRevision: revision })) }] };
  const p = { schemaVersion: '1.0.0', generationId, generatorVersion: '1.0.0', rulesVersion: { test: '1.0.0' }, reviewState: 'unreviewed', source, document: { relativePath: 'document.md', revision, blocks: [{ path: [1], kind: 'paragraph', text: quote }, { path: [2], kind: 'table', text: null }] }, pages: [1, 2].map(pageNo => ({ pageNo, width: 200, height: 300, unit: 'pt', origin: 'TOPLEFT', rotation: null, printedLabel: null })), items, assets: [], diagnostics: [] };
  writeFileSync(join(root, 'source/source.pdf'), pdf); writeFileSync(join(root, 'source/document.json'), docBytes); writeFileSync(join(root, 'document.md'), document);
  write(root, 'source/conversion-record.json', record); write(root, 'snapshot.json', snapshot); write(root, 'receipt.json', receipt); write(root, 'provenance.json', p); write(root, 'losses.json', { schemaVersion: '1.0.0', generationId, documentRevision: revision, items: [] });
  const names = ['source/source.pdf', 'source/document.json', 'source/conversion-record.json', 'document.md', 'snapshot.json', 'receipt.json', 'provenance.json', 'losses.json'];
  write(root, 'complete.json', { schemaVersion: '1.0.0', generationId, status: 'generated', reviewState: 'unreviewed', documentRevision: revision, files: names.map(relativePath => ({ relativePath, sha256: h(readFileSync(join(root, relativePath))) })) });
  return root;
}
