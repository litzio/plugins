
function Risks(props){
  const {React,ui,state,view,patch,invoke,input,toItem,mutate,readOnly,go}=props, options={React,ui};
  const current=one(state.items,view.id);
  const mode=view.tab||(view.process==="SUP.9"||current?.kind==="problem"?"Problems":view.process==="SUP.1"?"Quality":"Risks");
  const kind=({Risks:"risk",Problems:"problem",Quality:"finding"})[mode];
  const items=state.items.filter(i=>i.kind===kind&&matches(i,view.query)), selected=one(items,view.id)??items[0];
  const detail=useResource(React,invoke,"detail",{...input,id:selected?.id},Boolean(selected)), page=view.page??0;
  function riskDialog(item){
    const v=item?.risk, choices=["1","2","3","4","5"];
    ask(props,item?"Edit "+item.code:"New risk",[...(item?[]:[fieldSpec("title","Risk title")]),fieldSpec("likelihood","Likelihood",String(v?.likelihood??3),{options:choices}),fieldSpec("impact","Impact",String(v?.impact??3),{options:choices}),fieldSpec("residualLikelihood","Residual likelihood",String(v?.residualLikelihood??2),{options:choices}),fieldSpec("residualImpact","Residual impact",String(v?.residualImpact??3),{options:choices}),fieldSpec("strategy","Mitigation",v?.strategy??"",{multiline:true})],v=>mutate({name:"risk",id:item?.id,...v,likelihood:Number(v.likelihood),impact:Number(v.impact),residualLikelihood:Number(v.residualLikelihood),residualImpact:Number(v.residualImpact)}));
  }
  return <>
    <Heading React={React} title="Problems, Risk & Quality" sub={"MAN.5 · SUP.9 · SUP.1 · "+projectSubtitle(props)} actions={mode==="Risks"?<Btn {...options} primary icon="plus" disabled={readOnly} onClick={()=>riskDialog()}>New risk</Btn>:<Btn {...options} onClick={()=>go(mode==="Problems"?"verification":"assessment")}>{mode==="Problems"?"Open verification":"Open assessment"}</Btn>}/>
    <div className="ell-split"><Panel React={React} title={mode==="Risks"?"Risk matrix":mode} sub={mode==="Risks"?"Current likelihood × impact":"Issues and corrective actions"} action={<Toggle React={React} label="Governance view" value={mode} options={["Risks","Problems","Quality"]} onChange={tab=>patch({tab,id:"",page:0,query:""})}/>}>
      {mode==="Risks"&&<div className="ell-riskmap" aria-label="Risk matrix"><span/>{[1,2,3,4,5].map(x=><span key={x}>{x}</span>)}{[5,4,3,2,1].map(l=><React.Fragment key={l}><span>{l} · Likelihood</span>{[1,2,3,4,5].map(j=>{
        const cell=items.filter(i=>i.risk.likelihood===l&&i.risk.impact===j);
        return <div key={j} className={"ell-risk-cell "+(l*j>=12?"danger":l*j>=5?"warning":"success")}>{cell.length?cell.map(i=><button key={i.id} aria-pressed={selected?.id===i.id} onClick={()=>patch({id:i.id})}>{i.code}</button>):"·"}</div>;
      })}</React.Fragment>)}</div>}
      <div className="ell-toolbar"><Search React={React} label={"Find "+mode.toLowerCase()} value={view.query} onChange={query=>patch({query,page:0,id:""})}/></div>
      <Table React={React} label={mode} columns={["Artifact","Status","Owner"]}>{items.slice(page*10,(page+1)*10).map(i=><tr key={i.id} data-selected={selected?.id===i.id}><td><ItemButton React={React} item={i} onClick={()=>patch({id:i.id})}/></td><td>{i.problem?.state??i.finding?.status??i.risk.likelihood+" × "+i.risk.impact}</td><td>{ownerName(state.users,i.owner)}</td></tr>)}</Table>
      {!items.length&&<Empty {...options} text={"No "+mode.toLowerCase()+" match this scope"}/>}<Pages {...options} page={page} total={items.length} size={10} onChange={page=>patch({page})}/>
    </Panel><Panel React={React} className="ell-inspect"><Loading {...options} state={detail}>{({item,connected})=><>
      <code>{item.code}</code><h2>{item.title}</h2><p className="ell-text">{item.body}</p><Fact React={React} label="Owner">{ownerName(state.users,item.owner)}</Fact>
      {item.risk&&<><Fact React={React} label="Likelihood × impact">{item.risk.likelihood+" × "+item.risk.impact}</Fact><Fact React={React} label="Target residual risk">{item.risk.residualLikelihood+" × "+item.risk.residualImpact}</Fact><p className="ell-text">{item.risk.strategy}</p><Btn {...options} disabled={readOnly} onClick={()=>riskDialog(item)}>Review mitigation</Btn></>}
      {item.problem&&<><Fact React={React} label="Severity">{item.problem.severity}</Fact><Fact React={React} label="Cause">{item.problem.cause}</Fact><p className="ell-text">{item.problem.action}</p>
        <Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Update "+item.code,[fieldSpec("cause","Root cause",item.problem.cause,{multiline:true}),fieldSpec("action","Corrective action",item.problem.action,{multiline:true}),fieldSpec("retest","Passing retest","",{options:[["","No retest"],...state.items.filter(x=>x.kind==="execution").map(x=>[x.id,x.code+" "+x.title])] }),fieldSpec("closed","Status",item.problem.state,{options:["Open","Closed"]})],v=>mutate({name:"problem-update",id:item.id,...v,closed:v.closed==="Closed"}))}>Update problem and retest</Btn></>}
      {item.finding&&<><Fact React={React} label="Action status">{item.finding.status}</Fact><p className="ell-text">{item.finding.action}</p><Btn {...options} onClick={()=>go("assessment",{process:item.process,id:item.id})}>Open corrective action</Btn></>}
      <div className="ell-stack-title"><h3>Related engineering records</h3></div>{connected.map(l=><div key={l.id} className="ell-link-row"><ItemButton React={React} item={l.peer} onClick={()=>toItem(l.peer)}/><small>{l.type}</small></div>)}
    </>}</Loading></Panel></div>
  </>;
}
