import { koreanTime } from "../shared/time.mjs";
import { referenceText } from "./references.mjs";
// Source mapping transformations are independent of the Host and document engine.
export function boxesFor(lines) {
  const boxes = [];
  for (const l of lines) {
    const x = l.box, old = boxes.find(b => b.page === l.page);
    if (old) {
      old.x0 = Math.min(old.x0, x.x0); old.top = Math.min(old.top, x.top);
      old.x1 = Math.max(old.x1, x.x1); old.bottom = Math.max(old.bottom, x.bottom);
    } else boxes.push({ ...x, page: l.page });
  }
  return boxes;
}
export const snapshotNodes = s => s.nodes.filter(n => n.path.length === 1 && n.type !== 'caption');
export function references(value) {
  if (!value || typeof value !== 'object') return [];
  return [...(value.kind === 'footnote' ? [value.label] : []),
    ...Object.values(value).flatMap(v => typeof v === 'object' ? references(v) : [])];
}
// The document title takes plain words only. Formatting falls away; atoms whose
// words this plugin cannot state exactly (footnote calls, math, citations) refuse.
export function titleText(node) {
  if (references(node).length) return {reason:'미주 호출이 든 블록은 문서 제목으로 쓸 수 없습니다.'};
  let refused = null;
  const words = c => c.kind === 'text' ? c.text : c.kind === 'code' ? c.value
    : c.kind === 'break' ? ' ' : c.kind === 'reference' && referenceText(c.label) ? referenceText(c.label)
    : c.children ? c.children.map(words).join('')
    : (refused = '수식이나 인용이 든 블록은 문서 제목으로 쓸 수 없습니다.', '');
  const text = (node?.content || []).map(words).join('').replace(/\s+/gu, ' ').trim();
  if (refused) return {reason:refused};
  return text ? {text} : {reason:'글자가 없는 블록은 문서 제목으로 쓸 수 없습니다.'};
}
const mark = c => ["strong","emphasis","subscript","superscript","link"].includes(c.kind);
export const inlineLength = c => c.kind === "text" ? c.text.length :
  mark(c) ? c.children.reduce((n,child)=>n+inlineLength(child),0) : 1;
