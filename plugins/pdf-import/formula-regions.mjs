import { buildGrid } from './table-grid.mjs';
const number = /^\((?:[A-Z]\.)?\d+\)$/;
const overlapY = (a,b) => a.top < b.bottom && a.bottom > b.top;
const union = xs => ({x0:Math.min(...xs.map(x=>x.x0)),top:Math.min(...xs.map(x=>x.top)),x1:Math.max(...xs.map(x=>x.x1)),bottom:Math.max(...xs.map(x=>x.bottom))});

// Input lines have already had running furniture excluded. No text semantics are used.
export function formulaRegions(lines, regions, page) {
  const usable=lines.filter(l=>!l.kind);
  if(!usable.length)return [];
  const left=Math.min(...usable.map(l=>l.x0)),right=Math.max(...usable.map(l=>l.x1));
  const bounds=l=>({x0:l.x0,top:l.y0,x1:l.x1,bottom:l.y1});
  const anchors=usable.filter(l=>number.test(l.plain)&&l.x0>=left+0.8*(right-left)&&
    !usable.some(x=>x!==l&&overlapY(bounds(x),bounds(l))&&x.x0>=l.x1)&&
    (usable.some(x=>x!==l&&x.x1<l.x0&&overlapY(bounds(x),bounds(l)))||
      regions.some(o=>o.boxes[0].x0<l.x0&&overlapY(o.boxes[0],bounds(l)))));
  const formulas=[];
  for(const o of [...regions]) {
    const r=o.boxes[0], own=anchors.filter(l=>overlapY(r,bounds(l))&&r.x0<l.x0).sort((a,b)=>a.y0-b.y0);
    if(!own.length)continue;
    const grid=buildGrid([r.x0,r.top,r.x1,r.bottom],page.rulings||[],page.words||[],page.graphics||[]);
    const gridEnd=grid.rowEdges.length>=2&&grid.colEdges.length>=2?grid.rowEdges.at(-1):null;
    const below=gridEnd!==null&&own.every(l=>l.y0>gridEnd);
    regions.splice(regions.indexOf(o),1);
    if(below)regions.push({...o,boxes:[{...r,bottom:gridEnd}]});
    for(let i=0;i<own.length;i++) {
      const l=own[i];
      // Empty gap between adjacent anchor bands. Prefer the independent graphics
      // extents when extraction retained them; otherwise use the midpoint.
      const cut=(a,b)=>{
        const gs=(page.graphics||[]).map(g=>g.box).filter(b=>b[0]>=r.x0-2&&b[2]<=r.x1+2&&b[1]>=r.top-2&&b[3]<=r.bottom+2);
        const above=gs.filter(g=>g[1]<a.y1), below=gs.filter(g=>g[3]>b.y0);
        const end=Math.max(a.y1,...above.map(g=>g[3])),start=Math.min(b.y0,...below.map(g=>g[1]));
        return end<start?(end+start)/2:(a.y1+b.y0)/2;
      };
      const part={...r,top:i?cut(own[i-1],l):below?(gridEnd+l.y0)/2:r.top,bottom:i+1<own.length?cut(l,own[i+1]):r.bottom};
      formulas.push({...union([part,bounds(l)]),page:l.page});
    }
  }
  for(const l of anchors) {
    if(formulas.some(r=>overlapY(r,bounds(l))))continue;
    // Overlapping/touching glyph boxes, allowing only 10% of the number's
    // height for extraction rounding. Ordinary baseline gaps stop the flood.
    let band=bounds(l), members=[];
    const candidates=usable.filter(x=>x!==l&&x.x1<l.x0&&x.x1-x.x0<0.8*(right-left));
    for(let changed=true;changed;) {
      changed=false;
      for(const x of candidates)if(!members.includes(x)&&x.y0<=band.bottom+(l.y1-l.y0)*0.1&&x.y1>=band.top-(l.y1-l.y0)*0.1) {
        members.push(x);band=union([band,bounds(x)]);changed=true;
      }
    }
    if(members.length) {
      // Fraction/root strokes can extend past glyph bounds. Include nearby
      // horizontal rulings within one number height; they add no text members.
      const body=union(members.map(bounds)),height=l.y1-l.y0;
      const strokes=(page.rulings||[]).filter(s=>s.axis==='h' && s.a<body.x1 && s.b>body.x0 && s.pos>=body.top-height && s.pos<=body.bottom+height);
      for(const s of strokes) band=union([band,{x0:s.a,top:s.pos-0.5,x1:s.b,bottom:s.pos+0.5}]);
      formulas.push({...band,page:l.page});
    }
  }
  for(const r of formulas)regions.push({kind:'figure',formula:true,page:r.page,text:'',boxes:[r]});
  return formulas;
}
