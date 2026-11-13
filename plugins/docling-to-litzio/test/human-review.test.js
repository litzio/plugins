import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticGeneration, fakeCli } from "./correction-fixture.js";
import { createReview } from "../src/review.js";
import { generate } from "../src/generate.js";
import { createCorrections } from "../src/corrections.js";
import { loadHandoff } from "../src/provenance.js";
import { completionGate } from "../src/human-review.js";
test("completion needs every current scope and human decision; seals v1.2 and rejects later changes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "human-review-"));
  let root = join(parent, "generation");
  await syntheticGeneration(root, { header: true });
  if (process.env.DOCLING_TEST_CLI) {
    const bundle = join(parent, "bundle");
    await cp(join(root, "source"), bundle, { recursive: true });
    const record = JSON.parse(
      await readFile(join(bundle, "conversion-record.json")),
    );
    record.source.file = "source.pdf";
    await writeFile(
      join(bundle, "conversion-record.json"),
      JSON.stringify(record),
    );
    root = join(parent, "actual-generation");
    await generate(bundle, root, process.env.DOCLING_TEST_CLI);
  }
  await createReview(root, join(root, "review"));
  const fake = await fakeCli(root),
    service = createCorrections(
      root,
      process.env.DOCLING_TEST_CLI ??
        ((cmd, args) => (cmd === "check" ? { ok: true } : fake(cmd, args))),
    );
  let state = await service.progress();
  assert(
    state.gate.tokenDifferences > 0,
    "unfixed protected-token differences block completion",
  );
  const report = JSON.parse(
    await readFile(join(root, "review/review-targets.json")),
  );
  const f = report.findings.find(
    (f) => f.kind === "protected-token-difference",
  );
  const group = report.groups.find((g) => g.findingIds.includes(f.id));
  const m = await service.material(group.id),
    refs = m.checks.find((c) => c.selectorKey === "cell:0").pdfTokenIds;
  const scope = m.pdf.flatMap((p) => {
    const ts = p.tokens.filter((t) => refs.includes(t.id));
    return ts.length
      ? [
          {
            pageNo: p.pageNo,
            bbox: [
              Math.min(...ts.map((t) => t.bbox[0])),
              Math.min(...ts.map((t) => t.bbox[1])),
              Math.max(...ts.map((t) => t.bbox[2])),
              Math.max(...ts.map((t) => t.bbox[3])),
            ],
          },
        ]
      : [];
  });
  await service.submit({
    changeId: "restore",
    groupId: group.id,
    generationId: m.generationId,
    revision: m.documentRevision,
    actor: "human",
    decision: "correct",
    target: { kind: "cell", path: [1], row: 0, column: 0 },
    before: "999",
    after: "0.12 s",
    reason: "Synthetic restore",
    evidence: { refs, scope },
  });
  state = await service.progress();
  await assert.rejects(
    service.finalize({ revision: state.revision }),
    /review-incomplete/,
  );
  for (const scope of state.scopes)
    await service.checkpoint({
      scopeId: scope.id,
      revision: state.revision,
      state: "차이없음",
      note: "Synthetic state transition test, not an actual review",
    });
  state = await service.progress();
  for (const group of state.humanQueue)
    await service.humanDecision({
      groupId: group.id,
      revision: state.revision,
      decision: "confirmed",
      note: "Synthetic human decision test",
    });
  state = await service.progress();
  assert.equal(state.gate.ready, true);
  await service.finalize({ revision: state.revision });
  assert.equal(
    (await loadHandoff(root, { requireReviewed: true })).reviewComplete,
    true,
  );
  assert.equal((await service.progress()).reviewComplete, true);
  await service.checkpoint({
    scopeId: state.scopes[0].id,
    revision: state.revision,
    state: "미검사",
    note: "Reopened",
  });
  await assert.rejects(
    loadHandoff(root, { requireReviewed: true }),
    /review-unavailable/,
  );
  assert.equal((await service.progress()).reviewComplete, false);
  await writeFile(join(root, "document.md"), "manual edit");
  await assert.rejects(
    loadHandoff(root, { requireReviewed: true }),
    /file-digest/,
  );
});
test("missing page, failure, stale revision, deferred human and stopped review cannot complete", () => {
  const report = {
    groups: [{ id: "g", kinds: ["formula-review-required"] }],
    statistics: { pages: 1 },
    findings: [],
  };
  const s = {
    revision: "r",
    scopes: [
      {
        id: "g",
        state: "차이없음",
        checkpoint: { revision: "r", note: "synthetic check" },
      },
      {
        id: "page:1",
        state: "차이없음",
        checkpoint: { revision: "r", note: "synthetic check" },
      },
    ],
    humanDecisions: [{ groupId: "g", revision: "r", decision: "confirmed" }],
  };
  assert.equal(completionGate(s, report, [], "r").ready, true);
  assert.equal(
    completionGate(s, report, [{ severity: "blocking" }], "r").ready,
    false,
  );
  for (const patch of [
    { scopes: s.scopes.slice(0, 1) },
    { stopped: true },
    { pending: {} },
    { revision: "old" },
    { humanDecisions: [{ groupId: "g", revision: "r", decision: "deferred" }] },
    { scopes: [{ ...s.scopes[0], state: "실패" }, s.scopes[1]] },
  ])
    assert.equal(
      completionGate({ ...s, ...patch }, report, [], "r").ready,
      false,
    );
});
