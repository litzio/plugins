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
import {
  completionGate,
  lossCatalog,
  expressionReviews,
} from "../src/human-review.js";
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
    checks: [],
  };
  const s = {
    generationId: "g",
    sourceHash: "pdf",
    pending: null,
    stopped: false,
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
  const h = {
    provenance: {
      generationId: "g",
      source: { pdf: { sha256: "pdf" } },
      document: { revision: "r" },
      items: [],
    },
    snapshot: { revision: "r", nodes: [] },
  };
  const evidence = { pdfSha256: "pdf", pages: [] };
  assert.equal(completionGate(s, report, [], "r", h, evidence).ready, true);
  assert.equal(
    completionGate(s, report, [{ severity: "blocking" }], "r", h, evidence)
      .ready,
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
      completionGate({ ...s, ...patch }, report, [], "r", h, evidence).ready,
      false,
    );
});

test("expression losses need individual current decisions; deferral, changed meaning and a later edit block", () => {
  const loss = {
    severity: "blocking",
    sourceId: "s",
    reasonCode: "merged-cell-repeated",
    originalValue: { cellIndex: 0 },
    targets: [{ path: [1] }],
  };
  const report = { groups: [], statistics: { pages: 0 }, checks: [] };
  const h = {
    snapshot: { revision: "r", nodes: [] },
    provenance: {
      generationId: "g",
      source: { pdf: { sha256: "pdf" } },
      document: { revision: "r" },
      items: [{ sourceId: "s", targets: [{ path: [1], role: "content" }] }],
    },
  };
  const s = {
    generationId: "g",
    sourceHash: "pdf",
    pending: null,
    stopped: false,
    revision: "r",
    scopes: [],
    changes: [],
    lossConfirmations: [],
  };
  const catalog = lossCatalog([loss], h),
    base = {
      lossId: catalog[0].lossId,
      revision: "r",
      changeCount: 0,
      decision: "meaning-preserved",
    };
  assert.equal(
    completionGate(s, report, [loss], "r", h, { pdfSha256: "pdf", pages: [] })
      .expressionUnconfirmed,
    1,
  );
  for (const decision of ["deferred", "meaning-changed"]) {
    s.lossConfirmations = [{ ...base, decision }];
    assert.equal(
      completionGate(s, report, [loss], "r", h, { pdfSha256: "pdf", pages: [] })
        .ready,
      false,
    );
  }
  s.lossConfirmations = [base];
  assert.equal(
    completionGate(s, report, [loss], "r", h, { pdfSha256: "pdf", pages: [] })
      .ready,
    true,
  );
  assert.equal(
    expressionReviews({ ...s, changes: [{}] }, catalog, "r")[0].confirmation,
    null,
    "ABA revisions cannot resurrect a pre-edit confirmation",
  );
  assert.equal(expressionReviews(s, catalog, "new")[0].confirmation, null);
  assert.equal(
    lossCatalog([{ ...loss, reasonCode: "unknown" }], h)[0].classification,
    "repair-required",
  );
  assert.equal(
    lossCatalog(
      [
        {
          ...loss,
          reasonCode: "footnote-as-paragraph",
          originalValue: { text: "lost" },
        },
      ],
      { ...h, snapshot: { nodes: [] } },
    )[0].classification,
    "repair-required",
  );
});

