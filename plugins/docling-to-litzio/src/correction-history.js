import { diagnostic } from "./diagnostics.js";
import { inlineText } from "./rich-content.js";
import { protectedTokens } from "./tokens.js";
import { snapshotLookup } from "./lookup.js";
import { isDeepStrictEqual as equal } from "node:util";
import { createHash } from "node:crypto";
export const need = (v, code) => {
  if (!v) throw Object.assign(new Error(diagnostic(code)), { code });
};
export const digest = (v) => createHash("sha256").update(v).digest("hex");
export function targetNode(snapshot, target, lookup) {
  const path =
    target.kind === "cell"
      ? [...target.path, target.row, target.column]
      : target.path;
  const n = lookup ? lookup.node(path) : snapshot.nodes.find((n) => equal(n.path, path));
  need(
    n &&
      (target.kind === "cell"
        ? n.type === "cell"
        : target.kind === "equation"
          ? n.type === "equation"
          : n.type === "paragraph"),
    "unsupported-target",
  );
  return n;
}
export function valueAt(snapshot, target) {
  const n = targetNode(snapshot, target);
  return target.kind === "equation" ? n.latex : n.text;
}
// Text-only edits: rich atoms/marks, structure, captions and heading inference are excluded.
export function projectEdit(
  snapshot,
  target,
  before,
  after,
  revision,
  afterContent,
  beforeContent,
) {
  return applyProjection(
    structuredClone(snapshot),
    target,
    before,
    after,
    revision,
    afterContent,
    beforeContent,
  );
}

// Private replay state is cloned once, then every link is checked and applied.
function applyProjection(
  result,
  target,
  before,
  after,
  revision,
  afterContent,
  beforeContent,
  lookup,
) {
  const n = targetNode(result, target, lookup);
  need((target.kind === "equation" ? n.latex : n.text) === before, "before-conflict");
  if (target.kind === "equation") n.latex = after;
  else {
    need(
      !n.content ||
        equal(n.content, beforeContent) ||
        equal(n.content, before ? [{ kind: "text", text: before }] : []),
      "rich-target-unsupported",
    );
    if (afterContent !== undefined) {
      need(
        target.kind === "cell" &&
          Array.isArray(afterContent) &&
          afterContent.every(
            (c) =>
              ["text", "math"].includes(c.kind) &&
              typeof (c.kind === "math" ? c.value : c.text) === "string",
          ) &&
          inlineText(afterContent) === after,
        "invalid-cell-content",
      );
    }
    n.text = after;
    if (n.content)
      n.content =
        afterContent ?? (after ? [{ kind: "text", text: after }] : []);
  }
  result.revision = revision;
  return result;
}

// Historical rule witnesses have already passed validateHistory. Replay only
// text edits, cloning/indexing the snapshot once, independent of change count.
export function replayEdits(snapshot,changes) {
  const result=structuredClone(snapshot),lookup=snapshotLookup(result,{strict:true});
  for (const change of changes) applyProjection(result,change.target,change.before,change.after,change.afterRevision,change.afterContent,change.beforeContent,lookup);
  return result;
}
export function validateHistory(
  history,
  baseline,
  currentRevision,
  generationId,
) {
  need(
    ["1.1.0", "1.2.0", "1.3.0"].includes(history.schemaVersion) &&
      history.generationId === generationId &&
      history.baselineRevision === baseline.revision &&
      history.changes.length > 0,
    "history-binding",
  );
  let state = structuredClone(baseline);
  const ids = new Set();
  for (const c of history.changes) {
    need(!ids.has(c.changeId), "history-duplicate");
    ids.add(c.changeId);
    need(
      c.beforeRevision === state.revision &&
        c.afterRevision !== c.beforeRevision &&
        c.receipt?.ok === true &&
        c.receipt.command === "apply-batch" &&
        c.receipt.applied === 1 &&
        c.receipt.revision === c.afterRevision &&
        (c.evidence?.refs?.length ||
          c.evidence?.kind === "human-source-region") &&
        c.validation?.readback === true,
      "history-chain",
    );
    state = applyProjection(
      state,
      c.target,
      c.before,
      c.after,
      c.afterRevision,
      c.afterContent,
      c.beforeContent,
    );
  }
  need(
    state.revision === currentRevision && equal(state, history.currentSnapshot),
    "history-current",
  );
  return state;
}
export function operation(target, before, after, content) {
  if (target.kind === "cell")
    return {
      command: "update-table-cell",
      path: [...target.path, target.row, target.column].join(","),
      ...(content === undefined ? { text: after } : { content }),
    };
  return {
    command:
      target.kind === "equation" ? "update-equation-latex" : "update-node-text",
    path: target.path.join(","),
    from: before,
    to: after,
  };
}

