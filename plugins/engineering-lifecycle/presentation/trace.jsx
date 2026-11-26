
const linkTypes=["allocatedTo","derivedFrom","refinedFrom","realizedBy","verifiedBy","validatedBy","extractedFrom","resultOf","evidenceFor","affectedBy","supersedes"];
function linkDialog(props,source,peer,type="allocatedTo"){
  const rows=props.state.items.filter(i=>!["document","anchor"].includes(i.kind));
  const option = item => [item.id,item.code+" · "+item.title];
  const options=rows.map(option);
  ask(props,"Add trace relationship",[
    fieldSpec("from","Source",source?.id??options[0]?.[0],{options:source&&!rows.some(i=>i.id===source.id)?[option(source),...options]:options}),
    fieldSpec("type","Relationship",type,{options:linkTypes}),
    fieldSpec("to","Target",peer?.id??options.find(([id])=>id!==source?.id)?.[0],{options:peer&&!rows.some(i=>i.id===peer.id)?[option(peer),...options]:options}),
  ],values=>props.mutate({name:"link-add",...values}),"Add relationship","Store one directed relationship. Downstream and upstream views use the same record.");
}
function edgeDialog(props,edge){
  ask(props,"Review "+edge.type,[fieldSpec("comment","Consistency rationale","",{multiline:true})],v=>props.mutate({name:"link-review",link:edge.id,...v}),"Mark reviewed","Confirm that the content of both current revisions supports the intent of this link.");
}
function chooseFocus(state,view){
  return one(state.items,view.id)??state.items.find(i=>i.code==="SYS-042")??state.items.find(i=>i.kind==="system");
}
const graphHeaders=["Source","Extracted","Stakeholder","System","Design / SW / HW","Verification"];
function Explorer(props){
  const {React,ui,invoke,input,state,view,patch,go,readOnly}=props;
  const mode=view.tab||"Graph";
  const focus=chooseFocus(state,view);
  const [edge,setEdge]=React.useState(null);
  const [expanded,setExpanded]=React.useState(false);
  const options={React,ui};
  const data=useResource(React,invoke,"trace",{...input,id:focus?.id,direction:view.direction??"Both directions",depth:view.depth??5,cap:expanded?84:48,process:view.traceProcess||undefined},Boolean(focus&&mode!=="Gaps"));
  const findings=useResource(React,invoke,"gaps",{...input,process:view.process||undefined},mode==="Gaps");
  const detail=useResource(React,invoke,"detail",{...input,id:focus?.id},Boolean(focus));
  const results=state.items.filter(item=>matches(item,view.query)).filter(i=>!view.query||kinds[i.kind]||["document","anchor","change","problem","risk","finding"].includes(i.kind)).slice(0,8);
  const focusOn=id=>{setEdge(null);patch({id,query:""});};
  return <>
    <Heading React={React} title="Traceability Explorer" sub={projectSubtitle(props)+" · Follow source clauses, allocations, executions and evidence."} actions={<><Btn {...options} icon="table" onClick={()=>go("matrix",{id:focus?.id})}>Traceability Matrix</Btn><Btn {...options} primary disabled={readOnly} icon="plus" onClick={()=>linkDialog(props,focus)}>Add relationship</Btn></>}/>
    <div className="ell-split">
      <Panel React={React} title={mode==="Gaps"?"Trace and consistency checks":undefined}>
        <div className="ell-toolbar ell-graph-toolbar">
          <Toggle React={React} label="Traceability view" value={mode} options={["Graph","Lineage","Gaps"]} onChange={tab=>{setEdge(null);patch({tab,page:0});}}/>
          {mode!=="Gaps"&&<><Search React={React} label="Find artifact" value={view.query} onChange={query=>patch({query})}/><Select React={React} hidden label="Trace direction" items={["Both directions","Upstream","Downstream"]} value={view.direction??"Both directions"} onChange={direction=>patch({direction})}/>
          <Select React={React} hidden label="Trace depth" items={[2,3,4,5,6,7,8].map(d=>[String(d),"Depth "+d])} value={String(view.depth??5)} onChange={depth=>patch({depth:Number(depth)})}/>
          <Select React={React} hidden label="Trace process filter" items={[["","All processes"],...state.processes.map(p=>[p.code,p.code])]} value={view.traceProcess} onChange={traceProcess=>patch({traceProcess})}/>
          </>}
          {mode==="Gaps"&&<Select React={React} hidden label="Gap process" items={[["","All processes"],...state.processes.map(p=>[p.code,p.code])]} value={view.process} onChange={process=>patch({process,page:0})}/>}
        </div>
        {mode!=="Gaps"&&view.query&&<div className="ell-find-results" aria-label="Artifact search results">{results.length?results.map(i=><ItemButton React={React} key={i.id} item={i} onClick={()=>focusOn(i.id)}/>):<p>No matching artifacts</p>}</div>}
        {mode==="Gaps"?<Loading {...options} state={findings}>{rows=>{
          const page=view.page??0;
          return <><Table React={React} label="Trace issues" columns={["Artifact","Check","Details"]}>{rows.slice(page*12,(page+1)*12).map((r,k)=><tr key={k}><td><button className="ell-inline-link" onClick={()=>{focusOn(r.id);patch({tab:"Graph"});}}>{r.code}</button></td><td><Badge React={React} text={r.type}/></td><td>{r.detail}</td></tr>)}</Table>{!rows.length&&<Empty {...options} text="No trace gaps in this scope"/>}<Pages {...options} page={page} size={12} total={rows.length} onChange={page=>patch({page})}/></>;
        }}</Loading>:<Loading {...options} state={data}>{result=><>
          {mode==="Graph"?<GraphCanvas {...props} result={result} focus={focus} onFocus={focusOn} selectedEdge={edge} onEdge={setEdge}/>:<Lineage {...props} result={result} focus={focus} onFocus={focusOn}/>}
          <div className="ell-footer"><span>{focus.code+" · "+result.items.length+" artifacts"+(result.truncated?" · more nearby":"")}</span><Btn {...options} onClick={()=>setExpanded(e=>!e)} icon="trace">{expanded?"Reduce artifact limit":"Expand nearby artifacts"}</Btn></div>
        </>}</Loading>}
      </Panel>
      <Panel React={React} className="ell-inspect">
        {edge?<>
          <div className="ell-between"><code>{edge.type}</code><Badge React={React} text={edge.review}/></div>
          <h2>Relationship</h2><Fact React={React} label="Source">{one(state.items,edge.from)?.code}</Fact><Fact React={React} label="Target">{one(state.items,edge.to)?.code}</Fact>
          <Fact React={React} label="Reviewed revisions">{edge.fromRevision+" → "+edge.toRevision}</Fact>
          <div className="ell-stack"><Btn {...options} primary disabled={readOnly} onClick={()=>edgeDialog(props,edge)}>Review consistency</Btn><Btn {...options} disabled={readOnly} onClick={async()=>{if(await props.confirm({title:"Remove relationship?",confirmLabel:"Remove relationship"}))await props.mutate({name:"link-remove",link:edge.id},()=>setEdge(null));}}>Remove relationship</Btn><Btn {...options} onClick={()=>setEdge(null)}>Back to artifact</Btn></div>
        </>:<Loading {...options} state={detail}>{d=><>
          <div className="ell-between"><code>{d.item.code}</code><Badge React={React} text={"Revision "+d.item.revision} tone="neutral"/></div>
          <h2>{d.item.title}</h2><small>{kinds[d.item.kind]??d.item.kind} · {view.release}</small>
          <p className="ell-text">{d.item.body}</p>
          <Fact React={React} label="Owner">{ownerName(state.users,d.item.owner)}</Fact>
          <Fact React={React} label="Linked artifacts">{d.connected.length}</Fact><Fact React={React} label="Needs consistency review">{d.connected.filter(l=>l.review==="Suspect").length}</Fact>
          <Fact React={React} label="Expected links missing">{d.missing.length}</Fact>
          {d.item.execution&&<Fact React={React} label="Historical result">{d.item.execution.result.outcome+" · "+d.item.execution.scope}</Fact>}
          {d.source&&<Fact React={React} label="Source">{d.source.document.split("/").at(-1)+" v"+d.source.version+" · p. "+d.source.page}</Fact>}
          {d.missing.map((link,k)=>link.peer&&<button type="button" key={k} className="ell-warning ell-wide" disabled={readOnly} onClick={()=>linkDialog(props,d.item,link.peer,link.type)}>{link.peer.code+" · Missing "+link.type}</button>)}
          <div className="ell-stack">
            {d.source&&<Btn {...options} primary icon="file" onClick={()=>go("intake",{id:d.source.document,version:d.source.version,docPage:d.source.page,candidate:d.item.id})}>Open source clause</Btn>}
            <Btn {...options} icon="arrow" onClick={()=>props.toItem(d.item)}>Open {kinds[d.item.kind]?.toLowerCase()??"artifact"}</Btn>
            {d.item.evidence&&<Btn {...options} icon="download" onClick={()=>openAsset(props,d.item.id)}>Download evidence file</Btn>}
          </div>
          {d.connected.length>0&&<div className="ell-trace-edge-list"><h3>Relationships</h3>{d.connected.slice(0,7).map(link=><button type="button" key={link.id} onClick={()=>setEdge(link)}><code>{link.peer.code}</code><span>{link.type}</span><Badge React={React} text={link.review}/></button>)}</div>}
        </>}</Loading>}
      </Panel>
    </div>
  </>;
}
function organize(result, focus){
  const incoming=new Set(), outgoing=new Set();
  for(const e of result.edges){
    if(e.to===focus.id)incoming.add(e.from);
    if(e.from===focus.id)outgoing.add(e.to);
  }
  const nodes=[...result.items,...result.missing.filter(e=>!result.items.some(i=>i.id===e.target.id)).map(e=>({...e.target, missing:true}))];
  const grouped=result.columns.map(kinds=>nodes.filter(i=>kinds.includes(i.kind)).sort((a,b)=>{
    const rank=i=>{
      if(kinds.includes("execution")) return kinds.indexOf(i.kind);
      if(i.kind==="architecture")return -4;
      if(i.id===focus.id)return -8;
      if(incoming.has(i.id)||outgoing.has(i.id))return -2;
      return kinds.indexOf(i.kind);
    };
    return rank(a)-rank(b)||a.code.localeCompare(b.code,"en",{numeric:true});
  }));
  return grouped;
}
function GraphCanvas({React,ui,result,focus,onFocus,selectedEdge,onEdge,toItem}){
  const [zoom,setZoom]=React.useState(100);
  const ref=React.useRef(null), dragging=React.useRef(null);
  const id=React.useId().replace(/[^a-z0-9-]/gi,"");
  const groups=organize(result,focus);
  React.useLayoutEffect(()=>{if(ref.current)setZoom(Math.max(55,Math.min(100,Math.floor(ref.current.clientWidth/10))));},[]);
  const width=1000, height=Math.max(472,Math.max(0,...groups.map(g=>g.length))*86+82), viewHeight=540;
  const positions=new Map();
  groups.forEach((children,n)=>children.forEach((i,j)=>positions.set(i.id,{x:14+n*165,y:64+j*84,i})));
  const outgoing=[...result.edges,...result.missing.map(m=>({id:"missing-"+m.from+"-"+m.target.id,from:m.from,to:m.target.id,review:"Missing",type:m.type}))];
  const graphEdge=(edge)=>{
    const from=positions.get(edge.from),to=positions.get(edge.to);
    if(!from||!to)return null;
    const same=from.x===to.x,near=same&&to.y-from.y===84;
    const x1=from.x+(near?70:142),x2=to.x+(near?70:same?142:0),y1=from.y+(near?60:29),y2=to.y+(near?0:29);
    const dx=Math.abs(x2-x1)*.56;
    const path=near?"M"+x1+" "+y1+"V"+y2:same?"M"+x1+" "+y1+"C"+(x1+26)+" "+y1+" "+(x2+26)+" "+y2+" "+x2+" "+y2:
      "M"+x1+" "+y1+"C"+(x1+dx)+" "+y1+" "+(x2-dx)+" "+y2+" "+x2+" "+y2;
    const cls=edge.review==="Missing"?"missing":edge.review==="Suspect"?"suspect":edge.from===focus.id||edge.to===focus.id||edge.type!=="affectedBy"?"selected":"support";
    const text=from.i.code+" "+edge.type+" "+to.i.code+" · "+edge.review;
    return <g key={edge.id} className={"ell-edge "+cls+(selectedEdge?.id===edge.id?" focused":"")}>
      <path className="ell-edge-visible" d={path} markerEnd={cls==="selected"?"url(#arrow-"+id+")":undefined}/>
      {edge.review!=="Missing"&&<path className="ell-edge-hit" d={path} tabIndex={0} role="button" aria-label={text} onClick={()=>onEdge(edge)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onEdge(edge);}}}><title>{text}</title></path>}
    </g>;
  };
  function pointerDown(e){
    if(e.target.closest("button,[role=button],a"))return;
    dragging.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:ref.current.scrollLeft,top:ref.current.scrollTop};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e){
    const s=dragging.current;
    if(s){ref.current.scrollLeft=s.left+s.x-e.clientX;ref.current.scrollTop=s.top+s.y-e.clientY;}
  }
  const scale=zoom/100;
  function fit(){setZoom(Math.max(55,Math.min(100,Math.floor((ref.current?.clientWidth??width)/width*100))));ref.current.scrollTo(0,0);}
  return <div className="ell-graph-shell">
    <div className="ell-graph" ref={ref} tabIndex={0} aria-label="Directed traceability graph" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerCancel={()=>{dragging.current=null;}} onPointerUp={()=>{dragging.current=null;}}>
      <div style={{width:width*scale,height:height*scale,minHeight:viewHeight}}>
        <div className="ell-graph-layout" style={{width,height,transform:"scale("+scale+")"}}>
          <svg width={width} height={height} aria-label="Graph connections"><defs><marker id={"arrow-"+id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0l10 5-10 5z" fill="var(--ell-accent)"/></marker></defs>{outgoing.map(graphEdge)}</svg>
          {graphHeaders.map((label,n)=><span key={label} className="ell-column-heading" style={{left:14+n*165}}>{label}</span>)}
          {[...positions.values()].map(({x,y,i})=><div key={i.id} className="ell-node-wrap" style={{left:x,top:y}}>
            <ui.ContextMenu trigger={<button type="button" className={"ell-node "+(i.missing?"missing":"")} aria-pressed={i.id===focus.id} onClick={()=>onFocus(i.id)} title={i.title}><div><code>{i.code}</code><span className={"ell-state-dot "+(i.missing?"danger":"accent")}/></div><strong>{i.title}</strong><small>{i.missing?"Expected · missing":i.source?"p. "+i.source.page+" · § "+i.source.section:i.execution?.outcome??kinds[i.kind]??i.kind}</small></button>} actions={[{id:"inspect",label:"Focus in graph",icon:null,run:()=>onFocus(i.id)},{id:"open",label:"Open artifact",icon:null,run:()=>toItem(i)}]}/>
          </div>)}
        </div>
      </div>
    </div>
    <div className="ell-graph-bottom"><div className="ell-inline">{[["Trace link","accent"],["Suspect","warning"],["Missing","danger"],["Management","neutral"]].map(([text,tone])=><Badge React={React} key={text} text={text} tone={tone}/>)}</div><div className="ell-zoom">
      <button type="button" className="ell-minimap" aria-label="Go to graph center" onClick={()=>ref.current.scrollTo({left:ref.current.scrollWidth/4,top:ref.current.scrollHeight/4})}><svg viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none">{[...positions.values()].map(({x,y,i})=><rect key={i.id} x={x} y={y} rx="4" width="142" height="53" fill={i.id===focus.id?"var(--ell-accent)":"var(--ell-line)"}/>)}</svg></button>
      <button type="button" aria-label="Zoom out" disabled={zoom<=55} onClick={()=>setZoom(v=>Math.max(55,v-15))}>−</button><button type="button" aria-label="Fit graph" onClick={fit}>{zoom}%</button><button type="button" aria-label="Zoom in" disabled={zoom>=175} onClick={()=>setZoom(v=>Math.min(175,v+15))}>+</button>
    </div></div>
  </div>;
}
function Lineage({React,ui,result,focus,onFocus,state,go}){
  const [filters,setFilters]=React.useState({});
  const [folded,setFolded]=React.useState([]);
  const groups=organize(result,focus);
  const segments=[["Covered","accent",state.metrics.trace.n],["Needs links","danger",state.metrics.trace.d-state.metrics.trace.n]];
  const unit=62/Math.max(1,state.metrics.trace.d);
  return <>
    <div className="ell-lineage">{groups.map((items,n)=><section key={n}>
      <button type="button" className="ell-lineage-head" onClick={()=>setFolded(f=>f.includes(n)?f.filter(j=>j!==n):[...f,n])} aria-expanded={!folded.includes(n)}><strong>{graphHeaders[n]}</strong><span>{items.length}</span></button>
      {!folded.includes(n)&&<><input type="search" value={filters[n]??""} onChange={e=>setFilters(f=>({...f,[n]:e.target.value}))} aria-label={"Filter "+graphHeaders[n]} placeholder="Filter"/>
        <div>{items.filter(i=>matches(i,filters[n])).map(i=><button type="button" className="ell-record" aria-pressed={i.id===focus.id} key={i.id} onClick={()=>onFocus(i.id)}><code>{i.code}</code><strong>{i.title}</strong><small>{i.missing?"Expected · missing":kinds[i.kind]??i.kind}</small></button>)}</div></>}
    </section>)}</div>
    <div className="ell-flow"><div><h3>Release flow</h3><small>Requirements with declared trace expectations</small></div>
      <svg viewBox="0 0 450 82" role="img" aria-label="Aggregated trace flow">
        <text x="1" y="36">Applicable</text>
        {segments.map(([label,tone,n],i)=>{const a=i?state.metrics.trace.n*unit:0, h=n*unit,b=i?58:12;return <g key={label} className={tone} tabIndex={0} role="button" aria-label={label+" "+n} onClick={()=>go(i?"trace":"matrix",i?{tab:"Gaps"}:{})} onKeyDown={e=>{if(e.key==="Enter")go(i?"trace":"matrix",i?{tab:"Gaps"}:{});}}>
          <path d={"M62 "+(8+a)+"C150 "+(8+a)+" 172 "+b+" 280 "+b+"V"+(b+h)+"C172 "+(b+h)+" 150 "+(8+a+h)+" 62 "+(8+a+h)+"Z"}/><text x="295" y={b+10}>{label+" · "+n}</text></g>;})}
      </svg>
    </div>
  </>;
}
const matrixPresets=[
  ["Stakeholder → System","stakeholder","system","derivedFrom"],
  ["System → Architecture","system","architecture","allocatedTo"],
  ["System → Software","system","software","derivedFrom"],
  ["System → Hardware","system","hardware","derivedFrom"],
  ["Software → Architecture","software","architecture","allocatedTo"],
  ["Requirements → Measures","system","measure","verifiedBy"],
  ["Measures → Results","measure","execution","resultOf"],
];
const cellSymbols={Linked:"●",Suspect:"!",Reviewed:"✓",Missing:"×","Not applicable":"·"};
function MatrixView(props){
  const {React,ui,invoke,input,view,patch,go,readOnly,exportReport}=props;
  const p=matrixPresets.find(tuple=>tuple[0]===view.preset)??matrixPresets[1];
  const [name,defFrom,defTo,defType]=p;
  const [cell,setCell]=React.useState(null);
  const from=view.matrixFrom||defFrom,to=view.matrixTo||defTo,type=view.matrixType||defType;
  const rowStart=view.matrixRow??0,colStart=view.matrixCol??0;
  const result=useResource(React,invoke,"matrix",{...input,from,to,type,rowStart,colStart,query:view.query,onlyGaps:view.onlyGaps});
  const options={React,ui};
  const data=result.value, selection=cell&&data?data.rows.find(r=>r.id===cell.from)&&data.cols.find(c=>c.id===cell.to)?cell:null:null;
  const selectedFrom=data?.rows.find(row=>row.id===selection?.from),selectedTo=data?.cols.find(col=>col.id===selection?.to);
  const selectedState=selectedFrom&&selectedTo?data.cells[data.rows.indexOf(selectedFrom)][data.cols.indexOf(selectedTo)]:null;
  function scope(next){setCell(null);patch({matrixRow:0,matrixCol:0,...next});}
  return <>
    <Heading React={React} title="Traceability Matrix" sub={projectSubtitle(props)+" · Trace existence and relationship consistency."} actions={<><Btn {...options} onClick={()=>go("trace",{id:view.id})} icon="trace">Explorer</Btn><Btn {...options} primary onClick={()=>exportReport("matrix")} icon="download">Export trace CSV</Btn></>}/>
    <div className="ell-split">
      <Panel React={React} title={kinds[from]+" ↔ "+kinds[to]} sub={data?data.rowCount+" source artifacts · "+data.colCount+" targets":undefined}>
        <div className="ell-toolbar"><Select React={React} hidden label="Matrix preset" value={name} items={matrixPresets.map(([n])=>n)} onChange={preset=>scope({preset,matrixFrom:"",matrixTo:"",matrixType:""})}/><Search React={React} label="Filter matrix rows" value={view.query} onChange={query=>scope({query})}/><button className="ell-toggle-plain" type="button" aria-pressed={Boolean(view.onlyGaps)} onClick={()=>scope({onlyGaps:!view.onlyGaps})}>Gaps only</button></div>
        <div className="ell-toolbar"><Select React={React} hidden label="Row artifact type" value={from} items={Object.entries(kinds)} onChange={matrixFrom=>scope({matrixFrom})}/><Select React={React} hidden label="Column artifact type" value={to} items={Object.entries(kinds)} onChange={matrixTo=>scope({matrixTo})}/><Select React={React} hidden label="Relationship type" value={type} items={linkTypes} onChange={matrixType=>scope({matrixType})}/></div>
        <Loading {...options} state={result}>{d=><>
          <Table React={React} label="Traceability matrix" columns={["Source / target",...d.cols.map(c=><code title={c.title} key={c.id}>{c.code}</code>)]}>{d.rows.map((row,i)=><tr key={row.id} data-selected={row.id===selectedFrom?.id}><th scope="row"><ItemButton React={React} item={row} onClick={()=>go("trace",{id:row.id})}/></th>{d.cells[i].map((entry,j)=>{
            const col=d.cols[j], picked=row.id===selectedFrom?.id&&col.id===selectedTo?.id;
            return <td className="ell-matrix-td" key={col.id}><button type="button" aria-pressed={picked} className={"ell-cell "+statusTone(entry.state)} aria-label={row.code+" → "+col.code+" · "+entry.state} title={entry.state} onClick={()=>setCell({from:row.id,to:col.id})}>{cellSymbols[entry.state]}</button></td>;
          })}</tr>)}</Table>
          {(!d.rows.length||!d.cols.length)&&<Empty {...options} text="No artifacts for this matrix scope"/>}
          <div className="ell-footer"><div className="ell-inline">{Object.entries(cellSymbols).map(([label,symbol])=><small key={label} className={"ell-legend-factor "+statusTone(label)}>{symbol+" "+label}</small>)}</div></div>
          <div className="ell-matrix-paging"><Pages {...options} page={Math.floor(rowStart/12)} size={12} total={d.rowCount} onChange={n=>{setCell(null);patch({matrixRow:n*12});}}/><Pages {...options} page={Math.floor(colStart/9)} size={9} total={d.colCount} onChange={n=>{setCell(null);patch({matrixCol:n*9});}}/></div>
        </>}</Loading>
      </Panel>
      <Panel React={React} className="ell-inspect">
        {selectedState?<><div className="ell-between"><code>{selectedFrom.code+" → "+selectedTo.code}</code><Badge React={React} text={selectedState.state}/></div><h2>{selectedTo.title}</h2><Fact React={React} label="Relationship">{type}</Fact><Fact React={React} label="Source revision">{selectedFrom.revision}</Fact><Fact React={React} label="Target revision">{selectedTo.revision}</Fact>
          <div className="ell-stack">{selectedState.link?<Btn {...options} primary disabled={readOnly} onClick={()=>edgeDialog(props,{id:selectedState.link,type})}>Review consistency</Btn>:<Btn {...options} primary disabled={readOnly} icon="plus" onClick={()=>linkDialog(props,selectedFrom,selectedTo,type)}>Add relationship</Btn>}
          <Btn {...options} icon="trace" onClick={()=>go("trace",{id:selectedFrom.id})}>Explore source path</Btn><Btn {...options} onClick={()=>props.toItem(selectedTo)}>Open target</Btn></div></>:<Empty {...options} text="Select a matrix cell" details="Inspect the relationship or create an expected link."/>}
      </Panel>
    </div>
  </>;
}
