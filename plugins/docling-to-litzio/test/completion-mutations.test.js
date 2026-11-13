import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { syntheticGeneration, fakeCli } from "./correction-fixture.js";
import { createReview } from "../src/review.js";
import { createCorrections } from "../src/corrections.js";
import { loadHandoff } from "../src/provenance.js";
import { operation } from "../src/correction-history.js";
import {
  COMPLETION_CONDITIONS,
  completionRequirementsMet,
  completionGate,
} from "../src/human-review.js";
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const save = (file, value) => writeFile(file, JSON.stringify(value));
let prepared;
async function baseline() {
  return (prepared ??= (async () => {
    const parent = await mkdtemp(join(tmpdir(), "completion-matrix-")),
      root = join(parent, "sealed");
    await syntheticGeneration(root);
    await createReview(root, join(root, "review"));
    const fake = await fakeCli(root),
      service = createCorrections(root, (cmd, args) =>
        cmd === "check" ? { ok: true } : fake(cmd, args),
      );
    const report = await json(join(root, "review/review-targets.json"));
    const f = report.findings.find(
        (f) => f.kind === "protected-token-difference",
      ),
      groupId = report.groups.find((g) => g.findingIds.includes(f.id)).id;
    const state = await service.progress();
    await service.submit({
      changeId: "visual",
      generationId: state.generationId,
      revision: state.revision,
      groupId,
      actor: "human",
      decision: "correct",
      target: { kind: "cell", path: [1], row: 0, column: 0 },
      before: "999",
      after: "0.12 s",
      reason: "Synthetic matrix baseline",
      evidence: {
        kind: "human-source-region",
        refs: [],
        scope: f.regions.map((r) => ({ pageNo: r.pageNo, bbox: r.bbox })),
      },
    });
    await approve(service);
    await service.finalize({ revision: (await service.progress()).revision });
    assert.equal(
      (await loadHandoff(root, { requireReviewed: true })).reviewComplete,
      true,
    );
    return { parent, root, groupId, report };
  })());
}
async function approve(service) {
  let state = await service.progress();
  for (const scope of state.scopes)
    await service.checkpoint({
      scopeId: scope.id,
      revision: state.revision,
      state: "차이없음",
      note: "Synthetic acceptance state, not document-quality certification",
    });
  state = await service.progress();
  for (const group of state.humanQueue)
    await service.humanDecision({
      groupId: group.id,
      revision: state.revision,
      decision: "confirmed",
      note: "Synthetic required decision",
    });
  state = await service.progress();
  for (const loss of state.losses.filter(
    (l) => l.classification === "expression",
  )) {
    const m = await service.material(
      state.humanQueue.find((g) => g.findingIds)?.id ??
        state.scopes.find((s) => !s.id.startsWith("page:")).id,
    );
    await service.lossDecision({
      lossId: loss.lossId,
      groupId: m.group.id,
      revision: state.revision,
      targetPath: loss.targets[0].path,
      pageNo: m.findings[0].regions[0].pageNo,
      decision: "meaning-preserved",
      note: "Synthetic expression decision",
    });
  }
}
async function copy() {
  const b = await baseline(),
    root = join(b.parent, randomUUID());
  await cp(b.root, root, { recursive: true });
  const h = await loadHandoff(root, { requireReviewed: true }),
    fake = await fakeCli(root, h.snapshot);
  return {
    ...b,
    root,
    h,
    fake,
    service: createCorrections(root, (cmd, args) =>
      cmd === "check" ? { ok: true } : fake(cmd, args),
    ),
  };
}
async function blocked(root, service) {
  await assert.rejects(loadHandoff(root, { requireReviewed: true }));
  assert.equal((await service.progress()).reviewComplete, false);
}
for (const condition of COMPLETION_CONDITIONS)
  for (const value of [false, undefined])
    test(`condition proof mutation: ${condition}=${String(value)}`, () => {
      const proof = Object.fromEntries(
        COMPLETION_CONDITIONS.map((key) => [key, true]),
      );
      assert.equal(completionRequirementsMet(proof), true);
      proof[condition] = value;
      assert.equal(completionRequirementsMet(proof), false);
    });
