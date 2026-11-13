import { canonical, sha256 } from './model.mjs';
import { resolveSource } from './provenance.mjs';
import { fromSnapshot, walkContent } from './body.mjs';
import { bodyTokens, textOf, evidenceRegions } from './protected.mjs';
export const keyOf = value => sha256(canonical(value)).slice(7);
export function collectCandidates(inputs, profile) {
  if (!(profile.limits.candidates > 0 && profile.limits.characters > 0)) throw new Error('프로파일 구획 상한이 필요합니다');
  const sources = {}, units = [], sections = [];
  const intern = source => { const key = keyOf({ sourceKey: source.sourceKey, sourceId: source.trace?.sourceId??source.nativeLocation?.sourceId, selector: source.selector, quoteDigest: source.quoteDigest }); sources[key] = source; return key; };
  for (const input of inputs) {
    const { bundle, key: documentKey } = input, p = bundle.provenance, nodes = bundle.snapshot.nodes;
    const blockFor = n => input.blocks?.find(b => b.path[0] === n.path[0]) ?? null;
    const references = new Map(nodes.filter(n => n.label).map(n => [n.label, n]));
    const definitions = new Map(nodes.filter(n => n.type === 'footnote').map(n => [n.label, n]));
    let heading = [], group = [];
    const flush = () => {
      if (!group.length) { if (heading.length) sections.push({ key: keyOf({documentKey, revision:p.document.revision, heading}), documentKey, heading:[...heading], units:[], candidateKeys:[], oversized:false }); return; }
      let chunk = [], characters = 0, count = 0;
      const push = () => { if (!chunk.length) return; sections.push({ key: keyOf({ documentKey, revision: p.document.revision, units: chunk.map(u => u.key) }), documentKey, heading: [...heading], units: chunk, candidateKeys: [], oversized: chunk.some(u => u.text.length > profile.limits.characters) }); chunk = []; characters = count = 0; };
      for (const u of group) { const detected = u.reasons.length > 0; if (chunk.length && (characters + u.text.length > profile.limits.characters || count + Number(detected) > profile.limits.candidates)) push(); chunk.push(u); characters += u.text.length; count += Number(detected); }
      push(); group = [];
    };
    function resolveAt(node, selector) {
      if(input.nativeResolver) return input.nativeResolver(node,selector).map(intern);
      const found = [];
      for (const item of p.items) {
        if (selector.kind === 'cell') {
          for (const c of item.cells) if (c.targets.some(t => t.role === 'content' && t.path[0] === node.path[0] && t.selector.kind === 'cell' && selector.row >= t.selector.row && selector.row < t.selector.row + t.selector.rowSpan && selector.column >= t.selector.column && selector.column < t.selector.column + t.selector.columnSpan)) found.push(resolveSource(bundle, { sourceKey: documentKey, elementRef: item.selfRef, selector: 'cell:' + c.sourceCell.start_row_offset_idx + ':' + c.sourceCell.start_col_offset_idx }).source);
        } else if (typeof item.sourceText === 'string' && item.targets.some(t => t.role === 'content' && t.path[0] === node.path[0] && (selector.kind === 'block' ? t.selector.kind === 'block' : t.selector.kind === 'list-item' && t.selector.index === selector.index))) found.push(resolveSource(bundle, { sourceKey: documentKey, elementRef: item.selfRef }).source);
      }
      return [...new Set(found.filter(Boolean).map(intern))];
    }
    function add(node, kind, text, bodyBlocks, sourceKeys, extra = {}) {
      const key = keyOf({ documentKey, revision: p.document.revision, locator: node.path, kind, ...extra.locator });
      const reasons = [];
      for (const [strength, terms] of Object.entries(profile.obligations)) if (terms.some(term => /^[a-z]+$/i.test(term) ? new RegExp('\\b' + term + '\\b', 'i').test(text) : text.includes(term))) reasons.push(strength);
      if (profile.includeNumeric && /(?:[≤≥<>±]|\d\s*(?:~|–)|\d+(?:\.\d+)?\s*(?:to|이내))/.test(text)) reasons.push('numeric-range');
      if (profile.includeNumeric && /\d/.test(text) && ['table-row', 'table-cell'].includes(kind)) reasons.push('table-number');
      if ((kind === 'table-row' && !profile.includeTableRows) || (kind === 'table-cell' && !profile.includeTableCells)) reasons.length = 0;
      const u = { projection:structuredClone(node), key, documentKey, locator: node.path, kind, text, bodyBlocks, sourceKeys, heading: [...heading], reasons, contexts: [], ...extra };
      u.tokens = bodyTokens(bodyBlocks, profile, key); u.regions=evidenceRegions(bodyBlocks,key); units.push(u); group.push(u); return u;
    }
    for (const node of nodes.filter(n => n.path.length === 1)) {
      if (node.type === 'heading') { flush(); heading = heading.filter(h => h.level < node.level); heading.push({ level: node.level, text: node.text, content: node.content, path:node.path }); add(node,'heading',node.text,[{kind:'paragraph',...(node.content?{content:node.content}:{text:node.text})}],resolveAt(node,{kind:'block'})); continue; }
      if (node.type === 'target') continue;
      if (node.type === 'table') {
        const cells = nodes.filter(c => c.type === 'cell' && c.path[0] === node.path[0]), rows = [];
        for (const c of cells) (rows[c.path[1]] ??= []).push(c);
        const header = rows[0]?.map(c => c.text).join(' | ') ?? '';
        const headerBody=[{kind:'paragraph',content:(rows[0]??[]).flatMap((c,i)=>[...(i?[{kind:'text',text:' | '}]:[]),...(c.content??[{kind:'text',text:c.text}])])}];
        const captionContent = Array.isArray(node.caption) ? node.caption : node.caption?.content;
        const caption = captionContent ? textOf(captionContent) : '';
        add(node,'table-context',[header,caption].filter(Boolean).join(' | '),[...headerBody,...(caption?[{kind:'paragraph',content:captionContent}]:[])],[...new Set([...(rows[0]?.flatMap(c=>resolveAt(node,{kind:'cell',row:0,column:c.path[2]}))??[]),...resolveAt(node,{kind:'block'})])],{locator:{part:'header-caption'}});
        for (const [row, values] of rows.entries()) {
          if (!row) continue;
          const rowSources = [...new Set(values.flatMap(c => resolveAt(node, { kind: 'cell', row, column: c.path[2] })))];
          const shared = [{ key: keyOf({ documentKey, table: node.path, type: 'header' }), kind: 'header', text: header, bodyBlocks: headerBody, sourceKeys: rows[0]?.flatMap(c=>resolveAt(node,{kind:'cell',row:0,column:c.path[2]}))??[] }, ...(caption ? [{ key: keyOf({ documentKey, table: node.path, type: 'caption' }), kind: 'caption', text: caption, sourceKeys:resolveAt(node,{kind:'block'}), bodyBlocks: [{ kind: 'paragraph', content: captionContent }] }] : [])];
          const rowText = values.map(c => c.text).join(' | ');
          const rowBody = [{kind:'paragraph', content:values.flatMap((c,i) => [...(i ? [{kind:'text',text:' | '}] : []), ...(c.content ?? [{kind:'text',text:c.text}])])}];
          const ru = add(node, 'table-row', rowText, rowBody, rowSources, { locator: { row }, contexts: structuredClone(shared) });
          for (const c of values) add(c, 'table-cell', c.text, [{ kind: 'paragraph', ...(c.content ? { content: c.content } : { text: c.text }) }], resolveAt(node, { kind: 'cell', row, column: c.path[2] }), { locator: { row, column: c.path[2] }, rowKey: ru.key, contexts: [...structuredClone(shared), { key: ru.key, kind: 'row', text: rowText, bodyBlocks: ru.bodyBlocks,sourceKeys:ru.sourceKeys }] });
        }
      } else if (node.type === 'list') {
        const list = (items, ancestors = [], parents = []) => items.forEach((item, index) => {
          const path = [...ancestors, index];
          add(node, 'list-item', textOf(item.content), [{ kind: 'paragraph', content: item.content }], ancestors.length ? [] : resolveAt(node, { kind: 'list-item', index }), { locator: { item: path }, contexts: structuredClone(parents) });
          if (item.list) list(item.list.items, path, [...parents, { key: keyOf({documentKey, parent:node.path, path}), kind:'list-parent', text:textOf(item.content),sourceKeys:ancestors.length?[]:resolveAt(node,{kind:'list-item',index}), bodyBlocks:[{kind:'paragraph',content:item.content}] }]);
        });
        list(node.items);
      } else if (['paragraph', 'quote', 'admonition', 'code', 'footnote'].includes(node.type)) {
        const b = blockFor(node) ?? { block: node.type, ...node };
        add(node, node.type, node.text ?? node.code ?? '', [node.type==='footnote'?{kind:'paragraph',content:node.content}:fromSnapshot(b)], resolveAt(node, { kind: 'block' }));
      } else {
        add(node, 'unsupported-' + node.type, node.text ?? node.latex ?? textOf(Array.isArray(node.caption) ? node.caption : node.caption?.content), [], [], { unsupported:true });
      }
    }
    flush();
    const local = units.filter(u => u.documentKey === documentKey);
    for (const [index, u] of local.entries()) {
      for (const h of u.heading) u.contexts.push({key:keyOf({documentKey,heading:h}),kind:'heading',text:h.text,sourceKeys:resolveAt(h,{kind:'block'}),bodyBlocks:[{kind:'paragraph',...(h.content ? {content:h.content} : {text:h.text})}]});
      for (const [kind, other] of [['before', local[index - 1]], ['after', local[index + 1]]]) if (other) u.contexts.push({ key: other.key, kind, text: other.text, bodyBlocks: other.bodyBlocks,sourceKeys:other.sourceKeys });
      const atoms=[];walkContent(u.bodyBlocks,c=>atoms.push(c));
      for (const c of atoms) {
        const target=c.kind==='footnote'?definitions.get(c.label):c.kind==='reference'?references.get(c.label):null;
        if(target) {
          let body;
          if(target.type==='table') {
            const rows=[];for(const cell of nodes.filter(n=>n.type==='cell'&&n.path[0]===target.path[0])) (rows[cell.path[1]]??=[])[cell.path[2]]=cell.content??cell.text;
            body=[{kind:'table',rows,...(target.label?{label:target.label}:{}),...(target.caption?{caption:Array.isArray(target.caption)?target.caption:target.caption.content}:{})}];
          } else if(['heading','footnote'].includes(target.type)) body=[{kind:'paragraph',...(target.content?{content:target.content}:{text:target.text??''})}];
          else body=[fromSnapshot({block:target.type,...target})];
          u.contexts.push({key:keyOf({documentKey,target:target.path}),kind:c.kind,label:c.label,text:target.text??JSON.stringify(body),bodyBlocks:body,sourceKeys:[...new Set([...resolveAt(target,{kind:'block'}),...(target.type==='table'?nodes.filter(n=>n.type==='cell'&&n.path[0]===target.path[0]).flatMap(cell=>resolveAt(target,{kind:'cell',row:cell.path[1],column:cell.path[2]})):[])])],projection:target});
        } else if(['footnote','reference'].includes(c.kind)) u.contexts.push({key:keyOf({documentKey,missing:c.label}),kind:'unresolved-reference',text:c.label,bodyBlocks:[]});
      }
      const contextMap=new Map();for(const context of u.contexts) if(!contextMap.has(context.key)) contextMap.set(context.key,context);u.contexts=[...contextMap.values()];
      for (const c of u.contexts) {c.tokens = bodyTokens(c.bodyBlocks, profile, c.key);c.regions=evidenceRegions(c.bodyBlocks,c.key);}
    }
  }
  // Include repeated context/quotes in the text budget. Never truncate a condition.
  const bounded=[];
  for(const section of sections) {
    if(!section.units.length) { bounded.push(section);continue; }
    let chunk=[], chars=0, count=0;
    const push=()=>{if(!chunk.length)return;bounded.push({...section,key:keyOf({section:section.key,units:chunk.map(u=>u.key)}),units:chunk,candidateKeys:[],oversized:chunk.some(u=>u.inputCharacters>profile.limits.characters)});chunk=[];chars=count=0;};
    for(const u of section.units) {
      u.inputCharacters=u.text.length+u.contexts.reduce((n,c)=>n+c.text.length,0)+u.sourceKeys.reduce((n,k)=>n+sources[k].quote.length,0);
      if(chunk.length&&(chars+u.inputCharacters>profile.limits.characters||count+Number(!!u.reasons.length)>profile.limits.candidates)) push();
      chunk.push(u);chars+=u.inputCharacters;count+=Number(!!u.reasons.length);
    }
    push();
  }
  sections.splice(0,sections.length,...bounded);
  const candidates = {};
  for (const section of sections) for (const u of section.units) if (u.reasons.length) {
    const key = candidateKey(u, sources, profile);
    u.candidateKey=key;
    if (!candidates[key]) {
      candidates[key]={...u,candidateKey:key,provisional:!u.sourceKeys.length,sectionKey:section.key,occurrences:[{unitKey:u.key,sectionKey:section.key,documentKey:u.documentKey,locator:u.locator}]};section.candidateKeys.push(key);
    } else {
      const c=candidates[key];c.occurrences.push({unitKey:u.key,sectionKey:section.key,documentKey:u.documentKey,locator:u.locator});
      c.sourceKeys=[...new Set([...c.sourceKeys,...u.sourceKeys])];
      c.contexts=[...new Map([...c.contexts,...u.contexts,{key:u.key,kind:'alternate-occurrence',text:u.text,bodyBlocks:u.bodyBlocks,sourceKeys:u.sourceKeys}].map(c=>[c.key,c])).values()];
      c.contexts.forEach(context=>{context.tokens??=bodyTokens(context.bodyBlocks,profile,context.key);context.regions??=evidenceRegions(context.bodyBlocks,context.key);});
    }

  }
  for(const s of sections) {s.inputCharacters=s.units.reduce((n,u)=>n+u.inputCharacters,0)+s.candidateKeys.reduce((n,k)=>n+candidates[k].contexts.reduce((m,c)=>m+c.text.length,0),0);s.oversized ||= s.inputCharacters>profile.limits.characters;}
  const comparisons=[];const values=Object.values(candidates);
  for(let i=0;i<values.length;i++) for(let j=i+1;j<values.length;j++){const a=values[i],b=values[j];const skeleton=c=>c.text.replace(/[+−-]?\d+(?:\.\d+)?|[≤≥<>±=]/g,'#').replace(/\s+/g,' ').trim();if(a.text===b.text||skeleton(a)===skeleton(b)) comparisons.push({kind:a.text===b.text?'possible-duplicate':'possible-conflict',candidateKeys:[a.candidateKey,b.candidateKey],sectionKeys:[a.sectionKey,b.sectionKey]});}
  return { sections, candidates, sources, units, comparisons };
}
export function candidateKey(unit, sources, profile) {
  return keyOf({ ruleVersion: profile.ruleVersion, sources: unit.sourceKeys.map(key => { const s = sources[key]; return { artifact: s.trace?.sourceId??s.nativeLocation?.sourceId, elementRef: s.elementRef, selector: s.selector, quoteDigest: s.quoteDigest }; }).sort((a, b) => canonical(a).localeCompare(canonical(b))), ...(unit.sourceKeys.length ? {} : { provisionalLocator: unit.key }), kind: unit.kind });
}
