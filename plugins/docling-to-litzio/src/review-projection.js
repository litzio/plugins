import { listText } from "./rich-content.js";
import { snapshotLookup } from "./lookup.js";
import { isDeepStrictEqual as equal } from "node:util";
import { need, replayEdits } from "./correction-history.js";
export function textAt(snapshot, path, selector = { kind: "block" }, lookup) {
  const n = lookup
    ? lookup.node(path)
    : snapshot.nodes.find((n) => equal(n.path, path));
  need(n, "target-missing");
  if (selector.kind === "cell")
    return (
      (lookup
        ? lookup.node([...path, selector.row, selector.column], "cell")
        : snapshot.nodes.find(
            (c) =>
              c.type === "cell" &&
              equal(c.path, [...path, selector.row, selector.column]),
          )
      )?.text ?? null
    );
  if (selector.kind === "list-item")
    return n.items?.[selector.index]
      ? listText({ items: [n.items[selector.index]] })
      : null;
  return (
    n.text ??
    n.latex ??
    n.code ??
    (n.type === "figure"
      ? ((lookup
          ? lookup.caption(path[0])
          : snapshot.nodes.find(
              (c) => c.type === "caption" && c.path[0] === path[0],
            )
        )?.text ?? "")
      : null)
  );
}

// One projection for accepted corrections and historical approval witnesses.
export function projectReviewHandoff(baseline,current,history) {
  const lookup=snapshotLookup(current,{strict:true}),updated=structuredClone(baseline.provenance);
  updated.schemaVersion=history.schemaVersion;
  updated.document.revision=current.revision;
  updated.document.blocks=current.nodes.filter((node)=>node.path.length===1 && node.type!=="caption")
    .map((node)=>({path:node.path,kind:node.type,text:textAt(current,node.path,undefined,lookup)}));
  for (const item of updated.items) for (const target of [...item.targets,...item.cells.flatMap((cell)=>cell.targets),...item.losses.flatMap((loss)=>loss.targets)]) {
    target.documentRevision=current.revision;
    target.text=textAt(current,target.path,target.selector,lookup);
  }
  return {...baseline,provenance:updated,snapshot:current,history,baseline,pageCoverage:baseline.pageCoverage};
}
export function historicalReviewHandoff(handoff,changeCount) {
  const baseline=handoff.baseline ?? handoff,changes=handoff.history?.changes ?? [];
  need(Number.isInteger(changeCount) && changeCount>=0 && changeCount<=changes.length,"rule-history-count");
  if (changeCount===changes.length) return handoff;
  if (changeCount===0) return baseline;
  const snapshot=replayEdits(baseline.snapshot,changes.slice(0,changeCount));
  return projectReviewHandoff(baseline,snapshot,{...handoff.history,changes:changes.slice(0,changeCount),currentSnapshot:snapshot});
}