const events = {
  correction: async (x) => {
    const s = await x.service.progress(),
      m = await x.service.material(x.groupId);
    await x.service.submit({
      changeId: randomUUID(),
      generationId: s.generationId,
      revision: s.revision,
      groupId: x.groupId,
      actor: "human",
      decision: "correct",
      target: { kind: "cell", path: [1], row: 0, column: 0 },
      before: "0.12 s",
      after: "0.13 s",
      reason: "Synthetic state event",
      evidence: {
        kind: "human-source-region",
        refs: [],
        scope: m.findings[0].regions.map((r) => ({
          pageNo: r.pageNo,
          bbox: r.bbox,
        })),
      },
    });
  },
  undo: async (x) => {
    assert.equal(
      (
        await x.service.undo({
          undoOf: "visual",
          changeId: randomUUID(),
          actor: "human",
          reason: "Synthetic undo",
        })
      ).status,
      "applied",
    );
  },
  humanConfirmed: async (x) =>
    x.service.humanDecision({
      groupId: x.groupId,
      revision: x.h.snapshot.revision,
      decision: "confirmed",
      note: "New confirmation requires a new completion receipt",
    }),
  humanDeferredRequired: async (x) =>
    x.service.humanDecision({
      groupId: x.groupId,
      revision: x.h.snapshot.revision,
      decision: "deferred",
      note: "Hold",
    }),
  humanDeferredOrdinary: async (x) => {
    const s = await x.service.progress(),
      id = x.report.groups.find(
        (g) => !s.humanQueue.some((h) => h.id === g.id),
      ).id;
    await x.service.humanDecision({
      groupId: id,
      revision: s.revision,
      decision: "deferred",
      note: "Ordinary group hold",
    });
  },
  lossDeferred: async (x) => {
    const s = await x.service.progress(),
      loss = s.losses[0],
      m = await x.service.material(x.groupId);
    await x.service.lossDecision({
      lossId: loss.lossId,
      groupId: x.groupId,
      revision: s.revision,
      targetPath: loss.targets[0].path,
      pageNo: m.findings[0].regions[0].pageNo,
      decision: "deferred",
      note: "Hold expression",
    });
  },
  lossConfirmed: async (x) => {
    const s = await x.service.progress(),
      loss = s.losses[0],
      m = await x.service.material(x.groupId);
    await x.service.lossDecision({
      lossId: loss.lossId,
      groupId: x.groupId,
      revision: s.revision,
      targetPath: loss.targets[0].path,
      pageNo: m.findings[0].regions[0].pageNo,
      decision: "meaning-preserved",
      note: "New expression confirmation",
    });
  },
  lossMeaningChanged: async (x) => {
    const state = await x.service.progress(),
      loss = state.losses[0],
      m = await x.service.material(x.groupId);
    await x.service.lossDecision({
      lossId: loss.lossId,
      groupId: x.groupId,
      revision: state.revision,
      targetPath: loss.targets[0].path,
      pageNo: m.findings[0].regions[0].pageNo,
      decision: "meaning-changed",
      note: "Changed meaning",
    });
  },
  stop: async (x) => x.service.stop(),
  resume: async (x) => x.service.resume(),
  stopResume: async (x) => {
    await x.service.stop();
    await x.service.resume();
  },
  groupReopen: async (x) =>
    x.service.checkpoint({
      scopeId: x.groupId,
      revision: x.h.snapshot.revision,
      state: "미검사",
      note: "Reopen group",
    }),
  pageReopen: async (x) =>
    x.service.checkpoint({
      scopeId: "page:1",
      revision: x.h.snapshot.revision,
      state: "검사중",
      note: "Reopen page",
    }),
  checkpointUpdate: async (x) =>
    x.service.checkpoint({
      scopeId: x.groupId,
      revision: x.h.snapshot.revision,
      state: "차이없음",
      note: "New checkpoint",
    }),
  uncertain: async (x) =>
    x.service.submit({
      changeId: randomUUID(),
      generationId: x.h.provenance.generationId,
      revision: x.h.snapshot.revision,
      groupId: x.groupId,
      actor: "assistant",
      decision: "uncertain",
      reason: "New uncertainty",
    }),
  documentRevision: async (x) => {
    const file = join(x.root, "external.json");
    await save(file, [
      operation(
        { kind: "cell", path: [1], row: 0, column: 0 },
        "0.12 s",
        "0.13 s",
      ),
    ]);
    await x.fake("apply-batch", [
      "--operations",
      file,
      "--if-revision",
      x.h.snapshot.revision,
    ]);
  },
};
for (const [name, event] of Object.entries(events))
  test(`completed state event: ${name}`, async () => {
    const x = await copy();
    await event(x);
    await blocked(x.root, x.service);
    const state = await x.service.progress();
    assert.equal(state.completion, null);
    if (
      [
        "stop",
        "resume",
        "stopResume",
        "correction",
        "undo",
        "documentRevision",
      ].includes(name)
    ) {
      assert(state.lossConfirmations.every((r) => r.invalidatedAt));
      assert(state.humanDecisions.every((r) => r.invalidatedAt));
    }
  });
const mutations = {
  pending: (s) => (s.pending = {}),
  stopped: (s) => (s.stopped = true),
  staleLedger: (s) => (s.revision = "0".repeat(64)),
  missingPage: (s) => (s.scopes = s.scopes.filter((s) => s.id !== "page:1")),
  staleCheckpoint: (s) => (s.scopes[0].checkpoint.revision = "0".repeat(64)),
  uninspected: (s) => (s.scopes[0].state = "미검사"),
  failed: (s) => (s.scopes[0].state = "실패"),
  missingRequiredDecision: (s) => (s.humanDecisions = []),
  missingExpression: (s) => (s.lossConfirmations = []),
  deferredExpression: (s) => (s.lossConfirmations.at(-1).decision = "deferred"),
  changedExpression: (s) =>
    (s.lossConfirmations.at(-1).decision = "meaning-changed"),
  staleExpression: (s) =>
    (s.lossConfirmations.at(-1).revision = "0".repeat(64)),
  invalidatedExpression: (s) =>
    (s.lossConfirmations.at(-1).invalidatedAt = new Date().toISOString()),
  wrongChangeCount: (s) => s.lossConfirmations.at(-1).changeCount++,
};
for (const [name, mutate] of Object.entries(mutations))
  test(`issuance and reader mutation: ${name}`, async () => {
    const x = await copy(),
      file = join(x.root, "correction-ledger.json"),
      state = await json(file);
    mutate(state);
    await save(file, state);
    await assert.rejects(
      x.service.finalize({ revision: x.h.snapshot.revision }),
    );
    await assert.rejects(loadHandoff(x.root, { requireReviewed: true }));
  });
