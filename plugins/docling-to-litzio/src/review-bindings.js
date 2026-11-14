import { createMaterialReader, MATERIAL_FIELDS } from "./review-material.js";
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

export function materialContentDigest(material, memo = new WeakMap()) {
  const keys=Object.keys(material).sort(), declared=Object.keys(MATERIAL_FIELDS).sort();
  if (JSON.stringify(keys)!==JSON.stringify(declared))
    throw Object.assign(new Error("unbound-material-field: every material output field must have an explicit binding policy"),{code:"unbound-material-field"});
  const hash=(value)=> {
    if (!value || typeof value !== "object") return reviewDigest(value);
    if (!memo.has(value)) memo.set(value,reviewDigest(value));
    return memo.get(value);
  };
  const bound={};
  for (const [key,policy] of Object.entries(MATERIAL_FIELDS)) {
    if (policy.endsWith("-metadata")) continue;
    bound[key]=policy === "array" ? material[key].map(hash) : policy === "object" ? hash(material[key]) : material[key];
  }
  return reviewDigest(bound);
}

// Construct once per operation from the validated read set. Never cache between
// calls. Hash blocks/items/pages once, then combine their ordered hashes.
export function createPageBindingProjection(report, handoff, evidence) {
  const blocks = new Map(), sources = new Map(), pageSources = new Map();
  const coverageByPage = new Map((handoff.pageCoverage?.pages ?? []).map((page)=>[page.pageNo,page]));
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
  return (pageNo) => {
    const ids = [...(pageSources.get(pageNo) ?? [])].sort();
    const paths = [...new Set(ids.flatMap((id) => sources.get(id)?.paths ?? []))].sort((a,b) => a-b);
    return {
      generationId: handoff.provenance.generationId,
      sourceHash: handoff.provenance.source.pdf.sha256,
      sources: ids.map((id) => [id, sources.get(id)?.item, checkHashes.get(id) ?? null]),
      blocks: paths.map((path) => [path, blockHashes.get(path) ?? null]),
      pages: [[pageNo, pages.get(pageNo) ?? null]],
      extra: coverageByPage.has(pageNo) ? {comparisonCoverage:coverageByPage.get(pageNo)} : null,
    };
  };
}

// Human page comparisons expose exactly these source mappings, whole native
// blocks and PDF page evidence. History is deliberately absent. The digest
// projection below is identical to the indexed projection used for checkpoints.
export const PAGE_MATERIAL_FIELDS = Object.freeze(["contentDigest","documentRevision","generationId","sourceHash","sources","blocks","pages","extra"]);
export function pageMaterial(report,handoff,evidence,pageNo) {
  const page=evidence.pages.find((page)=>page.pageNo===pageNo);
  if (!page) throw Object.assign(new Error("page-not-found"),{code:"page-not-found"});
  const items=handoff.provenance.items.filter((item)=>item.regions.some((region)=>region.pageNo===pageNo))
    .sort((a,b)=>a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);
  const ids=new Set(items.map((item)=>item.sourceId)), checks=new Map();
  for (const check of report.checks) if (ids.has(check.sourceId)) {
    if (!checks.has(check.sourceId)) checks.set(check.sourceId,[]);
    checks.get(check.sourceId).push(check);
  }
  const paths=[...new Set(items.flatMap((item)=>[...item.targets,...item.cells.flatMap((cell)=>cell.targets)].map((target)=>target.path[0])))].sort((a,b)=>a-b);
  const nodes=new Map(paths.map((path)=>[path,[]]));
  for (const node of handoff.snapshot.nodes) nodes.get(node.path[0])?.push(node);
  const coverage=handoff.pageCoverage?.pages.find((page)=>page.pageNo===pageNo);
  const material={contentDigest:null,documentRevision:handoff.snapshot.revision,generationId:handoff.provenance.generationId,
    sourceHash:handoff.provenance.source.pdf.sha256,sources:items.map((item)=>({item,checks:checks.get(item.sourceId) ?? null})),
    blocks:paths.map((path)=>({path,nodes:nodes.get(path)})),pages:[page],extra:coverage ? {comparisonCoverage:coverage} : null};
  material.contentDigest=pageMaterialDigest(material);
  return material;
}
export function pageMaterialDigest(material) {
  if (JSON.stringify(Object.keys(material).sort())!==JSON.stringify([...PAGE_MATERIAL_FIELDS].sort()))
    throw Object.assign(new Error("unbound-page-material-field"),{code:"unbound-page-material-field"});
  for (const [entries,fields] of [[material.sources,["checks","item"]],[material.blocks,["nodes","path"]]])
    if (entries.some((entry)=>JSON.stringify(Object.keys(entry).sort())!==JSON.stringify(fields)))
      throw Object.assign(new Error("unbound-page-material-field"),{code:"unbound-page-material-field"});
  return pageBindingDigest({generationId:material.generationId,sourceHash:material.sourceHash,
    sources:material.sources.map(({item,checks})=>[item.sourceId,reviewDigest(item),checks===null ? null : reviewDigest(checks)]),
    blocks:material.blocks.map(({path,nodes})=>[path,nodes.length ? reviewDigest(nodes) : null]),
    pages:material.pages.map((page)=>[page.pageNo,reviewDigest(page)]),extra:material.extra});
}
export const PAGE_BINDING_FIELDS = Object.freeze(["generationId","sourceHash","sources","blocks","pages","extra"]);
export function pageBindingDigest(projection) {
  if (JSON.stringify(Object.keys(projection).sort()) !== JSON.stringify([...PAGE_BINDING_FIELDS].sort()))
    throw Object.assign(new Error("unbound-page-material-field: page evidence fields and binding inventory must match"),{code:"unbound-page-material-field"});
  return reviewDigest(projection);
}
export function reviewBindings(report, handoff, evidence) {
  const pageProjection = createPageBindingProjection(report,handoff,evidence);
  const result = new Map();
  const material = createMaterialReader(report,handoff,evidence), memo = new WeakMap();
  for (const group of report.groups)
    result.set(group.id,materialContentDigest(material(group.id),memo));
  for (const page of evidence.pages)
    result.set("page:" + page.pageNo, pageBindingDigest(pageProjection(page.pageNo)));
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