export function verifyCorrectionEvidence(
  history,
  provenance,
  evidence,
  report,
) {
  for (const c of history.changes) {
    need(
      c.sourceHash === provenance.source.pdf.sha256 &&
        equal(
          c.inverse,
          operation(c.target, c.after, c.before, c.beforeContent),
        ),
      "history-source",
    );
    const group = report.groups.find((g) => g.id === c.groupId);
    need(group, "history-group");
    const sourceIds = new Set(
      report.findings
        .filter((f) => group.findingIds.includes(f.id))
        .flatMap((f) => f.sourceIds),
    );
    const items = provenance.items.filter((i) => sourceIds.has(i.sourceId));
    if (c.evidence.kind === "human-source-region") {
      need(
        ["1.2.0", "1.3.0"].includes(history.schemaVersion) &&
          c.actor === "human" &&
          c.validation.protectedTokens === false &&
          c.validation.evidenceRecheck === "human-source-region",
        "history-human-evidence",
      );
      verifyVisualScope(c, group, report, evidence, items);
      if (c.undoOf) {
        const original = history.changes.find((x) => x.changeId === c.undoOf);
        need(
          original &&
            original.afterRevision === c.beforeRevision &&
            equal(original.target, c.target) &&
            original.after === c.before &&
            original.before === c.after &&
            equal(original.beforeContent, c.afterContent),
          "history-undo",
        );
      }
      continue;
    }
    need(c.before.trim().length > 0, "history-empty-before-requires-human");
    need(
      c.beforeContent === undefined && c.afterContent === undefined,
      "history-content-requires-human",
    );
    const checks = items.flatMap((i) =>
      c.target.kind === "cell"
        ? i.cells
            .filter((cell) =>
              cell.targets.some(
                (t) =>
                  equal(t.path, c.target.path) &&
                  t.selector.row === c.target.row &&
                  t.selector.column === c.target.column,
              ),
            )
            .flatMap((cell) =>
              report.checks.filter(
                (k) =>
                  k.sourceId === i.sourceId &&
                  k.selectorKey === "cell:" + cell.cellIndex,
              ),
            )
        : i.targets.some((t) => equal(t.path, c.target.path))
          ? report.checks.filter((k) => k.sourceId === i.sourceId)
          : [],
    );
    const refs = [...new Set(checks.flatMap((k) => k.pdfTokenIds))];
    need(
      refs.length && equal([...c.evidence.refs].sort(), refs.sort()),
      "history-evidence",
    );
    const tokens = evidence.pages
      .flatMap((p) => p.tokens)
      .filter((t) => refs.includes(t.id));
    need(
      tokens.every((t) =>
        c.evidence.scope.some(
          (r) =>
            evidence.pages.some(
              (p) =>
                p.pageNo === r.pageNo && p.tokens.some((x) => x.id === t.id),
            ) &&
            r.bbox[0] <= t.bbox[0] &&
            r.bbox[1] <= t.bbox[1] &&
            r.bbox[2] >= t.bbox[2] &&
            r.bbox[3] >= t.bbox[3],
        ),
      ),
      "history-scope",
    );
    const tokenMatch = equal(
      protectedTokens(c.after).map((t) => t.value),
      tokens.map((t) => t.value),
    );
    const matched = tokenMatch && c.target.kind !== "equation";
    need(
      c.validation.evidenceRecheck === evidenceRecheck(c, tokenMatch),
      "history-evidence-recheck",
    );
    need(c.validation.protectedTokens === matched, "history-validation");
    if (
      !c.undoOf &&
      (protectedTokens(c.before).length || protectedTokens(c.after).length)
    )
      need(
        matched ||
          (c.target.kind === "equation" &&
            equal(
              protectedTokens(c.after).map((t) => t.value),
              tokens.map((t) => t.value),
            )),
        "history-protected-tokens",
      );
    if (c.undoOf) {
      const original = history.changes
        .slice(0, history.changes.indexOf(c))
        .find((x) => x.changeId === c.undoOf);
      need(
        original &&
          original.afterRevision === c.beforeRevision &&
          equal(original.target, c.target) &&
          original.after === c.before &&
          original.before === c.after,
        "history-undo",
      );
    }
  }
}

