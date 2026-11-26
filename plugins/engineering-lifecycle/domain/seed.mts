
import { definitions, idFor, linkBetween, snapshotOf } from "./model.mjs";
import type { Item, Kind, LinkType, LinkReview, Release, Workspace, User, ProcessInstance, AssessmentEvidence, DocumentRevision } from "./model.mjs";

const day = "2026-11-27T09:42:00.000Z";
const previous = "After an accepted charging stop request, the output current shall fall below the defined shutdown threshold within 200 ms.";
const proposed = previous.replace("200 ms", "100 ms");
const people: User[] = [
  ["MC","Mina Cho","Systems lead"],["JS","Jun Seo","Verification lead"],["AY","Alex Yi","Architecture"],["KL","Kai Lim","Software"],["AS","Ari Shin","Hardware"],
  ["TR","Taylor Reed","Quality"],["NM","Noa Miller","Release"],["RJ","River James","Customer liaison"],["JL","Jules Lee","Controls"],["SP","Sam Park","Configuration"],
].map(([id,name,role]) => ({id,name,role}));
const docNames = ["Customer System Specification","Electrical Interface Specification","Communication Specification","Diagnostic Specification","Functional Safety Requirements","Environmental Requirements","Performance Requirements","Customer Change Request"];
const obc = [
  ["Bidirectional charge authorization","Session latch at restart","Controlled current derating","Supply enable arbitration","Energy-flow direction interlock"],
  ["High-voltage isolation monitor","Low-voltage supply wakeup","Connector pilot integrity","Input undervoltage lockout","Output contactor feedback"],
  ["CAN command counters","Charge state broadcast","Heartbeat freshness","Reset reason reporting","Power-limit negotiation"],
  ["Diagnostic snapshot retention","Event aging","Sensor drift detection","Service routine arming","Intermittent fault recovery"],
  ["Independent stop monitor","Relay plausibility","Watchdog recovery","Output discharge guard","Stale input fallback"],
  ["Thermal derating onset","Humidity startup guard","Coolant-loss behavior","Cold-start current ramp","Airflow obstruction response"],
  ["Current tracking accuracy","Standby power","Output slew limit","Recovery availability","Conversion-efficiency monitoring"],
  ["Shutdown time budget","Stop-event timestamp","Power direction reporting","Fault recovery hold","Source revision acknowledgement"],
];
const thermal = [
  ["Cabin preconditioning","Battery loop enable","Auxiliary coolant routing","Heat pump restart","Zone priority arbitration"],
  ["Pump duty feedback","Pressure sensor plausibility","Fan relay response","Expansion valve current","Coolant temperature signal"],
  ["Zone demand messaging","Compressor availability status","Sensor gateway timeout","Thermal state broadcast","Pump controller reset messaging"],
  ["Coolant fault recovery","Pressure fault snapshot","Valve stuck diagnosis","Repeated restart event storage","Service purge request checks"],
  ["Compressor overspeed handling","Battery freeze protection","Overpressure response","Coolant leak mitigation","Safe pump fallback"],
  ["Cold soak start","High ambient stability","Condensation limiting","Warmup after supply loss","Dust intake compensation"],
  ["Defrost ramp","Pump response time","Cabin heat stability","Pressure control accuracy","Battery loop stabilization"],
  ["Fault-clear retry budget","Zone priority revision","Pump fallback log","Threshold update handling","Variant designation review"],
];
const contexts = ["nominal supply", "cold wake-up", "mode transition", "transient supply recovery", "high-load operation"];
const methods = ["HIL test","Simulation","Analysis","Review","Inspection"];
const scopes = ["End of line rig","Controller integration bench","Vehicle model","Review package","Environmental bench"];
const bps = ["Deliverables","Evidence","Traceability","Consistency","Quality"];
const aspect = ["PA 1.1","PA 1.1","PA 1.1","PA 2.2","PA 2.1"];
function requirementType(kind: Kind, category = "") {
  if (category === "Interface") return "Interface requirement";
  if (category === "Derived") return "Derived requirement";
  return ({ customer:"Customer requirement", stakeholder:"Stakeholder requirement", system:"System requirement", software:"Software requirement", hardware:"Hardware requirement" } as Partial<Record<Kind,string>>)[kind] ?? "Requirement";
}

