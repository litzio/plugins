import { reviewBindings, currentReview, reviewDigest } from "./review-bindings.js";
import { firstBy, tokenLookup } from "./lookup.js";
import { createSourceReader } from "./rich-content.js";
import { createHash } from "node:crypto";
import { protectedTokens, difference } from "./tokens.js";
import { pageComparisons } from "./page-comparison.js";
import { ruleReviews } from "./rule-review.js";
const requiredKinds = new Set([
  "formula-review-required",
  "merged-table-review",
  "heading-basis-low",
  "meaning-loss",
]);
export function humanQueue(s, report, bindings, comparisons=[], ruleData) {
  const covered=new Set((ruleData?.items ?? []).filter((item)=>item.ruleConfirmation).map((item)=>item.lossId));
  const catalog=ruleData?.catalog ?? [];
  const findings=new Map((report.findings ?? []).map((finding)=>[finding.id,finding]));
  const lossBySource=new Map(),scopeById=new Map(s.scopes.map((scope)=>[scope.id,scope]));
  for (const loss of catalog) {
    if (!lossBySource.has(loss.sourceId)) lossBySource.set(loss.sourceId,[]);
    lossBySource.get(loss.sourceId).push(loss);
  }
  const uncertain=new Set((s.submissions ?? []).filter((submission)=>submission.decision === "uncertain" && submission.revision === s.revision).map((submission)=>submission.groupId));
  const decisions=new Map();
  for (const decision of s.humanDecisions ?? []) if (currentReview(decision,decision.groupId,s,s.revision,bindings)) decisions.set(decision.groupId,decision);
  const ruleCovers=(group)=> {
    const required=group.findingIds?.map((id)=>findings.get(id)).filter((finding)=>requiredKinds.has(finding.kind)) ?? [];
    return required.length>0 && required.every((finding)=> {
      if (!["meaning-loss","merged-table-review"].includes(finding.kind)) return false;
      const losses=finding.sourceIds.flatMap((id)=>lossBySource.get(id) ?? []).filter((loss)=>
        (finding.kind === "merged-table-review" || (loss.reasonCode===finding.evidence.reasonCode && reviewDigest(loss.originalValue)===reviewDigest(finding.evidence.originalValue))));
      return losses.length>0 && losses.every((loss)=>covered.has(loss.lossId));
    });
  };
  return [...report.groups
    .filter(
      (g) =>
        (g.kinds.some((k) => requiredKinds.has(k)) && !ruleCovers(g)) ||
        scopeById.get(g.id)?.state === "판단불가" || uncertain.has(g.id),
    ),...comparisons.filter((page)=>page.status === "requires-human").map((page)=>({id:page.scopeId,pageNos:[page.pageNo],kinds:["machine-unassessed-page"],comparison:page}))]
    .map((g) => ({
      ...g,
      decision:decisions.get(g.id) ?? null,
    }));
}
// Explicit policy allowlist; native-format alone never authorizes acceptance.
const expressionReasons = new Set([
  "merged-cell-repeated",
  "compound-header-flattened",
  "table-header-role",
  "cell-block-structure",
]);
export function lossCatalog(losses, handoff) {
  const items=new Map((handoff?.provenance.items ?? []).map((item)=>[item.sourceId,item]));
  return losses
    .filter((l) => l.severity === "blocking")
    .map((l) => {
      const item = items.get(l.sourceId);
      const targets =
        item?.targets.filter((t) => t.role === "content") ?? l.targets ?? [];
      const noteParagraph =
        ["dedicated-table-note", "footnote-as-paragraph"].includes(
          l.reasonCode,
        ) &&
        typeof l.originalValue?.text === "string" &&
        targets.some(
          (t) =>
            t.text === l.originalValue.text &&
            handoff?.snapshot.nodes.some(
              (n) =>
                n.type === "paragraph" &&
                JSON.stringify(n.path) === JSON.stringify(t.path),
            ),
        );
      const numberedNote =
        l.reasonCode === "dedicated-table-note" &&
        l.originalValue?.reason ===
          "Original table note placement/letter marker becomes a numbered endnote" &&
        targets.some(
          (t) => t.text === l.originalValue.text.replace(/^\S+\s+/, ""),
        );
      const expression =
        (expressionReasons.has(l.reasonCode) && targets.length > 0) ||
        noteParagraph ||
        numberedNote;
      return {
        lossId: createHash("sha256")
          .update(JSON.stringify([l.sourceId, l.reasonCode, l.originalValue]))
          .digest("hex"),
        sourceId: l.sourceId,
        reasonCode: l.reasonCode,
        representation: noteParagraph
          ? "unlinked-annotation"
          : numberedNote
            ? "numbered-endnote"
            : "native-expression",
        sourceDefect:
          l.originalValue?.reason ===
          "Repeated local marker within extracted table scope"
            ? "duplicate-local-note-marker"
            : "none",
        originalValue: l.originalValue,
        targets,
        classification: expression ? "expression" : "repair-required",
        basis: noteParagraph
          ? "Note body retained as an unlinked annotation paragraph"
          : numberedNote
            ? "Note body retained as a numbered endnote"
            : expression
              ? "Declared native representation limit; source values retained"
              : "Content preservation or ownership not established",
      };
    });
}
export function expressionReviews(s, catalog, revision, bindings, ruleData) {
  const rules=new Map((ruleData?.items ?? []).map((item)=>[item.lossId,item.ruleConfirmation]));
  const confirmations=new Map();
  for (const decision of s.lossConfirmations ?? []) if (currentReview(decision,decision.groupId,s,revision,bindings) &&
      (s.reviewVersion === "1.3.0" || decision.changeCount === (s.changes ?? []).length)) confirmations.set(decision.lossId,decision);
  return catalog
    .filter((l) => l.classification === "expression")
    .map((l) => ({
      ...l,
      ...(s.reviewVersion === "1.3.0" ? {ruleConfirmation:rules.get(l.lossId) ?? null} : {}),
      confirmation:confirmations.get(l.lossId) ?? null,
    }));
}
export function completionGate(s, report, losses, revision, handoff, evidence) {
  const bindings = s.reviewVersion === "1.3.0" && handoff && evidence
    ? reviewBindings(report, handoff, evidence) : undefined;
  const currentDecisions=new Map();
  for (const decision of s.humanDecisions ?? []) if (currentReview(decision,decision.groupId,s,revision,bindings)) currentDecisions.set(decision.groupId,decision);
  const confirmed = (id) =>currentDecisions.get(id)?.decision === "confirmed";
  const comparisons=s.reviewVersion === "1.3.0" && handoff && evidence ? pageComparisons(report,handoff,evidence,bindings) : [];
  const catalog = lossCatalog(losses, handoff);
  const ruleData=s.reviewVersion === "1.3.0" && handoff && evidence ? {...ruleReviews(s,report,handoff,evidence,catalog,bindings),catalog} : undefined;
  const machinePages=new Set(comparisons.filter((page)=>page.status === "machine-passed").map((page)=>page.scopeId));
  const humanPages=new Set(comparisons.filter((page)=>page.status === "requires-human").map((page)=>page.scopeId));
  const expected = [
    ...report.groups.map((g) => g.id),
    ...Array.from(
      { length: report.statistics.pages },
      (_, i) => "page:" + (i + 1),
    ),
  ];
  const scopesById=new Map(s.scopes.map((scope)=>[scope.id,scope]));
  const uncovered = expected.filter(
    (id) =>
      !scopesById.has(id) || (!machinePages.has(id) && !(humanPages.has(id) && confirmed(id)) &&
      ![scopesById.get(id)].some(
        (t) =>
          t && t.id === id &&
          !humanPages.has(id) &&
          currentReview(t.checkpoint, id, s, revision, bindings) &&
          typeof t.checkpoint.note === "string" &&
          t.checkpoint.note.trim() &&
          (t.state === "차이없음" ||
            (t.state === "교정후재검사" && t.checkpoint.note) ||
            (t.state === "판단불가" && confirmed(id))),
      )),
  );
  const decisions = new Map();
  for (const d of s.humanDecisions ?? [])
    if (s.reviewVersion === "1.3.0" || d.revision === revision) decisions.set(d.groupId, d);
  const human = new Set(
    humanQueue(s, report, bindings, comparisons, ruleData)
      .filter((g) => !confirmed(g.id))
      .map((g) => g.id),
  );
  for (const id of humanPages) if (!confirmed(id)) human.add(id);
  for (const [id, d] of decisions) if (d.decision === "deferred") human.add(id);
  const blocking = catalog.filter(
    (l) => l.classification === "repair-required",
  );
  const expressionUnconfirmed = expressionReviews(s, catalog, revision, bindings,ruleData).filter(
    (l) => l.confirmation?.decision !== "meaning-preserved" && !(l.ruleConfirmation && !l.confirmation),
  ).length;
  const reader = handoff
    ? createSourceReader(handoff.snapshot, handoff.provenance)
    : null;
  const itemsById = firstBy(handoff?.provenance.items ?? [], (i) => i.sourceId);
  const tokensFor = evidence ? tokenLookup(evidence) : null;
  const tokenDifferences =
    handoff &&
    evidence &&
    Array.isArray(report.checks) &&
    Array.isArray(evidence.pages)
      ? report.checks.filter((c) => {
          if (c.status !== "available") return false;
          const item = itemsById.get(c.sourceId);
          const cell = c.selectorKey.startsWith("cell:")
            ? item?.cells.find(
                (cell) => cell.cellIndex === Number(c.selectorKey.slice(5)),
              )
            : null;
          const targets = cell
            ? cell.targets.slice(0, 1)
            : item?.targets.filter((t) => t.role === "content");
          const humanReviewed =
            (targets ?? []).length > 0 &&
            (targets ?? []).every((t) => {
              const last = (handoff.history?.changes ?? [])
                .filter(
                  (c) =>
                    JSON.stringify(c.target.path) === JSON.stringify(t.path) &&
                    (c.target.kind !== "cell" ||
                      (t.selector.kind === "cell" &&
                        c.target.row === t.selector.row &&
                        c.target.column === t.selector.column)),
                )
                .at(-1);
              return (
                last?.evidence.kind === "human-source-region" && !last.undoOf
              );
            });
          if (humanReviewed) return false;
          const text = (targets ?? [])
            .map((t) => {
              let value = reader.text(t, item);
              if (
                cell &&
                item.structure.tableModel?.headerRows > 1 &&
                cell.sourceCell.column_header
              )
                return cell.sourceCell.text;
              const node = reader.node(t.path);
              if (
                item.label === "caption" &&
                ["figure", "table"].includes(node?.type) &&
                node.enumerator
              )
                return `${node.enumerator} ${value ?? ""}`;
              if (item.label === "footnote" && item.structure.noteBinding)
                return `${item.structure.noteBinding.marker} ${value ?? ""}`;
              return value;
            })
            .filter((t) => t !== null)
            .join(" ");
          const tokens = tokensFor(c.pdfTokenIds);
          const diff = difference(tokens, protectedTokens(text));
          return diff.missing.length || diff.extra.length;
        }).length
      : 0;
  const failures = s.scopes.filter((t) => t.state === "실패").length;
  const requirements = {
    boundEvidence:
      typeof s.generationId === "string" &&
      s.generationId.length > 0 &&
      typeof s.sourceHash === "string" &&
      s.sourceHash.length > 0 &&
      typeof revision === "string" &&
      revision.length > 0 &&
      !!handoff &&
      !!evidence &&
      handoff.provenance.generationId === s.generationId &&
      handoff.provenance.source?.pdf?.sha256 === s.sourceHash &&
      evidence.pdfSha256 === s.sourceHash &&
      handoff.snapshot?.revision === revision &&
      handoff.provenance.document?.revision === revision &&
      (s.reviewVersion !== "1.3.0" || !!handoff.pageCoverage) &&
      s.scopes.length === scopesById.size && scopesById.size === expected.length,
    noPending: s.pending === null,
    running: s.stopped === false,
    currentRevision: s.revision === revision,
    coverage: uncovered.length === 0,
    humanDecisions: human.size === 0,
    contentLosses: blocking.length === 0,
    expressions: expressionUnconfirmed === 0,
    failureFree: failures === 0,
    protectedValues: tokenDifferences === 0,
  };
  return {
    ready: completionRequirementsMet(requirements),
    uncovered: uncovered.length,
    human: human.size,
    blocking: blocking.length,
    expressionUnconfirmed,
    failures,
    tokenDifferences,
  };
}

// C0-C9 in the handoff contract. Missing proof is false, never an implicit pass.
export const COMPLETION_CONDITIONS = Object.freeze([
  "boundEvidence",
  "noPending",
  "running",
  "currentRevision",
  "coverage",
  "humanDecisions",
  "contentLosses",
  "expressions",
  "failureFree",
  "protectedValues",
]);
export function completionRequirementsMet(proof) {
  return COMPLETION_CONDITIONS.every((key) => proof?.[key] === true);
}

// groups=null invalidates every review; [] invalidates only the completion receipt.
export function invalidateReview(s, { groups = [], resetScopes = false } = {}) {
  s.completion = null;
  const affected = (id) => groups === null || groups.includes(id),
    time = new Date().toISOString();
  for (const record of [
    ...(s.humanDecisions ?? []),
    ...(s.lossConfirmations ?? []),
  ])
    if (affected(record.groupId)) record.invalidatedAt = time;
  if (resetScopes)
    for (const scope of s.scopes)
      if (affected(scope.id)) {
        scope.state = "미검사";
        scope.checkpoint = null;
      }
}
