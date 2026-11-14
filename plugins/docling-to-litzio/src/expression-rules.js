import { reviewDigest } from "./review-bindings.js";
import { snapshotLookup } from "./lookup.js";

export const RULE_VERSION = "1.0.0";
export const RULES = Object.freeze({
  "merged-cell-repeated": {
    title: "병합 범위의 값을 출력 칸마다 반영",
    method: "source-span-to-all-output-cells-with-ordered-header-composition",
  },
  "compound-header-flattened": {
    title: "복합 머리를 순서대로 합침",
    method: "ordered-unique-source-header-cells-joined-by-space-en-dash-space",
  },
  "table-header-role": {
    title: "머리 역할을 평문 셀로 표현",
    method: "source-cell-value-and-output-coordinate-preservation",
  },
});

// Verify the rule's result against source coordinates and actual current cells.
// This is deliberately separate from the generator's projection function.
function tableEvidence(raw, path, lookup) {
  const data = raw?.data;
  if (!data || !Array.isArray(data.table_cells)) return null;
  const grid = Array.from({length:data.num_rows},()=>Array(data.num_cols).fill(null));
  for (const [index, cell] of data.table_cells.entries())
    for (let row=cell.start_row_offset_idx;row<cell.end_row_offset_idx;row++)
      for (let col=cell.start_col_offset_idx;col<cell.end_col_offset_idx;col++) {
        if (!grid[row] || col<0 || col>=data.num_cols || grid[row][col] !== null) return null;
        grid[row][col] = index;
      }
  let headerRows=0;
  for (const row of grid) {
    if (!row.every((i)=>i !== null && data.table_cells[i].column_header === true)) break;
    headerRows++;
  }
  if (headerRows === data.num_rows) headerRows=1;
  const collapsed=Math.max(1,headerRows), offset=collapsed-1;
  const headers=Array.from({length:data.num_cols},(_,column)=> {
    const indices=[];
    for (let row=0;row<collapsed;row++) {
      const index=grid[row][column];
      if (index !== null && !indices.includes(index)) indices.push(index);
    }
    return {indices,text:indices.map((i)=>data.table_cells[i].text).join(" – ")};
  });
  const at=(row,column)=>lookup.node([...path,row,column],"cell");
  const expected=(row,column)=>row===0 && headerRows>1
    ? headers[column].text
    : grid[row+offset][column]===null ? "" : data.table_cells[grid[row+offset][column]].text;
  return {data,grid,headers,headerRows,collapsed,offset,at,expected};
}

export function expressionRuleReviews(handoff, catalog) {
  const lookup=snapshotLookup(handoff.snapshot), items=new Map(handoff.provenance.items.map((item)=>[item.sourceId,item]));
  const doc=(handoff.baseline ?? handoff).sourceDocument, tables=new Map();
  const results=catalog.filter((loss)=>loss.classification === "expression").map((loss)=> {
    const rule=RULES[loss.reasonCode], item=items.get(loss.sourceId);
    const base={lossId:loss.lossId,sourceId:loss.sourceId,ruleId:rule ? loss.reasonCode : null};
    if (!rule || !item) return {...base,status:"unverifiable",reason:"rule-not-established",checkedCells:0,complexity:0,contentDigest:reviewDigest(loss)};
    if (!tables.has(item.sourceId)) {
      const raw=item.selfRef.slice(2).split("/").reduce((value,key)=>value?.[key],doc);
      const path=item.targets.find((target)=>target.role === "content")?.path;
      tables.set(item.sourceId,path ? tableEvidence(raw,path,lookup) : null);
    }
    const table=tables.get(item.sourceId), checks=[];
    if (!table) return {...base,status:"unverifiable",reason:"table-source-unavailable",checkedCells:0,complexity:0,contentDigest:reviewDigest(loss)};
    const index=loss.originalValue?.cellIndex, cell=table.data.table_cells[index];
    if (loss.reasonCode === "compound-header-flattened") {
      if (table.headerRows<=1) return {...base,status:"failed",reason:"compound-header-missing",checkedCells:0,complexity:0,contentDigest:reviewDigest(loss)};
      for (let column=0;column<table.data.num_cols;column++)
        checks.push([0,column,table.expected(0,column),table.at(0,column)?.text ?? null]);
    } else if (cell) {
      const seen=new Set();
      for (let row=cell.start_row_offset_idx;row<cell.end_row_offset_idx;row++)
        for (let column=cell.start_col_offset_idx;column<cell.end_col_offset_idx;column++) {
          const outputRow=row<table.collapsed ? 0 : row-table.offset, key=`${outputRow}:${column}`;
          if (seen.has(key)) continue;
          seen.add(key);
          checks.push([outputRow,column,table.expected(outputRow,column),table.at(outputRow,column)?.text ?? null]);
        }
    }
    const passed=checks.length>0 && checks.every(([, ,expected,actual])=>expected===actual);
    return {...base,status:passed ? "verified" : "failed",reason:passed ? "rule-matches-current-cells" : "rule-output-mismatch",
      checkedCells:checks.length,complexity:loss.reasonCode === "compound-header-flattened" ? table.headerRows*table.data.num_cols : (cell?.row_span ?? 0)*(cell?.col_span ?? 0),
      contentDigest:reviewDigest({lossId:loss.lossId,source:cell ?? table.headers,checks}),
    };
  });
  const rules=Object.entries(RULES).map(([ruleId,definition])=> {
    const members=results.filter((item)=>item.ruleId===ruleId);
    const representatives=members.filter((item)=>item.status==="verified")
      .sort((a,b)=>b.complexity-a.complexity || (a.lossId < b.lossId ? -1 : a.lossId > b.lossId ? 1 : 0))
      .slice(0,3).map((item)=>({lossId:item.lossId,contentDigest:item.contentDigest}));
    return {ruleId,version:RULE_VERSION,...definition,policyDigest:reviewDigest({ruleId,version:RULE_VERSION,...definition}),
      count:members.length,verified:members.filter((item)=>item.status==="verified").length,representatives};
  }).filter((rule)=>rule.count>0);
  return {rules,items:results};
}
