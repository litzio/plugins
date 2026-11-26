
const evidenceLabels=["Deliverables","Evidence","Traceability","Consistency","Quality","Tailoring applied"];
function Assessment(props) {
  const {React,ui,state,view,patch,go,mutate,readOnly,exportReport}=props;
  const groups=["All","L1","L2","L3"], group=view.tab||"All", options={React,ui};
  const rows=state.processes.filter(p=>p.state!=="Not applicable"), openFindings=state.items.filter(i=>i.finding?.status==="Open");
  const selected=rows.find(p=>p.code===view.process)??rows.find(p=>p.code==="SYS.2")??rows[0];
  const relevant=e=>group==="All"||e.attribute.startsWith("PA "+group.slice(-1)+".");
  const all=rows.flatMap(p=>state.assessments[p.code]??[]).filter(relevant).filter(e=>e.state!=="N/A");
  const selectedEvidence=(state.assessments[selected?.code]??[]).filter(relevant);
  const selectedFindings=state.items.filter(i=>i.finding&&i.process===selected?.code), columns=evidenceLabels.filter(label=>all.some(e=>e.label===label)), start=view.page??0;
  function improvement(source){
    ask(props,"Create improvement action",[
      fieldSpec("title","Finding title",source?"Review "+source.label.toLowerCase():""),fieldSpec("action","Improvement action","",{multiline:true}),
      fieldSpec("owner","Owner",selected.owner,{options:state.users.map(u=>[u.id,u.name])}),fieldSpec("due","Due date","",{type:"date",required:false})
    ],v=>mutate({name:"finding",process:selected.code,attribute:source?.attribute,source:source?.source,...v}));
  }
  function reviewEvidence(e){
    const choices=state.items.filter(i=>i.kind!=="anchor").map(i=>[i.id,i.code+" · "+i.title]);
    ask(props,"Review "+selected.code+" evidence",[
      fieldSpec("status","Evidence status",e.state,{options:["Ready","Review","Missing","N/A"]}),
      fieldSpec("source","Evidence source",e.source,{options:[["","No evidence attached"],...choices]}),
      fieldSpec("rationale","Review rationale","",{multiline:true})
    ],v=>mutate({name:"assessment-evidence",process:selected.code,label:e.label,source:v.source,state:v.status,rationale:v.rationale}));
  }
  return <>
    <Heading React={React} title="Assessment Readiness" sub={"Automotive SPICE® "+state.model+" · Internal evidence review · "+projectSubtitle(props)} actions={<Btn {...options} primary icon="download" onClick={()=>exportReport("assessment")}>Create evidence report</Btn>}/>
    <div className="ell-metrics"><Metric React={React} label="Applied processes" ratio={rows.length} note="Selected release and baseline"/><Metric React={React} label="Evidence ready" ratio={{n:all.filter(e=>e.state==="Ready").length,d:all.length}}/><Metric React={React} label="Open findings" ratio={openFindings.length} note="Under active investigation"/><Metric React={React} label="Manual ratings" ratio={state.assessorRecords.length} note="Recorded assessor opinions"/></div>
    <div className="ell-split"><Panel React={React} title="Process evidence matrix" sub="Work products, reviews, traces and evidence" action={<Toggle React={React} label="Evidence level filter" options={groups} value={group} onChange={tab=>patch({tab,page:0,assessmentLabel:""})}/>}>
      <Table React={React} label="Process evidence matrix" columns={["Process",...columns,"Open gaps"]}>{rows.slice(start*12,(start+1)*12).map(p=>{
        const entries=(state.assessments[p.code]??[]).filter(relevant), gaps=openFindings.filter(g=>g.process===p.code).length;
        return <tr key={p.code} data-selected={p.code===selected?.code}><td><button className="ell-itembutton" onClick={()=>patch({process:p.code,assessmentLabel:""})}><code>{p.code}</code><span>{p.label}</span></button></td>{columns.map(label=>{const e=entries.find(row=>row.label===label);return <td key={label}><button className={"ell-heat-cell "+statusTone(e?.state??"N/A")} aria-label={p.code+" "+label+" "+(e?.state??"N/A")} onClick={()=>patch({process:p.code,assessmentLabel:label})}>{e?.state??"N/A"}</button></td>;})}<td><Badge React={React} text={gaps+" open"} tone={gaps?"warning":"neutral"}/></td></tr>;
      })}</Table><Pages {...options} page={start} total={rows.length} size={12} onChange={page=>patch({page})}/>
    </Panel><Panel React={React} className="ell-inspect">
      {selected&&<><code>{selected.code}</code><h2>{selected.label}</h2><small>Readiness review · PAM {state.model}</small>
      <div className="ell-stack">{selectedEvidence.filter(e=>!view.assessmentLabel||e.label===view.assessmentLabel).map(e=><div key={e.label} className="ell-link-row"><div className="ell-between"><strong>{e.label}</strong><Badge React={React} text={e.state}/></div><small>{e.attribute}</small><div className="ell-actions">{e.source&&<Btn {...options} onClick={()=>props.toItem(e.source)}>{one(state.items,e.source)?.code??"Open evidence"}</Btn>}<Btn {...options} disabled={readOnly} onClick={()=>reviewEvidence(e)}>Review evidence</Btn>{e.state!=="Ready"&&<Btn {...options} disabled={readOnly} onClick={()=>improvement(e)}>Create action</Btn>}</div></div>)}</div>
      <div className="ell-stack"><Btn {...options} primary icon="plus" disabled={readOnly} onClick={()=>improvement()}>Create improvement action</Btn><Btn {...options} icon="trace" onClick={()=>go("trace",{process:selected.code,tab:"Gaps"})}>Open trace checks</Btn></div>
      {selectedFindings.map(f=><div key={f.id} className="ell-link-row"><div className="ell-between"><code>{f.code}</code><Badge React={React} text={f.finding.status}/></div><strong>{f.title}</strong><small>{f.finding.due?"Due "+f.finding.due:ownerName(state.users,f.owner)}</small><p>{f.finding.action||f.body}</p>{f.finding.status==="Open"&&<Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Close "+f.code,[fieldSpec("action","Completion evidence","",{multiline:true})],v=>mutate({name:"finding-close",id:f.id,...v}))}>Record closure</Btn>}</div>)}
      <div className="ell-stack-title"><h3>Assessor opinions</h3><small>Manually recorded assessment ratings</small></div>
      {state.assessorRecords.filter(r=>r.process===selected.code).map((r,i)=><div className="ell-link-row" key={i}><strong>{r.attribute+" · "+r.rating}</strong><small>{ownerName(state.users,r.assessor)+" · "+plainDate(r.at)}</small><p>{r.note}</p></div>)}
      <div className="ell-stack"><Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Record assessor opinion",[
        fieldSpec("actor","Assessor",state.users[0].id,{options:state.users.map(u=>[u.id,u.name])}),fieldSpec("attribute","Process attribute","PA 1.1",{options:["PA 1.1","PA 2.1","PA 2.2","PA 3.1","PA 3.2"]}),fieldSpec("rating","Rating","L",{options:["N","P","L","F"]}),fieldSpec("note","Evidence and scope","",{multiline:true})
      ],v=>mutate({name:"assessor",process:selected.code,...v}))}>Record manual opinion</Btn></div></>}
    </Panel></div>
  </>;
}
function Planning(props){
  const {React,ui,state,project,view,go,exportReport}=props;
  const options={React,ui}, m=state.metrics;
  return <>
    <Heading React={React} title={view.process==="MAN.6"?"Measurement":view.process==="SPL.2"?"Product Release":"Project Management"} sub={projectSubtitle(props)} actions={<Btn {...options} primary icon="download" onClick={()=>exportReport("portfolio")}>Export project report</Btn>}/>
    <div className="ell-metrics"><Metric React={React} label="Deliverables" ratio={m.deliverables}/><Metric React={React} label="Trace coverage" ratio={m.trace}/><Metric React={React} label="Verification executed" ratio={m.execution}/><Metric React={React} label="Next milestone" ratio={project.milestoneDate} note={project.milestone}/></div>
    <Panel React={React} title="Milestone plan and actual progress"><Table React={React} label="Process progress" columns={["Process","Owner","Approved / planned","State"]}>{state.processes.map(p=><tr key={p.code}><td><button type="button" className="ell-itembutton" onClick={()=>go("lifecycle",{process:p.code})}><code>{p.code}</code><span>{p.label}</span></button></td><td>{ownerName(state.users,p.owner)}</td><td>{p.approved+" / "+p.planned}</td><td><Badge React={React} text={p.state}/></td></tr>)}</Table></Panel>
  </>;
}
