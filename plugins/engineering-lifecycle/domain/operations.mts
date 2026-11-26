
import { acceptsLink, consistency, definitions, directedTypes, idFor, kindColumns, labels, linkBetween, requirementKinds, scopeOf, snapshotOf } from "./model.mjs";
import { makeWorkspace } from "./seed.mjs";
import type { ChangeState, DocumentRevision, ImpactCandidate, Item, Kind, LinkType, ProcessState, ReviewState, Snapshot, TraceExpectation, TraceLink, Workspace } from "./model.mjs";

const changes: ChangeState[] = ["Proposed","Impact analysis","Owner review","Approved","Updating artifacts","Re-verification","Closed"];
const active = (item: Item) => item.applicable && item.requirement?.applicability !== "Excluded";
const appliedProcess = (s: Snapshot, code: string) => s.processes.find(p => p.code === code)?.state !== "Not applicable";
const yes = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const string = (v: unknown, label: string, max = 4000): string => {
  if (!yes(v) || v.length > max) throw new Error("Enter a valid " + label + ".");
  return v.trim();
};
const real = (v: unknown, label: string, max = 5) => {
  if (typeof v !== "number" || !Number.isInteger(v) || v<1 || v>max) throw new Error("Enter a valid " + label + ".");
  return v;
};
const find = (s: Snapshot, id: unknown): Item => {
  const item = typeof id === "string" && Object.hasOwn(s.items,id) ? s.items[id] : undefined;
  if (!item) throw new Error("This artifact is outside the selected project or release.");
  return item;
};
function unique(list: string[]) { return [...new Set(list)]; }
export function index(s: Snapshot) {
  const forward = new Map<string, TraceLink[]>(), reverse = new Map<string, TraceLink[]>();
  for (const link of s.links) {
    if (!s.items[link.from] || !s.items[link.to]) continue;
    if (!forward.has(link.from)) forward.set(link.from, []);
    if (!reverse.has(link.to)) reverse.set(link.to, []);
    forward.get(link.from)!.push(link);
    reverse.get(link.to)!.push(link);
  }
  return { forward, reverse };
}
function expectedLink(s: Snapshot, expected: TraceExpectation, get: Map<string,TraceLink[]>) {
  return get.get(expected.from)?.find(l => l.type === expected.type && (expected.to ? expected.to === l.to : s.items[l.to]?.kind === expected.targetKind) && active(s.items[l.to]));
}
function applies(s: Snapshot, e: TraceExpectation) {
  const from=s.items[e.from], to=e.to?s.items[e.to]:undefined;
  return Boolean(from && active(from) && appliedProcess(s,from.process) && (!to || (active(to) && appliedProcess(s,to.process))));
}
export function traceCounts(s:Snapshot) {
  const get=index(s), counts:Record<string,{needed:number;present:number;suspect:number}>={};
  for(const expected of s.expectations){
    if(!applies(s,expected))continue;
    const count=counts[expected.from]??={needed:0,present:0,suspect:0};
    count.needed++;
    const link=expectedLink(s,expected,get.forward);
    if(link){count.present++;if(consistency(link,s.items)==="Suspect")count.suspect++;}
  }
  return counts;
}
export function verificationStatus(s: Snapshot, vm: Item, baseline?: string, get = index(s)): {status:string; execution?:Item; history?:Item; count:number} {
  const executions = (get.forward.get(vm.id) ?? []).filter(l=>l.type==="resultOf").map(link=>s.items[link.to]).filter(item=>item.execution?.measure===vm.id).sort((a,b)=>b.execution!.date.localeCompare(a.execution!.date)||b.code.localeCompare(a.code));
  const targets = (get.reverse.get(vm.id) ?? []).filter(l=>["verifiedBy","validatedBy"].includes(l.type));
  const targetCount=new Set(targets.map(l=>l.from)).size;
  const history = executions[0];
  const execution = executions.find(({execution:e})=>e!.measureRevision===vm.revision
    && (!baseline||e!.scope===baseline||e!.scope.startsWith("Working set @"))
    && (!vm.measure?.retestAfter||e!.date>=vm.measure.retestAfter)
    && (e!.targetRevisions
      ? Object.keys(e!.targetRevisions).length===targetCount && targets.every(l=>e!.targetRevisions![l.from]===s.items[l.from].revision)
      : targets.every(l=>l.fromRevision===s.items[l.from].revision && l.toRevision===vm.revision)));
  if (!execution) return {status:history ? "Retest required" : "Not run",history,count:executions.length};
  return {status:execution.execution!.result.outcome, execution, history, count:executions.length};
}
export function metrics(s: Snapshot, baseline?:string) {
  const items=Object.values(s.items).filter(i=>active(i)&&appliedProcess(s,i.process));
  const get=index(s);
  const requirements=items.filter(x=>["system","software","hardware"].includes(x.kind));
  const expectations=s.expectations.filter(e=>applies(s,e)&&["system","software","hardware"].includes(s.items[e.from].kind));
  const needed=unique(expectations.map(e=>e.from));
  const incomplete=new Set(expectations.filter(e=>!expectedLink(s,e,get.forward)).map(e=>e.from));
  const measures=items.filter(i=>i.kind==="measure");
  const statuses=measures.map(i=>verificationStatus(s,i,baseline,get).status);
  const passed=statuses.filter(status=>status==="Passed").length;
  const failed=statuses.filter(status=>status==="Failed").length;
  const executed=statuses.filter(status=>["Passed","Failed","Blocked"].includes(status)).length;
  const deliverables=items.filter(i=>["document","stakeholder","system","software","hardware","architecture","design","unit","measure"].includes(i.kind));
  return {
    deliverables:{n:deliverables.filter(i=>i.review==="Approved").length,d:deliverables.length},
    trace:{n:needed.length-incomplete.size,d:needed.length},
    mapped:{n:requirements.filter(item=>(get.forward.get(item.id)??[]).some(l=>l.type==="verifiedBy"&&active(s.items[l.to]))).length,d:requirements.length},
    execution:{n:executed,d:measures.length}, pass:{n:passed,d:passed+failed},
    open:items.filter(i=>i.problem?.state==="Open").length, risks:items.filter(i=>i.risk&&i.risk.likelihood*i.risk.impact>=12).length,
  };
}
export function warnings(s: Snapshot, process?: string) {
  const get=index(s), report:{id:string; code:string; type:string; detail:string; to?:string}[]=[];
  const emit = (item:Item,type:string,detail:string,to?:string) => report.push({id:item.id,code:item.code,type,detail,to});
  const same = (i: Item) => (!process || i.process===process) && active(i) && appliedProcess(s,i.process);
  const headings=new Map<string,Item>();
  for (const i of Object.values(s.items)) {
    if (!same(i)) continue;
    const out=get.forward.get(i.id)??[], incoming=get.reverse.get(i.id)??[];
    if(i.kind==="customer"&&!incoming.some(l=>l.type==="extractedFrom")) emit(i,"Missing source","No approved source anchor is attached.");
    if(["system","software","hardware"].includes(i.kind)){
      if(!incoming.some(l=>["derivedFrom","refinedFrom"].includes(l.type))&&!i.requirement?.rationale) emit(i,"Missing rationale","No parent or documented derivation basis.");
      if(!i.requirement?.method) emit(i,"Missing verification method","Choose how to verify this requirement.");
      if(!out.some(l=>["allocatedTo","derivedFrom","realizedBy","refinedFrom","verifiedBy"].includes(l.type))) emit(i,"Missing downstream","No downstream design, requirement or measure.");
      const prev=headings.get(i.kind+"|"+i.title.toLocaleLowerCase());
      if(prev) emit(i,"Duplicate candidate","Same requirement title.",prev.id);
      headings.set(i.kind+"|"+i.title.toLocaleLowerCase(),i);
    }
    if(i.kind==="measure"){
      const m=verificationStatus(s,i,undefined,get);
      if(["Retest required","Not run"].includes(m.status)) emit(i,m.status,"No execution applies to the current revisions.");
    }
    for (const l of out) {
      if (!acceptsLink(i,s.items[l.to],l.type)) emit(i,"Invalid relationship",l.type+" is outside the allowed endpoint types.",l.to);
      if(consistency(l,s.items)==="Suspect") emit(i,"Suspect relationship","Review the endpoint revisions and rationale.",l.to);
    }
  }
  for(const e of s.expectations) if(applies(s,e)&&same(s.items[e.from])&&!expectedLink(s,e,get.forward)) emit(s.items[e.from],"Missing relationship",e.category,e.to);
  for(const l of s.links) if(s.items[l.from]&&same(s.items[l.from])&&!s.items[l.to]) emit(s.items[l.from],"Dangling relationship","The related artifact is unavailable.",l.to);
  return report;
}
export function graph(s: Snapshot, input: {id:string; direction?:string; depth?:number; cap?:number; process?:string}) {
  find(s,input.id);
  const get=index(s), ids=new Set([input.id]);
  const depth=Math.min(Math.max(input.depth??4,1),8), cap=Math.min(Math.max(input.cap??42,8),100);
  let truncated=false;
  const directions=input.direction==="Upstream"?[false]:input.direction==="Downstream"?[true]:[false,true];
  for(const downstream of directions) {
    const visited=new Set([input.id]), queue:[string,number][]=[[input.id,0]];
    for (const [key,d] of queue) {
      if (d>=depth) continue;
      const links=(downstream?get.forward:get.reverse).get(key)??[];
      for (const link of links) {
        const next=downstream?link.to:link.from;
        if(visited.has(next))continue;
        if(input.process&&s.items[next].process!==input.process)continue;
        if(!ids.has(next)&&ids.size>=cap){truncated=true;continue;}
        ids.add(next);visited.add(next);queue.push([next,d+1]);
      }
    }
  }
  const items=[...ids].map(i=>s.items[i]);
  const missing=s.expectations.filter(e=>ids.has(e.from)&&e.to&&s.items[e.to]&&applies(s,e)&&!expectedLink(s,e,get.forward)).slice(0,15);
  const edges=s.links.filter(l=>ids.has(l.from)&&ids.has(l.to)).map(l=>({...l,review:consistency(l,s.items)}));
  return {items,edges,missing:missing.map(e=>({...e,target:s.items[e.to!]})),truncated,columns:kindColumns,labels};
}
export function matrix(s: Snapshot,input:{from:Kind;to:Kind;type:LinkType;query?:string;rowStart?:number;colStart?:number;onlyGaps?:boolean}) {
  const all=Object.values(s.items), get=index(s);
  const q=(input.query??"").toLowerCase();
  const order=(a:Item,b:Item)=>a.code.localeCompare(b.code,"en",{numeric:true});
  const cols=all.filter(i=>i.kind===input.to&&active(i)&&appliedProcess(s,i.process)).sort(order);
  const rows=all.filter(i=>i.kind===input.from&&active(i)&&appliedProcess(s,i.process)&&(!q||(i.code+" "+i.title).toLowerCase().includes(q))).sort(order);
  const scoped=s.expectations.filter(e=>e.type===input.type&&e.targetKind===input.to&&applies(s,e));
  const needed=new Map<string,Set<string>>();
  for(const e of scoped){
    if(!needed.has(e.from)) needed.set(e.from,new Set());
    if(e.to) needed.get(e.from)!.add(e.to);
  }
  const visibleRows=input.onlyGaps?rows.filter(r=>scoped.some(e=>e.from===r.id&&!expectedLink(s,e,get.forward))):rows;
  const from=visibleRows.slice(Math.max(0,input.rowStart??0),Math.max(0,input.rowStart??0)+12);
  const to=cols.slice(Math.max(0,input.colStart??0),Math.max(0,input.colStart??0)+9);
  return { rows:from, cols:to, rowCount:visibleRows.length,colCount:cols.length,cells:from.map(r=>to.map(c=>{
    const l=get.forward.get(r.id)?.find(l=>l.to===c.id&&l.type===input.type);
    return { state:l?consistency(l,s.items):needed.get(r.id)?.has(c.id)?"Missing":"Not applicable",link:l?.id };
  }))};
}
export function impactOf(s:Snapshot,target:string) {
  find(s,target);
  const allowed=new Set<LinkType>(directedTypes.filter(x=>x.impact).map(x=>x.type));
  const get=index(s), seen=new Set([target]), q=[[target]]; const result:ImpactCandidate[]=[];
  for(const path of q){
    const key=path.at(-1)!;
    for(const link of get.forward.get(key)??[]){
      if(!allowed.has(link.type)||seen.has(link.to)||!active(s.items[link.to]))continue;
      seen.add(link.to); const next=[...path,link.to]; q.push(next);
      result.push({id:link.to,hops:next.length-1,path:next,owner:s.items[link.to].owner,disposition:"Pending"});
    }
  }
  return result;
}
export function compare(s:Snapshot,b:Snapshot) {
  const result:{id:string;code:string;title:string;kind:string;change:string}[]=[];
  for(const i of Object.values(s.items)){
    const prev=b.items[i.id];
    if(i.revision!==prev?.revision||i.review!==prev?.review||i.document?.current!==prev?.document?.current||
      i.requirement?.priority!==prev?.requirement?.priority||i.requirement?.applicability!==prev?.requirement?.applicability||
      i.change?.state!==prev?.change?.state||i.finding?.status!==prev?.finding?.status||i.problem?.state!==prev?.problem?.state)
      result.push({id:i.id,code:i.code,title:i.title,kind:i.kind,change:prev?"Modified":"Added"});
  }
  for(const i of Object.values(b.items)) if(!s.items[i.id]) result.push({id:i.id,code:i.code,title:i.title,kind:i.kind,change:"Removed"});
  const left=new Map(b.links.map(x=>[x.id,x])),right=new Map(s.links.map(x=>[x.id,x]));
  for(const link of s.links){
    const old=left.get(link.id);
    if(!old||JSON.stringify(old)!==JSON.stringify(link))result.push({id:link.id,code:s.items[link.from]?.code??"",title:link.type+" → "+s.items[link.to]?.code,kind:"trace",change:old?"Reviewed or revised":"Added"});
  }
  for(const link of b.links) if(!right.has(link.id))result.push({id:link.id,code:b.items[link.from]?.code??"",title:link.type+" → "+b.items[link.to]?.code,kind:"trace",change:"Removed"});
  return result;
}