export function splitContent(content, offset) {
  const left = [], right = []; let pos = 0;
  for (const c of content) {
    const length = inlineLength(c);
    if (pos + length <= offset) left.push(c);
    else if (pos >= offset) right.push(c);
    else if (mark(c)) {
      const [a,b]=splitContent(c.children,offset-pos);
      const tail=a.at(-1), head=b[0];
      const trailing=tail?.text?.match(/\s+$/)?.[0] || "";
      const leading=head?.text?.match(/^\s+/)?.[0] || "";
      if(trailing) a[a.length-1]={...tail,text:tail.text.trimEnd()};
      if(leading) b[0]={...head,text:head.text.trimStart()};
      const nonempty=n=>n.kind!=="text" || n.text;
      if(a.some(nonempty)) left.push({...c,children:a.filter(nonempty)});
      if(trailing) left.push({kind:"text",text:trailing});
      if(leading) right.push({kind:"text",text:leading});
      if(b.some(nonempty)) right.push({...c,children:b.filter(nonempty)});
    } else {
      if (c.kind !== 'text') throw Error('줄의 시작 위치를 확실히 정할 수 없어 나누지 않았습니다.');
      left.push({...c,text:c.text.slice(0,offset-pos)});
      right.push({...c,text:c.text.slice(offset-pos)});
    }
    pos += length;
  }
  return [left,right];
}
// Predict only operations this screen supports. The official revision guard is
// authoritative for the write; the handler verifies this projection before returning.
export function detachedTarget(snapshot, heading, action, kind) {
  if (heading?.type !== "heading" || !(action === "title" || action === "remove" || (action === "kind" && kind === "paragraph"))) return;
  return snapshot.find(n => n.type === "target" && n.path[0] === heading.path[0]-1);
}
export function previewCorrection(mapping, input, undoBefore) {
  const {action,ids=[],line,kind,level,plan,time = koreanTime()} = input;
  if (action === 'undo') {
    if (!undoBefore) throw Error('되돌릴 동작이 없습니다.');
    return restoreMapping(undoBefore,mapping,undoBefore.blocks.find(b=>ids.includes(b.id))?.id,time);
  }
  if (!mapping.snapshotNodes) throw Error('저장된 문서를 다시 열어 주세요.');
  const selected = mapping.blocks.filter(b=>ids.includes(b.id));
  const paths = [...new Set(selected.map(b=>b.path[0]))];
  // Several blocks go as one action: the same as removing them one by one from the last,
  // recorded once in the history.
  if (action === 'remove' && paths.length > 1) {
    let next = mapping;
    for (const p of [...paths].sort((a,b)=>b-a))
      next = previewCorrection(next,{...input,time,ids:selected.filter(b=>b.path[0]===p).map(b=>b.id)});
    return {...next,history:[...(mapping.history || []),{action,at:time,who:'user'}]};
  }
  const nodes = mapping.snapshotNodes.filter(n=>paths.includes(n.path[0]));
  if (!nodes.length) throw Error('고칠 블록을 찾지 못했습니다.');
  const at = paths[0], first = nodes[0];
  let replacement;
  if(plan?.items) replacement=[{type:'list',ordered:false,items:plan.items.map(content=>({content}))}];
  else if(plan?.rows) replacement=[{type:'table'}];
  else if(plan?.contents) replacement=plan.contents.map(content=>({type:'paragraph',content}));
  else if(action === 'merge' && first.type === 'table') replacement=[first];
  else if(action === 'kind' && kind === 'note') replacement=[{...first,type:'admonition',variant:'note'}];
  else if(action === 'merge' && first.type === 'list') replacement=[{...first,items:nodes.flatMap(n=>n.items)}];
  else if(action === 'merge') replacement=[{...first,content:nodes.flatMap((n,i)=>i?[{kind:'text',text:' '},...n.content]:n.content)}];
  else if(action === 'split') replacement=splitContent(first.content,splitOffset(selected[0].lines,line,first.content)).map(content=>({...first,content}));
  else if(action === 'kind') replacement=[{...first,type:kind,level:kind==='heading'?level:undefined}];
  else if(action === 'remove' || action === 'title') replacement=[];
  else throw Error('지원하지 않는 고치기입니다.');
  const next = transformMapping(mapping,{...input,at,removeCount:nodes.length,newCount:replacement.length,time});
  let predicted = structuredClone(mapping.snapshotNodes);
  const start = predicted.findIndex(n=>n.path[0]===at);
  predicted.splice(start,nodes.length,...replacement);
  if(action === 'remove') {
    const labels=references(first);
    const orphans=predicted.filter(n=>n.type==='footnote' && labels.includes(n.label) &&
      !predicted.some(other=>other.type!=='footnote' && references(other).includes(n.label)));
    for(const n of orphans) {
      // Map source paths before rebasing the rest, including multi-page notes.
      const oldPath=n.path[0]-nodes.length;
      for(const b of next.blocks.filter(b=>b.path[0]===oldPath)) for(const box of b.boxes)
        next.excluded.push({page:box.page,box,kind:'removed',lines:b.lines,edited:{action,at:time,who:'user'}});
    }
    const removedPaths = new Set(orphans.map(n=>n.path[0]-nodes.length));
    next.blocks=next.blocks.filter(b=>!removedPaths.has(b.path[0]));
    for(const b of next.blocks) b.path[0]-=[...removedPaths].filter(p=>p<b.path[0]).length;
    predicted=predicted.filter(n=>!orphans.includes(n));
  }
  const target = detachedTarget(mapping.snapshotNodes,first,action,kind);
  if (target) {
    predicted = predicted.filter(n=>n.path[0] !== target.path[0]);
    for (const b of next.blocks) if (b.path[0] > target.path[0]) b.path[0]--;
  }
  next.snapshotNodes=predicted.map((n,i)=>({...n,path:[i+1]}));
  return next;
}
export function restoreMapping(original, current, targetId, time) {
  const m = structuredClone(original), edited = {action:'undo',at:time,who:'user'};
  m.history = [...(current.history || []),edited];
  const target = m.blocks.find(b=>b.id===targetId);
  if(target) target.edited=edited;
  return m;
}
export function assertMapping(mapping, snapshot) {
  const nodes = snapshot.nodes.filter(n => n.path.length === 1 && n.type !== 'caption');
  const groups = new Map((mapping.snapshotNodes || []).filter(n=>n.type==="target").map(n=>[n.path.join("."),"target"]));
  for (const b of mapping.blocks) {
    const key = b.path.join('.');
    if (!groups.has(key)) groups.set(key, b.documentKind);
    else if (groups.get(key) !== b.documentKind) throw Error('블록 종류가 대응 자료와 다릅니다.');
  }
  if (nodes.length !== groups.size || nodes.some(n => groups.get(n.path.join('.')) !== n.type))
    throw Error('블록 수나 종류가 대응 자료와 다릅니다.');
}
export function transformMapping(mapping, { action, ids, line, kind, level, plan, at, removeCount, newCount, time }) {
  const m = structuredClone(mapping), selected = m.blocks.filter(b => ids.includes(b.id));
  if (!selected.length) throw Error('고칠 블록을 찾지 못했습니다.');
  const first = selected[0], edited = { action, at: time, who: 'user' };
  let replacements;
  if (plan?.blocks) {
    // A structure change brings its own source blocks: list items, table rows or paragraphs.
    replacements = plan.blocks.map(b => ({ ...b, edited }));
  } else if (action === 'merge' && ['list','table'].includes(first.documentKind)) {
    // Every source item or table keeps its own boxes; they now share the first one's path.
    replacements = selected.map(b => ({ ...b, path:[at], edited }));
  } else if (action === 'merge') {
    const lines = selected.flatMap(b => b.lines);
    replacements = [{ ...first, kind:'paragraph', documentKind:'paragraph', lines, boxes:boxesFor(lines), edited }];
  } else if (action === 'split') {
    const a = first.lines.slice(0, line), b = first.lines.slice(line);
    if (!a.length || !b.length) throw Error('둘째 줄부터 고르세요.');
    replacements = [a,b].map((lines,i) => ({ ...first, id: i ? first.id + ':' + time : first.id,
      path:[at+i], lines, boxes:boxesFor(lines), edited }));
  } else if (action === 'kind') {
    replacements = [{ ...first, kind, documentKind:kind === 'note' ? 'admonition' : kind, level: kind === 'heading' ? level : undefined, edited }];
  } else if (action === 'remove' || action === 'title') {
    // A block used as the document title leaves the body like a removed one, marked apart.
    replacements = [];
    for (const b of selected) for (const box of b.boxes)
      m.excluded.push({page:box.page, box, kind:action === 'title' ? 'title' : 'removed', lines:b.lines, edited});
  } else throw Error('지원하지 않는 고치기입니다.');
  const start = m.blocks.indexOf(first);
  m.blocks = m.blocks.filter(b => !ids.includes(b.id));
  for (const b of m.blocks) if (b.path[0] >= at + removeCount) b.path[0] += newCount - removeCount;
  m.blocks.splice(start, 0, ...replacements);
  m.history = [...(m.history || []), edited];
  return m;
}
// Compare the complete character sequence, allowing only whitespace differences.
// Footnote calls and figure/table references are one rendered position; the reference
// stands for its original words. Never guess around unsupported atoms.
export function splitOffset(lines, lineIndex, content) {
  if (lineIndex < 1 || lineIndex >= lines.length) throw Error('둘째 줄부터 고르세요.');
  const normalized = lines.map(l => l.text.replace(/\s/gu,''));
  return contentCuts(lines, content, [normalized.slice(0,lineIndex).join('').length])[0];
}
// The content offset of each non-blank character of the lines' words, as one sequence.
function contentPositions(lines, content) {
  const chars = [], positions = []; let offset = 0;
  const unsure = () => Error('줄의 시작 위치를 확실히 정할 수 없어 나누지 않았습니다.');
  const add = (s, position) => { for (const c of s) if (!/\s/u.test(c)) {chars.push(c);positions.push(position);} };
  const visit = c => {
    if (mark(c)) {c.children.forEach(visit);return;}
    if (c.kind === 'text') {
      for (let i=0;i<c.text.length;i++) { add(c.text[i],offset); offset++; }
    } else if (c.kind === 'footnote') { add('[^'+c.label+']', offset); offset++; }
    else if (c.kind === 'reference' && referenceText(c.label)) { add(referenceText(c.label), offset); offset++; }
    else if (c.kind === "math" && /^[A-Za-z\p{Script=Greek}][_^](?:[a-zA-Z0-9]|\{[a-zA-Z0-9]+\}|\{\\mathrm\{[a-zA-Z]+\}\})$/u.test(c.value)) {
      add(c.value.replace(/\\mathrm|[{}_^]/g,""), offset++);
    } else throw unsure();
  };
  content.forEach(visit);
  if (lines.map(l => l.text.replace(/\s/gu,'')).join('') !== chars.join('')) throw unsure();
  return {positions, length: offset};
}
// Content offsets where the given characters (indexes into the lines' non-blank characters) start.
// A cut must fall between two atoms and leave something on both sides.
export function contentCuts(lines, content, indexes) {
  const {positions, length} = contentPositions(lines, content);
  return indexes.map(index => {
    const result = positions[index];
    if (!result || result >= length || positions[index-1]===result) throw Error('줄의 시작 위치를 확실히 정할 수 없어 나누지 않았습니다.');
    return result;
  });
}
// Content cut at increasing offsets into pieces without blanks at either end.
export function cutContent(content, offsets) {
  const pieces = []; let rest = content;
  for (const offset of [...offsets].sort((a,b)=>b-a)) { const [left,right] = splitContent(rest,offset); pieces.unshift(right); rest = left; }
  pieces.unshift(rest);
  return pieces.map(trimInline);
}
// Inline content without blank text at its ends; line breaks become spaces.
export function trimInline(content) {
  const flat = c => c.kind === 'break' ? {kind:'text',text:' '} : c.children ? {...c,children:c.children.map(flat)} : c;
  const edge = (list, end) => {
    const out = [...list];
    for (;;) {
      const i = end ? out.length-1 : 0, c = out[i];
      if (!c) return out;
      if (c.kind === 'text') {
        const text = end ? c.text.trimEnd() : c.text.trimStart();
        if (text) { out[i] = {...c,text}; return out; }
        out.splice(i,1);
      } else if (mark(c) && c.children.length) {
        const children = edge(c.children,end);
        if (children.length) { out[i] = {...c,children}; return out; }
        out.splice(i,1);
      } else return out;
    }
  };
  return edge(edge(content.map(flat),false),true);
}
