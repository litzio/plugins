
import { createHash, randomUUID } from "node:crypto";
import { PluginPublicError } from "@litzio/plugin-sdk";
import { consistency, definitions, idFor, labels, requirementKinds, scopeOf } from "./runtime/model.mjs";
import { makeWorkspace } from "./runtime/seed.mjs";
import { compare, graph, impactOf, index, matrix, metrics, traceCounts, verificationStatus, warnings } from "./runtime/operations.mjs";
import { createPack, exportCsv, openPack, readPack, readSourceFile, updatePack } from "./store.mjs";
import { makePdf, pagesOf } from "./documents.mjs";

const destinations = Object.freeze({ requirements:"requirements", assessment:"assessment", matrix:"matrix", portfolio:"portfolio" });
const cleanNames = { document:"Source", system:"System requirements", architecture:"System architecture" };
function overview(workspace) {
  return workspace.projects.map(({ releases, ...p }) => {
    const active = releases[p.latest];
    return { ...p, releases:Object.values(releases).map(r=>({id:r.id,name:r.name})), metrics:metrics(active),
      active:active.processes.filter(i=>i.state==="In progress"||i.state==="In review").slice(0,4).map(i=>i.code),
      activity:Object.values(active.items).filter(i=>i.kind==="change"||i.kind==="problem").sort((a,b)=>Number(b.code==="CR-014")-Number(a.code==="CR-014")||b.date.localeCompare(a.date)).slice(0,3)
        .map(({id,code,title,kind,review})=>({id,code,title,kind,review})),
      preview:active.processes.slice(0,15).map(({code,state})=>({code,state})) };
  });
}
function processRows(s,issues=warnings(s)) {
  const items=Object.values(s.items);
  return definitions[s.model].map(d=>{
    const instance=s.processes.find(i=>i.code===d.code);
    const treated=instance.state==="Not applicable"?[]:items.filter(i=>i.process===d.code&&i.applicable&&i.requirement?.applicability!=="Excluded");
    const planned=treated.filter(i=>!["anchor","execution","evidence","change","problem","risk","finding"].includes(i.kind));
    const marked=issues.filter(i=>s.items[i.id]?.process===d.code);
    return { ...d,...instance, planned:planned.length,approved:planned.filter(i=>i.review==="Approved").length,
      missing:marked.filter(i=>i.type.startsWith("Missing")).length,
      queued:planned.filter(i=>i.review==="In review").length, open:treated.filter(i=>i.problem?.state==="Open"||i.finding?.status==="Open").length };
  });
}
function readiness(s,issues=warnings(s)){
  return Object.fromEntries(Object.entries(s.assessments).map(([code,rows])=>{
    const relevant=issues.filter(r=>s.items[r.id]?.process===code);
    return [code,rows.map(e=>{
      if(e.state==="N/A")return e;
      if(e.label==="Traceability"&&relevant.some(r=>["Missing source","Missing rationale","Missing downstream","Missing relationship","Dangling relationship","Invalid relationship"].includes(r.type)))return {...e,state:"Missing"};
      if(e.label==="Consistency"&&relevant.some(r=>r.type==="Suspect relationship"))return {...e,state:"Review"};
      return e;
    })];
  }));
}
const summary = (item) => ({id:item.id,code:item.code,kind:item.kind,title:item.title,process:item.process,owner:item.owner,revision:item.revision,review:item.review,
  requirement:item.requirement?{...item.requirement,revisions:undefined}:undefined,source:item.source,
  document:item.document?{current:item.document.current,state:item.document.state,applicability:item.document.applicability,revisions:item.document.revisions.map(r=>({version:r.version,received:r.received,pages:r.pages.length,imported:Boolean(r.attachment)}))}:undefined,
  change:item.change?{state:item.change.state,target:item.change.target}:undefined,
  finding:item.finding,problem:item.problem,risk:item.risk});
