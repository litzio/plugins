import { updateDocumentStatus, DOCUMENT_AUTHORING_LIMITS, parse, serialize } from '@litzio/plugin-sdk';
import { koreanTime } from "../shared/time.mjs";
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { detachedTarget, assertMapping, previewCorrection, restoreMapping, splitOffset, splitContent, inlineLength, snapshotNodes, references, titleText, tableNotePlan } from './corrections.mjs';
import { readDocument, writeDocument, FileChangedError } from '@litzio/plugin-sdk/node';
import { inspectDocument, applyCorrections, fileRevision, documentRevision, snapshotOf } from './document-io.mjs';
import { listPlan, tablePlan, unlistPlan, joinPlan, relabel, footnotePlan, tableRows, tableShapes } from './structure.mjs';
import { changedRange, editedBlocks, keepHistory } from '../shared/follow.mjs';
const STALE = '문서가 바뀌어 대응을 표시할 수 없음';
const topNodes = snapshotNodes;
const listOf = (n, items = n.items) => ({ordered:n.ordered,...(n.checklist?{checklist:true}:{}),...(n.ordered?{start:n.start,style:n.style,delimiter:n.delimiter}:{}),items});
const insert = (n, at) => n.type === 'paragraph'
  ? {command:'insert-block',at,content:n.content}
  : n.type === 'heading' ? {command:'insert-heading',at,level:n.level,content:n.content}
  : n.type === 'list' ? {command:'insert-list',at,list:listOf(n)}
  : n.type === 'admonition' ? {command:'insert-admonition',at,variant:n.variant,content:n.content} : null;
// A table with its caption, label and numbering, at a top-level index.
const insertNotes = (path, index, contents) => contents.map((content,i)=>({command:'insert-table-note',path,at:index+i,content}));
const tableOps = (t, cells, at) => [{command:'insert-table',at,cells},
  ...(t.caption?.length ? [{command:'update-table-caption',path:String(at),content:t.caption}] : []),
  ...(t.label ? [{command:'update-label',path:String(at),label:t.label}] : []),
  ...(t.enumerator ? [{command:'update-enumerator',path:String(at),enumerator:t.enumerator}] : []),
  ...(t.numbers ? [] : [{command:'update-enumeration',path:String(at),enumerated:false}]),
  ...insertNotes(String(at),0,t.notes || [])];
const contentUpdate = (n, content) => ({command:{paragraph:'update-paragraph',heading:'update-heading-content',admonition:'update-admonition-content'}[n.type],path:String(n.path[0]),content});
const cellsOf = (nodes, p) => tableRows(nodes, p).map(r => r.map(c => c?.content || []));
// Operations missing from the SDK use one official, revision-checked CLI batch.
const CLI_ONLY = ['insert-target','insert-footnote','remove-footnote','insert-table-note','remove-table-note'];
const needsCli = ops => ops.some(op => CLI_ONLY.includes(op.command));
function applyWithCli(cli, doc, ops, revision, dryRun = false) {
  return new Promise((resolve, reject) => {
    const child = execFile(cli.bin, [...cli.args, 'apply-batch', doc, '--operations', '-', '--if-revision', revision, '--format', 'json',
      ...(dryRun ? ['--dry-run'] : [])],
      {windowsHide:true,maxBuffer:dryRun ? 6 * statSync(doc).size + 1024 * 1024 : 1024 * 1024}, (error, stdout) => {
        if (!error) {
          try { return resolve(JSON.parse(stdout)); } catch (e) { return reject(e); }
        }
        try { if (fileRevision(doc) !== revision) return reject(new FileChangedError(doc)); } catch {}
        reject(error);
      });
    child.stdin.end(JSON.stringify(ops));
  });
}
// Table joins use SDK-only numbering edits and CLI-only note edits. Preview the latter
// on an exclusive sibling so relative resources resolve, then commit once to the original.
async function joinWithNotes(cli, doc, document, ops) {
  const noteOps = ops.filter(op=>op.command==='insert-table-note');
  const staged = applyCorrections(document,ops.filter(op=>op.command!=='insert-table-note'));
  if (!noteOps.length) return staged;
  const scratch = path.join(path.dirname(doc), '.table-notes-' + randomUUID() + '.md');
  await writeFile(scratch,serialize(staged),{flag:'wx'});
  try {
    const {markdown} = await applyWithCli(cli,scratch,noteOps,fileRevision(scratch),true);
    return parse(markdown);
  } finally {
    await rm(scratch,{force:true});
  }
}
// Links to a heading's target in the nodes that stay. Inspect exposes table cell content on
// separate paths; other supported containers carry their inline children on the top-level node.
function linksTo(snapshot, label, stays) {
  const count = value => value && typeof value === "object"
    ? Number(value.kind === "link" && value.url === "#"+label) +
      Object.values(value).reduce((sum,child)=>sum+count(child),0) : 0;
  return snapshot.nodes
    .filter(n => n.type === "cell" || (n.path.length === 1 && n.type !== "caption"))
    .filter(stays)
    .reduce((sum,n) => sum + count(n), 0);
}
const hasLabel = (value, labels) => !!value && typeof value === 'object' &&
  ((value.kind === 'reference' && labels.includes(value.label)) || Object.values(value).some(v => hasLabel(v, labels)));