function releasePack(project: string, releaseId: string, earlier: boolean, late: boolean): Release {
  const names = project === "OBC-22" ? obc : thermal;
  const items: Release["items"] = {}, links: Release["links"] = [], expectations: Release["expectations"] = [];
  const assessments: Release["assessments"] = {};
  const baseline = late ? (earlier ? "BL-19" : "BL-20") : (earlier ? "BL-11" : "BL-12");
  const owner = (n: number) => people[n % people.length].id;
  function add(code: string, kind: Kind, title: string, body: string, process: string, extra: Partial<Item> = {}, n = 0) {
    const item: Item = { id:idFor(project,code), code, kind,title,body,process,owner:owner(n),revision:1,review:(late || earlier || n % 3 === 0) ? "Approved" : "In review",applicable:true,date:day,...extra };
    items[item.id]=item;
    return item;
  }
  function req(code: string, kind: Kind, title: string, body: string, process: string, n: number, fragments: Partial<NonNullable<Item["requirement"]>> = {}) {
    const itemOwner = owner(n);
    return add(code,kind,title,body,process,{requirement:{ type:requirementType(kind, fragments.classification), classification:"Functional",priority:n % 6 === 0 ? "High" : "Normal",method: methods[n % methods.length],criterion:"Use the expected result in the associated verification measure.",rationale:"",implementation:"Planned",applicability:"Applicable",revisions:[{revision:1,title,body,time:day,owner:itemOwner}],...fragments }}, n);
  }
  const addLink = (a: Item, b: Item, t: LinkType, review: LinkReview = "Reviewed") => links.push(linkBetween(a,b,t,review));
  const expected = (a: Item,b: Item,t: LinkType,category: string) => expectations.push({ from:a.id, to:b.id, targetKind:b.kind,type:t,category });
  const docList = docNames.map((title,j) => {
    const code="DOC-"+String(j+1).padStart(3,"0");
    const isLead=!late&&j===0;
    const pages: DocumentRevision["pages"] = Array.from({length:isLead?14:5},(_,q)=>{
      const topic=names[j][q%5];
      return { title:q===13 ? "Controlled shutdown" : q===0 ? title : topic, clauses: q===13 ? [
        {code:"4.3.1",title:"Stop request handling",paragraph:"The charger shall handle accepted stop requests while operating in either supported power-flow direction."},
        {code:"4.3.2",title:"Stop response time",paragraph:previous},
        {code:"4.3.3",title:"Observation window",paragraph:"Record time from request acceptance to the first persistent crossing of the defined shutdown threshold."},
      ] : [{code:(j+1)+"."+(q+1),title:topic,paragraph:"The "+(late?"thermal controller":"charger")+" shall report "+topic.toLowerCase()+" state during "+contexts[q%5]+". The recorded state shall include the active mode and a timestamp."}] };
    });
    const version=isLead?"2.3":"1."+(j%4);
    const revisions: DocumentRevision[]=[{version,received:"2026-10-21",pages}];
    if (isLead && !earlier) {
      const revised=structuredClone(pages);
      revised[13].clauses[1].paragraph=proposed;
      revisions.push({version:"2.4",received:"2026-11-27",pages:revised});
    }
    return add(code,"document",title, (late?"Thermal controller":"On-board charger")+" customer document","SYS.1",{document:{current:revisions.at(-1)!.version,revisions,applicability:j===7?"Pending review":"Applicable",state:j===7?"Received":j===0?"In review":"Approved"}},j);
  });
  let offset=200;
  for (let j=0;j<names.length;j++) {
    const document=docList[j];
    const docRev=document.document!.revisions[0];
    for (let k=0;k<names[j].length;k++) {
      const n=++offset, x=names[j][k], context=contexts[k];
      const quote=docRev.pages[k].clauses[0].paragraph;
      const section=docRev.pages[k].clauses[0].code;
      const anchor=add("SRC-"+n,"anchor",x,quote,"SYS.1",{source:{document:document.id,version:docRev.version,page:k+1,section,x:.1,y:.27,width:.8,height:.13,quote}},n);
      const c=req("CUS-"+n,"customer",x,quote,"SYS.1",n,{applicability:j===7?"Pending":"Applicable"});
      const st=req("STK-"+n,"stakeholder",x+" expectations","During "+context+", operators shall be able to determine the current "+x.toLowerCase()+" state and whether intervention is required.","SYS.1",n);
      const sys=req("SYS-"+n,"system",x+" control","When "+context+" applies, the controller shall evaluate "+x.toLowerCase()+" against the active operating envelope and record the resulting state.","SYS.2",n,{classification:j===4?"Safety":j===1?"Interface":"Functional",priority:j===4?"High":"Normal"});
      const sysAlt=req("SYD-"+n,"system",x+" event reporting","For "+x.toLowerCase()+", log entry and exit transitions with the active mode, the monotonic timestamp, and the cause of transition.","SYS.2",n+2,{classification:"Derived",rationale:"System observability and offline diagnosis."});
      const sw=req("SWE-"+n,"software",x+" state logic","The application shall distinguish valid, pending and unavailable "+x.toLowerCase()+" states for "+context+".","SWE.1",n);
      const swAlt=req("SWD-"+n,"software",x+" event interface","Route "+x.toLowerCase()+" transition events to the diagnostic buffer and preserve their ordering across one application restart.","SWE.1",n+1,{classification:"Interface"});
      const hw=req("HWE-"+n,"hardware",x+" input conditioning","The hardware interface shall indicate loss of signal on the channel used for "+x.toLowerCase()+" and retain an independent fault output.","HWE.1",n+2,{classification:"Interface"});
      const hwAlt=req("HWD-"+n,"hardware",x+" feedback availability","Provide a feedback source for "+x.toLowerCase()+" that remains observable during "+context+".","HWE.1",n+3,{classification:"Derived",rationale:"Independent observation during integration."});
      const arch=add("ARC-"+n,"architecture",x+" controller allocation","Allocate main control to the coordinator and provide independent feedback for "+x.toLowerCase()+".","SYS.3",{architecture:{domain:j%2?"System / Hardware":"System / Software",responsibility:x,interfaces:["Control bus","Independent feedback"]}},n);
      const design=add("DES-"+n,"design",x+" transition supervisor","State arbitration and event capture for "+x.toLowerCase()+".","SWE.3",{design:{component:arch.id,responsibility:"Mode guard and diagnostic output"}},n);
      const unit=add("UNT-"+n,"unit",x+" evaluator","Evaluates guard state and produces an auditable transition reason.","SWE.3",{unit:{component:design.id,responsibility:x}},n);
      if(k===0 || k===2){
        const swComponent=add("SAC-"+n,"architecture",x+" software coordinator","Manages command and feedback for "+x.toLowerCase()+".","SWE.2",{architecture:{domain:"Software",responsibility:"Command arbitration and telemetry",interfaces:["Supervisor command","Diagnostic event"]}},n);
        addLink(sw,swComponent,"allocatedTo"); addLink(swComponent,design,"realizedBy");
        expected(sw,swComponent,"allocatedTo","Software allocation");
        const hwBlock=add("HAC-"+n,"architecture",x+" feedback hardware","Exposes the feedback chain for "+x.toLowerCase()+".","HWE.2",{architecture:{domain:"Hardware",responsibility:"Independent feedback monitoring",interfaces:["Feedback channel","Power-good"]}},n+1);
        addLink(hw,hwBlock,"allocatedTo"); expected(hw,hwBlock,"allocatedTo","Hardware allocation");
      }
      addLink(document,anchor,"evidenceFor");
      expected(anchor,c,"extractedFrom","Source");
      if (n % (late?39:19)) addLink(anchor,c,"extractedFrom");
      addLink(c,st,"derivedFrom");
      addLink(st,sys,"derivedFrom");
      addLink(st,sysAlt,"derivedFrom");
      addLink(sys,sw,"derivedFrom");
      addLink(sys,hw,"derivedFrom");
      addLink(sysAlt,swAlt,"derivedFrom");
      addLink(sysAlt,hwAlt,"derivedFrom");
      if (n%3===0) addLink(sysAlt,sw,"derivedFrom","Linked");
      expected(sys,arch,"allocatedTo","System allocation");
      if (n % (late?27:9)) addLink(sys,arch,"allocatedTo",n%7===0?"Suspect":"Reviewed");
      addLink(arch,design,"realizedBy");
      addLink(sw,design,"realizedBy");
      addLink(design,unit,"realizedBy");
      expected(sysAlt,swAlt,"derivedFrom","SW decomposition");
      for(let m=0;m<3;m++){
        const target=[sys,sw,hw][m], method=methods[(n+m)%methods.length];
        const no = n*10+m;
        const process = m===0 ? k===4?"SYS.4":"SYS.5" : m===1 ? ["SWE.4","SWE.5","SWE.6"][k%3] : k%2 ? "HWE.3" : "HWE.4";
        const title=x+" · "+["Expected behavior","Transition handling","Feedback channel"][m];
        const criterion=["Expected state and timestamp are captured for "+context+".","The transition is logged with correct cause; a stale input does not change the valid state.","Loss and restoration of feedback are independently observable."][m];
        const vm=add("VM-"+no,"measure",title,criterion,process,{measure:{method,environment:scopes[(n+m)%scopes.length],criterion,preconditions:"Load the selected baseline and start in "+context+".",procedure:["Capture the initial mode and channel state.","Trigger "+x.toLowerCase()+" and observe the relevant state.","Record the outcome and attach the measurement log."],release:releaseId}},n+m);
        expected(target,vm,"verifiedBy","Verification planning");
        if (n % (late?31:11) || m) addLink(target,vm,"verifiedBy");
        for(let run=0;run<2;run++){
          if(run===1 && (n+m)%3!==0) continue;
          const featuredFailure=((late&&x==="Coolant fault recovery")||(!late&&x==="Controlled current derating"))&&m===0&&run===0;
          if(!late&&!earlier&&(n+m)%5>2&&!featuredFailure) continue;
          const failed=featuredFailure||(n+m+run)%13===0;
          const pass: "Passed"|"Failed"|"Blocked" = failed?"Failed":(n+m)%17===0?"Blocked":"Passed";
          const observed=failed?"Observed mode and expected diagnostic reason differ.":"Observed state, timestamp and transition reference are present.";
          const vx=add("VX-"+no+"-"+(run+1),"execution",title+" run "+(run+1),observed,process,{execution:{measure:vm.id,measureRevision:vm.revision,scope:baseline,environment:vm.measure!.environment,date:"2026-11-"+(run?"26":"23"),result:{outcome:pass,observed,reason:failed?"Review input timing and arbitration.":""}}},n+m);
          addLink(vm,vx,"resultOf");
          if((n+m)%7===0&&run===0){
            const name = ["HIL test report","Simulation result","Static analysis record","Code review record","Inspection log"][(n+m)%methods.length];
            const code="EV-"+no;
            const ev=add(code,"evidence",name+" · "+x,observed,process,{evidence:{execution:vx.id,filename:code+".txt",mime:"text/plain",content:[name,title,"Scope: "+project+" / "+releaseId+" / "+baseline,"Environment: "+vx.execution!.environment,"Outcome: "+pass,"Observation: "+observed].join("\n")}},n);
            addLink(vx,ev,"evidenceFor");
          }
          if(failed){
            const pr=add("PR-"+no+"-"+(run+1),"problem",x+" result requires investigation",observed,"SUP.9",{problem:{severity:n%2?"Major":"Moderate",cause:"Under investigation",action:"Compare event timing with simulation baseline.",state:"Open",execution:vx.id}},n);
            addLink(vx,pr,"affectedBy");
          }
        }
      }
      if (k===4) {
        const cr=add("CR-"+n,"change",x+" clarification","Evaluate the proposed "+x.toLowerCase()+" change before the next release.","SUP.10",{change:{oldText:"Record the active state.",newText:"Record the active state and its cause.",target:sysAlt.id,state:"Proposed",candidates:[],actions:[]}},n);
        addLink(sysAlt,cr,"affectedBy","Linked");
      }
    }
  }
  if (!late) {
    const doc=docList[0], oldAnchor=add("SRC-042","anchor","Stop response time",previous,"SYS.1",{source:{document:doc.id,version:"2.3",page:14,section:"4.3.2",x:.1,y:.36,width:.8,height:.15,quote:previous}});
    const newAnchor=!earlier?add("SRC-043","anchor","Stop response time, revised",proposed,"SYS.1",{source:{document:doc.id,version:"2.4",page:14,section:"4.3.2",x:.1,y:.36,width:.8,height:.15,quote:proposed}}):undefined;
    const c=req("CUS-042","customer","Emergency shutdown timing",previous,"SYS.1",0,{criterion:"Output current crosses the agreed threshold within 200 ms."});
    const ch=req("CUS-043","customer","Threshold crossing persistence","Confirm the observation window for a persistent threshold crossing.","SYS.1",7,{applicability:"Clarification requested"});
    const st=req("STK-018","stakeholder","Controlled stop",previous,"SYS.1",0);
    const stOther=req("STK-019","stakeholder","Stop event reporting","Record the accepted stop command and the timestamp of the threshold crossing.","SYS.1",0);
    const sys=req("SYS-042","system","Shutdown within allocated timing",previous,"SYS.2",0,{classification:"Performance",method:"HIL test",criterion:"Threshold met within 200 ms",implementation:"In progress"});
    const sw=req("SWE-118","software","Current ramp-down","On accepted stop, apply the controlled current ramp and report the crossing timestamp.","SWE.1",3);
    const arch=add("ARC-011","architecture","Stop supervisor","Coordinate stop acceptance, current control and output feedback.","SYS.3",{architecture:{domain:"System",responsibility:"Accepted stop handling",interfaces:["Stop command","Ramp control","Feedback monitor"]}},2);
    const feedback=add("ARC-014","architecture","Current feedback","Return observed current and validity to the stop supervisor.","SYS.3",{architecture:{domain:"System",responsibility:"Measured current",interfaces:["Feedback bus"]}},2);
    const monitor=add("ARC-015","architecture","Independent current monitor","Report valid current threshold crossings independently of the ramp controller.","SYS.3",{architecture:{domain:"Hardware",responsibility:"Independent observation",interfaces:["Current feedback"]}},4);
    const design=add("DES-012","design","Ramp transition state machine","Manage the controlled stop transition and publish the measured threshold event.","SWE.3",{design:{component:arch.id,responsibility:"Ramp control"}},3);
    const unit=add("UNT-012","unit","Ramp controller","Evaluate received targets and feedback for the controlled stop.","SWE.3",{unit:{component:design.id,responsibility:"Ramp dispatch"}},3);
    const vm=add("VM-031","measure","Shutdown timing HIL","Measure time from the accepted stop request to a persistent current threshold crossing.","SYS.5",{measure:{method:"HIL test",environment:"Bidirectional HIL bench",criterion:"At most 200 ms",procedure:["Load the selected controller baseline.","Send an accepted stop request in the fixture.","Measure elapsed time to the current threshold crossing."],preconditions:"Controller is in steady, enabled operation.",release:releaseId}},1);
    const vx=add("VX-027","execution","Historical shutdown timing run","Passed at 108 ms against the historical 200 ms requirement.","SYS.5",{execution:{measure:vm.id,measureRevision:vm.revision,scope:baseline,environment:vm.measure!.environment,date:"2026-11-21",criterion:"At most 200 ms",result:{outcome:"Passed",observed:"108 ms",reason:"108 ms met the historical 200 ms criterion."}}},1);
    const ev=add("EV-051","evidence","HIL waveform","Synthetic HIL evidence with recorded crossing and acceptance limit.","SYS.5",{evidence:{execution:vx.id,filename:"EV-051-hil-capture.csv",mime:"text/csv",content:"time_ms,current_fraction\n0,1\n30,0.98\n70,0.66\n95,0.38\n108,0.2\n135,0.12\n200,0.1\n",waveform:[{time:0,value:1},{time:30,value:.98},{time:70,value:.66},{time:95,value:.38},{time:108,value:.2},{time:135,value:.12},{time:200,value:.1}]}},1);
    addLink(doc,oldAnchor,"evidenceFor"); if (newAnchor) addLink(doc,newAnchor,"evidenceFor");
    addLink(oldAnchor,c,"extractedFrom"); if(newAnchor) addLink(newAnchor,ch,"extractedFrom","Linked");
    addLink(c,st,"derivedFrom"); addLink(st,sys,"derivedFrom"); addLink(stOther,sys,"derivedFrom","Linked");
    addLink(sys,arch,"allocatedTo"); addLink(sys,feedback,"allocatedTo","Suspect");
    addLink(sys,sw,"derivedFrom"); addLink(arch,design,"realizedBy"); addLink(sw,design,"realizedBy"); addLink(design,unit,"realizedBy");
    addLink(arch,vm,"verifiedBy"); addLink(sw,vm,"verifiedBy"); addLink(sys,vm,"verifiedBy");
    addLink(vm,vx,"resultOf"); addLink(vx,ev,"evidenceFor");
    for(const a of [arch,feedback,monitor]) expected(sys,a,"allocatedTo","System allocation");
    expected(sys,vm,"verifiedBy","Verification planning");
    if (!earlier && newAnchor) {
      const cr=add("CR-014","change","Emergency shutdown timing","Proposed customer change in DOC-001 v2.4 · p.14 §4.3.2.","SUP.10",{change:{oldText:previous,newText:proposed,target:c.id,state:"Proposed",candidates:[],actions:[]}});
      addLink(c,cr,"affectedBy","Linked");
      const risk=add("RISK-006","risk","Timing margin after customer change","Historical HIL evidence measures 108 ms. Review the proposed 100 ms limit.","MAN.5",{risk:{likelihood:4,impact:4,residualLikelihood:2,residualImpact:4,strategy:"Validate revised timing and independent feedback coverage."}});
      addLink(cr,risk,"affectedBy"); addLink(vm,risk,"affectedBy");
      const gap=add("GAP-007","finding","Review monitoring allocation","Confirm the SYS-042 → ARC-015 allocation and the associated design decisions.","SYS.2",{finding:{status:"Open",attribute:"PA 1.1",due:"2026-12-05"}});
      addLink(sys,gap,"affectedBy");
    }
  } else {
    const source=Object.values(items).find(i=>i.problem&&i.title.includes("Coolant fault recovery"));
    const risk=add("RISK-009","risk","Coolant recovery stability","Review the failed coolant recovery run before release.","MAN.5",{risk:{likelihood:3,impact:5,residualLikelihood:2,residualImpact:4,strategy:"Confirm recovery timing and run a second integration scenario."}});
    if(source)addLink(source,risk,"affectedBy");
    const stakeholder=items[idFor(project,"STK-201")];
    const validation=add("VAL-001","measure","Cabin ready during preconditioning","Review whether the cabin reaches the requested condition before departure.","VAL.1",{measure:{method:"Review",environment:"Customer scenario review",criterion:"The recorded scenario meets the agreed comfort objective before departure.",preconditions:"Approved profile and departure schedule.",procedure:["Open the agreed request and profile.","Compare the recorded condition at departure.","Record validation acceptance."],release:releaseId}},7);
    addLink(stakeholder,validation,"validatedBy");
  }
  const processes: ProcessInstance[]=definitions["4.1"].map((def,n)=>{
    const reqs=Object.values(items).filter(i=>i.process===def.code&&i.applicable&&i.kind!=="anchor");
    let state:ProcessInstance["state"]=reqs.length?"In progress":"Ready";
    if(late&&n%3!==0) state="Completed";
    if(!late&&def.code==="SYS.1") state="In review";
    if(!late&&def.code==="SWE.6") state="Blocked";
    if(def.code==="VAL.1"&&!late) state="Not started";
    if(def.code==="MAN.6"&&earlier) state="Not applicable";
    assessments[def.code]=bps.map((label,j): AssessmentEvidence=>({
      source: reqs.find((_,k)=>k===j)?.id ?? reqs[0]?.id ?? "", label,attribute:aspect[j],
      state:state==="Not applicable"?"N/A":!reqs.length?"Missing":(n+j)%5===0?"Review":"Ready",
    }));
    assessments[def.code].push({source:reqs[0]?.id??"",label:"Tailoring applied",attribute:"PA 3.2",state:state==="Not applicable"?"N/A":state==="Completed"?"Ready":"Review"});
    return {code:def.code,owner:owner(n),state,planned:reqs.length,approved:reqs.filter(i=>i.review==="Approved").length,milestone:late?"Release readiness review":"Design freeze",updated:day,...(state==="Not applicable"?{exclusion:"Measurement consolidated into the earlier release plan."}:{})};
  });
  const release: Release={id:releaseId,name:earlier?"Engineering baseline":"Current release",model:"4.1",items,links,expectations,processes,assessments,assessorRecords:[],reviews:[],approvals:[],audit:[],baselines:[]};
  const snapshot=snapshotOf(release);
  if(!late&&!earlier) {
    const archivedDoc=snapshot.items[idFor(project,"DOC-001")].document!;
    archivedDoc.current="2.3"; archivedDoc.revisions=archivedDoc.revisions.filter(r=>r.version==="2.3");
    const excluded=["SRC-043","CUS-043","CR-014","RISK-006","GAP-007"].map(id=>idFor(project,id));
    for(const id of excluded) delete snapshot.items[id];
    snapshot.links=snapshot.links.filter(l=>!excluded.includes(l.from)&&!excluded.includes(l.to));
  }
  release.baselines.push({id:baseline,created:"2026-11-21T12:00:00.000Z",approvedBy:"SP",snapshot});
  return release;
}
export function makeWorkspace(): Workspace {
  return {schema:1,marker:"litzio.engineering-lifecycle",revision:0,resettable:true,users:structuredClone(people),applied:[],projects:[
    {id:"OBC-22",name:"22kW Bidirectional OBC",customer:"Fictive OEM A",type:"On-board charger",owner:"MC",milestone:"Design freeze",milestoneDate:"12 Dec",latest:"R1.2",releases:{"R1.1":releasePack("OBC-22","R1.1",true,false),"R1.2":releasePack("OBC-22","R1.2",false,false)}},
    {id:"ITMC-08",name:"Integrated Thermal Management Controller",customer:"Fictive OEM B",type:"Thermal controller",owner:"JS",milestone:"Release readiness review",milestoneDate:"18 Dec",latest:"R2.0",releases:{"R1.9":releasePack("ITMC-08","R1.9",true,true),"R2.0":releasePack("ITMC-08","R2.0",false,true)}},
  ]};
}