function view(s,release,users,baseline) {
  const get=index(s), trace=traceCounts(s), issues=warnings(s);
  const items=Object.values(s.items);
  return { model:s.model,baselines:release.baselines.map(({id,created,approvedBy})=>({id,created,approvedBy})),metrics:metrics(s,baseline),
    processes:processRows(s,issues),items:items.map(item=>{
      if(item.kind!=="measure")return {...summary(item),trace:trace[item.id]};
      const {status,execution,history,count}=verificationStatus(s,item,baseline,get);
      return {...summary(item),status,count,execution:execution?.code,history:history?.code};
    }),
    assessments:readiness(s,issues),assessorRecords:s.assessorRecords,events:s.audit.slice(-20).reverse(),users };
}
function lookup(s,id) {
  if(typeof id!=="string"||!Object.hasOwn(s.items,id))throw new Error("Choose an artifact in this project and release.");
  return s.items[id];
}
function executionBaseline(s,item,release) {
  const execution=item.execution??s.items[item.evidence?.execution]?.execution;
  return execution&&release.baselines.find(b=>b.id===execution.scope)?.id;
}
function detail(s,id,baseline) {
  const item=lookup(s,id), get=index(s);
  const connected=[...(get.forward.get(id)??[]),...(get.reverse.get(id)??[])].map(l=>({id:l.id,type:l.type,from:l.from,to:l.to,review:consistency(l,s.items),
    peer:summary(lookup(s,l.from===id?l.to:l.from)),fromRevision:l.fromRevision,toRevision:l.toRevision}));
  const missing=s.expectations.filter(e=>e.from===id && !connected.some(l=>l.type===e.type&&(e.to?l.to===e.to:l.peer.kind===e.targetKind))).map(e=>({...e,peer:e.to&&s.items[e.to]?summary(s.items[e.to]):undefined}));
  const runs=item.measure?(get.forward.get(id)??[]).filter(l=>l.type==="resultOf").map(l=>lookup(s,l.to)).filter(x=>x.execution).sort((a,b)=>b.execution.date.localeCompare(a.execution.date)):[];
  const source = item.source ? item : connected.map(l=>s.items[l.peer.id]).filter(i=>i.source && i.source.quote===item.body)[0]
    ?? connected.map(l=>s.items[l.peer.id]).filter(i=>i.source)[0];
  return { item:item.document?summary(item):item,connected,missing,source:source?.source,
    comments:s.reviews.filter(r=>r.item===id),approvals:s.approvals.filter(r=>r.item===id),runs,
    verification:item.measure?verificationStatus(s,item,baseline,get):undefined };
}
function documentView(s,id,version) {
  const document=lookup(s,id);
  const revision=document.document?.revisions.find(r=>r.version===(version||document.document.current));
  if(!revision)throw new Error("Choose an available document revision.");
  const get=index(s);
  const anchors=Object.values(s.items).filter(i=>i.source?.document===id&&i.source.version===revision.version);
  const candidates=anchors.flatMap(a=>(get.forward.get(a.id)??[]).filter(l=>l.type==="extractedFrom").map(l=>({item:summary(lookup(s,l.to)),anchor:a.source})));
  for(const a of anchors){
    const change=Object.values(s.items).find(i=>i.change?.newText===a.source.quote&&i.change.state!=="Closed");
    if(change&&!candidates.some(c=>c.item.id===change.change.target&&c.anchor.section===a.source.section)){
      const target=lookup(s,change.change.target);
      candidates.unshift({item:summary(target),anchor:a.source,proposed:true});
    }
  }
  return { document:summary(document), revision:revision.version,imported:Boolean(revision.attachment),pages:pagesOf(document,revision),candidates,anchors:anchors.map(a=>({id:a.id,...a.source})) };
}
function graphView(s,input) {
  const data=graph(s,input);
  const reduce=item=>({ ...summary(item),evidence:item.evidence?{filename:item.evidence.filename}:undefined,execution:item.execution?{scope:item.execution.scope,outcome:item.execution.result.outcome}:undefined });
  return { ...data,items:data.items.map(reduce),missing:data.missing.map(e=>({...e,target:reduce(e.target)})) };
}
const pct = ratio => ratio.d ? Math.round(100*ratio.n/ratio.d)+"%" : "N/A";
function report({s,project,release,baseline}, kind) {
  const m=metrics(s,baseline);
  const note="Scope "+project.id+" / "+release.id+" / "+(baseline||"Working set")+" · PAM "+s.model;
  if(kind==="matrix"){
    const rows=s.links.map(l=>[s.items[l.from]?.code||"Missing",l.type,s.items[l.to]?.code||"Missing",consistency(l,s.items)]);
    const field=value=>{
      const str=String(value);
      return '"' + (/^[=+\-@\t\r]/.test(str)?"'"+str:str).replaceAll('"','""') + '"';
    };
    return [["Source","Relationship","Target","Consistency"],...rows].map(row=>row.map(field).join(",")).join("\r\n");
  }
  const process=processRows(s), assessment=readiness(s);
  const lines = ["Synthetic Engineering Lifecycle demonstration.",note,
    "Deliverable approval: "+pct(m.deliverables)+" ("+m.deliverables.n+"/"+m.deliverables.d+"). Trace coverage: "+pct(m.trace)+" ("+m.trace.n+"/"+m.trace.d+").",
    "Verification measures executed: "+m.execution.n+" of "+m.execution.d+". Pass rate: "+pct(m.pass)+".",
    ...process.filter(p=>p.state!=="Not applicable").map(p=>{
      const entries=assessment[p.code]??[];
      const gaps=Object.values(s.items).filter(i=>i.kind==="finding"&&i.process===p.code&&i.finding.status!=="Closed");
      const evidence=entries.map(e=>e.label+" "+e.state+(e.source?" ["+(s.items[e.source]?.code??"source unavailable")+"]":""));
      return p.code+" "+p.label+" · "+p.state+" · "+evidence.join(", ")+(gaps.length?" · "+gaps.map(i=>i.code+" "+i.title+" / "+(i.finding.action??"Needs assigned action")).join(", "):"");
    }),
  ];
  if(kind==="assessment")lines.push("Evidence readiness describes the artifacts in scope. Capability ratings are recorded separately by an assessor.");
  return { title:kind==="assessment"?"Assessment evidence package":"Engineering lifecycle report",lines };
}
function answer(s,req,release) {
  const items=Object.values(s.items), get=index(s);
  const select=kind=>items.filter(i=>i.kind===kind&&(!req.process||i.process===req.process));
  const artifact=id=>{const i=lookup(s,id);return {id:i.code,title:i.title,process:i.process,revision:i.revision};};
  function evidenceScope(id) {
    const baseline=executionBaseline(s,lookup(s,id),release);
    return baseline&&release.baselines.find(b=>b.id===baseline&&b.snapshot.items[id])?.snapshot || s;
  }
  function provenance(id,sourceScope=evidenceScope(id)) {
    const trace=graph(sourceScope,{id,direction:"Upstream",depth:8,cap:60});
    return trace.items.filter(i=>i.source).slice(0,6).map(i=>({document:sourceScope.items[i.source.document]?.code,version:i.source.version,page:i.source.page,section:i.source.section,quote:i.source.quote}));
  }
  const target=req.target?idFor(req.project,req.target):undefined;
  switch(req.question){
    case "summary": return [{metrics:metrics(s,req.baseline), openChanges:select("change").filter(i=>i.change.state!=="Closed").length}];
    case "missing-trace":return warnings(s,req.process).filter(x=>x.type.includes("Missing")||x.type.includes("relationship")).slice(0,req.limit).map(x=>({ ...x,id:x.code,source:provenance(x.id) }));
    case "unverified":return select("system").filter(i=>i.applicable&&i.requirement?.applicability!=="Excluded").filter(i=>!(get.forward.get(i.id)??[]).filter(l=>l.type==="verifiedBy").some(l=>verificationStatus(s,lookup(s,l.to),req.baseline,get).status==="Passed")).slice(0,req.limit).map(i=>({...artifact(i.id),source:provenance(i.id)}));
    case "impact": {
      const focus=target?lookup(s,target):select("change")[0];
      if(!focus)return [];
      return impactOf(s,focus.change?.target??focus.id).slice(0,req.limit).map(c=>({...artifact(c.id),hops:c.hops,path:c.path.map(x=>artifact(x).id)}));
    }
    case "failed-evidence":return select("execution").filter(i=>i.execution.result.outcome==="Failed"&&(!req.baseline||i.execution.scope===req.baseline)).slice(0,req.limit).map(i=>({...artifact(i.id),scope:i.execution.scope,result:i.execution.result,source:provenance(i.id)}));
    case "readiness":return Object.entries(readiness(s)).filter(([process])=>!req.process||req.process===process).map(([process,rows])=>({process,evidence:rows.filter(e=>["Missing","Review"].includes(e.state)).map(e=>({...e,source:s.items[e.source]?.code})),findings:select("finding").filter(i=>i.process===process).map(i=>artifact(i.id))})).slice(0,req.limit);
    case "trace": {
      if(!target)throw new Error("Provide the displayed requirement, measure or evidence ID.");
      const historical=evidenceScope(target);
      return [{...artifact(target),evidenceBaseline:executionBaseline(s,lookup(s,target),release),
        source:provenance(target,historical),related:graph(historical,{id:target,depth:4}).items.slice(0,req.limit).map(i=>({id:i.code,title:i.title,process:i.process,revision:i.revision}))}];
    }
    default: throw new Error("Choose a supported engineering question.");
  }
}

