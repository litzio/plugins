import { createHash } from "node:crypto";

// Stable JSON: object keys sorted, array order retained. Revisions are audit
// metadata, not content. All other properties (including rich atoms) are bound.
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort()
      .filter((k) => !["revision", "documentRevision"].includes(k))
      .map((k) => [k, canonical(value[k])]));
  return value;
}
export const reviewDigest = (value) => createHash("sha256")
  .update(JSON.stringify(canonical(value)), "utf8").digest("hex");

// Construct once per operation from the validated read set. Never cache between
// calls. Hash blocks/items/pages once, then combine their ordered hashes.
export function reviewBindings(report, handoff, evidence) {
  const blocks = new Map(), sources = new Map(), pageSources = new Map();
  for (const node of handoff.snapshot.nodes) {
    const key = node.path[0];
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(node);
  }
  const blockHashes = new Map([...blocks].map(([k, v]) => [k, reviewDigest(v)]));
  for (const item of handoff.provenance.items) {
    const paths = [...new Set([...item.targets, ...item.cells.flatMap((c) => c.targets)]
      .map((t) => t.path[0]))].sort((a, b) => a - b);
    sources.set(item.sourceId, { item: reviewDigest(item), paths });
    for (const region of item.regions ?? []) {
      if (!pageSources.has(region.pageNo)) pageSources.set(region.pageNo, new Set());
      pageSources.get(region.pageNo).add(item.sourceId);
    }
  }
  const pages = new Map(evidence.pages.map((p) => [p.pageNo, reviewDigest(p)]));
  const checks = new Map();
  for (const check of report.checks) {
    if (!checks.has(check.sourceId)) checks.set(check.sourceId, []);
    checks.get(check.sourceId).push(check);
  }
  const checkHashes = new Map([...checks].map(([k, v]) => [k, reviewDigest(v)]));
  const findings = new Map(report.findings.map((f) => [f.id, f]));
  const bind = (ids, pageNos, extra) => {
    ids = [...new Set(ids)].sort();
    const paths = [...new Set(ids.flatMap((id) => sources.get(id)?.paths ?? []))].sort((a,b) => a-b);
    return reviewDigest({
      generationId: handoff.provenance.generationId,
      sourceHash: handoff.provenance.source.pdf.sha256,
      sources: ids.map((id) => [id, sources.get(id)?.item, checkHashes.get(id) ?? null]),
      blocks: paths.map((p) => [p, blockHashes.get(p) ?? null]),
      pages: [...new Set(pageNos)].sort((a,b) => a-b).map((p) => [p, pages.get(p) ?? null]),
      extra,
    });
  };
  const result = new Map();
  for (const group of report.groups) {
    const members = group.findingIds.map((id) => findings.get(id));
    result.set(group.id, bind(members.flatMap((f) => f.sourceIds), group.pageNos, { group, members }));
  }
  for (const page of evidence.pages)
    result.set("page:" + page.pageNo, bind(pageSources.get(page.pageNo) ?? [], [page.pageNo], null));
  return result;
}

export function currentReview(record, scopeId, state, revision, bindings) {
  if (!record || record.invalidatedAt) return false;
  if (state.reviewVersion !== "1.3.0") return record.revision === revision;
  if (!bindings) return false;
  const revisions = bindings.revisions ??= [state.baselineMarker?.documentRevision ?? revision, ...(state.changes ?? []).map((c) => c.afterRevision)];
  const known = bindings.knownRevisions ??= new Set(revisions);
  return known.has(record.revision) && (record.changeCount === undefined || revisions[record.changeCount] === record.revision) &&
    !!bindings?.has(scopeId) && record.contentDigest === bindings.get(scopeId);
}

export function invalidateChangedReviews(state, bindings) {
  state.completion = null;
  const now = new Date().toISOString();
  for (const scope of state.scopes)
    if (scope.checkpoint && scope.checkpoint.contentDigest !== bindings.get(scope.id)) {
      scope.state = "미검사";
      scope.checkpoint = null;
    }
  for (const record of [...(state.humanDecisions ?? []), ...(state.lossConfirmations ?? [])])
    if (record.contentDigest !== bindings.get(record.groupId)) record.invalidatedAt ??= now;
}

export function interruptReview(state) {
  state.completion = null;
  for (const scope of state.scopes)
    if (scope.state === "검사중") {
      scope.state = "미검사";
      scope.checkpoint = null;
    }
}
