// Read-only evaluation after the manual Assistant task. Does not call AI or edit documents.
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual as equal } from "node:util";
import { loadHandoff, textAt } from "../src/provenance.js";
const [rootArg, evaluationFile, resultFile] = process.argv.slice(2);
if (!resultFile)
  throw new Error(
    "Usage: node test/measure-assistant-acceptance.js WORK EVALUATION_FILE RESULT_FILE",
  );
const root = resolve(rootArg),
  expected = JSON.parse(await readFile(evaluationFile)),
  out = join(root, "generations", expected.jobId),
  h = await loadHandoff(out),
  ledger = JSON.parse(await readFile(join(out, "correction-ledger.json")));
const changes = h.history?.changes ?? [];
const targets = expected.injected.map((i) => {
  const source = h.provenance.items.find((s) => s.selfRef === i.selfRef),
    target = source.cells.find((c) => c.cellIndex === i.cellIndex).targets[0];
  return {
    target,
    value: textAt(h.snapshot, target.path, target.selector),
    expected: i.pdfValue,
  };
});
const allowed = (c) =>
  targets.some(
    (t) =>
      equal(t.target.path, c.target.path) &&
      t.target.selector.row === c.target.row &&
      t.target.selector.column === c.target.column &&
      c.after === t.expected,
  );
const selected = ledger.scopes.filter((s) => expected.groupIds.includes(s.id));
const result = {
  generationValid: true,
  injectedTargets: targets.length,
  correctedTargets: targets.filter((t) => t.value === t.expected).length,
  changes: changes.length,
  onlyInjectedTargetsChanged: changes.every(allowed),
  normalGroupsChanged: changes.filter((c) =>
    expected.normalGroups.includes(c.groupId),
  ).length,
  protectedTokensRechecked: changes.every(
    (c) => c.validation.evidenceRecheck === "verified-protected-tokens",
  ),
  uncertainSubmissions: ledger.submissions.filter(
    (s) => s.decision === "uncertain",
  ).length,
  pending: !!ledger.pending,
  selectedStates: Object.fromEntries(selected.map((s) => [s.id, s.state])),
  uninspectedGroups: ledger.scopes.filter(
    (s) => !s.id.startsWith("page:") && s.state === "미검사",
  ).length,
  uninspectedPages: ledger.scopes.filter(
    (s) => s.id.startsWith("page:") && s.state === "미검사",
  ).length,
  reviewComplete: false,
};
await writeFile(resultFile, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