// write: the official revision-checked write; tests replace it to leave other content behind.
export function correctionHandler({cli, write = writeDocument, limits = DOCUMENT_AUTHORING_LIMITS} = {}) {
  const histories = new Map(), locks = new Set();
  // The document as this handler last wrote it, for one document at a time. It stands in for
  // reading the file again only while the file on disk still has exactly that revision.
  let memory = null, refused = null;
  const persist = async (side, m) => {
    const tmp = side + '.pending';
    try {await writeFile(tmp,JSON.stringify(m));await rename(tmp,side);}
    finally {await rm(tmp,{force:true});}
  };
  function read(doc, timings) {
    const started = performance.now();
    if (memory?.doc === doc && fileRevision(doc) === memory.snapshot.revision) {
      timings.readMs = performance.now()-started; timings.remembered = true;
      return memory.snapshot;
    }
    memory = null;
    const snapshot = inspectDocument(doc);
    timings.readMs = performance.now()-started; timings.remembered = false;
    return snapshot;
  }
  // The written result is the document the official write read back from the bytes it wrote
  // (SDK 0.15.0), as long as the file still holds them. A write that gives no document back, or a
  // file changed since, is read again and checked as before.
  function commit(doc, document, revision, timings) {
    const writing = performance.now();
    const receipt = write(doc, document, revision);
    timings.writeMs = performance.now()-writing;
    const checking = performance.now();
    let snapshot, written;
    if (receipt.document && fileRevision(doc) === receipt.revision) {
      snapshot = snapshotOf(receipt.revision, receipt.document); written = true;
    } else {
      snapshot = inspectDocument(doc); written = snapshot.revision === receipt.revision; timings.reread = true;
    }
    timings.checkMs = performance.now()-checking;
    return {receipt, snapshot, written};
  }
  const correct = async function correct({document:doc,revision,ids=[],action,line,kind,level,historyId,status,fragments,confirmed=false}) {
    const time = koreanTime();
    if (!doc || path.extname(doc) !== '.md') throw Error('저장된 문서를 찾지 못했습니다.');
    if (locks.has(doc)) throw Error('이 문서를 고치는 중입니다.');
    locks.add(doc);
    const t = performance.now(), timings = {};
    try {
      const side = doc.replace(/\.md$/,'.pdf-source.json');
      const before = JSON.parse(await readFile(side,'utf8'));
      const current = read(doc, timings);
      if (revision !== before.revision || current.revision !== before.revision)
        return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'};
      if(action!=='undo') assertMapping(before,current);
      const key = doc + ':' + historyId, stack = histories.get(key) || [];
      if (action === 'status') {
        let result;
        try { result = commit(doc,updateDocumentStatus(current.document,status),current.revision,timings); }
        catch (e) { if (e instanceof FileChangedError) { memory = null; return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'}; } throw e; }
        if(!result.written) { memory = null; return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'}; }
        assertMapping(before,result.snapshot);
        const next = {...before,revision:result.receipt.revision};
        await persist(side,next);
        memory = {doc,snapshot:result.snapshot};
        for(const [historyKey,history] of histories) {
          if(historyKey.startsWith(doc+':') && history.at(-1)?.revision===current.revision)
            history.at(-1).revision=result.receipt.revision;
        }
        return {mapping:{...next,tables:tableShapes(result.snapshot.nodes)},status:result.snapshot.status,undoCount:stack.length};
      }
      let next, ops, inverse, targetId, irreversible = false, brokenLinks = 0, forward, endnote;
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
        const joiningTables = action === 'merge' && nodes.every(n=>n.type==='table');
        if (joiningTables)
          ids = [...ids, ...before.blocks.filter(x=>x.noteIndex !== undefined && selectedPaths.includes(x.path[0]) && !ids.includes(x.id)).map(x=>x.id)];
        if (action !== 'table-note-to-body' && before.blocks.some(x => selectedPaths.includes(x.path[0]) && !ids.includes(x.id)))
          throw Error('같은 문서 블록에 속한 원본 상자를 모두 골라 주세요.');
        const neighbours = type => nodes.length === selected.length && nodes.every((n,i)=>n.type === type && n.path[0] === at+i);
        let newCount = 1, plan;
        if (action === 'merge' && first?.type === 'table') {
          if (nodes.length < 2 || nodes.some((n,i)=>n.type !== 'table' || n.path[0] !== at+i)) throw Error('이웃한 표를 둘 이상 골라야 합니다.');
          const join = joinPlan(nodes,current.nodes);
          if (join.reason) throw Error(join.reason);
          const width = join.rows[0].length;
          if (join.rows.length > limits.tableRows || join.rows.length * width > limits.tableCells)
            throw Error('이은 표가 표 한도(' + limits.tableRows + '행·' + limits.tableColumns + '열·' + limits.tableCells.toLocaleString('en-US') + '칸)를 넘어 잇지 않았습니다.');
          // References to a later table move to the first table, whose label stays.
          const holders = join.relabel.length ? topNodes(current).filter(n => ['paragraph','heading','admonition'].includes(n.type) && hasLabel(n.content, join.relabel)) : [];
          ops = [...holders.map(n=>contentUpdate(n,relabel(n.content,join.relabel,first.label))),
            ...nodes.map(n=>({command:'remove-block',at:n.path[0]})).reverse(), ...tableOps({...first,notes:nodes.flatMap(n=>n.notes || [])},join.rows,at)];
          inverse = [{command:'remove-block',at}, ...nodes.flatMap((n,i)=>tableOps(n,cellsOf(current.nodes,n.path[0]),at+i)),
            ...holders.map(n=>contentUpdate(n,n.content))];
          // Table alignment and some numbering are not in the inspected nodes; undo must give back
          // exactly the saved bytes, or the join asks first and clears the undo history.
          if (needsCli(ops)) {
            if (!cli) throw Error('공식 CLI를 찾지 못해 표 주석을 고칠 수 없습니다.');
            forward = await joinWithNotes(cli,doc,current.document,ops);
            try { irreversible = documentRevision(await joinWithNotes(cli,doc,forward,inverse)) !== current.revision; }
            catch { irreversible = true; }
          } else {
            forward = applyCorrections(current.document,ops);
            try { irreversible = documentRevision(applyCorrections(forward,inverse)) !== current.revision; } catch { irreversible = true; }
          }
          if ((join.captions.length || join.broken || irreversible) && !confirmed)
            return {requiresConfirm:true,captions:join.captions,broken:join.broken,moved:join.moved,irreversible};
          brokenLinks = join.broken;
          plan = null;
        } else if (action === 'merge' && first?.type === 'list') {
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
            offset:n.content.reduce((sum,c)=>sum+inlineLength(c),0)}));
        } else if (action === 'list' || action === 'table') {
          if (!neighbours('paragraph')) throw Error('이웃한 본문을 골라야 합니다.');
          // The paragraphs go from the last and the new block takes the first one's place, all in
          // memory before the one write, so endnote definitions stay with their calls.
          plan = action === 'list' ? listPlan(selected,current.nodes,fragments,time) : tablePlan(selected,current.nodes,fragments,limits);
          if (plan.reason) throw Error(plan.reason);
          ops = [...nodes.map(n=>({command:'remove-block',at:n.path[0]})).reverse(),
            ...(action === 'list' ? [{command:'insert-list',at,list:{ordered:false,items:plan.items.map(content=>({content}))}}]
              // A table without a caption shows no number, like the tables conversion makes.
              : [{command:'insert-table',at,cells:plan.rows},{command:'update-enumeration',path:String(at),enumerated:false}])];
          inverse = [{command:'remove-block',at}, ...nodes.map((n,i)=>insert(n,at+i))];
        } else if (action === 'table-note' || action === 'table-note-to-body') {
          const {table,index,contents,reason} = tableNotePlan(action,selected,topNodes(current));
          if (reason) throw Error(reason);
          const path = String(table.path[0]);
          const removeNotes = contents.map((_,i)=>({command:'remove-table-note',path,at:index+i})).reverse();
          if (action === 'table-note') {
            ops = [...nodes.map(n=>({command:'remove-block',at:n.path[0]})).reverse(), ...insertNotes(path,index,contents)];
            inverse = [...removeNotes, ...nodes.map(n=>insert(n,n.path[0]))];
          } else {
            ops = [...removeNotes,{command:'insert-block',at:at+1,content:contents[0]}];
            inverse = [{command:'remove-block',at:at+1},...insertNotes(path,index,contents)];
          }
        } else if (action === 'footnote') {
          const note = footnotePlan(selected,before.blocks,topNodes(current));
          if (note.reason) throw Error(note.reason);
          const noteAt = note.note.path[0];
          ops = [{command:'remove-block',at:noteAt},{command:'insert-footnote',path:String(note.host.path[0]),
            offset:note.host.content.reduce((sum,c)=>sum+inlineLength(c),0),content:note.content}];
          endnote = {at:noteAt,node:topNodes(current).find(n=>n.path[0]===noteAt),
            labels:new Set(current.nodes.filter(n=>n.type==='footnote').map(n=>n.label)),target:note.target.id};
        } else if (action === 'split') {
          if (nodes.length !== 1 || first.type !== 'paragraph') throw Error('문단 하나를 골라야 합니다.');
          const offset = splitOffset(b.lines,line,first.content);
          ops = [{command:'split-paragraph',path:String(at),offset}];
          inverse = [{command:'merge-paragraph',path:String(at+1)}];
          if(first.content.some(c=>c.children)) {
            const halves=splitContent(first.content,offset);
            ops=halves.map((content,i)=>({command:'insert-block',at:at+i,content}));
            ops.push({command:'remove-block',at:at+2});
            inverse=[insert(first,at),{command:'remove-block',at:at+1},{command:'remove-block',at:at+1}];
          }
          newCount = 2;
        } else if (action === 'kind' && first?.type === 'list' && kind === 'paragraph') {
          if (nodes.length !== 1) throw Error('목록 하나를 골라야 합니다.');
          plan = unlistPlan(first,selected);
          if (plan.reason) throw Error(plan.reason);
          ops = [{command:'remove-block',at},...plan.contents.map((content,i)=>({command:'insert-block',at:at+i,content}))];
          inverse = [...plan.contents.map(()=>({command:'remove-block',at})),insert(first,at)];
          newCount = plan.contents.length;
        } else if (action === 'kind' && (first?.type === 'admonition' && kind === 'paragraph' || first?.type === 'paragraph' && kind === 'note')) {
          if (nodes.length !== 1) throw Error('블록 하나를 골라야 합니다.');
          // A note box and a paragraph trade places with the same inline content.
          ops = [{command:'remove-block',at},kind === 'note' ? {command:'insert-admonition',at,variant:'note',content:first.content} : {command:'insert-block',at,content:first.content}];
          inverse = [{command:'remove-block',at},insert(first,at)];
        } else if (action === 'kind') {
          if (nodes.length !== 1 || !['paragraph','heading'].includes(first.type) ||
            !['paragraph','heading'].includes(kind) || (kind === 'heading' && !(level>=1 && level<=6)))
            throw Error('본문이나 제목 하나를 골라야 합니다.');
          const same = kind === first.type && (kind !== 'heading' || level === first.level);
          ops = same ? [{command:'format'}] : [{command:'convert-block',path:String(at),to:kind,...(kind==='heading'?{level}:{})}];
          inverse = same ? [{command:'format'}] : [{command:'convert-block',path:String(at),to:first.type,...(first.type==='heading'?{level:first.level}:{})}];
        } else if (action === 'remove') {
          if (nodes.length !== selectedPaths.length || nodes.some(n => !['paragraph','heading','list','admonition'].includes(n.type)))
            throw Error('본문·제목·목록·참고 블록만 뺄 수 있습니다.');
          irreversible = nodes.some(n => references(n).length > 0);
          if (irreversible && !confirmed) return {requiresConfirm:true};
          // Blocks and the link targets of removed headings go from the last, and come back from the first.
          const all = topNodes(current), targets = nodes.map(n => detachedTarget(all,n,action)).filter(Boolean);
          // The official CLI that puts a target back takes a note box's plain text only.
          if (targets.length && nodes.some(n => n.type === 'admonition')) throw Error('참고 상자와 이름표가 있는 제목은 따로 빼 주세요.');
          const gone = [...nodes,...targets].sort((a,b)=>a.path[0]-b.path[0]);
          ops = gone.map(n => ({command:'remove-block',at:n.path[0]})).reverse();
          inverse = gone.map(n => n.type === 'target' ? {command:'insert-target',at:n.path[0],label:n.label} : insert(n,n.path[0]));
          const removed = new Set(gone.map(n => n.path[0]));
          brokenLinks = targets.reduce((sum,target) => sum + linksTo(current,target.label,n => !removed.has(n.path[0])),0);
          newCount = 0;
        } else if (action === 'title') {
          if (nodes.length !== 1 || !['paragraph','heading'].includes(first.type)) throw Error('본문이나 제목 하나를 골라야 합니다.');
          const {text, reason} = titleText(first);
          if (reason) throw Error(reason);
          if (current.title && !confirmed) return {requiresConfirm:true, title:current.title};
          // The replaced title does not return to the body; undo restores the previous value.
          ops = [{command:'remove-block',at},{command:'update-title',text}];
          inverse = [insert(first,at), current.title === null ? {command:'update-title',remove:true} : {command:'update-title',text:current.title}];
          newCount = 0;
        } else throw Error('지원하지 않는 고치기입니다.');
        const target = !['remove','footnote','list','table'].includes(action) && detachedTarget(topNodes(current),first,action,kind);
        if (target) {
          const index = target.path[0];
          ops.push({command:"remove-block",at:index});
          inverse.unshift({command:"insert-target",at:index,label:target.label});
          brokenLinks = linksTo(current,target.label,n => action === "kind" || n.path[0] !== at);
          forward = null;
        }
        if (action !== 'footnote') {
          next = previewCorrection(before,{action,ids,line,kind,level,plan,time});
          targetId = next.blocks.find(x=>x.id===b.id)?.id || next.blocks.find(x=>x.path[0]>=at)?.id || next.blocks.at(-1)?.id;
        }
      }
      const noteJoin = needsCli(ops) && ops.some(op=>op.command==='insert-table');
      const viaCli = needsCli(ops) && !noteJoin;
      if ((viaCli || noteJoin) && !cli) throw Error('공식 CLI를 찾지 못해 표 주석·미주·이름표를 고칠 수 없습니다.');
      let receipt, snapshot, written;
      try {
        const started = performance.now();
        if (viaCli) {
          memory = null;
          receipt = await applyWithCli(cli,doc,ops,before.revision);
          timings.cliMs = performance.now()-started;
          const checked = performance.now();
          snapshot = inspectDocument(doc);
          timings.inspectMs = performance.now()-checked;
          written = snapshot.revision === receipt.revision;
        } else {
          const document = forward || (noteJoin ? await joinWithNotes(cli,doc,current.document,ops) : applyCorrections(current.document,ops));
          timings.coreMs = performance.now()-started;
          ({receipt, snapshot, written} = commit(doc,document,before.revision,timings));
        }
        timings.operationMs = performance.now()-started;
      } catch (e) {
        memory = null;
        if (e instanceof FileChangedError)
          return {stale:true,message:'문서가 바뀌어 대응을 표시할 수 없음'};
        throw Error('문서를 고치지 못했습니다. 원본과 저장 상태를 확인해 주세요.');
      }
      if (endnote) {
        // The endnote definition goes where Core puts it; the note's source boxes follow it there.
        const definition = snapshot.nodes.find(n => n.type === 'footnote' && !endnote.labels.has(n.label));
        const edited = {action,at:time,who:'user'}, d = definition?.path[0] ?? Infinity;
        next = structuredClone(before);
        for (const x of next.blocks) {
          if (x.path[0] === endnote.at) Object.assign(x,{path:[d],kind:'footnote',documentKind:'footnote',edited});
          else { let p = x.path[0] > endnote.at ? x.path[0]-1 : x.path[0]; if (p >= d) p++; x.path = [p]; }
        }
        next.blocks.sort((a,c)=>a.path[0]-c.path[0]);
        next.history = [...(before.history || []),edited];
        inverse = definition ? [{command:'remove-footnote',path:String(d)},insert(endnote.node,endnote.at)] : [];
        if (!definition) written = false;
        targetId = endnote.target;
      }
      next.revision = receipt.revision;
      let invalid = !written;
      try { assertMapping(next,snapshot); } catch { invalid=true; }
      next.snapshotNodes=snapshotNodes(snapshot);
      next.verificationPending=false;
      next.stale = invalid;
      memory = invalid ? null : {doc,snapshot};
      try { await persist(side,next); }
      catch { memory = null; return {stale:true,message:'문서는 고쳤지만 대응 자료를 기록하지 못했습니다. 문서를 다시 열어 주세요.'}; }
      if (undo) {stack.pop(); if(stack.length) stack.at(-1).revision = receipt.revision;}
      else if (irreversible || (endnote && !inverse.length)) stack.length = 0;
      else stack.push({before,forward:ops,inverse,revision:receipt.revision,targetId:before.blocks.find(b=>ids.includes(b.id))?.id,
        range:changedRange(current.nodes,snapshot.nodes)});
      histories.set(key,stack);
      timings.totalMs = performance.now()-t;
      return {mapping:{...next,tables:tableShapes(snapshot.nodes)},targetId,undoCount:stack.length,timings,brokenLinks,
        message:invalid?'저장 뒤 대응이 문서와 달라 대응 표시를 멈췄습니다. 되돌리기는 사용할 수 있습니다.':''};
    } finally {locks.delete(doc);}
  };
  // The file on disk is no longer the mapping's revision: the comparison view saved its content
  // edits, or a document tab or the assistant changed the file. The correspondence moves to the
  // file when its blocks keep their number and kinds; otherwise it stops. revision: the revision
  // the mapping is at, for a save of the view the one the save started from. A file refused once
  // is not read again while it stays the same.
  correct.follow = async ({document:doc,revision,historyId}) => {
    if (!doc || path.extname(doc) !== '.md') throw Error('저장된 문서를 찾지 못했습니다.');
    const t = performance.now(), timings = {};
    const disk = fileRevision(doc);
    timings.hashMs = performance.now()-t;
    if (disk === revision) return {unchanged:true,timings};
    if (refused?.doc === doc && refused.revision === disk && refused.from === revision) return {stale:true,message:STALE,timings};
    if (locks.has(doc)) return {busy:true};
    locks.add(doc);
    try {
      const side = doc.replace(/\.md$/,'.pdf-source.json');
      let started = performance.now();
      const before = JSON.parse(await readFile(side,'utf8'));
      timings.sideMs = performance.now()-started;
      if (before.revision !== revision) return {stale:true,message:STALE,timings};
      // The content before the change, when this handler still holds it, tells which blocks changed.
      const old = memory?.doc === doc && memory.snapshot.revision === revision ? memory.snapshot : null;
      memory = null;
      // The view's save tells only its revisions: the saved file is read and parsed once (readMs),
      // then projected to its nodes (nodesMs).
      started = performance.now();
      const read = readDocument(doc);
      timings.readMs = performance.now()-started;
      started = performance.now();
      const snapshot = snapshotOf(read.revision, read.document);
      timings.nodesMs = performance.now()-started;
      started = performance.now();
      try { assertMapping(before,snapshot); }
      catch {
        refused = {doc,revision:snapshot.revision,from:revision};
        timings.checkMs = performance.now()-started;
        return {stale:true,message:STALE,timings};
      }
      timings.checkMs = performance.now()-started;
      started = performance.now();
      const next = {...before,revision:snapshot.revision,snapshotNodes:snapshotNodes(snapshot)};
      await persist(side,next);
      timings.writeMs = performance.now()-started;
      memory = {doc,snapshot};
      started = performance.now();
      for (const [key,stack] of histories) {
        if (!key.startsWith(doc+':') || !stack.length) continue;
        const kept = old ? keepHistory(stack,editedBlocks(old.nodes,snapshot.nodes)) : [];
        if (kept.at(-1)?.revision === revision) kept.at(-1).revision = snapshot.revision;
        histories.set(key,kept);
      }
      timings.historyMs = performance.now()-started;
      timings.totalMs = performance.now()-t;
      return {revision:snapshot.revision,status:snapshot.status,mapping:{...next,tables:tableShapes(snapshot.nodes)},
        undoCount:histories.get(doc+':'+historyId)?.length ?? 0,timings};
    } finally {locks.delete(doc);}
  };
  // Another document opened, or the screen closed: what was remembered goes.
  correct.forget = () => { memory = null; refused = null; };
  return correct;
}
