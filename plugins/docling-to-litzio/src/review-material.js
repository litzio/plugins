
// Exhaustive public material inventory. A new output field must be classified
// here or materialContentDigest rejects it rather than silently excluding it.
export const MATERIAL_FIELDS = Object.freeze({
  generationId: "scalar",
  documentRevision: "current-revision-metadata",
  baselineRevision: "scalar",
  sourceHash: "scalar",
  group: "object",
  findings: "array",
  fragments: "array",
  sourceNeighbors: "array",
  checks: "array",
  current: "array",
  neighbors: "array",
  pdf: "array",
  history: "array",
});

// Index once per read set. Membership and output order match the public material
// operation; the binding uses this SAME projection, not a parallel selection.
export function createMaterialReader(report,handoff,evidence,snapshot=handoff.snapshot) {
  const sources=handoff.provenance.items, sourceIndex=new Map(sources.map((item,index)=>[item.sourceId,index]));
  const doc=(handoff.baseline ?? handoff).sourceDocument;
  const fragments=sources.map((item)=>({sourceId:item.sourceId,selfRef:item.selfRef,
    raw:item.selfRef.slice(2).split("/").reduce((value,key)=>value?.[key],doc),mapping:item}));
  const sourceNeighbors=fragments.map(({selfRef,raw})=>({selfRef,raw}));
  const groups=new Map(report.groups.map((group)=>[group.id,group]));
  const findings=new Map(report.findings.map((finding,index)=>[finding.id,{finding,index}]));
  const checks=new Map(), blocks=new Map(), changes=new Map();
  for (const [index,check] of report.checks.entries()) {
    if (!checks.has(check.sourceId)) checks.set(check.sourceId,[]);
    checks.get(check.sourceId).push({value:check,index});
  }
  for (const [index,node] of snapshot.nodes.entries()) {
    if (!blocks.has(node.path[0])) blocks.set(node.path[0],[]);
    blocks.get(node.path[0]).push({value:node,index});
  }
  for (const [index,change] of (handoff.history?.changes ?? []).entries()) {
    if (!changes.has(change.target.path[0])) changes.set(change.target.path[0],[]);
    changes.get(change.target.path[0]).push({value:change,index});
  }
  const ordered=(entries)=>[...new Map(entries.map((entry)=>[entry.index,entry])).values()]
    .sort((a,b)=>a.index-b.index).map((entry)=>entry.value);
  return (groupId)=> {
    const group=groups.get(groupId);
    if (!group) throw Object.assign(new Error("group-not-found"),{code:"group-not-found"});
    const members=group.findingIds.map((id)=>findings.get(id)).sort((a,b)=>a.index-b.index).map((entry)=>entry.finding);
    const ids=new Set(members.flatMap((finding)=>finding.sourceIds));
    const indices=[...ids].map((id)=>sourceIndex.get(id)).sort((a,b)=>a-b);
    const neighborIndices=[...new Set(indices.flatMap((index)=>[index-1,index+1]).filter((index)=>index>=0 && index<sources.length))].sort((a,b)=>a-b);
    const paths=new Set(members.flatMap((finding)=>finding.targets.map((target)=>target.path[0])));
    const neighborPaths=new Set([...paths].flatMap((path)=>[path-1,path+1]));
    const historyPaths=new Set([...paths,...neighborPaths]);
    for (const index of [...indices,...neighborIndices])
      for (const target of [...sources[index].targets,...sources[index].cells.flatMap((cell)=>cell.targets)]) historyPaths.add(target.path[0]);
    return {
      generationId:handoff.provenance.generationId,
      documentRevision:snapshot.revision,
      baselineRevision:report.baselineRevision,
      sourceHash:handoff.provenance.source.pdf.sha256,
      group,findings:members,
      fragments:indices.map((index)=>fragments[index]),
      sourceNeighbors:neighborIndices.map((index)=>sourceNeighbors[index]),
      checks:ordered([...ids].flatMap((id)=>checks.get(id) ?? [])),
      current:ordered([...paths].flatMap((path)=>blocks.get(path) ?? [])),
      neighbors:ordered([...neighborPaths].flatMap((path)=>blocks.get(path) ?? [])),
      pdf:evidence.pages.filter((page)=>group.pageNos.includes(page.pageNo)),
      history:ordered([...historyPaths].flatMap((path)=>changes.get(path) ?? [])),
    };
  };
}
