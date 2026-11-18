import { renderPage, cancelRender, renderFailed } from "./page-render.mjs";
function ShortcutButton({React,ui,hint,children,...props}) {
  const [visible,setVisible]=React.useState(false),id=React.useId();
  return <span style={{position:'relative'}} onMouseEnter={()=>setVisible(true)} onMouseLeave={()=>setVisible(false)} onFocus={()=>setVisible(true)} onBlur={()=>setVisible(false)}>
    <ui.Button {...props} title={hint} aria-describedby={visible?id:undefined}>{children}</ui.Button>
    {visible&&<span id={id} role="tooltip" className="type-helper" style={{position:'absolute',left:0,top:'100%',whiteSpace:'nowrap',background:'var(--id-color-surface)',color:'var(--id-color-text)',padding:'var(--space-2)',border:'1px solid var(--id-color-border)',zIndex:2}}>{hint}</span>}
  </span>;
}

const thumbnailWidth = 128;

function ExcludedMark({React}) {
  return <svg aria-hidden="true" viewBox="0 0 400 500" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',color:'var(--id-color-danger)',opacity:0.55}}>
    <g transform="translate(200 250) rotate(-35) scale(5)"><text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill="currentColor" style={{color:"var(--id-color-danger)"}} className="type-screen-title">제외</text></g>
  </svg>;
}

