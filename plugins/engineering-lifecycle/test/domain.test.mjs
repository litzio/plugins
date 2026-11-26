
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeWorkspace } from "../runtime/seed.mjs";
import { acceptsLink, consistency, definitions, scopeOf } from "../runtime/model.mjs";
import { command, compare, graph, impactOf, index, matrix, metrics, verificationStatus, warnings } from "../runtime/operations.mjs";
import { createPack, openPack, readSourceFile, updatePack } from "../store.mjs";
import { makePdf, pagesOf } from "../documents.mjs";

const project="OBC-22", release="R1.2";
const id=code=>project+"/"+code;
const archive="BL-12";
const scope=(ws,baseline)=>scopeOf(ws,project,release,baseline).scope;
let nextAction=0;
const action=(ws,commandData)=>command(ws,project,release,commandData,"operation-"+String(++nextAction).padStart(4,"0"),"2026-11-27T10:00:00."+String(nextAction).padStart(3,"0")+"Z");
const fingerprint=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("two independent programs have production-sized deterministic synthetic data",()=>{
  const ws=makeWorkspace(), sums={};
  assert.equal(ws.projects.length,2);
  assert.equal(ws.users.length,10);
  for(const p of ws.projects){
    assert.equal(Object.keys(p.releases).length,2);
    const s=p.releases[p.latest];
    for(const i of Object.values(s.items)) sums[i.kind]=(sums[i.kind]??0)+1;
    assert.equal(s.processes.length,definitions["4.1"].length);
    assert.ok(s.processes.every(i=>definitions["4.1"].some(d=>d.code===i.code&&d.route)));
    const ids=new Set(s.links.map(l=>l.id));
    assert.equal(s.links.length,ids.size);
    assert.ok(s.links.length>=500);
    for(const l of s.links) assert.ok(acceptsLink(s.items[l.from],s.items[l.to],l.type));
  }
  assert.ok(sums.document>=15 && sums.customer+sums.stakeholder>=150 && sums.system>=150 && sums.software+sums.hardware>=300);
  assert.ok(sums.measure>=200&&sums.execution>=250&&sums.change>=10&&sums.problem>=20);
  const [a,b]=ws.projects.map(p=>metrics(p.releases[p.latest]));
  assert.ok(a.execution.n/a.execution.d<b.execution.n/b.execution.d);
  assert.ok(a.deliverables.n/a.deliverables.d<b.deliverables.n/b.deliverables.d);
  assert.throws(()=>scopeOf(ws,project,"R2.0"),/project and release/);
});
test("flagship requirement lineage has shared many-to-many links and navigable original anchors",()=>{
  const s=scope(makeWorkspace());
  const forward=graph(s,{id:id("SRC-042"),direction:"Downstream",depth:8});
  const back=graph(s,{id:id("EV-051"),direction:"Upstream",depth:8});
  for(const code of ["CUS-042","STK-018","SYS-042","VM-031","VX-027","EV-051"])assert.ok(forward.items.some(i=>i.code===code),code);
  for(const code of ["DOC-001","SRC-042","CUS-042","STK-018","STK-019","SYS-042","VM-031"])assert.ok(back.items.some(i=>i.code===code),code);
  const one=index(s);
  assert.equal(one.reverse.get(id("SYS-042")).filter(l=>l.type==="derivedFrom").length,2);
  assert.equal(one.forward.get(id("SYS-042")).filter(l=>l.type==="allocatedTo").length,2);
  assert.equal(s.items[id("SRC-042")].source.page,14);
});
test("matrix, graph and coverage consume one ledger and separate missing from suspect",()=>{
  let ws=makeWorkspace(), s=scope(ws);
  const read=()=>matrix(s,{from:"system",to:"architecture",type:"allocatedTo",query:"SYS-042"});
  const cell=code=>{const r=read();return r.cells[0][r.cols.findIndex(c=>c.code===code)].state;};
  const before=metrics(s).trace;
  assert.equal(cell("ARC-015"),"Missing");assert.equal(cell("ARC-014"),"Suspect");assert.equal(cell("ARC-011"),"Reviewed");
  assert.ok(warnings(s,"SYS.2").some(w=>w.code==="SYS-042"&&w.to===id("ARC-015")&&w.type==="Missing relationship"));
  ws=action(ws,{name:"link-add",from:id("SYS-042"),to:id("ARC-015"),type:"allocatedTo"});
  s=scope(ws);
  assert.equal(cell("ARC-015"),"Linked");
  assert.equal(metrics(s).trace.n,before.n+1);
  assert.equal(metrics(s).trace.d,before.d);
  const g=graph(s,{id:id("SYS-042"),depth:4});
  assert.ok(g.edges.some(l=>l.to===id("ARC-015")&&l.from===id("SYS-042")));
  assert.ok(!g.missing.some(l=>l.target.id===id("ARC-015")));
  assert.throws(()=>action(ws,{name:"link-add",from:id("SYS-042"),to:id("ARC-015"),type:"allocatedTo"}),/already exists/);
  assert.throws(()=>action(ws,{name:"link-add",from:id("SYS-042"),to:"ITMC-08/ARC-015",type:"allocatedTo"}),/outside/);
  const l=s.links.find(l=>l.to===id("ARC-014")&&l.from===id("SYS-042"));
  ws=action(ws,{name:"link-review",link:l.id,comment:"Current feedback aligns with the approved requirement."});
  assert.equal(consistency(scope(ws).links.find(x=>x.id===l.id),scope(ws).items),"Reviewed");
});
test("customer change preserves historical result and requires current verification to close",()=>{
  let ws=makeWorkspace();
  const snapshot=fingerprint(scope(ws,archive));
  const potential=impactOf(scope(ws),id("CUS-042"));
  assert.equal(potential.find(i=>i.id===id("STK-018")).hops,1);
  assert.equal(potential.find(i=>i.id===id("SYS-042")).hops,2);
  assert.ok(!potential.some(i=>i.id===id("STK-019")));
  const mutate=(name,extra={})=>{ws=action(ws,{name,id:id("CR-014"),...extra});};
  mutate("analyze");mutate("change-step");
  assert.throws(()=>mutate("change-step"),/impact decision/);
  for(const i of potential)mutate("impact-disposition",{target:i.id,decision:["SYS-042","VM-031"].some(code=>id(code)===i.id)?"Affected":"Unaffected",reason:"Reviewed the affected interfaces and owner notes."});
  mutate("change-step");mutate("change-step");mutate("apply-change",{criterion:"At most 100 ms"});
  let s=scope(ws), vm=s.items[id("VM-031")];
  assert.equal(verificationStatus(s,vm).status,"Retest required");
  assert.equal(verificationStatus(s,vm).history.execution.result.outcome,"Passed");
  ws=action(ws,{name:"review",id:id("CUS-042"),decision:"Approved",comment:"Customer change and source verified."});
  ws=action(ws,{name:"revise",id:id("SYS-042"),title:"Shutdown within allocated timing",body:"The controller shall meet the 100 ms threshold.",criterion:"100 ms"});
  ws=action(ws,{name:"review",id:id("SYS-042"),decision:"Approved",comment:"Approve the revised timing."});
  ws=action(ws,{name:"revise",id:id("VM-031"),title:"Shutdown timing HIL",body:"Repeat the test to measure timing with the revised specification.",criterion:"At most 100 ms"});
  mutate("change-step");
  assert.throws(()=>mutate("change-step"),/passing current execution/);
  ws=action(ws,{name:"run",id:id("VM-031"),outcome:"Passed",observed:"94 ms",environment:"Bidirectional HIL bench",reason:"94 ms met the revised timing limit.",evidence:"HIL-031: output threshold at 94 ms."});
  s=scope(ws);vm=s.items[id("VM-031")];
  assert.equal(verificationStatus(s,vm).status,"Passed");
  mutate("change-step");
  assert.equal(scope(ws).items[id("CR-014")].change.state,"Closed");
  assert.equal(scope(ws).items[id("VX-027")].execution.result.observed,"108 ms");
  assert.equal(fingerprint(scope(ws,archive)),snapshot);
  assert.ok(compare(scope(ws),scope(ws,archive)).some(item=>item.code==="SYS-042"&&item.change==="Modified"));
  ws=action(ws,{name:"baseline",title:"BL-13"});
  const approved=scope(ws,"BL-13");
  assert.equal(verificationStatus(approved,approved.items[id("VM-031")],"BL-13").status,"Passed");
  assert.equal(approved.items[id("VX-027")].execution.scope,"BL-12");
});
test("source PDF uses the selected immutable revision and emits 14 actual pages",()=>{
  const s=scope(makeWorkspace()), item=s.items[id("DOC-001")], rev=item.document.revisions;
  assert.equal(pagesOf(item,rev[1])[13].sections[1].code,"4.3.2");
  const prior=makePdf(item,rev[0]).toString(),current=makePdf(item,rev[1]).toString();
  assert.match(current,/^%PDF-1\.4/);assert.match(current,/\/Count 14 /);
  assert.match(prior,/within 200 ms/);assert.match(current,/within 100 ms/);
  assert.notEqual(prior,current);
});
test("workspace persists edits atomically, isolates projects, and resets with backup",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"engineering-test-"));
  try {
    const {file,workspace}=await createPack(dir);
    const before=fingerprint(workspace.projects[1]);
    const req={name:"new-requirement",kind:"system",title:"Acceptance guard",body:"Keep fixture output inactive while disabled."};
    const op=randomUUID(), a=await updatePack(file,0,op,project,release,req);
    assert.equal(a.revision,1);
    assert.equal(fingerprint(a.projects[1]),before);
    assert.equal((await openPack(file)).workspace.revision,1);
    const replay=await updatePack(file,0,op,project,release,req);
    assert.equal(replay.revision,1);
    await assert.rejects(updatePack(file,0,randomUUID(),project,release,req),/changed in another window/);
    await assert.rejects(createPack(dir),/already exists/);
    const initialLinks=scope(workspace).links.length;
    const reset=await updatePack(file,1,randomUUID(),project,release,{name:"reset"});
    assert.equal(reset.revision,2);assert.equal(scope(reset).links.length,initialLinks);
    assert.equal(JSON.parse(await readFile(file+".bak","utf8")).revision,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("unsupported or inconsistent data packs are rejected",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"engineering-invalid-"));
  try{
    const file=join(dir,"invalid.ell");
    await writeFile(file,JSON.stringify({marker:"litzio.engineering-lifecycle",schema:99}));
    await assert.rejects(openPack(file),/not a supported/);
    await assert.rejects(openPack(join(dir,"arbitrary.txt")),/Choose an Engineering/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("received originals retain bytes by revision and manual source anchors survive reopen",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"engineering-source-"));
  try{
    const {file,workspace}=await createPack(dir), payload=scope(workspace).items[id("DOC-001")];
    const original=makePdf(payload,payload.document.revisions[0]);
    const external=join(dir,"fictive-customer.pdf");
    await writeFile(external,original);
    const attachment=await readSourceFile(external);
    const saved=await updatePack(file,0,randomUUID(),project,release,{name:"receive-source",title:"Fictive interface extract",version:"7.4",attachment});
    const doc=Object.values(scope(saved).items).find(i=>i.title==="Fictive interface extract");
    const excerpt=payload.document.revisions[0].pages[13].clauses[1].paragraph;
    await updatePack(file,1,randomUUID(),project,release,{name:"anchor-source",id:doc.id,version:"7.4",page:14,section:"4.3.2",title:"Recorded timing requirement",quote:excerpt});
    const reopened=scope((await openPack(file)).workspace);
    const source=Object.values(reopened.items).find(i=>i.source?.document===doc.id);
    assert.equal(source.source.section,"4.3.2");
    assert.equal(source.source.quote,excerpt);
    assert.ok(reopened.links.some(l=>l.from===source.id&&l.type==="extractedFrom"));
    assert.deepEqual(Buffer.from(reopened.items[doc.id].document.revisions[0].attachment.base64,"base64"),original);
  }finally{await rm(dir,{recursive:true,force:true});}
});