export function activate() {
  let workspace=makeWorkspace(), loaded=null, queue=Promise.resolve();
  let ticket=randomUUID();
  function portfolio(){return {revision:workspace.revision,saved: Boolean(loaded),ticket,projects:overview(workspace),users:workspace.users};}
  function context(req){
    if(req.ticket&&req.ticket!==ticket)throw new Error("This Host opened another data pack. Return to Portfolio and select your workspace.");
    const {project,release,scope}=scopeOf(workspace,req.project,req.release,req.baseline);
    return {s:scope,project,release,baseline:req.baseline};
  }
  function write(fn){
    const task=queue.then(fn);
    queue=task.catch(()=>{});
    return task;
  }
  const handlers={
    portfolio,
    load: req=>{
      const {s,release,baseline}=context(req);
      return view(s,release,workspace.users,baseline);
    },
    create: req=>write(async()=>{
      const data=await createPack(req.folder);
      loaded=data.file; workspace=data.workspace; ticket=randomUUID();
      return portfolio();
    }),
    open: req=>write(async()=>{
      const data=await openPack(req.path);
      loaded=data.file; workspace=data.workspace; ticket=randomUUID();
      return portfolio();
    }),
    refresh: ()=>write(async()=>{
      if(loaded)workspace=await readPack(loaded);
      return portfolio();
    }),
    mutate: req=>write(async()=>{
      if(!loaded)throw new Error("Create or open a workspace data pack to save edits.");
      if(req.ticket!==ticket)throw new Error("This Host opened another data pack. Reopen your workspace before editing.");
      if(req.baseline)throw new Error("Baselines are read-only. Switch to the working set to edit.");
      scopeOf(workspace,req.project,req.release);
      const command=req.command?.name==="receive-source"?{...req.command,attachment:await readSourceFile(req.command.path)}:req.command;
      workspace=await updatePack(loaded,req.expected,req.operation,req.project,req.release,command);
      return portfolio();
    }),
    detail: req=>{
      const {s,baseline,release}=context(req), result=detail(s,req.id,baseline);
      return {...result,evidenceBaseline:executionBaseline(s,lookup(s,req.id),release)};
    },
    document: req=>documentView(context(req).s,req.id,req.version),
    asset: req=>{
      const {s}=context(req),item=lookup(s,req.id);
      if(item.document){
        const r=item.document.revisions.find(r=>r.version===(req.version??item.document.current));
        if(!r)throw new Error("Choose an available document revision.");
        if(r.attachment){
          const file=r.attachment;
          const data=Buffer.from(file.base64,"base64");
          const mime=file.mime;
          if(!["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(mime)||data.length>4*1024*1024||!/^[^\x00-\x1f/\\]+\.(pdf|docx)$/i.test(file.filename)||createHash("sha256").update(data).digest("hex")!==file.sha256)throw new Error("The stored original did not pass its integrity check.");
          return {filename:file.filename,mime,base64:file.base64};
        }
        return {filename:item.code+"-v"+r.version+".pdf",mime:"application/pdf",base64:makePdf(item,r).toString("base64")};
      }
      if(item.evidence)return {filename:item.evidence.filename,mime:item.evidence.mime,base64:Buffer.from(item.evidence.content).toString("base64")};
      throw new Error("This artifact has no source file.");
    },
    trace: req=>graphView(context(req).s,req),
    matrix: req=>matrix(context(req).s,req),
    gaps: req=>{const {s}=context(req);return warnings(s,req.process);},
    comparison: req=>{
      const {s,release}=context(req);
      const prior=release.baselines.find(b=>b.id===req.compare);
      if(!prior)throw new Error("Choose a baseline to compare.");
      return compare(s,prior.snapshot);
    },
    documentReport: req=>{
      if(!Object.hasOwn(destinations,req.kind)||req.kind==="matrix")throw new Error("Choose a report type.");
      return report(context(req),req.kind);
    },
    exportMatrix: req=>write(async()=>{
      const csv=report(context(req),"matrix");
      return {filename:await exportCsv(req.folder,"engineering-trace-"+new Date().toISOString().replace(/[^0-9]/g,"")+".csv",csv)};
    }),
    investigate: req=>{
      const {s,release}=context(req);
      return {project:req.project,release:req.release,scope:req.baseline||"Working set",records:answer(s,{...req,limit:req.limit??12},release)};
    },
  };
  async function run(name,input={}) {
    try { return await handlers[name](input); }
    catch(error){
      // Host filesystem errors can contain absolute paths that should stay on the Host.
      const code=error?.code;
      const message=code==="ENOENT"?"The selected data pack or folder could not be found."
        :code==="EACCES"||code==="EPERM"?"The Host cannot access the selected file or folder."
        :code==="ENOSPC"?"The Host does not have enough disk space to save the data pack."
        :code?"The Host could not complete the file operation. Check the selected workspace."
        :String(error?.message??"The operation could not complete.").replace(/[\r\n]+/g," ").slice(0,300);
      throw new PluginPublicError("engineering-action", message);
    }
  }
  return {
    operations:{
      portfolio: input=>run("portfolio",input),
      load: input=>run("load",input),
      create: input=>run("create",input),
      open: input=>run("open",input),
      refresh: input=>run("refresh",input),
      mutate: input=>run("mutate",input),
      detail: input=>run("detail",input),
      document: input=>run("document",input),
      asset: input=>run("asset",input),
      trace: input=>run("trace",input),
      matrix: input=>run("matrix",input),
      gaps: input=>run("gaps",input),
      comparison: input=>run("comparison",input),
      documentReport: input=>run("documentReport",input),
      exportMatrix: input=>run("exportMatrix",input),
      investigate: input=>run("investigate",input),
    },
    status:()=>({available:true,message:loaded?"Workspace data pack open":"Synthetic demo portfolio ready"}),
    dispose:()=>queue,
  };
}
