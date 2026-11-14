import test from "node:test";
import assert from "node:assert/strict";
import { ruleMaterials,ruleReviews,ruleOpeningState } from "../src/rule-review.js";
import { replayEdits,projectEdit } from "../src/correction-history.js";

function fixture(missing=true) {
  const cell=(text)=>({text,row_span:1,col_span:1,start_row_offset_idx:0,end_row_offset_idx:1,start_col_offset_idx:0,end_col_offset_idx:1,column_header:false});
  const cells=[cell("A"),cell("B")];
  const h={provenance:{generationId:"g",source:{pdf:{sha256:"pdf"}},items:cells.map((c,i)=>({sourceId:"s"+i,selfRef:"#/tables/"+i,regions:[{pageNo:i+1}],targets:[{path:[i+1],role:"content"}],cells:[]}))},
    snapshot:{revision:"r",nodes:cells.flatMap((c,i)=>[{path:[i+1],type:"table"},{path:[i+1,0,0],type:"cell",text:c.text}])},
    sourceDocument:{tables:cells.map((c)=>({data:{num_rows:1,num_cols:1,table_cells:[c]}}))}};
  const report={checks:[],findings:cells.map((c,i)=>({id:"f"+i,sourceIds:["s"+i],targets:[{path:[i+1],role:"content"}]})),
    groups:cells.map((c,i)=>({id:"g"+i,findingIds:["f"+i],pageNos:missing && i===1 ? [] : [i+1]}))};
  const evidence={pages:[1,2].map((pageNo)=>({pageNo,items:[],tokens:[]}))};
  const catalog=cells.map((c,i)=>({lossId:String(i).repeat(64),sourceId:"s"+i,reasonCode:"table-header-role",classification:"expression",originalValue:{cellIndex:0},targets:[{path:[i+1],role:"content"}]}));
  return {h,report,evidence,catalog};
}
function decision(state,view) {
  state.ruleOpens=view.representatives.flatMap((rep)=>rep.comparisons.map((comparison)=>({openId:rep.lossId,ruleId:view.ruleId,lossId:rep.lossId,...comparison,actor:"human",time:"time",revision:view.documentRevision,changeCount:0,ruleContentDigest:view.contentDigest,comparison:"source-and-current-side-by-side"})));
  state.ruleDecisions=[{decisionId:"d",ruleId:view.ruleId,actor:"human",time:"time",note:"Synthetic policy test",revision:view.documentRevision,
    changeCount:0,contentDigest:view.contentDigest,policyDigest:view.policyDigest,memberIds:view.members.map((item)=>item.lossId),decision:"approved",openIds:state.ruleOpens.map((open)=>open.openId)}];
}
test("an unviewable representative becomes an individual exception and cannot inherit approval",()=> {
  const x=fixture(),view=ruleMaterials(x.report,x.h,x.evidence,x.catalog)[0],state={reviewVersion:"1.3.0"};
  assert.equal(view.members[1].status,"unverifiable");assert.equal(view.members[1].reason,"source-comparison-unavailable");
  assert.equal(view.representatives.length,1);decision(state,view);
  const result=ruleReviews(state,x.report,x.h,x.evidence,x.catalog);
  assert(result.items[0].ruleConfirmation);assert.equal(result.items[1].ruleConfirmation,null);
  x.report.groups[0].pageNos=[];
  const noView=ruleMaterials(x.report,x.h,x.evidence,x.catalog)[0];decision(state,noView);
  assert.equal(ruleOpeningState(state,noView,x.catalog,x.report).canApprove,false);
  assert(ruleReviews(state,x.report,x.h,x.evidence,x.catalog).items.every((item)=>!item.ruleConfirmation));
});
test("historical replay clones once and uses indexed targets, preserving exact rich results",()=> {
  const before={revision:"r0",nodes:Array.from({length:130},(_,i)=>({path:[i+1,0,0],type:"cell",text:"A",content:[{kind:"text",text:"A"}]}))};
  const changes=Array.from({length:130},(_,i)=>({target:{kind:"cell",path:[i+1],row:0,column:0},before:"A",after:"B",afterRevision:"r"+(i+1)}));
  let expected=before;
  for (const change of changes) expected=projectEdit(expected,change.target,change.before,change.after,change.afterRevision);
  const original=globalThis.structuredClone;let clones=0;
  globalThis.structuredClone=(...args)=>{clones++;return original(...args);};
  let actual;
  try {actual=replayEdits(before,changes);} finally {globalThis.structuredClone=original;}
  assert.equal(clones,1);assert.deepEqual(actual,expected);assert(before.nodes.every((node)=>node.text==="A"));
});