function Thumbnail({React, pdf, index, root, enqueue}) {
  const canvas = React.useRef(null), finished = React.useRef(false);
  const [near, setNear] = React.useState(false), [ready, setReady] = React.useState(false), [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    const observer = new IntersectionObserver(entries => setNear(entries[0].isIntersecting), {root:root.current, rootMargin:'300px'});
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [root]);
  React.useEffect(() => {
    if (!near || finished.current) return;
    let cancelled = false, c = null;
    const cancel = enqueue(async () => {
      const page = await pdf.getPage(index + 1);
      c = canvas.current;
      if (cancelled || !c) return;
      const viewport = page.getViewport({scale:thumbnailWidth / pdf.pageSizes[index].width});
      if (await renderPage(c, page, viewport, () => cancelled) && !cancelled) {
        finished.current = true; setReady(true); setFailed(false);
      }
    }, e => {if (renderFailed(e, cancelled)) setFailed(true);});
    return () => {cancelled=true; cancel(); cancelRender(c);};
  }, [near, pdf, index, enqueue]);
  // A failed thumbnail says so in its own place and tries again when it comes near the view again.
  return <>
    <canvas ref={canvas} data-thumbnail={index+1} data-ready={ready} width={0} height={0}
      style={{display:'block',width:thumbnailWidth,height:thumbnailWidth*pdf.pageSizes[index].height/pdf.pageSizes[index].width}} />
    {failed && <span className="type-helper" style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',color:'var(--id-color-danger)'}}>그리지 못했습니다</span>}
  </>;
}

function LargePage({React, ui, pdf, index}) {
  const canvas=React.useRef(null), container=React.useRef(null);
  const [width,setWidth]=React.useState(0), [failed,setFailed]=React.useState(false), [attempt,setAttempt]=React.useState(0);
  React.useEffect(()=>{
    const observer=new ResizeObserver(entries=>setWidth(Math.min(850,entries[0].contentRect.width)));
    observer.observe(container.current); return ()=>observer.disconnect();
  },[]);
  React.useEffect(()=>{
    if(!width)return;
    let gone=false, c=null;
    (async()=>{
      const page=await pdf.getPage(index+1);c=canvas.current;if(gone||!c)return;
      if(await renderPage(c,page,page.getViewport({scale:width/pdf.pageSizes[index].width}),()=>gone)&&!gone)setFailed(false);
    })().catch(e=>{if(renderFailed(e,gone))setFailed(true);});
    return ()=>{gone=true;cancelRender(c);};
  },[pdf,index,width,attempt]);
  return <div ref={container} style={{width:'100%',position:'relative'}}><canvas ref={canvas} data-large-page={index+1} style={{display:'block',width:'100%',maxWidth:850,marginInline:'auto'}} />
    {failed&&<div data-page-render-failed style={{position:'absolute',top:'var(--space-4)',left:'var(--space-4)',right:'var(--space-4)',zIndex:1}}>
      <ui.Notice tone="error">이 쪽을 그리지 못했습니다. <ui.Button onClick={()=>setAttempt(n=>n+1)}>다시 그리기</ui.Button></ui.Notice>
    </div>}
  </div>;
}

export default function PagePicker({React, ui, pdf, titles, excluded, toggle, busy}) {
  const root=React.useRef(null), scroll=React.useRef(0), origin=React.useRef(null), largeControls=React.useRef(null);
  const [expanded,setExpanded]=React.useState(null), [help,setHelp]=React.useState('');
  // Only two nearby thumbnails render concurrently. Completed canvases stay mounted;
  // leaving the viewport cancels queued and in-flight work, not completed pictures.
  const enqueue=React.useMemo(()=>{
    let active=0;const waiting=[];
    function pump(){
      while(active<2 && waiting.length){
        const job=waiting.shift();if(job.cancelled)continue;
        active++;
        Promise.resolve().then(job.run).catch(job.error).finally(()=>{active--;pump();});
      }
    }
    return (run,error)=>{const job={run,error,cancelled:false};waiting.push(job);pump();return ()=>{job.cancelled=true;};};
  },[pdf]);
  React.useEffect(()=>{root.current.querySelector('[data-page-toggle]')?.focus({preventScroll:true});},[]);
  function open(index){scroll.current=root.current.scrollTop;origin.current=index;setHelp('');setExpanded(index);}
  function close(){setExpanded(null);requestAnimationFrame(()=>{if(!root.current)return;root.current.scrollTop=scroll.current;root.current.querySelector('[data-page-toggle="'+(origin.current+1)+'"]')?.focus({preventScroll:true});});}
  React.useEffect(()=>{
    if(expanded!==null && (!largeControls.current.contains(document.activeElement) || document.activeElement.disabled))
      largeControls.current.querySelector('button:not(:disabled)')?.focus();
  },[expanded]);
  React.useEffect(()=>{
    if(expanded===null)return;
    const main=largeControls.current?.closest('main');
    const key=e=>{
      const active=document.activeElement;
      if(!largeControls.current?.getClientRects().length || (active!==document.body&&main&&!main.contains(active)) || e.ctrlKey || e.altKey || e.metaKey)return;
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
        e.preventDefault();setExpanded(n=>n===null?null:Math.max(0,Math.min(pdf.numPages-1,n+(e.key==='ArrowLeft'?-1:1))));
      }
    };
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  },[expanded,pdf.numPages]);
  return <div data-page-picker style={{position:'relative'}}>
    <style>{`
      .pdf-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,128px);gap:var(--space-3);align-items:start}
      .pdf-picker-card{position:relative;width:128px}
      .pdf-picker-toggle{display:block!important;width:100%;height:auto!important;min-height:0!important;padding:0!important;white-space:normal!important;text-align:left!important;border:0!important;background:transparent!important;box-shadow:none!important}
      .pdf-picker-toggle:focus-visible{outline:2px solid var(--id-color-border-focus);outline-offset:3px}
      .pdf-picker-image{position:relative;background:var(--id-color-paper);box-shadow:var(--shadow-paper)}
      .pdf-picker-caption{display:block;padding-block:var(--space-1);color:var(--id-color-text)}
      .pdf-picker-bookmark{display:block;min-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pdf-picker-zoom{position:absolute!important;right:var(--space-1);top:var(--space-1);opacity:0;pointer-events:none}
      .pdf-picker-card:hover .pdf-picker-zoom,.pdf-picker-card:focus-within .pdf-picker-zoom{opacity:1;pointer-events:auto}
    `}</style>
    {help&&<div role="tooltip" className="type-helper" style={{position:'absolute',left:0,top:0,maxWidth:'100%',padding:'var(--space-2)',background:'var(--id-color-surface)',color:'var(--id-color-text)',zIndex:2,pointerEvents:'none'}}>{help}</div>}
    <div ref={root} data-page-grid-scroll style={{display:expanded===null?'block':'none',height:'min(72vh,850px)',overflow:'auto',padding:'var(--space-2)'}}>
      <div className="pdf-picker-grid">
        {pdf.pageSizes.map((size,i)=><div key={i} className="pdf-picker-card">
          <ui.Button variant="ghost" className="pdf-picker-toggle" data-page-toggle={i+1} disabled={busy} aria-pressed={excluded.has(i+1)}
            aria-label={(i+1)+'쪽'+(titles[i]?' · '+titles[i]:'')+' · '+(excluded.has(i+1)?'제외됨':'포함됨')}
            onClick={e=>toggle(i+1,e.shiftKey)}
            onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)toggle(i+1,e.shiftKey);}}}
            onMouseEnter={()=>setHelp(titles[i]||'')} onMouseLeave={()=>setHelp('')} onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))setHelp(titles[i]||'');}} onBlur={()=>setHelp('')}>
            <div className="pdf-picker-image" style={{outline:excluded.has(i+1)?'2px solid var(--id-color-danger)':undefined,outlineOffset:-2}}>
              <div style={{opacity:excluded.has(i+1)?0.4:1}}><Thumbnail React={React} pdf={pdf} index={i} root={root} enqueue={enqueue}/></div>
              {excluded.has(i+1)&&<ExcludedMark React={React}/>}
            </div>
            <span className="pdf-picker-caption type-helper"><span style={{display:'block'}}>{i+1}쪽</span><span className="pdf-picker-bookmark" aria-hidden={!titles[i]}>{titles[i]||' '}</span></span>
          </ui.Button>
          <ui.Button className="pdf-picker-zoom" aria-label={(i+1)+'쪽 크게 보기'} title="크게 보기" disabled={busy} onClick={()=>open(i)}
            onMouseEnter={()=>setHelp((i+1)+'쪽 크게 보기')} onMouseLeave={()=>setHelp('')}
            onFocus={()=>setHelp((i+1)+'쪽 크게 보기')} onBlur={()=>setHelp('')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/></svg>
          </ui.Button>
        </div>)}
      </div>
    </div>
    {expanded!==null&&<div ref={largeControls} data-large-view>
      <ui.Toolbar>
        <span className="type-item-name">{expanded+1} / {pdf.numPages}쪽{titles[expanded]?' · '+titles[expanded]:''}</span>
        <ShortcutButton React={React} ui={ui} hint="이전 쪽 · ←" disabled={expanded===0} onClick={()=>setExpanded(n=>n-1)}>이전 쪽</ShortcutButton>
        <ShortcutButton React={React} ui={ui} hint="다음 쪽 · →" disabled={expanded===pdf.numPages-1} onClick={()=>setExpanded(n=>n+1)}>다음 쪽</ShortcutButton>
        <ui.Button disabled={busy} onClick={e=>toggle(expanded+1,e.shiftKey)}>{excluded.has(expanded+1)?'포함':'제외'}</ui.Button>
        <ShortcutButton React={React} ui={ui} hint="닫기 · Esc" onClick={close}>닫기</ShortcutButton>
      </ui.Toolbar>
      <div style={{height:'min(68vh,820px)',overflow:'auto',background:'var(--id-color-canvas)',padding:'var(--space-3)'}}>
        <div style={{position:'relative',maxWidth:850,marginInline:'auto',outline:excluded.has(expanded+1)?'2px solid var(--id-color-danger)':undefined}}>
          <div style={{opacity:excluded.has(expanded+1)?0.4:1}}><LargePage key={expanded} React={React} ui={ui} pdf={pdf} index={expanded}/></div>
          {excluded.has(expanded+1)&&<ExcludedMark React={React}/>}
        </div>
      </div>
    </div>}
  </div>;
}
