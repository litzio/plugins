// Coordinates are viewport CSS pixels, independently clipped in each pane.
export function ribbonPath(width, leftTop, leftBottom, rightTop, rightBottom, lead=0) {
  const mid=width/2, f=n=>Math.round(n*100)/100;
  return `${lead?'M'+f(-lead)+' '+f(leftTop)+' L0':'M0'} ${f(leftTop)} C${f(mid)} ${f(leftTop)} ${f(mid)} ${f(rightTop)} ${f(width)} ${f(rightTop)} L${f(width)} ${f(rightBottom)} C${f(mid)} ${f(rightBottom)} ${f(mid)} ${f(leftBottom)} 0 ${f(leftBottom)}${lead?' L'+f(-lead)+' '+f(leftBottom):''} Z`;
}
const intersects=(top,bottom,height)=>bottom>0&&top<height;
const clipped=(top,bottom,height)=>[Math.max(0,top),Math.min(height,bottom)];
const exit=(above,height)=>above?[-10,-6]:[height+6,height+10];
export function connectorBands({sources,documentBlocks,sourceScroll,sourceHeight,documentHeight,width,selected=new Set(),hoverId=null,hoverPath=null,sourceRightEdge=0,documentOffset=0}) {
  if(!documentBlocks.length)return [];
  const visible=new Map(documentBlocks.map(x=>[x.path.join('.'),x]));
  const first=documentBlocks[0].path[0],last=documentBlocks.at(-1).path[0];
  return sources.flatMap(({b,top,bottom,right:sourceRight},i)=>{
    const key=b.path.join('.'),doc=visible.get(key),sourceTop=top-sourceScroll,sourceBottom=bottom-sourceScroll;
    const leftVisible=intersects(sourceTop,sourceBottom,sourceHeight),rightVisible=!!doc;
    const emphasis=hoverId===b.id||hoverPath===key?'hover':selected.has(b.id)?'selected':'quiet';
    if(!(leftVisible&&rightVisible)&&(!(leftVisible||rightVisible)||emphasis==='quiet'))return [];
    let left,right,direction;
    if(leftVisible)left=clipped(sourceTop,sourceBottom,sourceHeight);
    else {direction=sourceBottom<=0?'source-above':'source-below';left=exit(sourceBottom<=0,sourceHeight);}
    if(doc)right=clipped(doc.top,doc.bottom,documentHeight).map(y=>y+documentOffset);
    else {
      if(b.path[0]>=first&&b.path[0]<=last)return [];
      direction=b.path[0]<first?'document-above':'document-below';right=exit(b.path[0]<first,documentHeight).map(y=>y+documentOffset);
    }
    return [{key:b.id+':'+i,b,emphasis,direction,left,right,d:ribbonPath(width,...left,...right,leftVisible&&Number.isFinite(sourceRight)?Math.max(0,sourceRightEdge-sourceRight):0)}];
  });
}
export const browseScales=[1,.75,.5,.4];
export function steppedScale(value,delta) {
  const index=Math.max(0,browseScales.indexOf(value));
  return browseScales[Math.max(0,Math.min(browseScales.length-1,index+(delta>0?1:-1)))];
}
