import test from "node:test";
import assert from "node:assert/strict";
import { expressionRuleReviews } from "../src/expression-rules.js";

function fixture() {
  const cell=(text,r0,r1,c0,c1,header=false)=>({text,start_row_offset_idx:r0,end_row_offset_idx:r1,start_col_offset_idx:c0,end_col_offset_idx:c1,row_span:r1-r0,col_span:c1-c0,column_header:header});
  const raw={data:{num_rows:3,num_cols:3,table_cells:[cell("A",0,2,0,1,true),cell("B",0,1,1,3,true),cell("b",1,2,1,2,true),cell("c",1,2,2,3,true),cell("value",2,3,0,2),cell("other",2,3,2,3)]}};
  const values=[["A","B – b","B – c"],["value","value","other"]];
  const handoff={sourceDocument:{tables:[raw]},provenance:{items:[{sourceId:"table",selfRef:"#/tables/0",targets:[{role:"content",path:[1]}]}]},snapshot:{nodes:[{path:[1],type:"table"},...values.flatMap((row,r)=>row.map((text,c)=>({type:"cell",path:[1,r,c],text})))]}};
  const loss=(lossId,reasonCode,cellIndex)=>({lossId,sourceId:"table",reasonCode,classification:"expression",originalValue:{cellIndex}});
  return {handoff,catalog:[loss("header-merge","merged-cell-repeated",1),loss("body-merge","merged-cell-repeated",4),loss("compound","compound-header-flattened"),loss("role","table-header-role",5),loss("note","dedicated-table-note")]};
}
test("rule verifiers check all repeated cells and ordered header contributions",()=> {
  const {handoff,catalog}=fixture(), result=expressionRuleReviews(handoff,catalog);
  assert.deepEqual(result.items.map((item)=>item.status),["verified","verified","verified","verified","unverifiable"]);
  assert.equal(result.items[0].checkedCells,2);
  assert.equal(result.items[1].checkedCells,2);
  assert.equal(result.items[2].checkedCells,3);
  assert.equal(result.rules.length,3);
});
for (const [path,value,failed] of [
  [[1,1,1],"lost",["body-merge"]],
  [[1,0,2],"c – B",["header-merge","compound"]],
  [[1,1,2],"changed",["role"]],
]) test(`changing ${path.join(',')} fails only the rules using that output cell`,()=> {
  const {handoff,catalog}=fixture(), before=expressionRuleReviews(handoff,catalog);
  handoff.snapshot.nodes.find((node)=>JSON.stringify(node.path)===JSON.stringify(path)).text=value;
  const after=expressionRuleReviews(handoff,catalog);
  assert.deepEqual(after.items.filter((item)=>item.status==="failed").map((item)=>item.lossId),failed);
  for (const item of after.items.filter((item)=>!failed.includes(item.lossId)))
    assert.equal(item.contentDigest,before.items.find((old)=>old.lossId===item.lossId).contentDigest);
});
test("representatives are the three largest cases with deterministic ID ties",()=> {
  const {handoff,catalog}=fixture(), item=catalog[1];
  const many=["z","d","b","a"].map((lossId)=>({...item,lossId}));
  assert.deepEqual(expressionRuleReviews(handoff,many).rules[0].representatives.map((item)=>item.lossId),["a","b","d"]);
});