// Cross-check separately persisted processing records; this is consistency, not authentication.
export function validateCorrectionLedger(history, ledger, reconciling = false) {
  need(
    ledger &&
      ledger.generationId === history.generationId &&
      Array.isArray(ledger.changes) &&
      Array.isArray(ledger.submissions) &&
      Array.isArray(ledger.scopes),
    "history-ledger-required",
  );
  const recorded = [...ledger.changes];
  if (reconciling && ledger.pending) {
    const pending = { ...ledger.pending };
    delete pending.expected;
    delete pending.requestHash;
    recorded.push(pending);
    need(ledger.revision === pending.beforeRevision, "history-ledger-revision");
  } else {
    need(
      !ledger.pending && ledger.revision === history.currentSnapshot.revision,
      "history-ledger-revision",
    );
  }
  need(equal(recorded, history.changes), "history-ledger-mismatch");
  for (const c of recorded) {
    const submissions = ledger.submissions.filter(
      (s) => s.changeId === c.changeId,
    );
    need(
      submissions.length === 1 &&
        ledger.sourceHash === c.sourceHash &&
        ledger.scopes.some((s) => s.id === c.groupId),
      "history-ledger-submission",
    );
    const row = submissions[0];
    if (history.schemaVersion === "1.3.0")
      need(row.contentDigest === c.contentDigest && /^[a-f0-9]{64}$/.test(c.contentDigest), "history-ledger-material");
    const pending = reconciling && ledger.pending?.changeId === c.changeId;
    need(
      pending
        ? row.status === "pending-reconcile"
        : row.afterRevision === c.afterRevision &&
            row.status ===
              (c.validation.protectedTokens ||
              c.validation.evidenceRecheck === "human-source-region"
                ? "applied"
                : "uncertain"),
      "history-ledger-submission",
    );
  }
}
export function evidenceRecheck(change, tokenMatch) {
  if (change.evidence?.kind === "human-source-region")
    return "human-source-region";
  if (
    !protectedTokens(change.before).length &&
    !protectedTokens(change.after).length
  )
    return "not-applicable";
  if (change.undoOf && !tokenMatch) return "undo-restoration";
  return tokenMatch ? "verified-protected-tokens" : "unverified";
}

export function verifyVisualScope(change, group, report, pdf, items = []) {
  need(
    change.actor === "human" &&
      change.evidence?.kind === "human-source-region" &&
      change.evidence.refs?.length === 0,
    "human-evidence-required",
  );
  const mapped = items
    .filter((i) =>
      [...i.targets, ...i.cells.flatMap((c) => c.targets)].some(
        (t) =>
          equal(t.path, change.target.path) &&
          (change.target.kind !== "cell" ||
            (t.selector.kind === "cell" &&
              t.selector.row === change.target.row &&
              t.selector.column === change.target.column)),
      ),
    )
    .map((i) => i.sourceId);
  const findings = report.findings.filter(
    (f) =>
      group.findingIds.includes(f.id) &&
      (f.sourceIds.some((id) => mapped.includes(id)) ||
        f.targets.some(
          (t) =>
            equal(t.path, change.target.path) &&
            (change.target.kind !== "cell" ||
              (t.selector.kind === "cell" &&
                t.selector.row === change.target.row &&
                t.selector.column === change.target.column)),
        )),
  );
  need(
    items.some((i) =>
      [...i.targets, ...i.cells.flatMap((c) => c.targets)].some(
        (t) =>
          equal(t.path, change.target.path) &&
          (change.target.kind !== "cell" ||
            (t.selector.kind === "cell" &&
              t.selector.row === change.target.row &&
              t.selector.column === change.target.column)),
      ),
    ) ||
      findings.some(
        (f) =>
          f.targets.some(
            (t) =>
              equal(t.path, change.target.path) &&
              (change.target.kind !== "cell" ||
                (t.selector.kind === "cell" &&
                  t.selector.row === change.target.row &&
                  t.selector.column === change.target.column)),
          ) ||
          (f.sourceIds.some((id) =>
            report.checks.some((c) => c.sourceId === id),
          ) &&
            change.target.kind !== "cell" &&
            f.targets.some((t) => equal(t.path, change.target.path))),
      ),
    "visual-target-outside-group",
  );
  need(
    change.evidence.scope?.length > 0 &&
      change.evidence.scope.every((r) => {
        const page = pdf.pages.find((p) => p.pageNo === r.pageNo),
          b = r.bbox;
        return (
          page &&
          Array.isArray(b) &&
          b.length === 4 &&
          b.every(Number.isFinite) &&
          b[0] >= 0 &&
          b[1] >= 0 &&
          b[2] > b[0] &&
          b[3] > b[1] &&
          b[2] <= page.width &&
          b[3] <= page.height &&
          findings.some((f) =>
            f.regions.some(
              (x) =>
                x.pageNo === r.pageNo &&
                b[0] >= x.bbox[0] &&
                b[1] >= x.bbox[1] &&
                b[2] <= x.bbox[2] &&
                b[3] <= x.bbox[3],
            ),
          )
        );
      }),
    "visual-scope-outside-group",
  );
}
