import {exportSourceReferences} from './trace-store.mjs';
import { create } from 'xmlbuilder2';
import { createHash } from 'node:crypto';
import { policy, canonical, sha256, validate, semantic } from './model.mjs';
import { inlineFields, inlineTags } from './inline.mjs';
import {exportCatalogIssues,requirementClassification,setClassification} from './export-classification.mjs';

const NS = 'http://www.omg.org/spec/ReqIF/20110401/reqif.xsd';
const XHTML = 'http://www.w3.org/1999/xhtml';
const anchor = (scope, label) => 'label-' + createHash('sha256').update(scope + ':' + label).digest('hex');
export function xmlIdentityIssues(root) {
  const seen = new Set(), diagnostics = [];
  for (const n of [root, ...root.getElementsByTagName('*')]) for (const key of ['IDENTIFIER', 'id', 'xml:id']) if (n.hasAttribute?.(key)) {
    const value = n.getAttribute(key);
    if (seen.has(value)) diagnostics.push({ file: '', location: [1], code: 'duplicate-xml-id', severity: 'error', message: 'ReqIF 파일 안의 XML ID가 중복됩니다: ' + value });
    seen.add(value);
  }
  return diagnostics;
}
function listMarker(n, style = 'decimal') {
  if (style.endsWith('alpha')) {
    let s = ''; for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(97 + (i - 1) % 26) + s;
    return style.startsWith('upper') ? s.toUpperCase() : s;
  }
  if (style.endsWith('roman')) {
    let s = ''; for (const [value, letters] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]) { while (n >= value) { s += letters; n -= value; } }
    return style.startsWith('lower') ? s.toLowerCase() : s;
  }
  return String(n);
}
export function stableId(namespace, key) {
  const bytes = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(key, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return 'x-' + [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}

function inline(parent, content, context) {
  for (const c of content) {
    if (c.kind === 'text') parent.txt(c.text);
    else if (c.kind === 'break') parent.ele(XHTML, 'br');
    else if (c.kind === 'footnote') parent.ele(XHTML, 'sup').txt('[' + c.label + ']');
    else if (c.kind === 'reference') parent.ele(XHTML, 'a', { href: '#' + anchor(context.localLabels.has(c.label) ? context.setId : context.owners.get(c.label) ?? context.setId, c.label) }).txt(c.role + ': ' + c.label);
    else if (c.kind === 'link') inline(parent.ele(XHTML, 'a', { href: c.url }), c.children, context);
    else if (inlineTags[c.kind]) {
      const p = parent.ele(XHTML, inlineTags[c.kind]);
      if (inlineFields[c.kind] === 'children') inline(p, c.children, context); else p.txt(c[inlineFields[c.kind]]);
    } else throw new Error('지원하지 않는 인라인 요소: ' + c.kind);
  }
}
function body(parent, blocks, context) {
  for (const b of blocks) {
    if (b.kind === 'paragraph') inline(parent.ele(XHTML, 'p'), b.content ?? [{ kind: 'text', text: b.text }], context);
    else if (b.kind === 'table') {
      const table = parent.ele(XHTML, 'table', b.label ? { id: anchor(context.setId, b.label) } : {});
      if (b.caption?.length || b.enumerator) { const caption = table.ele(XHTML, 'caption'); if (b.enumerator) caption.txt('Table ' + b.enumerator + ' '); if (b.caption) inline(caption, b.caption, context); }
      for (const [i, row] of b.rows.entries()) {
        const tr = table.ele(XHTML, 'tr'); for (const [j, text] of row.entries()) {
          const cell = tr.ele(XHTML, i ? 'td' : 'th', b.align?.[j] ? { align: b.align[j] } : {});
          if (Array.isArray(text)) inline(cell, text, context); else cell.txt(text);
        }
      }
    } else if (b.kind === 'list') {
      // ReqIF's XHTML driver forbids ol@start. Keep non-default numbering
      // explicitly in each item rather than silently restarting at 1.
      const explicit = b.ordered && ((b.start ?? 1) !== 1 || (b.style && b.style !== 'decimal') || (b.delimiter && b.delimiter !== '.'));
      const list = parent.ele(XHTML, b.ordered && !explicit ? 'ol' : 'ul');
      for (const [index, item] of b.items.entries()) {
        const li = list.ele(XHTML, 'li');
        if (explicit) li.txt(listMarker((b.start ?? 1) + index, b.style) + (b.delimiter ?? '.') + ' ');
        inline(li, item.content, context); if (item.list) body(li, [{ kind: 'list', ...item.list }], context);
      }
    } else if (b.kind === 'quote') inline(parent.ele(XHTML, 'blockquote').ele(XHTML, 'p'), b.content ?? [{ kind: 'text', text: b.text }], context);
    else if (b.kind === 'admonition') {
      const div = parent.ele(XHTML, 'div'); div.ele(XHTML, 'p').ele(XHTML, 'strong').txt(b.variant);
      inline(div.ele(XHTML, 'p'), b.content ?? [{ kind: 'text', text: b.text }], context);
    } else if (b.kind === 'code') { if (b.language) parent.ele(XHTML, 'p').txt('Code: ' + b.language); parent.ele(XHTML, 'pre').txt(b.code); }
    else if (b.kind === 'divider') parent.ele(XHTML, 'hr');
    else throw new Error('지원하지 않는 본문: ' + b.kind);
  }
}

export function exportReqif(sets, { testOnly = false, previous, now = new Date().toISOString() } = {}) {
  const catalogIssues=exportCatalogIssues();
  if(catalogIssues.length)throw Object.assign(new Error('내보내기 필드 분류 누락'),{diagnostics:catalogIssues});
  const diagnostics = validate(sets, { formal: !testOnly });
  const requirementFields=new Set(Object.keys(requirementClassification));
  const setFields=new Set(Object.keys(setClassification));
  for(const s of sets) {
    for(const key of Object.keys(s))if(!setFields.has(key))diagnostics.push({file:s.file??'',location:[1],severity:'error',code:'unmapped-export-field',message:'미분류 문서 필드: '+key});
    for(const r of s.requirements)for(const key of Object.keys(r))if(!requirementFields.has(key))diagnostics.push({file:s.file??'',location:r.location??[1],severity:'error',code:'unmapped-export-field',message:'미분류 요구사항 필드: '+key});
    const lists=blocks=>{for(const b of blocks)if(b.kind==='list') {
      if(b.ordered&&b.style&&!['decimal','lower-alpha','upper-alpha','lower-roman','upper-roman'].includes(b.style))diagnostics.push({file:s.file??'',location:[1],severity:'error',code:'unsupported-export-list-style',message:'지원하지 않는 번호 목록 style: '+b.style});
      for(const i of b.items??[])if(i.list)lists([{kind:'list',...i.list}]);
    }};
    for(const r of s.requirements)lists(r.body);
  }
  if (testOnly) diagnostics.push({ file: '', location: [1], severity: 'warning', code: 'test-export', message: '시험 전용 ReqIF: 실사용 금지' });
  if (diagnostics.some(d => d.severity === 'error')) throw Object.assign(new Error('내보내기 차단'), { diagnostics });
  const namespace = sets[0].exportNamespace, id = key => stableId(namespace, key);
  const contexts = new Map(sets.map(s => [s.setId, { setId: s.setId, localLabels: new Set(s.requirements.flatMap(r => r.body.filter(b => b.label).map(b => b.label))), owners: new Map(sets.flatMap(set => set.requirements.map(r => [r.id, set.setId]))) }]));
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
  function type(kind, key, attrs, name=key) {
    const t = types.ele(kind, ident(key, name, attrs));
    const definitions = t.ele('SPEC-ATTRIBUTES');
    for (const [name, dt] of Object.entries(attrs)) {
      const d = definitions.ele('ATTRIBUTE-DEFINITION-' + dt, { ...ident('attr:' + key + ':' + name, name, dt), ...(dt === 'ENUMERATION' ? { 'MULTI-VALUED': false } : {}) });
      d.ele('TYPE').ele('DATATYPE-DEFINITION-' + dt + '-REF').txt(id('dt:' + (dt === 'ENUMERATION' ? name : dt.toLowerCase())));
    }
  }
  type('SPEC-OBJECT-TYPE', 'object-type', attributes);
  const specificationAttributes={'ReqIF.Name':'XHTML',SourceRegistry:'STRING',DocumentProfile:'STRING'};
  type('SPECIFICATION-TYPE', 'specification-type', specificationAttributes);
  const relationAttributes={RelationJudgments:'STRING'};
  for (const role of ['refines', 'relatesTo']) type('SPEC-RELATION-TYPE','relation-type:'+role,relationAttributes,role);
  function values(parent, typeKey, attrs, data, setId) {
    const vals = parent.ele('VALUES');
    for (const [name, dt] of Object.entries(attrs)) {
      const value = data[name];
      if (dt === 'STRING' && value.length > 65535) throw Object.assign(new Error(name + ': 65535자 초과'),{diagnostics:[...diagnostics,{file:'',location:[1],code:'export-attribute-too-long',severity:'error',message:name+': 65535자 초과. 자르지 않고 내보내기를 차단합니다'}]});
      const a = vals.ele('ATTRIBUTE-VALUE-' + dt, dt === 'STRING' ? { 'THE-VALUE': value } : {});
      a.ele('DEFINITION').ele('ATTRIBUTE-DEFINITION-' + dt + '-REF').txt(id('attr:' + typeKey + ':' + name));
      if (dt === 'XHTML') body(a.ele('THE-VALUE').ele(XHTML, 'div', name === 'ReqIF.Text' ? { id: anchor(setId, data.id) } : {}), value, contexts.get(setId));
      if (dt === 'ENUMERATION') a.ele('VALUES').ele('ENUM-VALUE-REF').txt(id('enum:' + name + ':' + value));
    }
  }
  const text = s => [{ kind: 'paragraph', text: s }];
  const objects = content.ele('SPEC-OBJECTS');
  for (const s of sets) for (const r of s.requirements) {
    const o = objects.ele('SPEC-OBJECT', ident(r.id, r.title, { ...semantic(r), status: r.status }));
    const notes = (r.footnotes ?? []).map(f => ({ kind: 'paragraph', content: [{ kind: 'text', text: '[' + f.label + '] ' }, ...f.content] }));
    const pages = [...new Set(r.sources.flatMap(s => s.trace?.regions?.map(region => region.pageNo) ?? []))].sort((a, b) => a - b).join(', ');
    values(o, 'object-type', attributes, { ...r, 'ReqIF.Name': r.titleContent ? [{ kind: 'paragraph', content: r.titleContent }] : text(r.title), 'ReqIF.Text': [...r.body, ...notes], rationale: text(r.rationale), SourceReferences: canonical(exportSourceReferences(r.sources)), SourcePages: pages }, s.setId);
    o.ele('TYPE').ele('SPEC-OBJECT-TYPE-REF').txt(id('object-type'));
  }
  const rels = content.ele('SPEC-RELATIONS'), relations = new Map();
  for (const s of sets) for (const r of s.requirements) for (const rel of r.relations) {
    const [from, to] = rel.role === 'relatesTo' ? [r.id, rel.targetId].sort() : [r.id, rel.targetId];
    const key = 'relation:' + rel.role + ':' + from + ':' + to;
    if(!relations.has(key))relations.set(key,{from,to,role:rel.role,assertions:[]});
    relations.get(key).assertions.push({sourceId:r.id,...rel});
  }
  for(const [key,{from,to,role,assertions}] of relations) {
    assertions.sort((a,b)=>canonical(a).localeCompare(canonical(b)));
    const e = rels.ele('SPEC-RELATION', ident(key, role, { from, to, role, assertions }));
    values(e,'relation-type:'+role,relationAttributes,{RelationJudgments:canonical(assertions)});
    e.ele('TYPE').ele('SPEC-RELATION-TYPE-REF').txt(id('relation-type:' + role));
    e.ele('SOURCE').ele('SPEC-OBJECT-REF').txt(from); e.ele('TARGET').ele('SPEC-OBJECT-REF').txt(to);
  }
  const specs = content.ele('SPECIFICATIONS');
  for (const s of sets) {
    const documentProfile={profile:s.profile,defaultLevel:s.defaultLevel,exportNamespace:s.exportNamespace};
    const spec = specs.ele('SPECIFICATION', ident('specification:' + s.setId, s.title, { title: s.title, ids: s.requirements.map(r => r.id),registry:s.registry,documentProfile }));
    values(spec, 'specification-type', specificationAttributes, { 'ReqIF.Name': text(s.title),SourceRegistry:canonical(s.registry),DocumentProfile:canonical(documentProfile) }, s.setId);
    spec.ele('TYPE').ele('SPECIFICATION-TYPE-REF').txt(id('specification-type'));
    const children = spec.ele('CHILDREN');
    for (const r of s.requirements) children.ele('SPEC-HIERARCHY', ident('hierarchy:' + s.setId + ':' + r.id, r.id, r.id)).ele('OBJECT').ele('SPEC-OBJECT-REF').txt(r.id);
  }
  if (previous) manifest.missing = Object.keys(previous.entries).filter(k => !manifest.entries[k]);
  const identityIssues = xmlIdentityIssues(root.node);
  if (identityIssues.length) throw Object.assign(new Error('XML ID 무결성 검사 실패'), { diagnostics: [...diagnostics, ...identityIssues] });
  // Pretty indentation inside mixed XHTML inserts whitespace into requirements.
  return { xml: root.end({ prettyPrint: false }), manifest, diagnostics };
}
