// nodes: the saved top-level document nodes, used to tell ordered from unordered lists.
export function blockActions(blocks, allBlocks, nodes=[]) {
  const single=blocks.length===1, first=blocks[0], text=single&&['paragraph','heading'].includes(first.documentKind);
  const complete=blocks.every(b=>allBlocks.filter(x=>x.path[0]===b.path[0]).every(x=>blocks.some(y=>y.id===x.id)));
  const groupReason='같은 문서 블록에 속한 원본 상자를 모두 골라야 합니다.';
  // Before the document is saved, source blocks have no path yet.
  const paths=[...new Set(blocks.map(b=>b.path?.[0]))].sort((a,b)=>a-b);
  const ordered=p=>!!nodes.find(n=>n.path.length===1&&n.path[0]===p)?.ordered;
  const lists=paths.length>=2&&blocks.every(b=>b.documentKind==='list')&&paths.every((p,i)=>p===paths[0]+i)&&paths.every(p=>ordered(p)===ordered(paths[0]));
  const make=(id,label,ok,reason,action,extra={})=>({id,label,disabled:!ok,disabledReason:!ok?(!complete?groupReason:reason):undefined,action,extra});
  return [
    make('merge','합치기',complete&&(lists||blocks.length>=2&&blocks.every((b,i)=>b.documentKind==='paragraph'&&b.path[0]===first.path[0]+i)),'이웃한 문단이나 같은 종류의 목록을 둘 이상 골라야 합니다.','merge'),
    make('split','나누기',complete&&single&&first.documentKind==='paragraph'&&first.lines?.length>1,'원본 줄이 둘 이상인 문단 하나를 골라야 합니다.','split'),
    ...[{kind:'paragraph',label:'본문으로'},...Array.from({length:6},(_,i)=>({kind:'heading',level:i+1,label:'제목 '+(i+1)+'로'}))].map(({kind,level,label})=>{
      const same=text&&first.documentKind===kind&&(kind!=='heading'||first.level===level);
      return make(kind==='paragraph'?'paragraph':'h'+level,label,complete&&text&&!same,same?'이미 같은 종류입니다.':'본문이나 제목 하나를 골라야 합니다.','kind',{kind,...(level?{level}:{})});
    }),
    {...make('remove','문서에서 빼기',complete&&single&&['paragraph','heading','list'].includes(first.documentKind),'본문·제목·목록 블록 하나를 골라야 합니다.','remove'),danger:true},
  ];
}
