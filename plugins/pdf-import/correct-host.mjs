import { readFile, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertMapping, editableMapping, transformMapping, restoreMapping, splitOffset } from './corrections.mjs';
const exec = promisify(execFile);
const topNodes = s => s.nodes.filter(n => n.path.length === 1 && n.type !== 'caption');
function references(value) {
  if(!value || typeof value!=='object') return [];
  return [...(value.kind==='footnote'?[value.label]:[]),...Object.values(value).flatMap(v=>typeof v==='object'?references(v):[])];
}
const insert = (n, at) => n.type === 'paragraph'
  ? {command:'insert-block',at,content:n.content}
  : n.type === 'heading' ? {command:'insert-heading',at,level:n.level,content:n.content}
  : n.type === 'list' ? {command:'insert-list',at,list:{ordered:n.ordered,...(n.ordered?{start:n.start,style:n.style,delimiter:n.delimiter}:{}),items:n.items}} : null;
export function correctionHandler(cli) {
  const histories = new Map(), locks = new Set();
  const run = async args => {
    if (!cli) throw Error('이 Host에는 공식 문서 고치기 기능이 없습니다.');
    const r = await exec(cli.bin,[...cli.args,...args],{windowsHide:true,maxBuffer:16*1024*1024});
    return r.stdout ? JSON.parse(r.stdout) : null;
  };
  const inspect = doc => run(['inspect',doc,'--format','json']);
  const batch = async (doc, operations, revision) => {
    const dir = await mkdtemp(path.join(os.tmpdir(),'pdf-import-edit-'));
    try {
      const input = path.join(dir,'operations.json');
      await writeFile(input,JSON.stringify(operations));
      return await run(['apply-batch',doc,'--operations',input,'--if-revision',revision,'--format','json']);
    } finally { await rm(dir,{recursive:true,force:true}); }
  };
  const persist = async (side, m) => {
    const tmp = side + '.pending';
    try {await writeFile(tmp,JSON.stringify(m));await rename(tmp,side);}
    finally {await rm(tmp,{force:true});}
  };
  return async function correct({document:doc,revision,ids=[],action,line,kind,level,historyId,confirmed=false}) {
    if (!doc || path.extname(doc) !== '.md') throw Error('저장된 문서를 찾지 못했습니다.');
    if (locks.has(doc)) throw Error('이 문서를 고치는 중입니다.');
    locks.add(doc);
    const t = performance.now(), timings = {};
    try {
      const side = doc.replace(/\.md$/,'.pdf-source.json');
      const before = JSON.parse(await readFile(side,'utf8'));
      if (!editableMapping(before)) throw Error('다시 변환해야 고칠 수 있습니다');
      const current = await inspect(doc);
      timings.beforeInspectMs = performance.now()-t;
      if (current.revision !== before.revision || revision !== before.revision)
        return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'};
      assertMapping(before,current);
      const key = doc + ':' + historyId, stack = histories.get(key) || [];
      let next, ops, inverse, targetId, irreversible = false;
      const undo = action === 'undo', prior = stack.at(-1);
      if (undo) {
        if (!prior || prior.revision !== current.revision) throw Error('되돌릴 동작이 없습니다.');
        ops = prior.inverse; inverse = prior.forward;
        targetId = prior.targetId;
        next = restoreMapping(prior.before,before,targetId,new Date().toISOString());
      } else {
        const selected = before.blocks.filter(b => ids.includes(b.id));
        if (!selected.length || selected.length !== ids.length) throw Error('고칠 블록을 다시 골라 주세요.');
        const selectedPaths = [...new Set(selected.map(b => b.path[0]))].sort((a,b)=>a-b);
        const nodes = topNodes(current).filter(n => selectedPaths.includes(n.path[0]));
        const at = selectedPaths[0], first = nodes[0], b = selected[0];
        if (before.blocks.some(x => selectedPaths.includes(x.path[0]) && !ids.includes(x.id)))
          throw Error('같은 문서 블록에 속한 원본 상자를 모두 골라 주세요.');
        let newCount = 1;
        if (action === 'merge') {
          if (nodes.length < 2 || nodes.some((n,i)=>n.type !== 'paragraph' || n.path[0] !== at+i))
            throw Error('이웃한 문단을 둘 이상 골라야 합니다.');
          const content = nodes.flatMap((n,i)=>i ? [{kind:'text',text:' '},...n.content] : n.content);
          // Core merge concatenates without a separator. Reinsert the exact inline
          // content with separators in the same atomic batch; references stay alive.
          ops = nodes.slice(1).map(()=>({command:'merge-paragraph',path:String(at+1)}));
          ops.push({command:'remove-block',at},{command:'insert-block',at,content});
          inverse = nodes.slice(0,-1).map((n,i)=>({command:'split-paragraph',path:String(at+i),
            offset:n.content.reduce((sum,c)=>sum+(c.kind==='text'?c.text.length:1),0)}));
        } else if (action === 'split') {
          if (nodes.length !== 1 || first.type !== 'paragraph') throw Error('문단 하나를 골라야 합니다.');
          const offset = splitOffset(b.lines,line,first.content);
          ops = [{command:'split-paragraph',path:String(at),offset}];
          inverse = [{command:'merge-paragraph',path:String(at+1)}]; newCount = 2;
        } else if (action === 'kind') {
          if (nodes.length !== 1 || !['paragraph','heading'].includes(first.type) ||
            !['paragraph','heading'].includes(kind) || (kind === 'heading' && !(level>=1 && level<=6)))
            throw Error('본문이나 제목 하나를 골라야 합니다.');
          const same = kind === first.type && (kind !== 'heading' || level === first.level);
          ops = same ? [{command:'format'}] : [{command:'convert-block',path:String(at),to:kind,...(kind==='heading'?{level}:{})}];
          inverse = same ? [{command:'format'}] : [{command:'convert-block',path:String(at),to:first.type,...(first.type==='heading'?{level:first.level}:{})}];
        } else if (action === 'remove') {
          if (nodes.length !== 1 || !['paragraph','heading','list'].includes(first.type))
            throw Error('본문·제목·목록 블록 하나를 골라야 합니다.');
          const restore = insert(first,at);
          irreversible = references(first).length > 0;
          if (irreversible && !confirmed) return {requiresConfirm:true};
          ops = [{command:'remove-block',at}]; inverse = restore ? [restore] : [];
          newCount = 0;
        } else throw Error('지원하지 않는 고치기입니다.');
        next = transformMapping(before,{action,ids,line,kind,level,at,removeCount:nodes.length,newCount,time:new Date().toISOString()});
        if (action === 'remove' && irreversible) {
          // Core drops an endnote whose last call was removed. Its source is also
          // explicitly excluded; this is known before the write, never guessed.
          const labels = [...new Set(references(first))];
          const orphans = topNodes(current).filter(n=>n.type==='footnote' && labels.includes(n.label) &&
            !topNodes(current).some(other=>other!==first && other.type!=='footnote' && references(other).includes(n.label)));
          for (const n of orphans.sort((a,b)=>b.path[0]-a.path[0])) {
            const oldPath = n.path[0]-1;
            const removed = next.blocks.filter(b=>b.path[0]===oldPath);
            for(const b of removed) for(const box of b.boxes) next.excluded.push({page:box.page,box,kind:'removed',lines:b.lines,edited:{action:'remove',at:new Date().toISOString(),who:'user'}});
            next.blocks=next.blocks.filter(b=>b.path[0]!==oldPath);
            for(const b of next.blocks) if(b.path[0]>oldPath) b.path[0]--;
          }
        }
        targetId = next.blocks.find(x=>x.id===b.id)?.id || next.blocks.find(x=>x.path[0]>=at)?.id || next.blocks.at(-1)?.id;
      }
      let receipt, after;
      try {
        const started = performance.now(); receipt = await batch(doc,ops,current.revision);
        timings.operationMs = performance.now()-started;
        const checked = performance.now(); after = await inspect(doc);
        timings.inspectMs = performance.now()-checked;
        assertMapping(next,after); next.revision = after.revision;
        await persist(side,next);
      } catch (e) {
        if (!receipt) throw Error('문서를 고치지 못했습니다. 원본과 저장 상태를 확인해 주세요.');
        try {
          await batch(doc,inverse,receipt.revision);
          const restored = await inspect(doc); assertMapping(before,restored);
          await persist(side,{...before,revision:restored.revision});
        } catch {
          return {stale:true,message:'고친 뒤 대응을 확인하지 못했고 되돌리기도 실패해 대응을 멈췄습니다.'};
        }
        throw Error('고친 뒤 대응을 확인하지 못해 문서의 동작을 되돌렸습니다.');
      }
      if (undo) {stack.pop(); if(stack.length) stack.at(-1).revision = after.revision;}
      else if (irreversible) stack.length = 0;
      else stack.push({before,forward:ops,inverse,revision:after.revision,targetId:before.blocks.find(b=>ids.includes(b.id))?.id});
      histories.set(key,stack);
      timings.totalMs = performance.now()-t;
      return {mapping:next,targetId,undoCount:stack.length,timings};
    } finally {locks.delete(doc);}
  };
}
