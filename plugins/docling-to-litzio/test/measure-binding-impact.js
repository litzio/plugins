// Deterministic scope influence, not latency or document-quality acceptance.
// Creates a disposable generation from fixed conversion files; no converter/AI.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generate } from "../src/generate.js";
import { createReview, readReview } from "../src/review.js";
import { createMaterialReader } from "../src/review-material.js";
import { reviewBindings } from "../src/review-bindings.js";
import { textAt } from "../src/provenance.js";
import { snapshotLookup } from "../src/lookup.js";
const [bundle,root,cli,resultFile]=process.argv.slice(2);
await generate(bundle,root,cli);
await createReview(root,join(root,"review"));
const {handoff,report,evidence}=await readReview(root,join(root,"review"));
const baseline=reviewBindings(report,handoff,evidence), material=createMaterialReader(report,handoff,evidence);
const candidates=new Map();
for (const group of report.groups)
  for (const node of material(group.id).current)
    if (["paragraph","cell","equation"].includes(node.type) && (node.text ?? node.latex ?? "").trim())
      candidates.set(JSON.stringify(node.path),node);
const counts=[],histogram={};
for (const [key,node] of candidates) {
  const next=structuredClone(handoff), changed=next.snapshot.nodes.find((candidate)=>JSON.stringify(candidate.path)===key);
  const field=node.type === "equation" ? "latex" : "text";
  changed[field]+=" scope-probe";
  if (changed.content) changed.content=[{kind:"text",text:changed[field]}];
  const lookup=snapshotLookup(next.snapshot);
  for (const item of next.provenance.items)
    for (const target of [...item.targets,...item.cells.flatMap((cell)=>cell.targets),...item.losses.flatMap((loss)=>loss.targets)])
      target.text=textAt(next.snapshot,target.path,target.selector,lookup);
  const target=node.type === "cell" ? {kind:"cell",path:[node.path[0]],row:node.path[1],column:node.path[2]} : {kind:node.type,path:node.path};
  next.history ??= {changes:[]};
  next.history.changes.push({target,before:node[field],after:changed[field],beforeRevision:handoff.snapshot.revision,afterRevision:"scope-probe"});
  const after=reviewBindings(report,next,evidence);
  const affected=report.groups.filter((group)=>baseline.get(group.id)!==after.get(group.id)).length;
  counts.push(affected);histogram[affected]=(histogram[affected] ?? 0)+1;
}
const result={method:"One independent content mutation and related history entry per distinct nonempty editable current target; no correction is executed or accepted as document review",pages:evidence.pages.length,groups:report.groups.length,targets:counts.length,averageAffectedGroups:counts.reduce((sum,n)=>sum+n,0)/counts.length,minAffectedGroups:Math.min(...counts),maxAffectedGroups:Math.max(...counts),histogram};
await writeFile(resultFile,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
