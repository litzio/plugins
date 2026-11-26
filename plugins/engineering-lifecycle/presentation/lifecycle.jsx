
function MiniV({React,processes}) {
  const points=[[64,42],[124,67],[184,93],[244,119],[304,93],[364,67],[424,42]];
  const relevant=["SYS.1","SYS.2","SYS.3","SWE.3","SWE.5","SYS.4","SYS.5"];
  return <svg className="ell-mini" viewBox="0 0 490 150" aria-label="Mini V-Cycle" role="img">
    <path d="M64 42L124 67 184 93 244 119 304 93 364 67 424 42M64 42H424M124 67H364M184 93H304" fill="none" stroke="var(--ell-line)"/>
    {points.map(([x,y],n)=>{const state=processes.find(p=>p.code===relevant[n])?.state??"Ready";return <circle key={n} cx={x} cy={y} r="7" className={statusTone(state)}><title>{relevant[n]+" · "+state}</title></circle>;})}
    <text x="56" y="22">ENGINEERING</text><text x="360" y="22">VERIFICATION</text>
  </svg>;
}
function Portfolio({React,ui,home,open}) {
  const options={React,ui};
  return <>
    <Heading React={React} title="Project Portfolio" sub="Compare release progress, trace coverage and verification across two demo projects."/>
    <div className="ell-grid">
      {home.projects.map(project=><Panel key={project.id} React={React} className="ell-project">
        <div className="ell-project-head"><div className="ell-inline"><code>{project.id}</code><Badge React={React} text={project.latest} tone="neutral"/></div><Badge React={React} text={project.id==="OBC-22"?"Engineering underway":"Release preparation"} tone={project.id==="OBC-22"?"accent":"success"}/></div>
        <div className="ell-project-title"><button type="button" onClick={()=>open(project.id)}>{project.name}</button><div>{project.type+" · "+project.customer}<span>{ownerName(home.users,project.owner)}</span></div></div>
        <div className="ell-mini-wrap"><strong>Lifecycle activity</strong><MiniV React={React} processes={project.preview}/></div>
        <div className="ell-project-metrics">{[["Deliverables",project.metrics.deliverables,"approved"],["Trace coverage",project.metrics.trace,"requirements"],["Execution coverage",project.metrics.execution,"measures"]].map(([label,ratio,unit])=><div key={label}><Metric React={React} label={label} ratio={ratio} note={ratio.n+" / "+ratio.d+" "+unit}/><Bar React={React} value={percent(ratio)} label={label}/></div>)}</div>
        <div className="ell-pad">
          <Fact React={React} label="Active processes"><span className="ell-inline">{project.active.map(p=><code key={p}>{p}</code>)}</span></Fact>
          <Fact React={React} label="Open issues & risk">{project.metrics.open+" issues · "+project.metrics.risks+" high risks"}</Fact>
          <div className="ell-project-foot"><div><strong>{project.milestone}</strong><small>Next milestone · {project.milestoneDate}</small></div><Btn {...options} primary icon="arrow" onClick={()=>open(project.id)}>Open {project.id}</Btn></div>
        </div>
      </Panel>)}
    </div>
    <Panel React={React} title="Recent changes" sub="Across both projects" className="ell-spaced">
      <div className="ell-grid ell-activity">{home.projects.map(project=><div key={project.id}>{project.activity.slice(0,2).map(i=><div className="ell-row" key={i.id}><Icon React={React} name={i.kind==="change"?"change":"warning"}/><ItemButton React={React} item={i} onClick={()=>open(project.id,i.kind==="change"?"impact":"risks",{id:i.id,tab:i.kind==="problem"?"Problems":""})}/></div>)}</div>)}</div>
    </Panel>
  </>;
}
const positions={"SYS.1":[3,46],"SYS.2":[10,110],"SYS.3":[17,174],"SWE.1":[24,238],"SWE.2":[31,302],"SWE.3":[33.5,366],"SWE.4":[52,366],"SWE.5":[55,302],"SWE.6":[62,238],"SYS.4":[69,174],"SYS.5":[76,110],"VAL.1":[83,46],"HWE.1":[4,444],"HWE.2":[20,444],"HWE.3":[65,444],"HWE.4":[81,444]};
const processCaptions={"SYS.1":"Elicitation","SYS.2":"System requirements","SYS.3":"System architecture","SYS.4":"System integration","SYS.5":"System verification","SWE.1":"SW requirements","SWE.2":"SW architecture","SWE.3":"Detailed design / units","SWE.4":"Unit verification","SWE.5":"SW integration","SWE.6":"SW verification","HWE.1":"HW requirements","HWE.2":"Hardware design","HWE.3":"Verify HW design","HWE.4":"Verify HW requirements","VAL.1":"Product validation"};
const processStates=["Not started","Ready","In progress","In review","Blocked","Completed","Not applicable"];
function Lifecycle(props) {
  const {React,ui,state,view,patch,go,readOnly,mutate}=props;
  const selected=state.processes.find(p=>p.code===view.process)||state.processes[1];
  const map=view.tab!=="By process";
  const [emphasis,setEmphasis]=React.useState("All activity");
  function proc(p,position=false){
    return <button type="button" key={p.code} title={p.label+" · "+p.state} aria-label={p.code+" "+p.label} aria-pressed={p.code===selected.code} className={"ell-process "+(p.state==="Blocked"?"ell-blocked ":"")+((emphasis==="Gaps"&&p.missing>0)?"ell-gap":"")} style={position?{left:positions[p.code][0]+"%",top:positions[p.code][1]}:undefined} onClick={()=>patch({process:p.code})}>
      <div><code>{p.code}</code><span className={"ell-state-dot "+statusTone(p.state)}/></div><strong>{processCaptions[p.code]??p.label}</strong><Bar React={React} value={p.planned?Math.round(100*p.approved/p.planned):0} label={p.code+" deliverables approved"}/></button>;
  }
  function update(){ask(props,"Update "+selected.code,[fieldSpec("state","Process state",selected.state,{options:processStates}),fieldSpec("owner","Process owner",selected.owner,{options:state.users.map(u=>[u.id,u.name])}),fieldSpec("reason","Tailoring or blocking rationale",selected.exclusion??"",{required:false,multiline:true})],values=>mutate({name:"process",code:selected.code,...values}));}
  function destination(){go(selected.route,{process:selected.code,id:selected.code==="SYS.2"?state.items.find(i=>i.code==="SYS-042")?.id:undefined});}
  const planned=selected.planned?Math.round(selected.approved*100/selected.planned):null;
  return <>
    <Heading React={React} title="Interactive V-Cycle" sub={projectSubtitle(props)+" · Navigate concurrent engineering processes."} actions={<Toggle React={React} label="Process highlights" options={["All activity","Gaps"]} value={emphasis} onChange={setEmphasis}/>}/>
    <div className="ell-split">
      <Panel React={React} title={map?"Process map":"Lifecycle lanes"} sub={"Automotive SPICE® "+state.model+" · "+state.processes.filter(p=>p.state!=="Not applicable").length+" applicable processes"} action={<Toggle React={React} label="Lifecycle view" options={["V-Cycle","By process"]} value={map?"V-Cycle":"By process"} onChange={tab=>patch({tab})}/>}>
        {map?<div className="ell-v-scroll"><div className="ell-v">
          <span className="ell-v-label ell-v-left">Requirements & design</span><span className="ell-v-label ell-v-right">Integration & verification</span>
          <svg viewBox="0 0 1000 540" preserveAspectRatio="none" aria-hidden="true">
            <path className="ell-wire" d="M101 74L171 138 241 202 311 266 381 330 407 394 593 394 621 330 691 266 761 202 831 138 901 74"/>
            <path className="ell-wire focus" d="M242 138H758"/>
            <path className="ell-wire dashed" d="M312 202H688"/>
            <path className="ell-wire" d="M382 266H618M452 330H548M180 472H200M342 472H650M792 472H810"/>
          </svg>
          {state.processes.filter(p=>positions[p.code]).map(p=>proc(p,true))}
          <span className="ell-v-label ell-v-hw">Hardware engineering</span>
          <div className="ell-v-legend">{["In progress","In review","Blocked","Completed","Not started"].map(text=><Badge React={React} key={text} text={text}/>)}</div>
        </div></div>:<div className="ell-lanes">{["System","Software","Hardware","Validation"].map(area=><div key={area}><h3>{area}</h3><div>{state.processes.filter(p=>p.area===area).map(p=>proc(p))}</div></div>)}</div>}
        <div className="ell-support"><h3>Management & support</h3><div>{state.processes.filter(p=>!positions[p.code]).map(p=><button type="button" key={p.code} aria-pressed={p.code===selected.code} title={p.label+" · "+p.state} onClick={()=>patch({process:p.code})}><span className={"ell-state-dot "+statusTone(p.state)}/><code>{p.code}</code></button>)}</div></div>
      </Panel>
      <Panel React={React} className="ell-inspect">
        <div className="ell-between"><code>{selected.code}</code><Badge React={React} text={selected.state}/></div><h2>{selected.label}</h2><small>{view.release} · {view.baseline||"Working set"}</small>
        <div className="ell-ring-row"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="21"/><circle cx="26" cy="26" r="21" pathLength="100" strokeDasharray={(planned??0)+" 100"} transform="rotate(-90 26 26)"/><text x="26" y="29">{planned===null?"N/A":planned+"%"}</text></svg><div><strong>Approved deliverables</strong><small>{selected.approved+" of "+selected.planned+" planned"}</small></div></div>
        <Fact React={React} label="Owner">{ownerName(state.users,selected.owner)}</Fact><Fact React={React} label="Review queue">{selected.queued}</Fact><Fact React={React} label="Missing trace / methods">{selected.missing}</Fact><Fact React={React} label="Open problems and gaps">{selected.open}</Fact><Fact React={React} label="Next milestone">{selected.milestone}</Fact><Fact React={React} label="Updated">{plainDate(selected.updated)}</Fact>
        {selected.exclusion&&<p className="ell-warning">{selected.exclusion}</p>}
        <div className="ell-stack"><Btn React={React} ui={ui} primary icon="arrow" disabled={selected.state==="Not applicable"} onClick={destination}>Open {({requirements:"requirements",intake:"customer documents",architecture:"architecture",verification:"verification",planning:"milestone plan",impact:"change requests",risks:"problems and risks",baselines:"baselines"})[selected.route]}</Btn><Btn React={React} ui={ui} disabled={readOnly} onClick={update}>Update process state</Btn><Btn React={React} ui={ui} icon="trace" onClick={()=>go("trace",{process:selected.code,tab:"Gaps"})}>Show trace gaps</Btn></div>
      </Panel>
    </div>
  </>;
}
const projectSubtitle=({project,view})=>project.id+" · "+view.release+(view.baseline?" · "+view.baseline:" · Working set");

