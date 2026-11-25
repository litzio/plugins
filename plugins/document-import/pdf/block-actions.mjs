import { titleText } from './corrections.mjs';
import { LABELS } from '../shared/block-kind.mjs';
const removable = ['paragraph','heading','list'];
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
  return {id:'keep', label:'이 쪽에서 고른 것만 남기기', disabled:!ids.length, disabledReason:ids.length ? undefined : reason, action:'keep', extra:{ids, kept}, danger:true};
}
// nodes: the saved top-level document nodes, used to tell ordered from unordered lists.
export function blockActions(blocks, allBlocks, nodes=[]) {
  const single=blocks.length===1, first=blocks[0], text=single&&['paragraph','heading'].includes(first.documentKind);
  const complete=blocks.every(b=>allBlocks.filter(x=>x.path[0]===b.path[0]).every(x=>blocks.some(y=>y.id===x.id)));
  const groupReason='같은 문서 블록에 속한 원본 상자를 모두 골라야 합니다.';
  // Before the document is saved, source blocks have no path yet.
  const paths=[...new Set(blocks.map(b=>b.path?.[0]))].sort((a,b)=>a-b);
  const ordered=p=>!!nodes.find(n=>n.path.length===1&&n.path[0]===p)?.ordered;
  const lists=paths.length>=2&&blocks.every(b=>b.documentKind==='list')&&paths.every((p,i)=>p===paths[0]+i)&&paths.every(p=>ordered(p)===ordered(paths[0]));
  // Without the saved node the handler checks the words itself.
  const node=text&&nodes.find(n=>n.path.length===1&&n.path[0]===first.path?.[0]), title=node?titleText(node):{};
  const make=(id,label,ok,reason,action,extra={})=>({id,label,disabled:!ok,disabledReason:!ok?(!complete?groupReason:reason):undefined,action,extra});
  const fixed=[...new Set(blocks.filter(b=>!removable.includes(b.documentKind)).map(b=>LABELS[b.kind]||'다른 종류'))];
  return [
    make('merge','합치기',complete&&(lists||blocks.length>=2&&blocks.every((b,i)=>b.documentKind==='paragraph'&&b.path[0]===first.path[0]+i)),'이웃한 문단이나 같은 종류의 목록을 둘 이상 골라야 합니다.','merge'),
    make('split','나누기',complete&&single&&first.documentKind==='paragraph'&&first.lines?.length>1,'원본 줄이 둘 이상인 문단 하나를 골라야 합니다.','split'),
    ...[{kind:'paragraph',label:'본문으로'},...Array.from({length:6},(_,i)=>({kind:'heading',level:i+1,label:'제목 '+(i+1)+'로'}))].map(({kind,level,label})=>{
      const same=text&&first.documentKind===kind&&(kind!=='heading'||first.level===level);
      return make(kind==='paragraph'?'paragraph':'h'+level,label,complete&&text&&!same,same?'이미 같은 종류입니다.':'본문이나 제목 하나를 골라야 합니다.','kind',{kind,...(level?{level}:{})});
    }),
    make('title','문서 제목으로',complete&&text&&!title.reason,text?title.reason:'본문이나 제목 하나를 골라야 합니다.','title'),
    {...make('remove','문서에서 빼기',complete&&blocks.length>0&&!fixed.length,
      fixed.length?'고른 것에 '+fixed.join('·')+' 블록이 있어 뺄 수 없습니다. 본문·제목·목록만 뺄 수 있습니다.':'본문·제목·목록 블록을 골라야 합니다.','remove'),danger:true},
    keepAction(blocks.length?pageOf(blocks.flatMap(b=>b.boxes||[])):null,blocks.map(b=>b.id),allBlocks),
  ];
}

export { sourceOverlays } from "../shared/linked-items.mjs";
