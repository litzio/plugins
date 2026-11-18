import { updateDocumentStatus } from '@litzio/plugin-sdk';
import { koreanTime } from "./time.mjs";
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertMapping, previewCorrection, restoreMapping, splitOffset, snapshotNodes, references } from './corrections.mjs';
import { writeDocument, FileChangedError } from '@litzio/plugin-sdk/node';
import { inspectDocument, applyCorrections } from './document-io.mjs';
const topNodes = snapshotNodes;
const listOf = (n, items = n.items) => ({ordered:n.ordered,...(n.ordered?{start:n.start,style:n.style,delimiter:n.delimiter}:{}),items});
const insert = (n, at) => n.type === 'paragraph'
  ? {command:'insert-block',at,content:n.content}
  : n.type === 'heading' ? {command:'insert-heading',at,level:n.level,content:n.content}
  : n.type === 'list' ? {command:'insert-list',at,list:listOf(n)} : null;
export function correctionHandler() {
  const histories = new Map(), locks = new Set();
  const persist = async (side, m) => {
    const tmp = side + '.pending';
    try {await writeFile(tmp,JSON.stringify(m));await rename(tmp,side);}
    finally {await rm(tmp,{force:true});}
  };
  const correct = async function correct({document:doc,revision,ids=[],action,line,kind,level,historyId,status,confirmed=false}) {
    const time = koreanTime();
    if (!doc || path.extname(doc) !== '.md') throw Error('저장된 문서를 찾지 못했습니다.');
    if (locks.has(doc)) throw Error('이 문서를 고치는 중입니다.');
    locks.add(doc);
    const t = performance.now(), timings = {};
    try {
      const side = doc.replace(/\.md$/,'.pdf-source.json');
      const before = JSON.parse(await readFile(side,'utf8'));
      const readStarted=performance.now(), current=inspectDocument(doc);
      timings.readMs=performance.now()-readStarted;
      if (revision !== before.revision || current.revision !== before.revision)
        return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'};
      if(action!=='undo') assertMapping(before,current);
      const key = doc + ':' + historyId, stack = histories.get(key) || [];
      if (action === 'status') {
        assertMapping(before,current);
        const receipt = writeDocument(doc,updateDocumentStatus(current.document,status),current.revision);
        const actual = inspectDocument(doc);
        if(actual.revision !== receipt.revision) return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'};
        assertMapping(before,actual);
        const next = {...before,revision:receipt.revision};
        await persist(side,next);
        for(const [historyKey,history] of histories) {
          if(historyKey.startsWith(doc+':') && history.at(-1)?.revision===current.revision)
            history.at(-1).revision=receipt.revision;
        }
        return {mapping:next,status:actual.status,undoCount:stack.length};
      }
      let next, ops, inverse, targetId, irreversible = false;
      const undo = action === 'undo', prior = stack.at(-1);
      if (undo) {
        if (!prior || prior.revision !== current.revision) throw Error('되돌릴 동작이 없습니다.');
        ops = prior.inverse; inverse = prior.forward;
        targetId = prior.targetId;
        next = restoreMapping(prior.before,before,targetId,time);
      } else {
        const selected = before.blocks.filter(b => ids.includes(b.id));
        if (!selected.length || selected.length !== ids.length) throw Error('고칠 블록을 다시 골라 주세요.');
        const selectedPaths = [...new Set(selected.map(b => b.path[0]))].sort((a,b)=>a-b);
        const nodes = topNodes(current).filter(n => selectedPaths.includes(n.path[0]));
        const at = selectedPaths[0], first = nodes[0], b = selected[0];
        if (before.blocks.some(x => selectedPaths.includes(x.path[0]) && !ids.includes(x.id)))
          throw Error('같은 문서 블록에 속한 원본 상자를 모두 골라 주세요.');
        let newCount = 1;
        if (action === 'merge' && first?.type === 'list') {
          if (nodes.length < 2 || nodes.some((n,i)=>n.type !== 'list' || n.path[0] !== at+i || !!n.ordered !== !!first.ordered))
            throw Error('이웃한 같은 종류의 목록을 둘 이상 골라야 합니다.');
          const items = nodes.flatMap(n=>n.items);
          if (items.length > 100) throw Error('합친 목록이 100항목을 넘어 합치지 않았습니다.');
          // The first list takes every item before the others go, so footnote calls stay alive.
          ops = [{command:'update-list',path:String(at),list:listOf(first,items)},
            ...nodes.slice(1).map(()=>({command:'remove-block',at:at+1}))];
          inverse = [...nodes.slice(1).map((n,i)=>insert(n,at+1+i)),
            {command:'update-list',path:String(at),list:listOf(first)}];
        } else if (action === 'merge') {
          if (nodes.length < 2 || nodes.some((n,i)=>n.type !== 'paragraph' || n.path[0] !== at+i))
            throw Error('이웃한 문단을 둘 이상 골라야 합니다.');
          const content = nodes.flatMap((n,i)=>i ? [{kind:'text',text:' '},...n.content] : n.content);
          // Core merge concatenates without a separator. Reinsert the exact inline
          // content with separators before the single SDK write; references stay alive.
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
        next = previewCorrection(before,{action,ids,line,kind,level,time});
        targetId = next.blocks.find(x=>x.id===b.id)?.id || next.blocks.find(x=>x.path[0]>=at)?.id || next.blocks.at(-1)?.id;
      }
      let receipt;
      try {
        const started = performance.now();
        const document=applyCorrections(current.document,ops);
        timings.coreMs=performance.now()-started;
        const writing=performance.now();
        receipt=writeDocument(doc,document,before.revision);
        timings.writeMs=performance.now()-writing;
        timings.operationMs = performance.now()-started;
      } catch (e) {
        if (e instanceof FileChangedError)
          return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'};
        throw Error('문서를 고치지 못했습니다. 원본과 저장 상태를 확인해 주세요.');
      }
      const checked=performance.now(), actual=inspectDocument(doc);
      next.revision = receipt.revision;
      let invalid=actual.revision !== receipt.revision;
      try { assertMapping(next,actual); } catch { invalid=true; }
      next.snapshotNodes=snapshotNodes(actual);
      next.verificationPending=false;
      timings.inspectMs=performance.now()-checked;
      next.stale = invalid;
      try { await persist(side,next); }
      catch { return {stale:true,message:'문서는 고쳤지만 대응 자료를 기록하지 못했습니다. 문서를 다시 열어 주세요.'}; }
      if (undo) {stack.pop(); if(stack.length) stack.at(-1).revision = receipt.revision;}
      else if (irreversible) stack.length = 0;
      else stack.push({before,forward:ops,inverse,revision:receipt.revision,targetId:before.blocks.find(b=>ids.includes(b.id))?.id});
      histories.set(key,stack);
      timings.totalMs = performance.now()-t;
      return {mapping:next,targetId,undoCount:stack.length,timings,
        message:invalid?'저장 뒤 대응이 문서와 달라 대응 표시를 멈췄습니다. 되돌리기는 사용할 수 있습니다.':''};
    } finally {locks.delete(doc);}
  };
  return correct;
}