function Intake(props){
  const {React,ui,invoke,input,state,view,patch,go,readOnly,mutate}=props;
  const all=state.items.filter(x=>x.kind==="document");
  const list=all.filter(x=>matches(x,view.query));
  const chosen=one(state.items,view.id);
  const fromAnchor=chosen?.source;
  const doc=fromAnchor?one(all,fromAnchor.document):chosen?.kind==="document"?chosen:list[0];
  const selectedVersion=view.version||fromAnchor?.version;
  const contents=useResource(React,invoke,"document",{...input,id:doc?.id,version:selectedVersion},Boolean(doc));
  const loaded=contents.value;
  const selectedReq=loaded?.candidates.find(c=>c.item.id===view.candidate)??loaded?.candidates.find(c=>c.item.code==="CUS-042")??loaded?.candidates[0];
  const source=selectedReq?.anchor;
  const pageNumber=view.docPage??fromAnchor?.page??source?.page??1;
  const selectedPage=loaded?.pages.find(p=>p.number===pageNumber);
  const [compareRevisions,setCompareRevisions]=React.useState(false);
  const prior=doc?.document.revisions.filter(r=>r.version!==loaded?.revision).at(-1);
  const old=useResource(React,invoke,"document",{...input,id:doc?.id,version:prior?.version},Boolean(compareRevisions&&prior&&doc));
  const options={React,ui};
  function setDocument(item) {patch({id:item.id,docPage:undefined,version:undefined,candidate:undefined});setCompareRevisions(false);}
  function disposition(outcome){ask(props,outcome,[fieldSpec("reason","Reason or question","",{multiline:true})],vals=>mutate({name:"intake-disposition",id:selectedReq.item.id,outcome,...vals}));}
  function receive(current){
    return props.task(async()=>{
      const picked=await props.pickPath({kind:"file",extensions:[".pdf",".docx"]});
      if(!picked)return;
      ask(props,current?"Receive a new revision":"Receive a customer document",[
        ...(current?[]:[fieldSpec("title","Document title")]),fieldSpec("version","Document version",current?"":"1.0")
      ],values=>mutate({name:"receive-source",id:current?.id,path:picked.path,...values},()=>{patch({version:undefined,docPage:undefined,candidate:undefined});setCompareRevisions(false);}),"Receive document");
    });
  }
  function anchorExcerpt(){
    ask(props,"Anchor a requirement to source",[
      fieldSpec("page","Source page",String(pageNumber),{type:"number",min:1,max:300}),fieldSpec("section","Section or paragraph"),
      fieldSpec("title","Requirement title"),fieldSpec("quote","Exact source quotation","",{multiline:true})
    ],v=>mutate({name:"anchor-source",id:doc.id,version:loaded.revision,...v,page:Number(v.page)}),"Record source anchor");
  }
  return <>
    <Heading React={React} title="Customer document review" sub={"SYS.1 · "+projectSubtitle(props)} actions={<><Btn {...options} disabled={readOnly} icon="plus" onClick={()=>receive()}>Receive document</Btn>{doc&&<><Btn {...options} disabled={!prior} onClick={()=>setCompareRevisions(s=>!s)}>{compareRevisions?"Close revision comparison":"Compare revisions"}</Btn><Btn {...options} primary icon="download" onClick={()=>openAsset(props,doc.id,loaded?.revision)}>Download original</Btn></>}</>}/>
    <div className="ell-intake">
      <Panel React={React} title="Source documents" sub={all.length+" received"}>
        <div className="ell-toolbar"><Search React={React} label="Find documents" value={view.query} onChange={query=>patch({query})}/></div>
        <div className="ell-doc-list">{list.map(item=><button type="button" aria-pressed={doc?.id===item.id} key={item.id} onClick={()=>setDocument(item)}><Icon React={React} name="file"/><span><strong>{item.title}</strong><small>{item.code+" · v"+item.document.current+" · "+item.document.state}</small></span></button>)}</div>
      </Panel>
      <Panel React={React} className="ell-doc-panel">
        {!doc&&<Empty {...options} text="No matching documents"/>}
        <Loading {...options} state={contents}>{data=><>
          <div className="ell-toolbar"><Select React={React} label="Document version" hidden items={doc.document.revisions.map(r=>[r.version,"v"+r.version])} value={data.revision} onChange={version=>patch({version,docPage:undefined,candidate:undefined})}/><Select React={React} hidden label="Page" items={data.pages.map(p=>[String(p.number),"Page "+p.number+" / "+data.pages.length])} value={String(pageNumber)} onChange={n=>patch({docPage:Number(n)})}/><div className="ell-spacer"/><Badge React={React} text={doc.document.state}/></div>
          {data.imported&&<div className="ell-pad"><small>Recorded extracts · download the original to check page and paragraph positions.</small></div>}
          {data.imported&&!data.pages.length&&<Empty {...options} text="No source excerpts recorded" details="Open the original document then record a page and paragraph."/>}
          {selectedPage&&<div className="ell-pdf-area"><article className="ell-pdf">
            <div className="ell-between"><code>{projectDocumentLabel(props.project)}</code><code>{doc.code} / v{data.revision}</code></div>
            <h2>{doc.title}</h2><small>{props.project.name}</small>
            <h3>{selectedPage.heading}</h3>
            {selectedPage.sections.map(section=><section key={section.code} className={source?.page===pageNumber&&source.section===section.code?"ell-source-highlight":""}>
              <strong>§ {section.code} · {section.title}</strong><p>{section.lines.join(" ")}</p>
            </section>)}
            <footer>{selectedPage.foot}<span>{pageNumber}</span></footer>
          </article></div>}
          {compareRevisions&&<Loading {...options} state={old}>{formerly=>{
            const then=formerly.pages.find(p=>p.number===pageNumber);
            const previous=then?.sections.find(s=>s.code===source?.section)??then?.sections[0], current=selectedPage?.sections.find(s=>s.code===source?.section)??selectedPage?.sections[0];
            return <div className="ell-pad"><h3>Revision comparison</h3><TextDiff React={React} before={previous?.lines.join(" ")??""} after={current?.lines.join(" ")??""} labels={["v"+formerly.revision,"v"+data.revision]}/></div>;
          }}</Loading>}
        </>}</Loading>
      </Panel>
      <Panel React={React} title="Extracted requirements" sub={(loaded?.candidates.length??0)+" in this source revision"} className="ell-intake-results">
        {loaded?.candidates.map(({item,anchor,proposed},k)=><button type="button" className="ell-record" aria-pressed={selectedReq?.item.id===item.id} key={item.id+"-"+k} onClick={()=>patch({candidate:item.id,docPage:anchor.page})}><div className="ell-between"><code>{item.code}</code><Badge React={React} text={proposed?"Proposed revision":item.requirement.applicability}/></div><strong>{item.title}</strong><p>{anchor.quote}</p><small>p. {anchor.page} · § {anchor.section}</small></button>)}
        {loaded&&!loaded.candidates.length&&<Empty {...options} text="No anchored candidates" details="Choose a document revision with extracted requirements."/>}
        {selectedReq&&<div className="ell-stack ell-pad"><Btn {...options} disabled={readOnly} icon="check" onClick={()=>disposition("Applicable")}>Record applicability</Btn><Btn {...options} disabled={readOnly} onClick={()=>disposition("Clarification requested")}>Request clarification</Btn><Btn {...options} disabled={readOnly} onClick={()=>disposition("Agreed")}>Record agreement</Btn><Btn {...options} disabled={readOnly} onClick={()=>disposition("Excluded")}>Exclude with reason</Btn><Btn {...options} primary icon="trace" onClick={()=>go("trace",{id:selectedReq.item.id})}>View lineage</Btn></div>}
        {doc&&<div className="ell-stack ell-pad"><Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Set document workflow",[fieldSpec("stage","Document stage",doc.document.state,{options:["Received","Assigned","Extracted","In review","Clarification requested","Agreed","Approved"]}),fieldSpec("owner","Document owner",doc.owner,{options:state.users.map(u=>[u.id,u.name])})],values=>mutate({name:"document-stage",id:doc.id,...values}))}>Update document workflow</Btn>
          <Btn {...options} disabled={readOnly} onClick={()=>receive(doc)}>Receive new version</Btn>
          {loaded?.imported&&<Btn {...options} disabled={readOnly} onClick={anchorExcerpt}>Record source anchor</Btn>}
        </div>}
      </Panel>
    </div>
  </>;
}
const projectDocumentLabel=project=>project.customer.toUpperCase()+" · ENGINEERING DEMO";
const requirementProcesses={"SYS.1":"stakeholder","SYS.2":"system","SWE.1":"software","HWE.1":"hardware"};
function reviseDialog(props,item){
  const requirement=item.requirement;
  ask(props,"Edit "+item.code,[fieldSpec("title","Title",item.title),fieldSpec("body","Description",item.body,{multiline:true}),fieldSpec("criterion","Acceptance criterion",requirement?.criterion??item.measure?.criterion??"",{multiline:true,required:false}),...(requirement?[fieldSpec("method","Verification method",requirement.method,{required:false})]:[])],values=>props.mutate({name:"revise",id:item.id,...values}));
}
function newRequirement(props,parent){
  const k=parent?.kind==="customer"?"stakeholder":parent?.kind==="stakeholder"?"system":parent?.kind==="system"?"software":parent?.kind??"system";
  ask(props,parent?"Decompose "+parent.code:"New requirement",[
    fieldSpec("kind","Requirement level",k,{options:Object.entries(kinds).filter(([s])=>["customer","stakeholder","system","software","hardware"].includes(s))}),
    fieldSpec("title","Title"),fieldSpec("body","Requirement text","",{multiline:true}),fieldSpec("classification","Classification","Functional",{options:["Functional","Performance","Safety","Interface","Derived"]}),
    fieldSpec("rationale","Derivation rationale","",{multiline:true,required:false}),fieldSpec("method","Verification method","",{required:false}),fieldSpec("criterion","Acceptance criterion","",{multiline:true,required:false}),
  ],values=>props.mutate({name:"new-requirement",parent:parent?.id,...values}));
}
function ItemInspector(props){
  const {React,ui,invoke,input,item,go,toItem,readOnly,mutate}=props;
  const detail=useResource(React,invoke,"detail",{...input,id:item?.id},Boolean(item));
  const [show,setShow]=React.useState("Details");
  const options={React,ui};
  if(!item)return <Panel React={React} className="ell-inspect"><Empty {...options} text="Select an artifact"/></Panel>;
  return <Panel React={React} className="ell-inspect"><div className="ell-between"><code>{item.code}</code><Badge React={React} text={item.review}/></div><h2>{item.title}</h2><small>{kinds[item.kind]??item.kind} · Revision {item.revision}</small>
    <Loading {...options} state={detail}>{data=>{
      const actual=data.item,r=actual.requirement;
      return <>
        <div className="ell-subtabs"><Toggle React={React} label="Artifact details" options={["Details","Links","History"]} value={show} onChange={setShow}/></div>
        {show==="Details"&&<>
          <p className="ell-text">{actual.body}</p>
          <Fact React={React} label="Owner">{ownerName(props.state.users,item.owner)}</Fact>
          {r&&<><Fact React={React} label="Requirement type">{r.type}</Fact><Fact React={React} label="Classification">{r.classification}</Fact><Fact React={React} label="Verification">{r.method||"Unassigned"}</Fact><Fact React={React} label="Acceptance">{r.criterion||"Undefined"}</Fact><Fact React={React} label="Priority">{r.priority}</Fact><Fact React={React} label="Implementation">{r.implementation}</Fact><Fact React={React} label="Applicability">{r.applicability}</Fact></>}
          {data.source&&<button type="button" className="ell-inline-link" onClick={()=>go("intake",{id:data.source.document,version:data.source.version,docPage:data.source.page,candidate:actual.id})}>{data.source.document.split("/").at(-1)} v{data.source.version} · p. {data.source.page} · § {data.source.section}</button>}
          {data.missing?.length>0&&<p className="ell-warning">{data.missing.length} declared trace expectation(s) missing.</p>}
          <div className="ell-stack">
            <Btn {...options} primary icon="trace" onClick={()=>go("trace",{id:item.id})}>Open in Explorer</Btn>
            {r&&<><Btn {...options} disabled={readOnly} onClick={()=>reviseDialog(props,actual)}>Edit requirement</Btn><Btn {...options} disabled={readOnly} onClick={()=>newRequirement(props,actual)}>Decompose requirement</Btn><Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Review "+item.code,[fieldSpec("decision","Decision","In review",{options:["In review","Approved","Rejected"]}),fieldSpec("comment","Review rationale","",{multiline:true})],vals=>mutate({name:"review",id:item.id,...vals}))}>Record review</Btn>
              <Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Propose change",[fieldSpec("title","Change title",item.title),fieldSpec("newText","Proposed requirement text",actual.body,{multiline:true})],vals=>mutate({name:"new-change",target:item.id,...vals}))}>Create change request</Btn></>}
          </div>
        </>}
        {show==="Links"&&<div className="ell-stack">
          {data.connected.map(l=><div className="ell-link-row" key={l.id}><ItemButton React={React} item={l.peer} onClick={()=>toItem(l.peer)}/><small>{l.type}</small><Badge React={React} text={l.review}/></div>)}
          {!data.connected.length&&<Empty {...options} text="No relationships"/>}
          <Btn {...options} disabled={readOnly} icon="plus" onClick={()=>linkDialog(props,item)}>Add relationship</Btn>
        </div>}
        {show==="History"&&<div className="ell-stack">
          {r?.revisions.length>1&&<TextDiff React={React} before={r.revisions.at(-2).body} after={r.revisions.at(-1).body} labels={r.revisions.slice(-2).map(x=>"Revision "+x.revision)}/>}
          {r?.revisions.slice().reverse().map(revision=><div className="ell-link-row" key={revision.revision}><strong>Revision {revision.revision}</strong><small>{plainDate(revision.time)} · {ownerName(props.state.users,revision.owner)}</small><p>{revision.body}</p></div>)}
          {data.comments.map((comment,i)=><div className="ell-link-row" key={i}><strong>{ownerName(props.state.users,comment.author)}</strong><small>{plainDate(comment.at)} · Revision {comment.revision}</small><p>{comment.comment}</p></div>)}
        </div>}
      </>;
    }}</Loading>
  </Panel>;
}
function Requirements(props){
  const {React,ui,state,view,patch,mutate,readOnly}=props;
  const [selected,setSelected]=React.useState([]);
  const [order,setOrder]=React.useState("ID");
  const options={React,ui};
  const code=view.filterKind||requirementProcesses[view.process]||"system";
  const page=view.page??0;
  const rows=state.items.filter(i=>i.requirement&&(code==="All"||i.kind===code)&&(!view.reviewFilter||i.review===view.reviewFilter)&&(!view.ownerFilter||i.owner===view.ownerFilter)&&matches(i,view.query));
  rows.sort((a,b)=>order==="Title"?a.title.localeCompare(b.title):a.code.localeCompare(b.code,"en",{numeric:true}));
  const chosen=one(rows,view.id)??rows.find(i=>i.code==="SYS-042")??rows[0];
  React.useEffect(()=>setSelected([]),[props.input.project,props.input.release,code]);
  const picked=selected.filter(id=>rows.some(r=>r.id===id));
  const actions=<><Btn {...options} disabled={!picked.length||readOnly} onClick={()=>ask(props,"Update selected requirements",[fieldSpec("priority","Priority","High",{options:["Low","Normal","High","Critical"]})],v=>mutate({name:"set-requirements",ids:picked,...v}))}>Set priority ({picked.length})</Btn><Btn {...options} primary icon="plus" disabled={readOnly} onClick={()=>newRequirement(props)}>New requirement</Btn></>;
  return <>
    <Heading React={React} title="Requirement Engineering" sub={projectSubtitle(props)+" · Author, review and trace requirements."} actions={actions}/>
    <div className="ell-split">
      <Panel React={React} title={(kinds[code]??"All")+" requirements"} sub={rows.length+" in the filtered scope"} action={chosen&&<Btn {...options} disabled={readOnly||rows.length<2} onClick={()=>ask(props,"Merge into "+chosen.code,[fieldSpec("source","Requirement to merge",rows.find(r=>r.id!==chosen.id)?.id,{options:rows.filter(r=>r.id!==chosen.id).map(r=>[r.id,r.code+" "+r.title])}),fieldSpec("reason","Merge rationale","",{multiline:true})],v=>mutate({name:"merge",id:chosen.id,...v}))}>Merge</Btn>}>
        <div className="ell-toolbar"><Search React={React} label="Search requirements" value={view.query} onChange={query=>patch({query,page:0})}/>
          <Select React={React} hidden label="Requirement type" value={code} items={[["All","All types"],...Object.entries(kinds).filter(([s])=>["customer","stakeholder","system","software","hardware"].includes(s))]} onChange={filterKind=>patch({filterKind,page:0,id:""})}/>
          <Select React={React} hidden label="Review filter" value={view.reviewFilter} items={[["","All reviews"],"Draft","In review","Approved","Rejected"]} onChange={reviewFilter=>patch({reviewFilter,page:0})}/>
          <Select React={React} hidden label="Owner filter" value={view.ownerFilter} items={[["","All owners"],...state.users.map(u=>[u.id,u.name])]} onChange={ownerFilter=>patch({ownerFilter,page:0})}/>
          <Select React={React} hidden label="Sort requirements" value={order} items={["ID","Title"]} onChange={setOrder}/>
        </div>
        <Table React={React} label="Requirements" columns={["","ID and title","Class","Review","Trace","Priority","Owner"]}>{rows.slice(page*12,(page+1)*12).map(item=><tr key={item.id} data-selected={item.id===chosen?.id}>
          <td><input type="checkbox" aria-label={"Select "+item.code} checked={selected.includes(item.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,item.id]:v.filter(x=>x!==item.id))}/></td>
          <td><ItemButton React={React} item={item} onClick={()=>patch({id:item.id})}/></td><td>{item.requirement.classification}</td><td><Badge React={React} text={item.review}/></td>
          <td>{item.trace?<span title={item.trace.suspect+" suspect links"}>{item.trace.present+" / "+item.trace.needed}</span>:"—"}</td>
          <td><select className="ell-inline-priority" disabled={readOnly} aria-label={"Priority for "+item.code} value={item.requirement.priority} onChange={e=>mutate({name:"set-requirements",ids:[item.id],priority:e.target.value})}>{["Low","Normal","High","Critical"].map(v=><option key={v}>{v}</option>)}</select></td><td>{ownerName(state.users,item.owner)}</td>
        </tr>)}</Table>
        {!rows.length&&<Empty {...options} text="No matching requirements"/>}<Pages {...options} page={page} total={rows.length} size={12} onChange={page=>patch({page})}/>
      </Panel>
      <ItemInspector {...props} item={chosen} key={chosen?.id}/>
    </div>
  </>;
}
function Architecture(props){
  const {React,ui,state,view,patch,go}=props;
  const options={React,ui};
  const rows=state.items.filter(i=>["architecture","design","unit"].includes(i.kind)&&matches(i,view.query)&&(!view.process||i.process===view.process));
  const selected=one(rows,view.id)??rows[0], current=useResource(React,props.invoke,"detail",{...props.input,id:selected?.id},Boolean(selected));
  const page=view.page??0;
  return <>
    <Heading React={React} title="Architecture & Design" sub={projectSubtitle(props)+(view.process?" · "+view.process:"")+" · Inspect allocation and realized components."}/>
    <div className="ell-split"><Panel React={React} title="Component relationships"><div className="ell-toolbar"><Search React={React} label="Search components" value={view.query} onChange={query=>patch({query,page:0})}/>{view.process&&<Btn {...options} onClick={()=>patch({process:""})}>All processes</Btn>}</div>
      <Loading {...options} state={current}>{d=><div className="ell-component-map">
        <div>{d.connected.filter(l=>l.to===selected.id).slice(0,5).map(l=><ItemButton React={React} key={l.id} item={l.peer} onClick={()=>props.toItem(l.peer)}/>)}</div>
        <Icon React={React} name="arrow"/><div className="ell-component-current"><code>{selected.code}</code><h3>{selected.title}</h3><small>{d.item.architecture?.interfaces?.join(" · ")??d.item.design?.responsibility??d.item.unit?.responsibility}</small></div><Icon React={React} name="arrow"/>
        <div>{d.connected.filter(l=>l.from===selected.id).slice(0,5).map(l=><ItemButton React={React} key={l.id} item={l.peer} onClick={()=>props.toItem(l.peer)}/>)}</div>
      </div>}</Loading>
      <Table React={React} columns={["Component","Type","Process","Review"]} label="Architecture components">{rows.slice(page*8,(page+1)*8).map(item=><tr data-selected={item.id===selected?.id} key={item.id}><td><ItemButton React={React} item={item} onClick={()=>patch({id:item.id})}/></td><td>{kinds[item.kind]}</td><td>{item.process}</td><td><Badge React={React} text={item.review}/></td></tr>)}</Table>
      {!rows.length&&<Empty {...options} text="No components for this scope"/>}<Pages {...options} page={page} total={rows.length} size={8} onChange={page=>patch({page})}/>
    </Panel><ItemInspector {...props} item={selected} key={selected?.id}/></div>
  </>;
}
