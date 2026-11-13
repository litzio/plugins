import { sourceItemText } from "./rich-content.js";
import { createHash } from "node:crypto";
import { protectedTokens, difference } from "./tokens.js";
const requiredKinds = new Set([
  "formula-review-required",
  "merged-table-review",
  "heading-basis-low",
  "meaning-loss",
]);
export function humanQueue(s, report) {
  return report.groups
    .filter(
      (g) =>
        g.kinds.some((k) => requiredKinds.has(k)) ||
        s.scopes.some((t) => t.id === g.id && t.state === "판단불가") ||
        (s.submissions ?? []).some(
          (t) =>
            t.groupId === g.id &&
            t.decision === "uncertain" &&
            t.revision === s.revision,
        ),
    )
    .map((g) => ({
      ...g,
      decision:
        (s.humanDecisions ?? [])
          .filter((d) => d.groupId === g.id && d.revision === s.revision)
          .at(-1) ?? null,
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
  return losses
    .filter((l) => l.severity === "blocking")
    .map((l) => {
      const item = handoff?.provenance.items.find(
        (i) => i.sourceId === l.sourceId,
      );
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
export function expressionReviews(s, catalog, revision) {
  return catalog
    .filter((l) => l.classification === "expression")
    .map((l) => ({
      ...l,
      confirmation:
        (s.lossConfirmations ?? [])
          .filter(
            (d) =>
              d.lossId === l.lossId &&
              d.revision === revision &&
              d.changeCount === (s.changes ?? []).length &&
              !d.invalidatedAt,
          )
          .at(-1) ?? null,
    }));
}
export function completionGate(s, report, losses, revision, handoff, evidence) {
  const confirmed = (id) =>
    (s.humanDecisions ?? [])
      .filter((d) => d.groupId === id && d.revision === revision)
      .at(-1)?.decision === "confirmed";
  const expected = [
    ...report.groups.map((g) => g.id),
    ...Array.from(
      { length: report.statistics.pages },
      (_, i) => "page:" + (i + 1),
    ),
  ];
  const uncovered = expected.filter(
    (id) =>
      !s.scopes.some(
        (t) =>
          t.id === id &&
          t.checkpoint?.revision === revision &&
          typeof t.checkpoint.note === "string" &&
          t.checkpoint.note.trim() &&
          (t.state === "차이없음" ||
            (t.state === "교정후재검사" && t.checkpoint.note) ||
            (t.state === "판단불가" && confirmed(id))),
      ),
  );
  const human = humanQueue(s, report).filter((g) => !confirmed(g.id));
  const catalog = lossCatalog(losses, handoff);
  const blocking = catalog.filter(
    (l) => l.classification === "repair-required",
  );
  const expressionUnconfirmed = expressionReviews(s, catalog, revision).filter(
    (l) => l.confirmation?.decision !== "meaning-preserved",
  ).length;
  const tokenDifferences = handoff
    ? report.checks.filter((c) => {
        if (c.status !== "available") return false;
        const item = handoff.provenance.items.find(
          (i) => i.sourceId === c.sourceId,
        );
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
            return last?.evidence.kind === "human-source-region";
          });
        if (humanReviewed) return false;
        const text = (targets ?? [])
          .map((t) => {
            let value = sourceItemText(
              handoff.snapshot,
              t,
              item,
              handoff.provenance,
            );
            if (
              cell &&
              item.structure.tableModel?.headerRows > 1 &&
              cell.sourceCell.column_header
            )
              return cell.sourceCell.text;
            const node = handoff.snapshot.nodes.find(
              (n) => JSON.stringify(n.path) === JSON.stringify(t.path),
            );
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
        const ids = new Set(c.pdfTokenIds),
          tokens = evidence.pages
            .flatMap((p) => p.tokens)
            .filter((t) => ids.has(t.id));
        const diff = difference(tokens, protectedTokens(text));
        return diff.missing.length || diff.extra.length;
      }).length
    : 0;
  const failures = s.scopes.filter((t) => t.state === "실패").length;
  return {
    ready:
      !s.pending &&
      !s.stopped &&
      s.revision === revision &&
      !uncovered.length &&
      !human.length &&
      !blocking.length &&
      !expressionUnconfirmed &&
      !failures &&
      !tokenDifferences,
    uncovered: uncovered.length,
    human: human.length,
    blocking: blocking.length,
    expressionUnconfirmed,
    failures,
    tokenDifferences,
  };
}
