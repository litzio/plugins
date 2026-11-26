
function Waveform({React,points}){
  const line=points.map((p,n)=>(n?"L":"M")+(20+p.time*1.21)+" "+(103-p.value*85)).join(" ");
  return <svg className="ell-wave" viewBox="0 0 286 132" role="img" aria-label="Synthetic HIL current waveform crossing the shutdown threshold at 108 milliseconds">
    <path d="M20 18H263M20 40H263M20 62H263M20 84H263M20 106H263M20 17V106M141 17V106M263 17V106" stroke="var(--ell-line)" fill="none"/>
    <path d="M20 86H263" stroke="var(--ell-warning)" strokeDasharray="4 3"/><path d={line} stroke="var(--ell-accent)" strokeWidth="2" fill="none"/>
    <circle cx="150.7" cy="86" r="3" fill="var(--ell-accent)"/><text x="154" y="78">108 ms</text><text x="20" y="123">0</text><text x="125" y="123">100</text><text x="224" y="123">200 ms</text>
  </svg>;
}
function Verification(props){
  const {React,ui,invoke,input,state,view,patch,go,mutate,readOnly}=props;
  const current=one(state.items,view.id);
  const mode=view.tab||(current?.kind==="execution"?"Executions":current?.kind==="evidence"?"Evidence":"Measures");
  const options={React,ui}, m=state.metrics;
  const group=({Measures:"measure",Executions:"execution",Evidence:"evidence"})[mode];
  const candidates=state.items.filter(x=>x.kind===group&&(!view.process||x.process===view.process)&&matches(x,view.query)&&(!view.statusFilter||group!=="measure"||x.status===view.statusFilter));
  candidates.sort((a,b)=>a.code.localeCompare(b.code,"en",{numeric:true}));
  const picked=current&&["measure","execution","evidence"].includes(current.kind)?current:candidates.find(i=>i.code==="VM-031")??candidates[0];
  const detail=useResource(React,invoke,"detail",{...input,id:picked?.id},Boolean(picked));
  const d=detail.value, page=view.page??0;
  function createRun(){
    if(!d?.item.measure)return;
    ask(props,"Record execution for "+picked.code,[
      fieldSpec("outcome","Outcome","Passed",{options:["Passed","Failed","Blocked"]}),fieldSpec("observed","Observed result"),fieldSpec("environment","Environment",d.item.measure.environment),
      fieldSpec("reason","Result rationale","",{multiline:true}),fieldSpec("evidence","Evidence or run log","",{multiline:true,required:false,max:20000})
    ],v=>mutate({name:"run",id:picked.id,...v}));
  }
  return <>
    <Heading React={React} title="Verification & Evidence" sub={(view.process?view.process+" · ":"")+projectSubtitle(props)+" · Scope, execution and supporting records."} actions={<Btn {...options} primary icon="plus" disabled={readOnly||!d?.item.measure} onClick={createRun}>Record execution</Btn>}/>
    <div className="ell-metrics"><Metric React={React} label="Measures planned" ratio={m.execution.d} note={view.baseline||"Working set"}/><Metric React={React} label="Execution coverage" ratio={m.execution}/><Metric React={React} label="Pass rate" ratio={m.pass} note={m.pass.n+" / "+m.pass.d+" final outcomes"}/><Metric React={React} label="Requirement mapping" ratio={m.mapped}/></div>
    <div className="ell-split">
      <Panel React={React} title={"Verification "+mode.toLowerCase()} sub={candidates.length+" matching artifacts"} action={<Toggle React={React} label="Verification views" options={["Measures","Executions","Evidence"]} value={mode} onChange={tab=>patch({tab,id:"",page:0,query:""})}/>}>
        <div className="ell-toolbar"><Search React={React} label={"Find "+group} value={view.query} onChange={query=>patch({query,page:0,id:""})}/>
          <Select React={React} hidden label="Verification process" items={[["","All processes"],...state.processes.filter(p=>p.route==="verification").map(p=>[p.code,p.code])]} value={view.process} onChange={process=>patch({process,page:0,id:""})}/>
          {mode==="Measures"&&<Select React={React} hidden label="Verification result" items={[["","All results"],"Passed","Failed","Blocked","Retest required","Not run"]} value={view.statusFilter} onChange={statusFilter=>patch({statusFilter,page:0,id:""})}/>}
          {view.baseline&&<button className="ell-toggle-plain" onClick={()=>patch({baseline:"",page:0})}>Working set</button>}
        </div>
        <Table React={React} label={"Verification "+mode.toLowerCase()} columns={["Artifact","Process",group==="measure"?"Current status":"Review",group==="measure"?"Latest execution":"Owner"]}>{candidates.slice(page*10,(page+1)*10).map(item=><tr key={item.id} data-selected={picked?.id===item.id}><td><ItemButton React={React} item={item} onClick={()=>patch({id:item.id})}/></td><td>{item.process}</td><td><Badge React={React} text={item.status??item.review}/></td><td>{item.execution??item.history??ownerName(state.users,item.owner)}</td></tr>)}</Table>
        {!candidates.length&&<Empty {...options} text="No verification artifacts match"/>}<Pages {...options} size={10} page={page} total={candidates.length} onChange={page=>patch({page})}/>
        <div className="ell-footer"><Btn {...options} icon="layers" onClick={()=>go("baselines")}>Compare baseline revisions</Btn></div>
      </Panel>
      <Panel React={React} className="ell-inspect">
        {!picked&&<Empty {...options} text="Select an artifact"/>}
        <Loading {...options} state={detail}>{({item,runs,connected,verification,evidenceBaseline})=>{
          const vm=item.measure, vx=item.execution, ev=item.evidence;
          return <>
            <div className="ell-between"><code>{item.code}</code><Badge React={React} text={verification?.status??vx?.result.outcome??item.review}/></div><h2>{item.title}</h2><small>{item.process} · Revision {item.revision}</small>
            {vm&&<>
              <p className="ell-text">{item.body}</p><Fact React={React} label="Method">{vm.method}</Fact><Fact React={React} label="Acceptance">{vm.criterion}</Fact><Fact React={React} label="Environment">{vm.environment}</Fact><Fact React={React} label="Preconditions">{vm.preconditions}</Fact>
              <details className="ell-details"><summary>Procedure</summary><ol>{vm.procedure.map(p=><li key={p}>{p}</li>)}</ol></details>
              <h3 className="ell-stack-title">Execution history</h3>{runs.length?runs.slice(0,8).map(run=><div key={run.id} className="ell-link-row"><ItemButton React={React} item={run} onClick={()=>patch({id:run.id,tab:"Executions",query:"",page:0})}/><div className="ell-between"><small>{run.execution.scope+" · Measure r"+run.execution.measureRevision}</small><Badge React={React} text={run.execution.result.outcome}/></div></div>):<p className="ell-text">No execution has been recorded.</p>}
              <div className="ell-stack"><Btn {...options} disabled={readOnly} onClick={()=>reviseDialog(props,item)}>Edit verification specification</Btn></div>
            </>}
            {vx&&<>
              <Fact React={React} label="Run scope">{vx.scope}</Fact><Fact React={React} label="Measure revision">{vx.measureRevision}</Fact><Fact React={React} label="Environment">{vx.environment}</Fact>{vx.criterion&&<Fact React={React} label="Acceptance in this run">{vx.criterion}</Fact>}<Fact React={React} label="Observed">{vx.result.observed}</Fact><p className="ell-text">{vx.result.reason}</p>
              {connected.filter(l=>l.peer.kind==="evidence").map(l=><div className="ell-link-row" key={l.id}><ItemButton React={React} item={l.peer} onClick={()=>patch({id:l.peer.id,tab:"Evidence",page:0,query:""})}/><Btn {...options} icon="file" onClick={()=>patch({id:l.peer.id,tab:"Evidence",page:0,query:""})}>Open evidence preview</Btn></div>)}
              {vx.result.outcome==="Failed"&&<div className="ell-stack"><Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Create problem report",[fieldSpec("title","Title",item.title),fieldSpec("severity","Severity","Major",{options:["Critical","Major","Moderate","Minor"]}),fieldSpec("action","Planned corrective action","",{multiline:true})],v=>mutate({name:"problem",id:item.id,...v}))}>Create problem report</Btn></div>}
            </>}
            {ev&&<><p className="ell-text">{item.body}</p>{ev.waveform?<Waveform React={React} points={ev.waveform}/>:<pre className="ell-evidence-preview">{ev.content}</pre>}
              <Fact React={React} label="Evidence file">{ev.filename}</Fact><div className="ell-stack"><Btn {...options} icon="download" primary onClick={()=>openAsset(props,item.id)}>Download evidence file</Btn><Btn {...options} onClick={()=>patch({id:ev.execution,tab:"Executions",page:0,query:""})}>Open execution</Btn></div></>}
            <div className="ell-stack"><Btn {...options} icon="trace" onClick={()=>go("trace",{id:item.id,direction:item.kind==="measure"?"Both directions":"Upstream",depth:8,baseline:evidenceBaseline??view.baseline})}>Trace to source requirement</Btn></div>
          </>;
        }}</Loading>
      </Panel>
    </div>
  </>;
}
