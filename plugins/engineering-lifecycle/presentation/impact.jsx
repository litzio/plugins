
function TextDiff({React,before,after,labels=["Before","After"]}){
  const a=before.split(/(\s+)/),b=after.split(/(\s+)/);
  let start=0,end=0;
  while(start<Math.min(a.length,b.length)&&a[start]===b[start])start++;
  while(end<Math.min(a.length,b.length)-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  return <div className="ell-diff">{[a,b].map((parts,i)=><div key={i}><strong>{labels[i]}</strong><p>{parts.slice(0,start).join("")}{i===0?<del>{parts.slice(start,parts.length-end).join("")}</del>:<ins>{parts.slice(start,parts.length-end).join("")}</ins>}{parts.slice(parts.length-end).join("")}</p></div>)}</div>;
}
const changeSteps=["Proposed","Impact analysis","Owner review","Approved","Updating artifacts","Re-verification","Closed"];
function Impact(props){
  const {React,ui,state,view,patch,invoke,input,mutate,readOnly,toItem,go}=props;
  const changes=state.items.filter(i=>i.kind==="change");
  const selected=one(changes,view.id)??changes.find(i=>i.code==="CR-014")??changes[0];
  const data=useResource(React,invoke,"detail",{...input,id:selected?.id},Boolean(selected));
  const [candidate,setCandidate]=React.useState("");
  const options={React,ui}, issue=data.value?.item.change;
  function newChange(){
    const requirements=state.items.filter(i=>i.requirement), first=requirements.find(i=>i.code==="CUS-042")??requirements[0];
    ask(props,"New change request",[fieldSpec("target","Target requirement",first.id,{options:requirements.map(i=>[i.id,i.code+" "+i.title])}),fieldSpec("title","Change title"),fieldSpec("newText","Proposed requirement text","",{multiline:true})],v=>mutate({name:"new-change",...v}));
  }
  return <>
    <Heading React={React} title="Change Impact Analysis" sub={selected?selected.code+" · "+selected.title:projectSubtitle(props)} actions={<><Btn {...options} icon="plus" disabled={readOnly} onClick={newChange}>New change request</Btn><Btn {...options} primary icon="trace" disabled={readOnly||!issue||!["Proposed","Impact analysis","Owner review"].includes(issue.state)} onClick={()=>mutate({name:"analyze",id:selected.id})}>Run impact analysis</Btn></>}/>
    {!selected?<Empty {...options} text="No change requests"/>:<Loading {...options} state={data}>{d=>{
      const ch=d.item.change, stage=changeSteps.indexOf(ch.state);
      const focus=ch.candidates.find(i=>i.id===candidate)??ch.candidates[0], artifact=one(state.items,focus?.id);
      const page=view.page??0, historical=ch.candidates.map(i=>one(state.items,i.id)).find(i=>i?.kind==="execution");
      return <div className="ell-split"><Panel React={React} title="Customer specification diff" sub={d.item.body} action={<Select React={React} hidden label="Change request" items={changes.map(i=>[i.id,i.code+" · "+i.title])} value={selected.id} onChange={id=>{setCandidate("");patch({id,page:0});}}/>}>
        <ol className="ell-change-steps">{changeSteps.map((label,n)=><li key={label} aria-current={n===stage?"step":undefined}><span>{n<stage?"✓":n===stage?"●":"○"}</span> {label}</li>)}</ol>
        <div className="ell-pad"><TextDiff React={React} before={ch.oldText} after={ch.newText} labels={["Prior wording","Proposed wording"]}/></div>
        {focus&&<div className="ell-impact-path" aria-label="Selected impact path">{focus.path.map((id,n)=>{const node=one(state.items,id);return <React.Fragment key={id}>{n!==0&&<Icon React={React} name="arrow"/>}<button type="button" onClick={()=>go("trace",{id})}><code>{node?.code}</code><strong>{node?.title}</strong><small>{n?n===1?"Direct":"Indirect · "+n+" hops":"Changed item"}</small></button></React.Fragment>;})}</div>}
        <div className="ell-panel-head"><div><h2>Impact candidates</h2><small>{ch.candidates.length+" total · "+ch.candidates.filter(x=>x.hops===1).length+" direct · "+ch.candidates.filter(x=>x.disposition==="Pending").length+" pending"}</small></div></div>
        <Table React={React} label="Change impact candidates" columns={["Artifact","Distance","Owner","Disposition"]}>{ch.candidates.slice(page*10,(page+1)*10).map(c=>{
          const i=one(state.items,c.id);
          return <tr key={c.id} data-selected={c.id===focus?.id}><td><ItemButton React={React} item={i} onClick={()=>setCandidate(c.id)}/></td><td>{c.hops===1?"Direct":"Indirect · "+c.hops+" hops"}</td><td>{ownerName(state.users,c.owner)}</td><td><Badge React={React} text={c.disposition}/></td></tr>;
        })}</Table>
        {!ch.candidates.length&&<Empty {...options} text="No impact candidates yet" details="Run impact analysis to follow permitted downstream relationships."/>}
        <Pages {...options} page={page} size={10} total={ch.candidates.length} onChange={page=>patch({page})}/>
      </Panel><Panel React={React} className="ell-inspect">
        <div className="ell-between"><code>{selected.code}</code><Badge React={React} text={ch.state}/></div><h2>{selected.title}</h2><small>{projectSubtitle(props)}</small>
        <Fact React={React} label="Changed artifact">{one(state.items,ch.target)?.code}</Fact><Fact React={React} label="Owner">{ownerName(state.users,selected.owner)}</Fact><Fact React={React} label="Assigned actions">{ch.actions.filter(a=>a.done).length+" / "+ch.actions.length+" complete"}</Fact>
        {historical&&<p className="ell-warning">Prior executions retain their original results and baseline. Reuse requires checking the current requirement and measure revisions.</p>}
        <div className="ell-stack">
          {stage>0&&stage<changeSteps.length-1&&<Btn {...options} primary disabled={readOnly} onClick={()=>mutate({name:"change-step",id:selected.id})}>Move to {changeSteps[stage+1]}</Btn>}
          {ch.state==="Updating artifacts"&&<Btn {...options} disabled={readOnly} onClick={()=>ask(props,"Apply proposed wording",[fieldSpec("criterion","Revised acceptance criterion","",{required:false})],v=>mutate({name:"apply-change",id:selected.id,...v}),"Apply to requirement")}>Apply proposed wording</Btn>}
          <Btn {...options} icon="arrow" onClick={()=>toItem(ch.target)}>Open changed requirement</Btn>
          {historical&&<Btn {...options} icon="verify" onClick={()=>toItem(historical)}>Open historical execution</Btn>}
        </div>
        {artifact&&<div className="ell-impact-inspect"><h3>{artifact.code+" · "+artifact.title}</h3><Fact React={React} label="Impact decision">{focus.disposition}</Fact>{focus.rationale&&<p className="ell-text">{focus.rationale}</p>}
          <div className="ell-stack">
            <Btn {...options} disabled={readOnly||ch.state!=="Owner review"} onClick={()=>ask(props,"Review impact on "+artifact.code,[fieldSpec("decision","Disposition","Affected",{options:["Affected","Unaffected"]}),fieldSpec("reason","Decision rationale","",{multiline:true})],v=>mutate({name:"impact-disposition",id:selected.id,target:focus.id,...v}))}>Record impact decision</Btn>
            {ch.actions.some(a=>a.id===focus.id)?<Btn {...options} disabled={readOnly||ch.actions.find(a=>a.id===focus.id).done} onClick={()=>mutate({name:"impact-action",id:selected.id,target:focus.id})}>Complete assigned action</Btn>:<Btn {...options} disabled={readOnly||ch.state==="Closed"} onClick={()=>ask(props,"Assign action for "+artifact.code,[fieldSpec("owner","Recipient",focus.owner,{options:state.users.map(u=>[u.id,u.name])}),fieldSpec("text","Action","",{multiline:true})],v=>mutate({name:"impact-action",id:selected.id,target:focus.id,...v}))}>Assign action</Btn>}
            <Btn {...options} onClick={()=>toItem(artifact)}>Open affected artifact</Btn>
          </div>
        </div>}
      </Panel></div>;
    }}</Loading>}
  </>;
}
function Baselines(props){
  const {React,ui,invoke,input,state,view,patch,mutate,readOnly}=props;
  const id=view.compareBaseline||state.baselines[0]?.id||"";
  const result=useResource(React,invoke,"comparison",{...input,compare:id},Boolean(id));
  const options={React,ui}, rows=result.value??[], page=view.page??0;
  return <>
    <Heading React={React} title="Configuration & Baselines" sub={projectSubtitle(props)+" · Approved snapshots and revision differences."} actions={<Btn {...options} primary icon="plus" disabled={readOnly} onClick={()=>ask(props,"Create approved baseline",[fieldSpec("title","Baseline identifier","")],v=>mutate({name:"baseline",...v}),"Create baseline","Locks the current artifact versions, relationship reviews, tailoring and evidence references.")}>Create approved baseline</Btn>}/>
    <div className="ell-split"><Panel React={React} title="Compare artifact revisions" sub={rows.length+" changes"}>
      <div className="ell-toolbar"><Select React={React} hidden label="Comparison baseline" items={state.baselines.map(i=>[i.id,"Compare with "+i.id])} value={id} onChange={compareBaseline=>patch({compareBaseline,page:0})}/><span className="ell-spacer"/><code>{view.baseline||"Working set"} → {id}</code></div>
      <Loading {...options} state={result}>{entries=><><Table React={React} label="Baseline differences" columns={["Artifact","Kind","Change"]}>{entries.slice(page*12,(page+1)*12).map((r,n)=><tr key={r.id+"-"+n}><td>{r.kind==="trace"?<span>{r.code+" · "+r.title}</span>:<ItemButton React={React} item={r} onClick={()=>props.toItem(r)}/>}</td><td>{r.kind}</td><td>{r.change}</td></tr>)}</Table>{!entries.length&&<Empty {...options} text="The selected scopes have no revision differences"/>}<Pages {...options} page={page} total={entries.length} size={12} onChange={page=>patch({page})}/></>}</Loading>
    </Panel><Panel React={React} className="ell-inspect" title="Approved snapshots">{state.baselines.map(b=><div className="ell-link-row" key={b.id}><code>{b.id}</code><Fact React={React} label="Approved by">{ownerName(state.users,b.approvedBy)}</Fact><Fact React={React} label="Created">{plainDate(b.created)}</Fact><div className="ell-stack"><Btn {...options} onClick={()=>patch({baseline:b.id,page:0})}>Open {b.id}</Btn><Btn {...options} onClick={()=>patch({compareBaseline:b.id,page:0})}>Compare with {b.id}</Btn></div></div>)}</Panel></div>
  </>;
}