type Command = { name:string; [key:string]:unknown };
const statuses: ProcessState[]=["Not started","Ready","In progress","In review","Blocked","Completed","Not applicable"];
const reviewStates: ReviewState[]=["Draft","In review","Approved","Rejected"];
function owner(workspace:Workspace,id:unknown) {
  if(typeof id!=="string"||!workspace.users.some(u=>u.id===id))throw new Error("Select a workspace user.");
  return id;
}
function nextCode(s:Snapshot, prefix:string, initial=400) {
  const count=Object.values(s.items).reduce((n,i)=>i.code.startsWith(prefix+"-")&&/^\d+$/.test(i.code.slice(prefix.length+1))?Math.max(n,Number(i.code.slice(prefix.length+1))):n,initial);
  return prefix+"-"+(count+1);
}
function typedItem(s:Snapshot,id:unknown,kind:Kind) {
  const i=find(s,id);
  if(i.kind!==kind)throw new Error("Select a "+labels[kind]+".");
  return i;
}
export function command(workspace: Workspace, projectId:string, releaseId:string, c:Command, opId:string, now:string): Workspace {
  if(workspace.applied.includes(opId)) return workspace;
  if(c.name==="reset"){
    if(!workspace.resettable) throw new Error("This workspace cannot be reset.");
    const clean=makeWorkspace(); clean.revision=workspace.revision+1; clean.applied=[...workspace.applied.slice(-79),opId]; return clean;
  }
  const fresh=structuredClone(workspace);
  const {release:s}=scopeOf(fresh,projectId,releaseId);
  const author=c.actor===undefined ? fresh.users[0].id : owner(fresh,c.actor);
  const selected=(c.id===undefined?undefined:find(s,c.id));
  const record=(detail:string,item?:Item)=>s.audit.push({id:opId,at:now,actor:author,action:detail,item:item?.id});
  function addArtifact(code:string,kind:Kind,title:string,body:string,process:string,extras:Partial<Item>={}) {
    const id=idFor(projectId,code);
    if(Object.hasOwn(s.items,id))throw new Error("That ID already exists.");
    const item:Item={id,code,kind,title,body,process,owner:author,revision:1,review:"Draft",applicable:true,date:now,...extras};
    s.items[id]=item; return item;
  }
  function addLink(from:Item,to:Item,type:LinkType) {
    if(!acceptsLink(from,to,type))throw new Error("This relationship does not accept those artifact types.");
    const link=linkBetween(from,to,type);
    if(s.links.some(x=>x.id===link.id))throw new Error("That relationship already exists.");
    s.links.push(link); return link;
  }
  function revise(item:Item, title:string, body:string, criterion?:string, change?:string) {
    item.revision++; item.title=title; item.body=body; item.date=now; item.review="In review";
    if(item.requirement) {
      if(criterion) item.requirement.criterion=criterion;
      item.requirement.revisions.push({revision:item.revision,title,body,time:now,owner:author,change});
    }
    if(item.measure&&criterion) item.measure.criterion=criterion;
  }
  switch(c.name){
    case "new-requirement": {
      const kind=c.kind as Kind;
      if(!requirementKinds.includes(kind))throw new Error("Choose a requirement type.");
      const title=string(c.title,"title",180),body=string(c.body,"requirement");
      const prefix={customer:"CUS",stakeholder:"STK",system:"SYS",software:"SWE",hardware:"HWE"}[kind as "system"];
      const process=({customer:"SYS.1",stakeholder:"SYS.1",system:"SYS.2",software:"SWE.1",hardware:"HWE.1"})[kind as "system"];
      const item=addArtifact(nextCode(s,prefix),kind,title,body,process,{requirement:{type:yes(c.type)?c.type:labels[kind],classification:yes(c.classification)?c.classification:"Functional",priority:"Normal",method:yes(c.method)?c.method:"",rationale:yes(c.rationale)?c.rationale:"",criterion:yes(c.criterion)?c.criterion:"",implementation:"Planned",applicability:"Applicable",revisions:[{revision:1,title,body,time:now,owner:author}]}});
      if(yes(c.parent))addLink(find(s,c.parent),item,"derivedFrom");
      record("Created requirement",item); break;
    }
    case "revise":{
      const item=selected;
      if(!item||(!item.requirement&&!item.measure))throw new Error("Select a requirement or verification measure.");
      revise(item,string(c.title,"title",180),string(c.body,"description"),yes(c.criterion)?string(c.criterion,"criterion",1000):undefined);
      if(item.requirement&&yes(c.method))item.requirement.method=string(c.method,"verification method",60);
      record("Revised artifact",item); break;
    }
    case "review":{
      if(!selected||!selected.requirement)throw new Error("Choose a requirement.");
      const decision=c.decision as ReviewState;
      if(decision!==undefined&&!reviewStates.includes(decision))throw new Error("Choose a review decision.");
      const comment=string(c.comment,"review comment",2000);
      s.reviews.push({item:selected.id,revision:selected.revision,author,comment,at:now});
      if(decision)selected.review=decision;
      if(decision==="Approved"||decision==="Rejected")s.approvals.push({item:selected.id,revision:selected.revision,author,decision,at:now});
      record("Reviewed requirement",selected); break;
    }
    case "set-requirements":{
      if(!Array.isArray(c.ids)||!c.ids.length||c.ids.length>100)throw new Error("Select up to 100 requirements.");
      const priority=string(c.priority,"priority",30);
      if(!["Low","Normal","High","Critical"].includes(priority))throw new Error("Choose a priority.");
      for(const id of new Set(c.ids)){
        const item=find(s,id);
        if(!item.requirement)throw new Error("Only requirements can be updated together.");
        item.requirement.priority=priority;
      }
      record("Updated requirement priorities"); break;
    }
    case "merge":{
      if(!selected?.requirement)throw new Error("Choose a requirement to keep.");
      const source=find(s,c.source);
      if(source.id===selected.id||!source.requirement||source.kind!==selected.kind)throw new Error("Choose another requirement of the same type.");
      const reason=string(c.reason,"merge reason",1000);
      revise(selected,selected.title,selected.body+"\n\n"+source.body);
      addLink(source,selected,"supersedes");
      source.requirement.applicability="Excluded"; source.requirement.rationale=reason;
      s.reviews.push({item:source.id,revision:source.revision,author,comment:reason,at:now});
      record("Merged requirements while preserving the source",selected); break;
    }
    case "intake-disposition":{
      if(!selected?.requirement || selected.kind!=="customer")throw new Error("Select an extracted customer requirement.");
      const value=string(c.outcome,"applicability",40), reason=string(c.reason,"reason or clarification",1500);
      if(!["Applicable","Excluded","Clarification requested","Agreed"].includes(value))throw new Error("Choose an applicability outcome.");
      selected.requirement.applicability=value; selected.requirement.rationale=reason;
      s.reviews.push({item:selected.id,revision:selected.revision,author,comment:value+": "+reason,at:now});
      record("Recorded customer requirement disposition",selected); break;
    }
    case "document-stage":{
      if(!selected?.document)throw new Error("Choose a customer document.");
      const stage=string(c.stage,"document stage",45);
      if(!["Received","Assigned","Extracted","In review","Clarification requested","Agreed","Approved"].includes(stage))throw new Error("Choose a document workflow stage.");
      selected.document.state=stage;
      if(yes(c.owner))selected.owner=owner(fresh,c.owner);
      record("Set document workflow stage",selected); break;
    }
    case "receive-source":{
      const attachment=c.attachment as DocumentRevision["attachment"];
      if(!attachment?.base64||!attachment.sha256)throw new Error("Select an original PDF or Word file.");
      const version=string(c.version,"document version",30);
      if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(version))throw new Error("Use a document version such as 1.0.");
      const doc=selected??addArtifact(nextCode(s,"DOC",9),"document",string(c.title,"document title",180),"Received source document","SYS.1",{document:{current:version,revisions:[],applicability:"Pending review",state:"Received"}});
      if(!doc.document)throw new Error("Choose a source document for the revision.");
      if(doc.document.revisions.some(r=>r.version===version))throw new Error("Choose a new document version.");
      doc.document.revisions.push({version,received:now,pages:[],attachment});
      doc.document.current=version;doc.document.state="Received";doc.revision++;doc.date=now;
      record("Received source document",doc);break;
    }
    case "anchor-source":{
      if(!selected?.document)throw new Error("Select a source document.");
      const revision=selected.document.revisions.find(r=>r.version===c.version);
      if(!revision)throw new Error("Select a document revision.");
      const page=real(c.page,"source page",300),section=string(c.section,"section or paragraph reference",70);
      const quote=string(c.quote,"source quotation",4000),title=string(c.title,"requirement title",180);
      if(!revision.attachment&&!revision.pages[page-1]?.clauses.some(c=>c.code===section&&c.paragraph===quote))throw new Error("The quotation must match the displayed demo source.");
      if(revision.attachment){
        while(revision.pages.length<page)revision.pages.push({title:"Recorded source extract",clauses:[]});
        const clauses=revision.pages[page-1].clauses;
        if(clauses.some(v=>v.code===section&&v.paragraph!==quote))throw new Error("Use a distinct paragraph reference for a different quotation.");
        if(!clauses.some(v=>v.code===section))clauses.push({code:section,title,paragraph:quote});
      }
      const anchor=addArtifact(nextCode(s,"SRC"),"anchor",title,quote,"SYS.1",{source:{document:selected.id,version:revision.version,page,section,x:0,y:0,width:0,height:0,quote}});
      const extracted=addArtifact(nextCode(s,"CUS"),"customer",title,quote,"SYS.1",{requirement:{type:"Customer requirement",classification:"Functional",priority:"Normal",method:"",implementation:"Planned",applicability:"Pending",rationale:"",criterion:"",revisions:[{revision:1,title,body:quote,time:now,owner:author}]}});
      addLink(selected,anchor,"evidenceFor");addLink(anchor,extracted,"extractedFrom");
      if(selected.document.state==="Received")selected.document.state="Extracted";
      record("Anchored a customer requirement",extracted);break;
    }
    case "link-add":{
      const from=find(s,c.from),to=find(s,c.to);
      addLink(from,to,string(c.type,"relationship",30) as LinkType);
      record("Added relationship",from); break;
    }
    case "link-review":{
      const l=s.links.find(l=>l.id===c.link); if(!l)throw new Error("Select an active relationship.");
      const from=find(s,l.from),to=find(s,l.to);
      const comment=string(c.comment,"review rationale",1000);
      l.review="Reviewed";l.fromRevision=from.revision;l.toRevision=to.revision;
      s.reviews.push({item:l.id,revision:from.revision,author,comment,at:now});
      record("Confirmed consistency",from); break;
    }
    case "link-remove":{
      const l=s.links.find(l=>l.id===c.link); if(!l)throw new Error("Select an active relationship.");
      s.links=s.links.filter(x=>x.id!==l.id); record("Removed relationship",find(s,l.from)); break;
    }
    case "process":{
      const p=s.processes.find(p=>p.code===c.code), state=c.state as ProcessState;
      if(!p||!statuses.includes(state))throw new Error("Choose a process and state.");
      if(state==="Not applicable"||state==="Blocked")p.exclusion=string(c.reason,state==="Blocked"?"blocking reason":"tailoring rationale",1000);
      else delete p.exclusion;
      p.state=state;p.updated=now;
      if(yes(c.owner))p.owner=owner(fresh,c.owner);
      record("Updated process "+p.code); break;
    }
    case "new-change":{
      const target=find(s,c.target),title=string(c.title,"title",180),newText=string(c.newText,"proposed wording");
      if(!target.requirement)throw new Error("Choose a requirement to change.");
      const existing=Object.values(s.items).find(i=>i.change?.target===target.id&&i.change?.newText===newText&&i.change?.state!=="Closed");
      if(existing)throw new Error("Open the existing change request "+existing.code+".");
      const item=addArtifact(nextCode(s,"CR",20),"change",title,"Proposed change from the requirement workspace.","SUP.10",{change:{oldText:target.body,newText,target:target.id,state:"Proposed",candidates:[],actions:[]}});
      addLink(target,item,"affectedBy"); record("Opened change request",item); break;
    }
    case "analyze":{
      const item=typedItem(s,c.id,"change"), ch=item.change!;
      if(!["Proposed","Impact analysis","Owner review"].includes(ch.state))throw new Error("Impact can be recalculated before approval.");
      const prior=new Map(ch.candidates.map(x=>[x.id,x]));
      ch.candidates=impactOf(s,ch.target).map(x=>({...x,disposition:prior.get(x.id)?.disposition??"Pending",rationale:prior.get(x.id)?.rationale}));
      if(ch.state==="Proposed")ch.state="Impact analysis";
      record("Analyzed change impact",item);break;
    }
    case "impact-disposition":{
      const item=typedItem(s,c.id,"change"),ch=item.change!, candidate=ch.candidates.find(i=>i.id===c.target);
      if(ch.state!=="Owner review"||!candidate||!["Affected","Unaffected"].includes(String(c.decision)))throw new Error("Choose an impact candidate during owner review.");
      candidate.disposition=c.decision as "Affected"|"Unaffected"; candidate.rationale=string(c.reason,"impact rationale",1000);
      record("Recorded impact decision",item);break;
    }
    case "impact-action":{
      const item=typedItem(s,c.id,"change"),ch=item.change!, target=ch.candidates.find(i=>i.id===c.target);
      if(!target||ch.state==="Closed")throw new Error("Select a candidate in an open change.");
      const prior=ch.actions.find(a=>a.id===target.id);
      if(prior)prior.done=true;
      else ch.actions.push({id:target.id,owner:owner(fresh,c.owner??target.owner),text:string(c.text,"action",1000),done:false});
      record(prior?"Completed change action":"Assigned change action",item);break;
    }
    case "change-step":{
      const item=typedItem(s,c.id,"change"),ch=item.change!, next=changes[changes.indexOf(ch.state)+1];
      if(!next||ch.state==="Proposed")throw new Error("Run impact analysis before continuing.");
      if(next==="Approved"&&ch.candidates.some(i=>i.disposition==="Pending"))throw new Error("Record each candidate's impact decision before approval.");
      if(next==="Re-verification"){
        if(find(s,ch.target).body!==ch.newText)throw new Error("Apply and review the change first.");
        if(find(s,ch.target).review!=="Approved")throw new Error("Approve the revised customer requirement before re-verification.");
      }
      if(next==="Closed"){
        if(ch.actions.some(a=>!a.done))throw new Error("Complete outstanding change actions.");
        const affected=ch.candidates.filter(i=>i.disposition==="Affected").map(i=>find(s,i.id));
        if(affected.some(i=>i.requirement&&i.review!=="Approved"))throw new Error("Affected requirements need approval.");
        const comparisons=affected.filter(i=>i.measure);
        if(comparisons.some(m=>verificationStatus(s,m).status!=="Passed"))throw new Error("Affected verification measures need a passing current execution.");
      }
      ch.state=next; record("Change moved to "+next,item);break;
    }
    case "apply-change":{
      const item=typedItem(s,c.id,"change"),ch=item.change!;
      if(ch.state!=="Updating artifacts")throw new Error("Move the approved change to Updating artifacts first.");
      const target=find(s,ch.target);
      if(target.body===ch.newText)throw new Error("The proposed wording is already applied.");
      revise(target,target.title,ch.newText,yes(c.criterion)?string(c.criterion,"criterion",1000):undefined,item.id);
      for(const candidate of ch.candidates.filter(i=>i.disposition==="Affected")){
        const artifact=find(s,candidate.id);
        if(artifact.measure)artifact.measure.retestAfter=now;
      }
      const anchor=Object.values(s.items).find(i=>i.kind==="anchor"&&i.source?.quote===ch.newText);
      if(anchor && target.kind==="customer") {
        const newLink=addLink(anchor,target,"extractedFrom");newLink.review="Linked";
        for(const old of s.links.filter(l=>l.to===target.id&&l.type==="extractedFrom"&&l.id!==newLink.id))old.review="Suspect";
      }
      record("Applied proposed requirement revision",target);break;
    }
    case "run":{
      const vm=typedItem(s,c.id,"measure"),outcome=string(c.outcome,"result",25);
      if(!["Passed","Failed","Blocked"].includes(outcome))throw new Error("Choose a verification result.");
      const observed=string(c.observed,"observed result",800);
      const environment=string(c.environment??vm.measure!.environment,"test environment",100);
      const reason=string(c.reason,"execution rationale",1000);
      const targetRevisions=Object.fromEntries(s.links.filter(l=>l.to===vm.id&&["verifiedBy","validatedBy"].includes(l.type)).map(l=>[l.from,find(s,l.from).revision]));
      const vx=addArtifact(nextCode(s,"VX",500),"execution",vm.title+" · "+now.slice(0,10),observed,vm.process,{execution:{measure:vm.id,measureRevision:vm.revision,scope:"Working set @"+(workspace.revision+1),environment,date:now,result:{outcome:outcome as "Passed"|"Failed"|"Blocked",observed,reason},targetRevisions,criterion:vm.measure!.criterion},review:"Approved"});
      addLink(vm,vx,"resultOf").review="Reviewed";
      if(yes(c.evidence)){
        const evCode=nextCode(s,"EV",500);
        const ev=addArtifact(evCode,"evidence",vm.title+" execution evidence",observed,vm.process,{evidence:{execution:vx.id,mime:"text/plain",filename:evCode+"-execution.txt",content:string(c.evidence,"test evidence",20000)}});
        addLink(vx,ev,"evidenceFor").review="Reviewed";
      }
      record("Recorded verification execution",vx);break;
    }
    case "baseline":{
      const name=string(c.title,"baseline identifier",36);
      if(!/^[A-Za-z0-9][A-Za-z0-9_. -]+$/.test(name)||s.baselines.some(b=>b.id===name))throw new Error("Use a unique baseline identifier.");
      const snapshot=snapshotOf(s);
      s.baselines.push({id:name,created:now,approvedBy:author,snapshot});
      record("Created immutable baseline "+name);break;
    }
    case "finding":{
      const process=string(c.process,"process",16);
      if(!definitions[s.model]?.some(p=>p.code===process)||!appliedProcess(s,process))throw new Error("Choose an applicable process.");
      const action=string(c.action,"improvement action",3000);
      const gap=addArtifact(nextCode(s,"GAP",60),"finding",string(c.title,"finding title",180),action,process,{finding:{status:"Open",attribute:yes(c.attribute)?c.attribute:"PA 1.1",action,due:yes(c.due)?c.due:undefined},owner:c.owner?owner(fresh,c.owner):author});
      if(yes(c.source)){const source=find(s,c.source); if(acceptsLink(source,gap,"affectedBy"))addLink(source,gap,"affectedBy");}
      record("Created improvement action",gap);break;
    }
    case "assessment-evidence":{
      const process=string(c.process,"process",16), label=string(c.label,"evidence category",60);
      const entry=s.assessments[process]?.find(e=>e.label===label);
      const status=c.state;
      if(!entry||!appliedProcess(s,process)||!["Ready","Review","Missing","N/A"].includes(String(status)))throw new Error("Choose an evidence category and status.");
      const source=yes(c.source)?find(s,c.source):undefined;
      if(status==="Ready"&&!source)throw new Error("Attach a source before marking the evidence ready.");
      const rationale=string(c.rationale,"evidence review rationale",2000);
      entry.source=source?.id??"";entry.state=status as "Ready";
      s.reviews.push({item:source?.id??process,revision:source?.revision??0,author,comment:rationale,at:now});
      record("Reviewed "+process+" evidence: "+label,source);break;
    }
    case "finding-close":{
      if(!selected?.finding)throw new Error("Choose an improvement action.");
      selected.finding.status="Closed";selected.finding.action=string(c.action,"completion evidence",2000);record("Closed improvement action",selected);break;
    }
    case "assessor":{
      const process=string(c.process,"process",16),attribute=string(c.attribute,"process attribute",20),rating=string(c.rating,"rating",1);
      if(!appliedProcess(s,process)||!s.assessments[process]||!["N","P","L","F"].includes(rating)||!["PA 1.1","PA 2.1","PA 2.2","PA 3.1","PA 3.2"].includes(attribute))throw new Error("Choose a process rating and attribute.");
      s.assessorRecords.push({process,attribute,rating:rating as "N",assessor:author,note:string(c.note,"assessor opinion",3000),at:now});record("Recorded a manual assessor opinion");break;
    }
    case "problem":{
      const vx=typedItem(s,c.id,"execution");
      if(vx.execution?.result.outcome!=="Failed")throw new Error("Choose a failed execution.");
      const p=addArtifact(nextCode(s,"PR",400),"problem",string(c.title,"problem title",180),vx.body,"SUP.9",{problem:{severity:string(c.severity,"severity",30),cause:"Under investigation",action:string(c.action,"planned action",2000),state:"Open",execution:vx.id}});
      addLink(vx,p,"affectedBy");record("Created problem report",p);break;
    }
    case "problem-update":{
      if(!selected?.problem)throw new Error("Choose a problem.");
      const closing=c.closed===true;
      const rerun=yes(c.retest)?typedItem(s,c.retest,"execution"):undefined;
      if(closing&&(!rerun||rerun.execution?.result.outcome!=="Passed"||rerun.execution?.measure!==find(s,selected.problem.execution).execution?.measure))throw new Error("Attach a passing retest of the affected measure.");
      selected.problem.cause=string(c.cause,"root cause",2000);selected.problem.action=string(c.action,"corrective action",2000);selected.problem.state=closing?"Closed":"Open";
      if(rerun)addLink(rerun,selected,"affectedBy");record("Updated problem report",selected);break;
    }
    case "risk":{
      const item=selected??addArtifact(nextCode(s,"RISK",30),"risk",string(c.title,"risk title",180),string(c.strategy,"mitigation",1500),"MAN.5");
      if(item.kind!=="risk")throw new Error("Choose a risk.");
      item.risk={likelihood:real(c.likelihood,"likelihood"),impact:real(c.impact,"impact"),residualLikelihood:real(c.residualLikelihood,"residual likelihood"),residualImpact:real(c.residualImpact,"residual impact"),strategy:string(c.strategy,"mitigation",1500)};
      if(yes(c.source))addLink(find(s,c.source),item,"affectedBy");
      record("Saved risk assessment",item);break;
    }
    default: throw new Error("Choose an available workspace action.");
  }
  fresh.revision++;fresh.applied=[...fresh.applied.slice(-79),opId];return fresh;
}