test("public loss decision binds one known loss to current comparison and preserves negative decisions", async () => {
  const root = join(
    await mkdtemp(join(tmpdir(), "loss-decision-")),
    "generation",
  );
  await syntheticGeneration(root);
  await createReview(root, join(root, "review"));
  const service = createCorrections(root, await fakeCli(root));
  let s = await service.progress();
  const loss = s.losses[0],
    report = JSON.parse(
      await readFile(join(root, "review/review-targets.json")),
    );
  const finding = report.findings.find((f) =>
      f.sourceIds.includes(loss.sourceId),
    ),
    group = report.groups.find((g) => g.findingIds.includes(finding.id));
  const input = {
    lossId: loss.lossId,
    groupId: group.id,
    revision: s.revision,
    targetPath: loss.targets[0].path,
    pageNo: finding.regions[0].pageNo,
    decision: "meaning-preserved",
    note: "Synthetic comparison attestation",
  };
  await assert.rejects(
    service.lossDecision({ ...input, revision: "old" }),
    /stale-loss-decision/,
  );
  await assert.rejects(
    service.lossDecision({ ...input, lossId: "missing" }),
    /loss-not-expression/,
  );
  await assert.rejects(
    service.lossDecision({ ...input, targetPath: [999] }),
    /loss-outside-comparison/,
  );
  await assert.rejects(
    service.lossDecision({ ...input, pageNo: 999 }),
    /loss-page-not-compared/,
  );
  await service.lossDecision(input);
  s = await service.progress();
  assert.equal(s.gate.expressionUnconfirmed, 0);
  assert.equal(
    s.lossConfirmations[0].meaning,
    "expression-semantic-preservation",
  );
  await service.lossDecision({ ...input, decision: "deferred" });
  assert.equal((await service.progress()).gate.expressionUnconfirmed, 1);
  await service.lossDecision({ ...input, decision: "meaning-changed" });
  assert.equal((await service.progress()).gate.expressionUnconfirmed, 1);
});

test("human region evidence alone permits empty cell inline math, records provenance, and undoes exactly", async () => {
  const parent = await mkdtemp(join(tmpdir(), "visual-cell-"));
  let root = join(parent, "seed");
  await syntheticGeneration(root, { text: "" });
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
    root = join(parent, "actual");
    await generate(bundle, root, process.env.DOCLING_TEST_CLI);
  }
  await createReview(root, join(root, "review"));
  const service = createCorrections(
    root,
    process.env.DOCLING_TEST_CLI ?? (await fakeCli(root)),
  );
  const s = await service.progress(),
    report = JSON.parse(
      await readFile(join(root, "review/review-targets.json")),
    ),
    f = report.findings.find((f) => f.kind === "protected-token-difference"),
    group = report.groups.find((g) => g.findingIds.includes(f.id));
  const input = {
    changeId: "visual-fill",
    generationId: s.generationId,
    revision: s.revision,
    groupId: group.id,
    actor: "human",
    decision: "correct",
    target: { kind: "cell", path: [1], row: 0, column: 0 },
    before: "",
    after: "x^2",
    afterContent: [{ kind: "math", value: "x^2" }],
    reason: "Synthetic visual evidence test",
    evidence: {
      kind: "human-source-region",
      refs: [],
      scope: f.regions.map((r) => ({ pageNo: r.pageNo, bbox: r.bbox })),
    },
  };
  await assert.rejects(
    service.submit({ ...input, evidence: undefined }),
    /schema-invalid|invalid-edit|content-requires-human-evidence/,
  );
  const { afterContent: _content, evidence: _evidence, ...noEvidence } = input;
  await assert.rejects(
    service.submit({ ...noEvidence, actor: "assistant" }),
    /invalid-edit/,
  );
  await assert.rejects(service.submit(noEvidence), /invalid-edit/);
  await assert.rejects(
    service.submit({ ...input, actor: "assistant" }),
    /human-evidence-required/,
  );
  await assert.rejects(
    service.submit({
      ...input,
      evidence: {
        ...input.evidence,
        scope: [{ pageNo: 999, bbox: [0, 0, 1, 1] }],
      },
    }),
    /invalid-inspection-scope|visual-scope/,
  );
  assert.equal((await service.submit(input)).status, "applied");
  let h = await loadHandoff(root);
  assert.equal(h.marker.schemaVersion, "1.3.0");
  assert.equal(
    h.history.changes[0].validation.evidenceRecheck,
    "human-source-region",
  );
  assert.equal(h.history.changes[0].validation.protectedTokens, false);
  assert.deepEqual(
    h.snapshot.nodes.find((n) => n.type === "cell").content,
    input.afterContent,
  );
  assert.equal(
    (
      await service.undo({
        undoOf: input.changeId,
        changeId: "visual-undo",
        actor: "human",
        reason: "Synthetic reverse",
      })
    ).status,
    "applied",
  );
  h = await loadHandoff(root);
  assert.equal(h.snapshot.nodes.find((n) => n.type === "cell").text, "");
  assert.deepEqual(h.snapshot.nodes.find((n) => n.type === "cell").content, []);
});
