import { protectedTokens } from "./tokens.js";
import { isDeepStrictEqual as equal } from "node:util";
import { createHash } from "node:crypto";
export const need = (v, code) => {
  if (!v) throw new Error(code);
};
export const digest = (v) => createHash("sha256").update(v).digest("hex");
export function targetNode(snapshot, target) {
  const path =
    target.kind === "cell"
      ? [...target.path, target.row, target.column]
      : target.path;
  const n = snapshot.nodes.find((n) => equal(n.path, path));
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
export function projectEdit(snapshot, target, before, after, revision) {
  const result = structuredClone(snapshot),
    n = targetNode(result, target);
  need(valueAt(result, target) === before, "before-conflict");
  if (target.kind === "equation") n.latex = after;
  else {
    need(
      !n.content ||
        equal(n.content, before ? [{ kind: "text", text: before }] : []),
      "rich-target-unsupported",
    );
    n.text = after;
    if (n.content) n.content = after ? [{ kind: "text", text: after }] : [];
  }
  result.revision = revision;
  return result;
}
export function validateHistory(
  history,
  baseline,
  currentRevision,
  generationId,
) {
  need(
    history.schemaVersion === "1.1.0" &&
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
        c.evidence?.refs?.length &&
        c.validation?.readback === true,
      "history-chain",
    );
    state = projectEdit(state, c.target, c.before, c.after, c.afterRevision);
  }
  need(
    state.revision === currentRevision && equal(state, history.currentSnapshot),
    "history-current",
  );
  return state;
}
export function operation(target, before, after) {
  if (target.kind === "cell")
    return {
      command: "update-table-cell",
      path: [...target.path, target.row, target.column].join(","),
      text: after,
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
        equal(c.inverse, operation(c.target, c.after, c.before)),
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
    const matched =
      equal(
        protectedTokens(c.after).map((t) => t.value),
        tokens.map((t) => t.value),
      ) && c.target.kind !== "equation";
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
