import { tableNotePlan, titleText } from './corrections.mjs';
import { listPlan, tablePlan, unlistPlan, footnotePlan } from './structure.mjs';
import { LABELS } from '../shared/block-kind.mjs';
const removable = ['paragraph','heading','list','admonition'];
// The one page all the given boxes are on, or null.
export function pageOf(boxes) {
  const pages = new Set(boxes.map(x => x.page));
  return pages.size === 1 ? [...pages][0] : null;
}
// Keeping only the chosen blocks of one page: the other blocks of that page that can go.
// A document block goes only when every source box of it is on the page and none is chosen;
// tables, figures and footnotes stay. kept: the document blocks of the page left in place.
export function keepTargets(page, chosenIds, allBlocks) {
  const groups = new Map();
  for (const b of allBlocks) if (b.path) groups.set(b.path[0], [...(groups.get(b.path[0]) || []), b]);
  const ids = [], kept = [];
  for (const group of groups.values()) {
    if (!group.some(b => b.boxes.some(x => x.page === page)) || group.some(b => chosenIds.includes(b.id))) continue;
    if (group.every(b => removable.includes(b.documentKind) && b.boxes.every(x => x.page === page))) ids.push(...group.map(b => b.id));
    else kept.push(group[0]);
  }
  return {ids, kept};
}
// One sentence about the blocks a keep left in place, or ''.
export function keptNote(kept) {
  if (!kept.length) return '';
  const counts = new Map();
  for (const b of kept) {
    const name = removable.includes(b.documentKind) ? '다른 쪽으로 이어지는 블록' : LABELS[b.kind] || '블록';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return '이 쪽의 ' + [...counts].map(([name, n]) => name + ' ' + n + '개').join(', ') + '는 뺄 수 없어 그대로 두었습니다.';
}
// The keep action for a selection on one page. chosenIds may name a document title box.
export function keepAction(page, chosenIds, allBlocks) {
  const {ids, kept} = page == null ? {ids: [], kept: []} : keepTargets(page, chosenIds, allBlocks);
  const reason = page == null ? '고른 블록이 모두 한 쪽에 있어야 합니다.' : '이 쪽에 더 뺄 수 있는 블록이 없습니다.';
  return {id:'keep', group:'remove', visible:true, label:'이 쪽에서 고른 것만 남기기', disabled:!ids.length, disabledReason:ids.length ? undefined : reason, action:'keep', extra:{ids, kept}, danger:true};
}
// Actions for the chosen blocks, in three groups: kind ('kind'), structure ('structure') and
// taking out ('remove'). An action that cannot apply to any of the chosen kinds is not visible.
// nodes: the saved top-level document nodes. fragments: source text fragments by page for the
// chosen blocks' pages (undefined while they load). tables: column counts by table path.
export function blockActions(blocks, allBlocks, nodes=[], {fragments, limits, tables = {}} = {}) {
  const single=blocks.length===1, first=blocks[0], text=single&&['paragraph','heading'].includes(first.documentKind);
  const complete=blocks.every(b=>allBlocks.filter(x=>x.path[0]===b.path[0]).every(x=>blocks.some(y=>y.id===x.id)));
  const groupReason='같은 문서 블록에 속한 원본 상자를 모두 골라야 합니다.';
  // Before the document is saved, source blocks have no path yet.
  const paths=[...new Set(blocks.map(b=>b.path?.[0]))].sort((a,b)=>a-b);
  const kinds=new Set(blocks.map(b=>b.documentKind)), only=(...k)=>blocks.length>0&&[...kinds].every(x=>k.includes(x));
  const node=p=>nodes.find(n=>n.path.length===1&&n.path[0]===p);
  const ordered=p=>!!node(p)?.ordered;
  const adjacent=paths.every((p,i)=>p===paths[0]+i);
  const lists=paths.length>=2&&blocks.every(b=>b.documentKind==='list')&&adjacent&&paths.every(p=>ordered(p)===ordered(paths[0]));
  const joined=paths.length>=2&&blocks.every(b=>b.documentKind==='table')&&adjacent;
  const joinedComplete=joined&&allBlocks.filter(x=>paths.includes(x.path[0])&&x.noteIndex===undefined)
    .every(x=>blocks.some(y=>y.id===x.id));
  const sameWidth=joined&&paths.every(p=>tables[p]&&tables[p]===tables[paths[0]]);
  // One mapping block per paragraph, next to each other.
  const paragraphs=only('paragraph')&&adjacent&&paths.length===blocks.length;
  // Without the saved node the handler checks the words itself.
  const textNode=text&&node(first.path?.[0]), title=textNode?titleText(textNode):{};
  const make=(group,id,label,visible,ok,reason,action,extra={})=>({id,group,visible,label,disabled:!ok,disabledReason:!ok?(!complete?groupReason:reason):undefined,action,extra});
  const fixed=[...new Set(blocks.filter(b=>!removable.includes(b.documentKind)).map(b=>LABELS[b.kind]||'다른 종류'))];
  const plan=(fn,...args)=>{ if(!complete||!paragraphs) return {reason:'이웃한 본문 블록을 골라야 합니다.'}; try { return fn(...args); } catch(e) { return {reason:e.message}; } };
  const notText={reason:'본문 블록을 골라야 합니다.'};
  const listing=only('paragraph')?plan(listPlan,blocks,nodes,fragments):notText;
  const tabling=only('paragraph')?(limits?plan(tablePlan,blocks,nodes,fragments,limits):{reason:'표 한도를 읽지 못했습니다.'}):notText;
  const noting=only('paragraph')&&complete?footnotePlan(blocks,allBlocks,nodes):notText;
  const tableNoting=only('paragraph')&&complete?tableNotePlan('table-note',blocks,nodes):notText;
  const fromTable=single&&first.noteIndex!==undefined;
  const listNode=single&&first.documentKind==='list'&&node(first.path?.[0]);
  const unlisting=listNode?unlistPlan(listNode,allBlocks.filter(x=>x.path[0]===first.path[0])):{};
  const toParagraph=text||single&&first.documentKind==='admonition'||listNode&&!unlisting.reason;
  const paragraphReason=listNode?unlisting.reason:'본문·제목·참고 상자나 목록 하나를 골라야 합니다.';
  return [
    ...[{kind:'paragraph',label:'본문으로'},...Array.from({length:6},(_,i)=>({kind:'heading',level:i+1,label:'제목 '+(i+1)+'로'}))].map(({kind,level,label})=>{
      const same=text&&first.documentKind===kind&&(kind!=='heading'||first.level===level);
      return kind==='paragraph'
        ? fromTable
          ? make('kind','paragraph',label,true,!tableNotePlan('table-note-to-body',blocks,nodes).reason,'표 주석을 찾지 못했습니다.','table-note-to-body')
          : make('kind','paragraph',label,only('paragraph','heading','admonition','list'),complete&&toParagraph&&!same,same?'이미 같은 종류입니다.':paragraphReason,'kind',{kind})
        : make('kind','h'+level,label,only('paragraph','heading'),complete&&text&&!same,same?'이미 같은 종류입니다.':'본문이나 제목 하나를 골라야 합니다.','kind',{kind,level});
    }),
    make('kind','note','참고로',only('paragraph','heading','admonition'),complete&&single&&first.documentKind==='paragraph',
      single&&first.documentKind==='admonition'?'이미 같은 종류입니다.':'본문 하나를 골라야 합니다.','kind',{kind:'note'}),
    make('kind','title','문서 제목으로',only('paragraph','heading'),complete&&text&&!title.reason,text?title.reason:'본문이나 제목 하나를 골라야 합니다.','title'),
    make('structure','merge','합치기',only('paragraph')||only('list')||only('table'),joinedComplete&&sameWidth||complete&&(lists||blocks.length>=2&&blocks.every((b,i)=>b.documentKind==='paragraph'&&b.path[0]===first.path[0]+i)),
      joined?'열 수가 같은 표만 이을 수 있습니다.':only('table')?'이웃한 표를 둘 이상 골라야 합니다.':'이웃한 문단이나 같은 종류의 목록을 둘 이상 골라야 합니다.','merge'),
    make('structure','split','나누기',only('paragraph'),complete&&single&&first.documentKind==='paragraph'&&first.lines?.length>1,'원본 줄이 둘 이상인 문단 하나를 골라야 합니다.','split'),
    make('structure','list','목록으로',only('paragraph'),!listing.reason,listing.reason,'list'),
    make('structure','table','표로',only('paragraph'),!tabling.reason,tabling.reason,'table'),
    make('structure','table-note','표 주석으로',only('paragraph'),!tableNoting.reason,tableNoting.reason,'table-note'),
    make('structure','footnote','미주로',only('paragraph'),!noting.reason,noting.reason,'footnote'),
    {...make('remove','remove','문서에서 빼기',true,complete&&blocks.length>0&&!fixed.length,
      fixed.length?'고른 것에 '+fixed.join('·')+' 블록이 있어 뺄 수 없습니다. 본문·제목·목록·참고 상자만 뺄 수 있습니다.':'본문·제목·목록·참고 블록을 골라야 합니다.','remove'),danger:true},
    keepAction(blocks.length?pageOf(blocks.flatMap(b=>b.boxes||[])):null,blocks.map(b=>b.id),allBlocks),
  ];
}

export { sourceOverlays } from "../shared/linked-items.mjs";
