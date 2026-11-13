import { canonical } from './model.mjs';
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function protectedTokens(text, profile, prefix = 'text') {
  const numbers = '[+−-]?\\d+(?:\\.\\d+)?(?:[eE][+−-]?\\d+)?';
  const units = profile.units.map(escape).sort((a, b) => b.length - a.length).join('|');
  const negatives = profile.negations.map(t => /^[a-z]+$/i.test(t) ? '(?<![\\p{L}])'+escape(t)+'(?![\\p{L}])' : escape(t)).join('|');
  const pattern = new RegExp(`(?<number>${numbers})|(?<format>[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+)|(?<operator>[≤≥<>±=−~–]|\\+|(?<![\\p{L}])-(?![\\p{L}]))|(?<unit>(?<![\\p{L}_])(?:${units})(?![\\p{L}_]))|(?<negation>${negatives})`, 'giu');
  const result = [...text.matchAll(pattern)].map(m => ({ key: prefix + ':' + m.index, kind: Object.keys(m.groups).find(k => m.groups[k] !== undefined), value: m[0], start: m.index, end: m.index + m[0].length }));
  // Also protect an unfamiliar unit/word immediately after a quantity. Never silently
  // drop rpm or another unconfigured literal just because the unit catalog is small.
  for (const token of result.filter(t=>t.kind==='number')) {
    const tail=/^\s*([\p{L}°µμ%][\p{L}\p{N}°µμ%/·*^+−-]*)/u.exec(text.slice(token.end));
    if(!tail) continue; const start=token.end+tail[0].length-tail[1].length,end=start+tail[1].length;
    if(!result.some(t=>t.start===start&&t.end===end)) result.push({key:prefix+':quantity:'+start,kind:'quantity-word',value:tail[1],start,end});
  }
  return result.sort((a,b)=>a.start-b.start);
}
export function bodyTokens(blocks, profile, prefix = 'body') {
  const tokens = [];
  function inline(content, path) {
    for (const [i, c] of content.entries()) {
      const key = path + '/' + i;
      if (c.kind === 'math') tokens.push({ key: key + ':math', kind: 'math', value: c.value });
      if (['subscript', 'superscript'].includes(c.kind)) tokens.push({ key: key + ':mark', kind: c.kind, value: canonical(c.children) });
      if (c.kind === 'text' || c.kind === 'code') tokens.push(...protectedTokens(c.kind === 'text' ? c.text : c.value, profile, key));
      if (Array.isArray(c.children)) inline(c.children, key);
    }
  }
  function block(b, path) {
    if (b.kind === 'code') tokens.push(...protectedTokens(b.code, profile, path + '/code'));
    if (b.kind === 'equation') tokens.push({ key: path + ':latex', kind: 'math', value: b.latex });
    if (b.content) inline(b.content, path); else if (typeof b.text === 'string') tokens.push(...protectedTokens(b.text, profile, path));
    if (b.caption) inline(b.caption, path + '/caption');
    if (b.kind === 'list') for (const [i, item] of b.items.entries()) { inline(item.content, path + '/item/' + i); if (item.list) block({ kind: 'list', ...item.list }, path + '/nested/' + i); }
    if (b.kind === 'table') for (const [r, row] of b.rows.entries()) for (const [c, cell] of row.entries()) { const key = path + '/cell/' + r + '/' + c; if (Array.isArray(cell)) inline(cell, key); else tokens.push(...protectedTokens(cell, profile, key)); }
  }
  blocks.forEach((b, i) => block(b, prefix + '/' + i)); return tokens;
}
export function textOf(content) { return (content ?? []).map(c => c.kind === 'text' ? c.text : c.kind === 'code' || c.kind === 'math' ? c.value : c.children ? textOf(c.children) : c.kind === 'break' ? '\n' : '').join(''); }
