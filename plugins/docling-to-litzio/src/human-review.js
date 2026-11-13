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
  const blocking = losses.filter((l) => l.severity === "blocking");
  const tokenDifferences = handoff
    ? report.checks.filter((c) => {
        if (c.status !== "available") return false;
        const item = handoff.provenance.items.find(
          (i) => i.sourceId === c.sourceId,
        );
        const targets = c.selectorKey.startsWith("cell:")
          ? item?.cells.find(
              (cell) => cell.cellIndex === Number(c.selectorKey.slice(5)),
            )?.targets
          : item?.targets.filter((t) => t.role === "content");
        const text = (targets ?? []).map((t) => t.text ?? "").join(" ");
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
      !failures &&
      !tokenDifferences,
    uncovered: uncovered.length,
    human: human.length,
    blocking: blocking.length,
    failures,
    tokenDifferences,
  };
}
