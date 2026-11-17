// Pure geometry; coordinates are PDF points with a top-left origin.
export const joinText = (a, b) => a + (a.endsWith('-') ? '' : ' ') + b;
const cluster = values => {
  const groups = [];
  for (const v of values.sort((a,b)=>a-b)) {
    const g = groups.at(-1);
    if (g && v-g[0] <= 2) g.push(v); else groups.push([v]);
  }
  return groups.map(g=>g.reduce((a,b)=>a+b,0)/g.length);
};
const coverage = (segments, pos, a, b) => {
  const intervals = segments.filter(s=>Math.abs(s.pos-pos)<=2).map(s=>[Math.max(a,s.a),Math.min(b,s.b)]).filter(([l,r])=>r>l).sort((a,b)=>a[0]-b[0]);
  let end=a, n=0;
  for(const [l,r] of intervals) { n+=Math.max(0,r-Math.max(end,l));end=Math.max(end,r); }
  return n/(b-a);
};
function cellText(words) {
  const lines=[];
  for(const w of [...words].sort((a,b)=>a.top-b.top || a.x0-b.x0)) {
    const mid=(w.top+w.bottom)/2;
    let line=lines.find(l=>mid>=l.top-0.5 && mid<=l.bottom+0.5);
    if(!line) lines.push(line={top:w.top,bottom:w.bottom,words:[]});
    line.top=Math.min(line.top,w.top);line.bottom=Math.max(line.bottom,w.bottom);line.words.push(w);
  }
  const tokens=[];let text='';
  for(const line of lines.sort((a,b)=>a.top-b.top)) {
    let prev;let row='';
    for(const w of line.words.sort((a,b)=>a.x0-b.x0)) {
      const space=prev && (w.superscript || prev.superscript || w.x0-prev.x1>0.12*Math.max(prev.size,w.size)) && !/\s$/.test(prev.text)&&!/^\s/.test(w.text);
      const piece=(space?' ':'')+w.text;
      tokens.push({text:piece,superscript:!!w.superscript,newLine:!prev});
      row+=piece;prev=w;
    }
    text=text?joinText(text,row.trim()):row.trim();
  }
  return {text:text.replace(/\s+/g,' ').trim(),tokens};
}
export function buildGrid(box, rulings, words) {
  words=words.map((w,id)=>({...w,id:w.id??id}));
  const [l,t,r,b]=box, pad=2;
  const source=words.filter(w=>(w.x0+w.x1)/2>=l-pad && (w.x0+w.x1)/2<=r+pad && (w.top+w.bottom)/2>=t-pad && (w.top+w.bottom)/2<=b+pad);
  let hs=rulings.filter(s=>s.axis==='h' && s.pos>=t-pad && s.pos<=b+pad && s.b>l && s.a<r);
  const vs=rulings.filter(s=>s.axis==='v' && s.pos>=l-pad && s.pos<=r+pad && s.b>t && s.a<b);
  let ys=cluster(hs.map(s=>s.pos));
  // Reject short ticks as column evidence; long segmented vertical rules may accumulate.
  const xs=cluster(vs.map(s=>s.pos)).filter(x=>coverage(vs,x,ys[0]??t,ys.at(-1)??b)>=0.15);
  hs=hs.filter(s=>xs.some(x=>Math.abs(x-s.a)<=2)&&xs.some(x=>Math.abs(x-s.b)<=2));
  ys=cluster(hs.map(s=>s.pos));
  const grid={rowEdges:ys,colEdges:xs,rows:ys.length-1,cols:xs.length-1,cells:[],sourceWords:source.map(w=>w.id),outside:[],reason:null};
  if(ys.length<2 || xs.length<2) return {...grid,reason:'격자를 세우지 못함'};
  const R=grid.rows,C=grid.cols;
  // Each candidate row must have a horizontal connection across its full width.
  // Disconnected side-by-side grids have no such connection over the separating gap.
  const parents=Array.from({length:hs.length+vs.length},(_,i)=>i), segs=[...hs,...vs];
  const find=i=>parents[i]===i?i:(parents[i]=find(parents[i]));
  for(let i=0;i<hs.length;i++) for(let j=hs.length;j<segs.length;j++) {
    const h=segs[i],v=segs[j];
    if(v.pos>=h.a-pad && v.pos<=h.b+pad && h.pos>=v.a-pad && h.pos<=v.b+pad) parents[find(i)]=find(j);
  }
  const components=new Map();
  segs.forEach((s,i)=>{const g=components.get(find(i))??[];g.push(s);components.set(find(i),g);});
  if([...components.values()].filter(g=>cluster(g.filter(s=>s.axis==='h').map(s=>s.pos)).length>=2 && g.filter(s=>s.axis==='v').length>=2 && Math.max(...g.filter(s=>s.axis==='h').map(s=>s.b-s.a))>80 && Math.max(...g.filter(s=>s.axis==='v').map(s=>s.b))-Math.min(...g.filter(s=>s.axis==='v').map(s=>s.a))>15).length>1) return {...grid,reason:'서로 닿지 않는 격자가 둘 이상임'};
  const parent=Array.from({length:R*C},(_,i)=>i);
  const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  for(let i=0;i<R;i++) for(let j=0;j<C;j++) {
    if(j+1<C && coverage(vs,xs[j+1],ys[i],ys[i+1])<0.5) parent[root(i*C+j)]=root(i*C+j+1);
    if(i+1<R && coverage(hs,ys[i+1],xs[j],xs[j+1])<0.5) parent[root(i*C+j)]=root((i+1)*C+j);
  }
  const cells=new Map();
  for(let i=0;i<R;i++) for(let j=0;j<C;j++) {
    const k=root(i*C+j);let c=cells.get(k);
    if(!c) cells.set(k,c={r0:i,r1:i+1,c0:j,c1:j+1,slots:0,words:[]});
    c.r0=Math.min(c.r0,i);c.r1=Math.max(c.r1,i+1);c.c0=Math.min(c.c0,j);c.c1=Math.max(c.c1,j+1);c.slots++;
  }
  if([...cells.values()].some(c=>c.slots!==(c.r1-c.r0)*(c.c1-c.c0))) return {...grid,reason:'병합 범위가 직사각형이 아님'};
  for(const w of source) {
    const x=(w.x0+w.x1)/2,y=(w.top+w.bottom)/2;
    const i=ys.findIndex((a,k)=>k<R && y>=a-0.5 && y<=ys[k+1]+0.5),j=xs.findIndex((a,k)=>k<C && x>=a-0.5 && x<=xs[k+1]+0.5);
    if(i<0||j<0) grid.outside.push(w.id);else cells.get(root(i*C+j)).words.push(w);
  }
  grid.cells=[...cells.values()].map(({words,slots,...c})=>({...c,...cellText(words),wordIds:words.map(w=>w.id)})).sort((a,b)=>a.r0-b.r0||a.c0-b.c0);
  const below=source.filter(w=>grid.outside.includes(w.id)&&(w.top+w.bottom)/2>ys.at(-1));
  if(below.length && Math.min(...below.map(w=>w.x0)) <= xs[0]+(xs.at(-1)-xs[0])*0.1) {
    grid.externalNotes=[{...cellText(below),wordIds:below.map(w=>w.id),box:[Math.min(...below.map(w=>w.x0)),Math.min(...below.map(w=>w.top)),Math.max(...below.map(w=>w.x1)),Math.max(...below.map(w=>w.bottom))]}];
    grid.outside=grid.outside.filter(id=>!below.some(w=>w.id===id));
  }
  if(grid.outside.length) grid.reason='어느 칸에도 들어가지 않는 글자가 있음';
  return grid;
}
export function flattenGrid(grid) {
  const {rows:R,cols:C,cells}=grid;
  const full=c=>c.c0===0&&c.c1===C;
  let end=R;
  while(end>1 && cells.some(c=>full(c)&&c.r1===end)) end=cells.find(c=>full(c)&&c.r1===end).r0;
  const notes=[...cells.filter(c=>c.r0>=end),...(grid.externalNotes||[])];
  let d=1;
  while(d<end) {
    let next=d;
    for(const c of cells.filter(c=>c.r0<end)) {
      if(c.r0<d&&c.r1>d) next=Math.max(next,c.r1);
      if(c.r0===d-1&&c.c1-c.c0>1&&!full(c)) next=Math.max(next,d+1);
    }
    if(next===d) break;
    d=next;
  }
  if(d>=end) d=1;
  const rows=[Array.from({length:C},(_,j)=>cells.filter(c=>c.r0<d&&c.c0<=j&&c.c1>j&&(!full(c)||j===0)).map(c=>c.text).filter(Boolean).join(' / '))];
  const tokenRows=[Array.from({length:C},(_,j)=>cells.filter(c=>c.r0<d&&c.c0<=j&&c.c1>j&&(!full(c)||j===0)))];
  for(let i=d;i<end;i++) {
    const row=[],tokens=[];
    for(let j=0;j<C;j++) {const c=cells.find(c=>c.r0<=i&&c.r1>i&&c.c0<=j&&c.c1>j);row.push(c&&(!full(c)||j===0)?c.text:'');tokens.push(c&&(!full(c)||j===0)?[c]:[]);}
    rows.push(row);tokenRows.push(tokens);
  }
  const repeated=cells.filter(c=>c.r0>=d&&c.r0<end&&!full(c)).reduce((n,c)=>n+(c.r1-c.r0)*(c.c1-c.c0)-1,0);
  const sections=cells.filter(c=>full(c)&&c.r0>=d&&c.r0<end).length;
  return {rows,tokenRows,notes,headerRows:d,exportedRows:R-end+(grid.externalNotes?.length||0),record:{headerRows:d,repeated,sections,exportedRows:R-end+(grid.externalNotes?.length||0)}};
}
export function checkConservation(grid) {
  const counts=new Map();
  [...grid.cells,...(grid.externalNotes||[])].forEach(c=>c.wordIds.forEach(id=>counts.set(id,(counts.get(id)||0)+1)));
  return {missing:grid.sourceWords.filter(id=>!counts.has(id)),duplicated:[...counts].filter(([,n])=>n!==1).map(([id])=>id)};
}
