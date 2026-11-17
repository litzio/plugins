import {connectorBands} from './link-geometry.mjs';
const ns='http://www.w3.org/2000/svg';
export default function SourceLinks({React,controller,layout,pane,preview,mapping,sources,selection,stale,colors,onSelect,pageWidth}) {
  const svg=React.useRef(null),latest=React.useRef(null);
  latest.current={mapping,sources,selection,stale,colors,onSelect,pageWidth};
  React.useLayoutEffect(()=>{controller.current?.refresh();});
  React.useLayoutEffect(()=>{
    const root=svg.current,nodes=new Map();let frame=0,hoverId=null,hoverPath=null,bandHover=null;
    const region=()=>preview.current?.querySelector('[role="region"]');
    function draw(){
      frame=0;const current=latest.current,view=region(),source=pane.current,report=layout.current;
      if(!view||!source||!current.mapping||current.stale||report?.revision!==current.mapping.revision||!report.blocks.length){root.replaceChildren();nodes.clear();return;}
      const gutter=root.parentElement.getBoundingClientRect(),from=source.getBoundingClientRect(),to=view.getBoundingClientRect();
      if(from.right>=to.left || Math.abs(from.top-to.top)>10){root.replaceChildren();nodes.clear();return;}
      const documentOffset=to.top+view.clientTop-from.top-source.clientTop, height=Math.max(source.clientHeight,view.clientHeight+documentOffset),width=gutter.width;
      root.style.top=(from.top+source.clientTop-gutter.top)+'px';root.style.height=height+'px';root.style.left=-source.offsetWidth+'px';root.style.width=(source.offsetWidth+width)+'px';root.setAttribute('viewBox',`${-source.offsetWidth} 0 ${source.offsetWidth+width} ${height}`);
      const bands=connectorBands({sources:current.sources,documentBlocks:report.blocks,sourceScroll:source.scrollTop,sourceHeight:source.clientHeight,documentHeight:report.height,width,selected:new Set(current.selection),hoverId:bandHover||hoverId,hoverPath,sourceRightEdge:source.offsetWidth-source.clientWidth+current.pageWidth,documentOffset});
      const keep=new Set();
      for(const band of bands){
        keep.add(band.key);let node=nodes.get(band.key);
        if(!node){node=document.createElementNS(ns,'path');node.dataset.linkSource=band.b.id;node.style.pointerEvents='none';root.append(node);nodes.set(band.key,node);}
        node._block=band.b;node.setAttribute('d',band.d);node.dataset.linkKey=band.key;node.dataset.emphasis=band.emphasis;node.dataset.direction=band.direction||'both';
        node.dataset.leftTop=band.left[0];node.dataset.leftBottom=band.left[1];node.dataset.rightTop=band.right[0];node.dataset.rightBottom=band.right[1];
        const active=band.emphasis!=='quiet',color='var(--id-color-'+(band.b.warning?'warning':(current.colors[band.b.kind]||'info'))+')';
        node.setAttribute('fill',color);node.setAttribute('stroke',color);node.setAttribute('fill-opacity',active?(band.emphasis==='hover'?'.16':'.12'):'.025');node.setAttribute('stroke-opacity',active?'.8':band.b.warning?'.2':'.09');node.setAttribute('stroke-width',active?'1.2':'.6');
      }
      for(const [key,node] of nodes)if(!keep.has(key)){node.remove();nodes.delete(key);}
      // Draw quiet bands first; active bands stay easy to point at where paths cross.
      for(const band of bands)if(band.emphasis!=='quiet')root.append(nodes.get(band.key));
    }
    function refresh(){if(!frame)frame=requestAnimationFrame(draw);}
    const api={refresh,layout(){cancelAnimationFrame(frame);draw();},source(id){hoverId=id;hoverPath=null;refresh();},document(event){
      const view=region(),report=layout.current;if(!view||!report)return;
      const y=event.clientY-view.getBoundingClientRect().top-view.clientTop;
      hoverPath=report.blocks.find(b=>b.top<=y&&b.bottom>=y)?.path.join('.')||null;hoverId=null;refresh();
    },leaveDocument(){hoverPath=null;refresh();}};
    controller.current=api;
    const host=root.parentElement;
    function hit(event){const p=root.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const transform=root.getScreenCTM();if(!transform)return null;const local=p.matrixTransform(transform.inverse());return [...root.children].reverse().find(node=>node._block&&(node.isPointInFill(local)||node.isPointInStroke(local)));}
    const click=e=>{const node=hit(e);if(node)latest.current.onSelect(node._block);};
    const over=e=>{const node=hit(e),id=node?node._block.id:null;if(id!==bandHover){bandHover=id;host.style.cursor=id?'pointer':'';refresh();}};
    const out=()=>{bandHover=null;host.style.cursor='';refresh();};
    host.addEventListener('click',click);host.addEventListener('pointermove',over);host.addEventListener('pointerleave',out);
    pane.current?.addEventListener('scroll',refresh,{passive:true});window.addEventListener('resize',refresh);window.addEventListener('scroll',refresh,true);
    const observer=new ResizeObserver(refresh);for(const el of [root.parentElement,pane.current,preview.current])if(el)observer.observe(el);
    refresh();
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();pane.current?.removeEventListener('scroll',refresh);window.removeEventListener('resize',refresh);window.removeEventListener('scroll',refresh,true);host.removeEventListener('click',click);host.removeEventListener('pointermove',over);host.removeEventListener('pointerleave',out);controller.current=null;};
  },[]);
  return <div data-link-gutter style={{position:'relative',minWidth:0}}><svg ref={svg} data-source-links aria-hidden="true" style={{position:'absolute',left:0,width:'100%',height:760,overflow:'hidden',pointerEvents:'none'}}/></div>;
}
