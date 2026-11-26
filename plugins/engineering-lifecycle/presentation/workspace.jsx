
const navigation = [
  ["Project",[["portfolio","Portfolio","grid"]]],
  ["Engineering",[["lifecycle","Lifecycle","v"],["intake","Document intake","file"],["requirements","Requirements","table"],["architecture","Architecture","box"],["trace","Traceability","trace"],["verification","Verification","verify"]]],
  ["Governance",[["impact","Changes","change"],["baselines","Baselines","layers"],["risks","Problems & risks","warning"],["assessment","Assessment","check"]]],
];
const glyphs = {
  grid:"M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",v:"m4 5 8 14 8-14M9 6h6m-5 5h4",file:"M6 3h8l4 4v14H6zM14 3v5h4M9 13h6m-6 4h6",table:"M3 5h18v14H3zM8 5v14M3 10h18M3 15h18",box:"m12 3 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4m-8 4v10",trace:"M4 6h6v4H4zm10 8h6v4h-6zM10 8h7v6m-3-3 3 3 3-3",verify:"M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10zM9 12l2 2 4-4",change:"M8 4v16m8-16v16m-11-9 3-3 3 3m2 2 3 3 3-3",layers:"m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5M3 16l9 5 9-5",warning:"m12 3 10 17H2L12 3zm0 6v5m0 3h.01",check:"M8 4h8v3H8zM8 5H5v16h14V5h-3m-7 9 2 2 4-4",arrow:"M3 12h17m-5-5 5 5-5 5",search:"M20 20l-5-5m2-4a6 6 0 1 1-12 0 6 6 0 0 1 12 0z",close:"m6 6 12 12M18 6 6 18",link:"M9 15l6-6m-6 9-2 2a4 4 0 0 1-6-6l4-4m10-4 2-2a4 4 0 0 1 6 6l-4 4",download:"M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4",plus:"M12 4v16M4 12h16",
};
function Icon({React,name}) { return <svg className="ell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={glyphs[name] || glyphs.box} /></svg>; }
const percent = ratio => ratio?.d ? Math.round(100*ratio.n/ratio.d) : null;
const ratioText = ratio => percent(ratio)===null?"N/A":percent(ratio)+"%";
const statusTone = value => /failed|missing|rejected|blocked/i.test(value)?"danger":/approved|passed|ready|completed|reviewed|linked/i.test(value)?"success":/retest|suspect|review|pending|open/i.test(value)?"warning":/progress|draft|active|working/i.test(value)?"accent":"neutral";
const one = (rows,id) => rows.find(x=>x.id===id);
const ownerName = (users,id) => one(users,id)?.name ?? id ?? "—";
const plainDate = text => text ? text.slice(0,10) : "—";
const matches = (item,q) => !q||(item.code+" "+item.title).toLowerCase().includes(q.toLowerCase());
const kinds = {customer:"Customer",stakeholder:"Stakeholder",system:"System",software:"Software",hardware:"Hardware",architecture:"Architecture",design:"Design",unit:"Software unit",measure:"Measure",execution:"Execution",evidence:"Evidence"};
const initialViews = (portfolio) => Object.fromEntries(portfolio.projects.map(p=>[p.id,{route:"lifecycle",release:p.latest,baseline:"",query:"",process:"",id:"",tab:"",page:0}]));
function useResource(React, invoke, op, input, enabled=true) {
  const key = enabled ? JSON.stringify(input) : "";
  const [current,set] = React.useState({key:"",value:null,error:""});
  React.useEffect(()=>{
    let stale=false;
    if (key) invoke(op,JSON.parse(key)).then(value=>{if(!stale)set({key,value,error:""});},err=>{if(!stale)set({key,value:null,error:err.message});});
    return ()=>{stale=true;};
  },[invoke,op,key]);
  return current.key===key ? {...current,loading:false} : {value:null,error:"",loading:enabled};
}
function Badge({React,text,tone}) {return <span className={"ell-badge "+(tone??statusTone(text))}><span aria-hidden="true"/> {text}</span>;}
function Bar({React,value,label}) {return <div className="ell-track" role="progressbar" aria-label={label??"Progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value??0}><span style={{width:(value??0)+"%"}}/></div>;}
function Metric({React,label,ratio,note}) {return <div className="ell-metric"><span>{label}</span><strong>{typeof ratio==="object"?ratioText(ratio):ratio}</strong><small>{note??(ratio?.n+" / "+ratio?.d)}</small></div>;}
function Fact({React,label,children}) {return <div className="ell-fact"><span>{label}</span><strong>{children}</strong></div>;}
function Panel({React,title,sub,action,children,className=""}) {return <section className={"ell-panel "+className}>{title&&<div className="ell-panel-head"><div><h2>{title}</h2>{sub&&<small>{sub}</small>}</div>{action}</div>}{children}</section>;}
function Btn({React,ui,children,icon,primary,disabled,onClick,pressed,label}) {return <ui.Button variant={primary?"default":"outline"} disabled={disabled} onClick={onClick} aria-pressed={pressed} aria-label={label}>{icon&&<Icon React={React} name={icon}/>} {children}</ui.Button>;}
function Select({React,label,value,onChange,items,hidden=false}) {return <label className={"ell-field "+(hidden?"ell-hidden-label":"")}><span>{label}</span><select aria-label={label} value={value??""} onChange={e=>onChange(e.target.value)}>{items.map(it=>{const [value,text]=Array.isArray(it)?it:[it,it];return <option key={value} value={value}>{text}</option>;})}</select></label>;}
function Search({React,label,value,onChange}) {return <label className="ell-search"><Icon React={React} name="search"/><input data-engineering-search aria-label={label} placeholder={label} value={value??""} onChange={e=>onChange(e.target.value)}/><kbd>/</kbd></label>;}
function Toggle({React,options,value,onChange,label}) {return <div className="ell-toggle" role="group" aria-label={label}>{options.map(label=><button key={label} type="button" aria-pressed={label===value} onClick={()=>onChange(label)}>{label}</button>)}</div>;}
function Loading({React,ui,state,children}) {
  if(state.error)return <ui.Notice tone="error">{state.error}</ui.Notice>;
  if(state.loading)return <div className="ell-loading" aria-live="polite"><span/><span/><span/>Loading workspace data…</div>;
  return state.value?children(state.value):null;
}
function Pages({React,ui,page,total,size,onChange}) {const last=Math.max(0,Math.ceil(total/size)-1);return <div className="ell-footer"><span>{total?Math.min(page*size+1,total)+"–"+Math.min((page+1)*size,total)+" of "+total:"0 results"}</span><div className="ell-actions"><Btn React={React} ui={ui} disabled={page===0} onClick={()=>onChange(page-1)}>Previous</Btn><Btn React={React} ui={ui} disabled={page>=last} onClick={()=>onChange(page+1)}>Next</Btn></div></div>;}
function Table({React,columns,children,label}) {return <div className="ell-table-wrap"><table className="ell-table" aria-label={label}><thead><tr>{columns.map((name,i)=><th scope="col" key={i}>{name}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;}
function ItemButton({React,item,onClick}) {return <button type="button" className="ell-itembutton" onClick={onClick}><code>{item.code}</code><span>{item.title}</span></button>;}
function Empty({React,ui,text,details}) {return <ui.EmptyState title={text} description={details}/>;}

export default function EngineeringLifecycle({React,ui,invoke,pickPath,saveDocument,confirm,fileOpen}) {
  const [home,setHome]=React.useState(null);
  const [selected,setSelected]=React.useState("");
  const [opened,setOpened]=React.useState([]);
  const [views,setViews]=React.useState({});
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState("");
  const [notice,setNotice]=React.useState("");
  const [dialog,setDialog]=React.useState(null);
  const active=React.useRef(true), transaction=React.useRef(false), root=React.useRef(null), handled=React.useRef(null);
  React.useEffect(()=>{active.current=true;let stale=false;
    invoke("portfolio",{}).then(data=>{if(!stale)setHome(prev=>prev??data);},e=>{if(!stale)setError(e.message);});
    return()=>{stale=true;active.current=false;};
  },[invoke]);
  const project=home?.projects.find(p=>p.id===selected);
  const view=views[selected]??{route:"portfolio",release:"",process:"",baseline:""};
  const input = {project:selected,release:view.release,baseline:view.baseline||undefined,ticket:home?.ticket,revision:home?.revision};
  const state=useResource(React,invoke,"load",input,Boolean(project));
  const patch=next=>setViews(prev=>({...prev,[selected]:{...prev[selected],...next}}));
  function openProject(id,route="lifecycle",extra={}) {
    setViews(prev=>({...prev,[id]:{...(prev[id]??initialViews(home)[id]),route,...extra}}));
    setOpened(current=>current.includes(id)?current:[...current,id]);
    setSelected(id);
  }
  function go(route,extra={}) {
    if(route==="portfolio"){setSelected("");return;}
    const focus=one(state.value?.items??[],extra.id);
    patch({route,process:"",id:"",tab:"",page:0,query:"",docPage:undefined,version:undefined,candidate:undefined,
      filterKind:route==="requirements"&&focus?.requirement?focus.kind:undefined,reviewFilter:undefined,ownerFilter:undefined,
      statusFilter:undefined,direction:undefined,traceProcess:undefined,...extra});
  }
  function toItem(item){
    const id=typeof item==="string"?item:item?.id;
    if(!id)return;
    const found=one(state.value?.items??[],id);
    const route=found?.kind==="document"||found?.kind==="anchor"?"intake"
      :found?.kind==="measure"||found?.kind==="execution"||found?.kind==="evidence"?"verification"
      :found?.kind==="change"?"impact":found?.kind==="problem"||found?.kind==="risk"?"risks"
      :found?.kind==="finding"?"assessment":found?.kind==="architecture"||found?.kind==="design"||found?.kind==="unit"?"architecture":found?.kind in kinds?"requirements":"trace";
    go(route,{id,process:found?.kind==="finding"?found.process:""});
  }
  async function task(fn,message=""){
    if(transaction.current)return false;
    transaction.current=true;
    setBusy(true);setError("");setNotice("");
    try { await fn(); if(active.current && message)setNotice(message); return true; }
    catch(e) { if(active.current&&e.name!=="AbortError")setError(e.message); return false; }
    finally {transaction.current=false;if(active.current)setBusy(false);}
  }
  function useHome(data,replace=false){setHome(data);if(replace){setViews(initialViews(data));setOpened([]);setSelected("");}}
  async function chooseWorkspace(create,provided){
    return task(async()=>{
      const picked=provided?{path:provided}:await pickPath(create?{kind:"folder"}:{kind:"file",extensions:[".ell"]});
      if(!picked)return;
      useHome(await invoke(create?"create":"open",create?{folder:picked.path}:{path:picked.path}),true);
    });
  }
  React.useEffect(()=>{
    if(!fileOpen?.path||handled.current===fileOpen.request||busy)return;
    handled.current=fileOpen.request;
    void chooseWorkspace(false,fileOpen.path);
  },[fileOpen?.request,busy]);
  function mutate(command,completed) {
    return task(async()=>{
      const data=await invoke("mutate",{...input,expected:home.revision,operation:globalThis.crypto.randomUUID(),command});
      useHome(data);completed?.(data);
    },"Saved to workspace");
  }
  async function exportReport(kind){
    return task(async()=>{
      const choice=await pickPath({kind:"folder"});
      if(!choice)return;
      if(kind==="matrix"){
        const result=await invoke("exportMatrix",{...input,folder:choice.path});
        setNotice("Saved "+result.filename);
      }else{
        const report=await invoke("documentReport",{...input,kind});
        const name=report.title+" "+selected+" "+view.release+" "+new Date().toISOString().replace(/[^0-9]/g,"");
        const receipt=await saveDocument({folder:choice.path,name:name+".md",open:true,
          authoring:{title:report.title,inputs:[{key:"evidence",blocks:report.lines.map(text=>({kind:"paragraph",text}))}]}});
        setNotice(receipt.opening?.status==="refused"?"Report saved. Open it from the selected folder.":"Saved and opened the Litzio report.");
      }
    });
  }
  async function reset(){
    if(await confirm({title:"Reset demo data?",message:"This replaces changes in the current synthetic workspace. The previous revision remains in the backup file.",confirmLabel:"Reset demo"})){
      const target=project??home.projects[0];
      const release=project?view.release:target.latest;
      await task(async()=>{
        const data=await invoke("mutate",{project:target.id,release,ticket:home.ticket,expected:home.revision,operation:globalThis.crypto.randomUUID(),command:{name:"reset"}});
        useHome(data,true);
      },"Demo data restored");
    }
  }
  const toolbar=<div className="ell-actions">
    <Btn React={React} ui={ui} icon="layers" disabled={busy} onClick={()=>chooseWorkspace(false)}>Open data pack</Btn>
    {!home?.saved&&<Btn React={React} ui={ui} icon="plus" primary disabled={busy} onClick={()=>chooseWorkspace(true)}>Create data pack</Btn>}
    {home?.saved&&<Btn React={React} ui={ui} disabled={busy} onClick={()=>task(async()=>useHome(await invoke("refresh",{})),"Workspace refreshed")}>Refresh</Btn>}
  </div>;
  const currentNav=view.route==="matrix"?"trace":view.route;
  const props={React,ui,invoke,input,state:state.value,project,view,patch,go,toItem,mutate,task,openDialog:setDialog,exportReport,readOnly:!home?.saved||Boolean(view.baseline)||busy,busy,confirm,pickPath};
  return <ui.ScreenLayout details={project?.id??"Automotive SPICE® 4.1"} description="Engineer and review from customer documents to verification evidence." actions={toolbar} status={<ui.Status tone={home?.saved?"ok":"neutral"} label={busy?"Saving or loading…":home?.saved?"Data pack open":"Synthetic demo"}/>}>
    <style>{styles}</style>
    <div className="ell" ref={root} onKeyDown={e=>{
      if(e.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)){const searchBox=root.current?.querySelector("[data-engineering-search]");if(searchBox){e.preventDefault();searchBox.focus();}}
    }}>
      <aside className="ell-rail" aria-label="Engineering navigation">
        <div className="ell-brand"><Icon React={React} name="v"/><strong>Engineering<br/>Lifecycle</strong></div>
        {navigation.map(([group,entries])=><div key={group} className="ell-navgroup"><small>{group}</small>{entries.map(([id,label,icon])=><button key={id} type="button" aria-current={currentNav===id?"page":undefined} disabled={!project&&id!=="portfolio"} onClick={()=>go(id)}><Icon React={React} name={icon}/>{label}</button>)}</div>)}
        {home?.saved&&<button className="ell-reset" disabled={busy} onClick={()=>void reset()}>Reset demo</button>}
        <small className="ell-demo">Synthetic project data</small>
      </aside>
      <div className="ell-content">
        <div className="ell-tabs" role="group" aria-label="Project tabs">
          <button type="button" aria-pressed={!selected} onClick={()=>setSelected("")}><Icon React={React} name="grid"/> Portfolio</button>
          {opened.map(id=><span className="ell-project-tab" key={id}><button type="button" aria-pressed={id===selected} onClick={()=>setSelected(id)}><span className="ell-project-dot"/>{id}</button><button type="button" className="ell-close" aria-label={"Close "+id} onClick={()=>{setOpened(list=>list.filter(x=>x!==id));if(selected===id)setSelected("");}}><Icon React={React} name="close"/></button></span>)}
        </div>
        <div className="ell-body">
          {error&&<ui.Notice tone="error">{error}</ui.Notice>}
          {notice&&<div className="ell-notice" role="status">{notice}</div>}
          {!home?<div className="ell-loading" aria-live="polite"><span/><span/><span/>Loading project portfolio…</div>:!project?<Portfolio React={React} ui={ui} home={home} open={openProject}/>:<Loading React={React} ui={ui} state={state}>{data=><>
            <div className="ell-scope"><button type="button" onClick={()=>go("lifecycle")}>{project.id}</button><span> / </span>{view.route!=="lifecycle"&&<button type="button" onClick={()=>go("lifecycle")}>Lifecycle</button>}
              <div className="ell-scope-controls">
                <Select React={React} label="Release" hidden value={view.release} items={project.releases.map(x=>[x.id,"Release "+x.id])} onChange={release=>patch({release,baseline:"",id:"",page:0})}/>
                <Select React={React} label="Baseline scope" hidden value={view.baseline} items={[["","Working set"],...data.baselines.map(x=>[x.id,x.id+" · Baseline"])]} onChange={baseline=>patch({baseline,id:"",page:0})}/>
              </div>
            </div>
            <WorkspaceView {...props}/>
          </>}</Loading>}
        </div>
      </div>
      {dialog&&<EditDialog React={React} ui={ui} data={dialog} error={error} busy={busy} onClose={()=>setDialog(null)}/>}
    </div>
  </ui.ScreenLayout>;
}
function WorkspaceView(props) {
  const {view}=props;
  switch(view.route){
    case "lifecycle": return <Lifecycle {...props}/>;
    case "intake": return <Intake {...props}/>;
    case "requirements": return <Requirements {...props}/>;
    case "architecture": return <Architecture {...props}/>;
    case "trace": return <Explorer {...props}/>;
    case "matrix": return <MatrixView {...props}/>;
    case "impact": return <Impact {...props}/>;
    case "verification": return <Verification {...props}/>;
    case "baselines": return <Baselines {...props}/>;
    case "assessment": return <Assessment {...props}/>;
    case "risks": return <Risks {...props}/>;
    case "planning": return <Planning {...props}/>;
    default: return null;
  }
}
function Heading({React,title,sub,actions}) {return <div className="ell-heading"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{actions&&<div className="ell-actions">{actions}</div>}</div>;}
function EditDialog({React,ui,data,error,busy,onClose}) {
  const ref=React.useRef(null);
  const [values,set]=React.useState(Object.fromEntries(data.fields.map(f=>[f.key,f.value??""])));
  React.useEffect(()=>{ref.current?.showModal();const node=ref.current;return()=>node?.close();},[]);
  return <dialog className="ell-dialog" ref={ref} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={async e=>{e.preventDefault();if(!busy&&await data.submit(values))onClose();}}>
      <div className="ell-dialog-head"><h2>{data.title}</h2><button type="button" aria-label="Close dialog" onClick={onClose} disabled={busy}><Icon React={React} name="close"/></button></div>
      {data.help&&<p>{data.help}</p>}
      {data.fields.map(f=>f.options?<Select key={f.key} React={React} label={f.label} items={f.options} value={values[f.key]} onChange={value=>set(v=>({...v,[f.key]:value}))}/>
        :<label className="ell-field" key={f.key}><span>{f.label}</span>{f.multiline?<textarea required={f.required!==false} value={values[f.key]} rows={4} maxLength={f.max??4000} onChange={e=>set(v=>({...v,[f.key]:e.target.value}))}/>
          :<input required={f.required!==false} type={f.type??"text"} min={f.min} max={f.max} maxLength={f.maxLength??180} value={values[f.key]} onChange={e=>set(v=>({...v,[f.key]:e.target.value}))}/>}</label>)}
      <div className="ell-actions"><Btn React={React} ui={ui} disabled={busy} onClick={onClose}>Cancel</Btn><button className="ell-primary" type="submit" disabled={busy}>{busy?"Saving…":data.action??"Save"}</button></div>
      {!busy&&error&&<ui.Notice tone="error">{error}</ui.Notice>}
    </form>
  </dialog>;
}
const fieldSpec=(key,label,value="",extra={})=>({key,label,value,...extra});
function ask(props,title,fields,submit,action,help){props.openDialog({title,fields,submit,action,help});}
function openAsset(props,id,version) {
  return props.task(async()=>{
    const data=await props.invoke("asset",{...props.input,id,version});
    const bin=globalThis.atob(data.base64);
    const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:data.mime}));
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=data.filename;anchor.click();
    globalThis.setTimeout(()=>URL.revokeObjectURL(url),2000);
  });
}