test("undo is not a fresh human attestation even after all checkpoints and decisions are resubmitted", async () => {
  const x = await copy();
  await events.undo(x);
  await approve(x.service);
  const state = await x.service.progress();
  assert(state.gate.tokenDifferences > 0);
  assert.equal(state.gate.ready, false);
  await assert.rejects(
    x.service.finalize({ revision: state.revision }),
    /review-incomplete/,
  );
  await assert.rejects(loadHandoff(x.root, { requireReviewed: true }));
});
test("ordinary group hold blocks new issuance after otherwise complete evidence", async () => {
  const x = await copy();
  await events.humanDeferredOrdinary(x);
  const state = await x.service.progress();
  assert(state.gate.human > 0);
  assert.equal(state.gate.ready, false);
  await assert.rejects(
    x.service.finalize({ revision: state.revision }),
    /review-incomplete/,
  );
});
test("missing handoff/PDF proofs and an unresolved content loss fail closed", async () => {
  const x = await copy(),
    s = await x.service.progress(),
    evidence = await json(join(x.root, "review/pdf-evidence.json"));
  assert.equal(
    completionGate(
      { ...s, sourceHash: undefined },
      x.report,
      x.h.losses.items,
      s.revision,
      x.h,
      { ...evidence, pdfSha256: undefined },
    ).ready,
    false,
  );
  assert.equal(
    completionGate(
      { ...s, pending: undefined },
      x.report,
      x.h.losses.items,
      s.revision,
      x.h,
      evidence,
    ).ready,
    false,
  );
  assert.equal(
    completionGate(
      { ...s, stopped: undefined },
      x.report,
      x.h.losses.items,
      s.revision,
      x.h,
      evidence,
    ).ready,
    false,
  );
  for (const [h, e] of [
    [null, evidence],
    [x.h, null],
  ])
    assert.equal(
      completionGate(s, x.report, x.h.losses.items, s.revision, h, e).ready,
      false,
    );
  assert.equal(
    completionGate(
      s,
      x.report,
      [{ sourceId: "missing", reasonCode: "unknown", severity: "blocking" }],
      s.revision,
      x.h,
      evidence,
    ).ready,
    false,
  );
});

for (const file of ["document.md", "review/pdf-evidence.json"])
  test(`sealed evidence mutation: ${file}`, async () => {
    const x = await copy();
    await writeFile(join(x.root, file), "corrupted evidence");
    await assert.rejects(
      x.service.finalize({ revision: x.h.snapshot.revision }),
    );
    await assert.rejects(loadHandoff(x.root, { requireReviewed: true }));
  });
test("failed official check refuses a fresh completion receipt", async () => {
  const x = await copy();
  await events.humanConfirmed(x);
  const service = createCorrections(x.root, (cmd, args) =>
    cmd === "check" ? { ok: false } : x.fake(cmd, args),
  );
  assert.equal((await service.progress()).gate.ready, true);
  await assert.rejects(
    service.finalize({ revision: x.h.snapshot.revision }),
    /document-check-failed/,
  );
  await assert.rejects(loadHandoff(x.root, { requireReviewed: true }));
});
test("stop/resume needs fresh review evidence and explicit reissuance", async () => {
  const x = await copy(),
    old = (await x.service.progress()).completion;
  await x.service.stop();
  await x.service.resume();
  await blocked(x.root, x.service);
  await approve(x.service);
  assert.equal((await x.service.progress()).reviewComplete, false);
  await x.service.finalize({ revision: x.h.snapshot.revision });
  const h = await loadHandoff(x.root, { requireReviewed: true });
  assert.equal(h.reviewComplete, true);
  assert.notEqual((await x.service.progress()).completion.time, old.time);
});

test("stop/resume and fresh checkpoints cannot silently clear an ordinary explicit hold", async () => {
  const x = await copy();
  await events.humanDeferredOrdinary(x);
  await x.service.stop();
  await x.service.resume();
  await approve(x.service);
  const state = await x.service.progress();
  assert(state.gate.human > 0);
  assert.equal(state.gate.ready, false);
  await assert.rejects(
    x.service.finalize({ revision: state.revision }),
    /review-incomplete/,
  );
  await assert.rejects(loadHandoff(x.root, { requireReviewed: true }));
});
