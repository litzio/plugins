import { create } from 'xmlbuilder2';
import { createHash } from 'node:crypto';
import { policy, canonical, sha256, validate, semantic } from './model.mjs';
import { inlineFields, inlineTags } from './inline.mjs';

const NS = 'http://www.omg.org/spec/ReqIF/20110401/reqif.xsd';
const XHTML = 'http://www.w3.org/1999/xhtml';
export function stableId(namespace, key) {
  const bytes = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(key, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return 'x-' + [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}

function inline(parent, content) {
  for (const c of content) {
    if (c.kind === 'text') parent.txt(c.text);
    else if (inlineTags[c.kind]) {
      const p = parent.ele(XHTML, inlineTags[c.kind]);
      if (inlineFields[c.kind] === 'children') inline(p, c.children); else p.txt(c[inlineFields[c.kind]]);
    } else throw new Error('지원하지 않는 인라인 요소: ' + c.kind);
  }
}
function body(parent, blocks) {
  for (const b of blocks) {
    if (b.kind === 'paragraph') inline(parent.ele(XHTML, 'p'), b.content ?? [{ kind: 'text', text: b.text }]);
    else if (b.kind === 'table') {
      const table = parent.ele(XHTML, 'table');
      for (const [i, row] of b.rows.entries()) {
        const tr = table.ele(XHTML, 'tr'); for (const text of row) tr.ele(XHTML, i ? 'td' : 'th').txt(text);
      }
    } else throw new Error('지원하지 않는 본문: ' + b.kind);
  }
}

export function exportReqif(sets, { testOnly = false, previous, now = new Date().toISOString() } = {}) {
  const diagnostics = validate(sets, { formal: !testOnly });
  if (testOnly) diagnostics.push({ file: '', location: [1], severity: 'warning', code: 'test-export', message: '시험 전용 ReqIF: 실사용 금지' });
  if (diagnostics.some(d => d.severity === 'error')) throw Object.assign(new Error('내보내기 차단'), { diagnostics });
  const namespace = sets[0].exportNamespace, id = key => stableId(namespace, key);
  const manifest = { version: 1, namespace, entries: {}, missing: [] };
  const ident = (key, name, value) => {
    const identifier = key.startsWith('req-') ? key : id(key);
    const digest = sha256(canonical(value));
    const old = previous?.namespace === namespace ? previous.entries[identifier] : undefined;
    const changed = old?.digest === digest ? old.lastChange : now;
    manifest.entries[identifier] = { digest, lastChange: changed };
    return { IDENTIFIER: identifier, 'LONG-NAME': name, 'LAST-CHANGE': changed };
  };
  if (!previous) diagnostics.push({ file: '', location: [1], code: 'manifest-new', severity: 'warning', message: '이전 manifest 없음: 기존 변경 시각 복구 불가' });
  if (previous && previous.namespace !== namespace) throw new Error('이전 manifest namespace와 다릅니다');
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele(NS, 'REQ-IF', { 'xmlns:xhtml': XHTML });
  // Structural root whitespace also lets reqif 0.0.47 retain a non-self-closing
  // root when it captures namespaces after removing child elements.
  root.txt('\n');
  const header = root.ele('THE-HEADER').ele('REQ-IF-HEADER', { IDENTIFIER: id('header') });
  // ReqIF 1.2 uses the 20110401 schema whose wire version is fixed to 1.0.
  for (const [k, v] of Object.entries({ 'COMMENT': testOnly ? 'TEST ONLY - NOT FOR PRODUCTION' : 'requirements-extract/1', 'CREATION-TIME': now, 'REQ-IF-TOOL-ID': 'requirements-extract/1', 'REQ-IF-VERSION': '1.0', 'SOURCE-TOOL-ID': 'requirements-extract/1', TITLE: testOnly ? 'TEST ONLY' : 'Requirements' })) header.ele(k).txt(v);
  const content = root.ele('CORE-CONTENT').ele('REQ-IF-CONTENT');
  const datatypes = content.ele('DATATYPES');
  datatypes.ele('DATATYPE-DEFINITION-XHTML', ident('dt:xhtml', 'XHTML', 'xhtml'));
  datatypes.ele('DATATYPE-DEFINITION-STRING', { ...ident('dt:string', 'String', 65535), 'MAX-LENGTH': 65535 });
  for (const [k, values] of Object.entries(policy)) {
    const list = datatypes.ele('DATATYPE-DEFINITION-ENUMERATION', ident('dt:' + k, k, values)).ele('SPECIFIED-VALUES');
    for (const [i, value] of values.entries()) list.ele('ENUM-VALUE', ident('enum:' + k + ':' + value, value, value)).ele('PROPERTIES').ele('EMBEDDED-VALUE', { KEY: i, 'OTHER-CONTENT': value });
  }
  const types = content.ele('SPEC-TYPES');
  const attributes = { 'ReqIF.Name': 'XHTML', 'ReqIF.Text': 'XHTML', ...Object.fromEntries(Object.keys(policy).map(k => [k, 'ENUMERATION'])), rationale: 'XHTML', SourceReferences: 'STRING', SourcePages: 'STRING' };
  function type(kind, key, attrs) {
    const t = types.ele(kind, ident(key, key, attrs));
    const definitions = t.ele('SPEC-ATTRIBUTES');
    for (const [name, dt] of Object.entries(attrs)) {
      const d = definitions.ele('ATTRIBUTE-DEFINITION-' + dt, { ...ident('attr:' + key + ':' + name, name, dt), ...(dt === 'ENUMERATION' ? { 'MULTI-VALUED': false } : {}) });
      d.ele('TYPE').ele('DATATYPE-DEFINITION-' + dt + '-REF').txt(id('dt:' + (dt === 'ENUMERATION' ? name : dt.toLowerCase())));
    }
  }
  type('SPEC-OBJECT-TYPE', 'object-type', attributes);
  type('SPECIFICATION-TYPE', 'specification-type', { 'ReqIF.Name': 'XHTML' });
  for (const role of ['refines', 'relatesTo']) types.ele('SPEC-RELATION-TYPE', ident('relation-type:' + role, role, role));
  function values(parent, typeKey, attrs, data) {
    const vals = parent.ele('VALUES');
    for (const [name, dt] of Object.entries(attrs)) {
      const value = data[name];
      if (dt === 'STRING' && value.length > 65535) throw new Error(name + ': 65535자 초과');
      const a = vals.ele('ATTRIBUTE-VALUE-' + dt, dt === 'STRING' ? { 'THE-VALUE': value } : {});
      a.ele('DEFINITION').ele('ATTRIBUTE-DEFINITION-' + dt + '-REF').txt(id('attr:' + typeKey + ':' + name));
      if (dt === 'XHTML') body(a.ele('THE-VALUE').ele(XHTML, 'div'), value);
      if (dt === 'ENUMERATION') a.ele('VALUES').ele('ENUM-VALUE-REF').txt(id('enum:' + name + ':' + value));
    }
  }
  const text = s => [{ kind: 'paragraph', text: s }];
  const objects = content.ele('SPEC-OBJECTS');
  for (const s of sets) for (const r of s.requirements) {
    const o = objects.ele('SPEC-OBJECT', ident(r.id, r.title, { ...semantic(r), status: r.status }));
    values(o, 'object-type', attributes, { ...r, 'ReqIF.Name': text(r.title), 'ReqIF.Text': r.body, rationale: text(r.rationale), SourceReferences: canonical(r.sources), SourcePages: '' });
    o.ele('TYPE').ele('SPEC-OBJECT-TYPE-REF').txt(id('object-type'));
  }
  const rels = content.ele('SPEC-RELATIONS'), seen = new Set();
  for (const s of sets) for (const r of s.requirements) for (const rel of r.relations) {
    const [from, to] = rel.role === 'relatesTo' ? [r.id, rel.targetId].sort() : [r.id, rel.targetId];
    const key = 'relation:' + rel.role + ':' + from + ':' + to;
    if (seen.has(key)) continue; seen.add(key);
    const e = rels.ele('SPEC-RELATION', ident(key, rel.role, { from, to, role: rel.role }));
    e.ele('TYPE').ele('SPEC-RELATION-TYPE-REF').txt(id('relation-type:' + rel.role));
    e.ele('SOURCE').ele('SPEC-OBJECT-REF').txt(from); e.ele('TARGET').ele('SPEC-OBJECT-REF').txt(to);
  }
  const specs = content.ele('SPECIFICATIONS');
  for (const s of sets) {
    const spec = specs.ele('SPECIFICATION', ident('specification:' + s.setId, s.title, { title: s.title, ids: s.requirements.map(r => r.id) }));
    values(spec, 'specification-type', { 'ReqIF.Name': 'XHTML' }, { 'ReqIF.Name': text(s.title) });
    spec.ele('TYPE').ele('SPECIFICATION-TYPE-REF').txt(id('specification-type'));
    const children = spec.ele('CHILDREN');
    for (const r of s.requirements) children.ele('SPEC-HIERARCHY', ident('hierarchy:' + s.setId + ':' + r.id, r.id, r.id)).ele('OBJECT').ele('SPEC-OBJECT-REF').txt(r.id);
  }
  if (previous) manifest.missing = Object.keys(previous.entries).filter(k => !manifest.entries[k]);
  // Pretty indentation inside mixed XHTML inserts whitespace into requirements.
  return { xml: root.end({ prettyPrint: false }), manifest, diagnostics };
}
