import { syntheticGeneration, fakeCli } from "./correction-fixture.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  rename,
  mkdir,
  rmdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { generate } from "../src/generate.js";
import { createReview, readReview } from "../src/review.js";
import { loadHandoff } from "../src/provenance.js";
import { createCorrections, officialCli } from "../src/corrections.js";
import {
  digest,
  projectEdit,
  validateHistory,
  operation,
} from "../src/correction-history.js";
const cli = process.env.DOCLING_TEST_CLI;
const path = { kind: "paragraph", path: [1] };
test("exact text projection rejects before conflict, unsupported rich marks and unrelated edits", () => {
  const snap = {
    revision: "a",
    nodes: [
      {
        type: "paragraph",
        path: [1],
        text: "1 ms",
        content: [{ kind: "text", text: "1 ms" }],
      },
    ],
  };
  assert.throws(
    () => projectEdit(snap, path, "2 ms", "3 ms", "b"),
    /before-conflict/,
  );
  const rich = structuredClone(snap);
  rich.nodes[0].content = [
    { kind: "strong", children: [{ kind: "text", text: "1 ms" }] },
  ];
  assert.throws(
    () => projectEdit(rich, path, "1 ms", "3 ms", "b"),
    /rich-target/,
  );
  assert.deepEqual(
    operation({ kind: "cell", path: [2], row: 1, column: 0 }, "a", "b"),
    { command: "update-table-cell", path: "2,1,0", text: "b" },
  );
  const c = {
    changeId: "1",
    beforeRevision: "a",
    afterRevision: "b",
    target: path,
    before: "1 ms",
    after: "2 ms",
    receipt: { ok: true, command: "apply-batch", applied: 1, revision: "b" },
    evidence: { refs: ["t"] },
    validation: { readback: true },
  };
  const h = {
    schemaVersion: "1.1.0",
    generationId: "g",
    baselineRevision: "a",
    changes: [c],
    currentSnapshot: projectEdit(snap, path, "1 ms", "2 ms", "b"),
  };
  validateHistory(h, snap, "b", "g");
  h.currentSnapshot.nodes.push({
    type: "paragraph",
    path: [2],
    text: "unrecorded",
  });
  assert.throws(() => validateHistory(h, snap, "b", "g"), /history-current/);
});
let baseline;
async function prepare() {
  if (baseline) return baseline;
  const root = await mkdtemp(join(tmpdir(), "docling-correction-test-"));
  if (!cli) {
    const out = join(root, "baseline");
    await syntheticGeneration(out);
    await createReview(out, join(out, "review"));
    baseline = { root, out };
    return baseline;
  }
  const input = join(root, "input");
  await cp(resolve("fixtures/lsr-1.1"), input, { recursive: true });
  const bundle = join(input, "converted"),
    docFile = join(bundle, "document.json"),
    recordFile = join(bundle, "conversion-record.json");
  const doc = JSON.parse(await readFile(docFile)),
    record = JSON.parse(await readFile(recordFile));
  // Deliberately corrupt one conversion value in an isolated copy; the PDF stays immutable.
  const table = doc.tables.find((t) =>
    t.data.table_cells.some((c) => c.text === "0.12 s"),
  );
  assert(table, "known public numeric cell");
  const cell = table.data.table_cells.find((c) => c.text === "0.12 s");
  cell.text = "999";
  const raw = JSON.stringify(doc);
  await writeFile(docFile, raw);
  record.document.sha256 = digest(raw);
  await writeFile(recordFile, JSON.stringify(record));
  const out = join(root, "baseline");
  await generate(bundle, out, cli);
  await createReview(out, join(out, "review"));
  baseline = { root, out };
  return baseline;
}
async function setup(mode = "real") {
  const b = await prepare(),
    out = join(b.root, randomUUID());
  await cp(b.out, out, { recursive: true });
  let calls = 0;
  const real = cli ? officialCli(cli, out) : await fakeCli(out);
  const call = async (command, args) => {
    if (command === "apply-batch") {
      calls++;
      if (mode === "failure") throw new Error("injected-failure");
      const r = await real(command, args);
      if (mode === "lost") throw new Error("lost-response");
      if (mode === "partial") return { ...r, applied: 0 };
      if (mode === "publish-failure") {
        await rename(
          join(out, "complete.json"),
          join(out, "saved-complete.json"),
        );
        await mkdir(join(out, "complete.json"));
      }
      return r;
    }
    return real(command, args);
  };
  const service = createCorrections(out, call),
    { report } = await readReview(out, join(out, "review"));
  const f = report.findings.find(
    (f) =>
      f.kind === "protected-token-difference" &&
      f.evidence.nativeValues.includes("999"),
  );
  assert(f, "injected difference detected");
  const group = report.groups.find((g) => g.findingIds.includes(f.id));
  const m = await service.material(group.id),
    fragment = m.fragments.find((f) =>
      f.mapping.cells.some((c) => c.sourceCell.text === "999"),
    );
  const cell = fragment.mapping.cells.find((c) => c.sourceCell.text === "999"),
    t = cell.targets[0];
  const check = m.checks.find(
    (c) =>
      c.sourceId === fragment.sourceId &&
      c.selectorKey === "cell:" + cell.cellIndex,
  );
  const input = {
    changeId: randomUUID(),
    generationId: m.generationId,
    revision: m.documentRevision,
    groupId: group.id,
    actor: "assistant",
    decision: "correct",
    target: {
      kind: "cell",
      path: t.path,
      row: t.selector.row,
      column: t.selector.column,
    },
    before: "999",
    after: "0.12 s",
    reason: "Deterministic test: restore PDF token in isolated conversion copy",
    evidence: {
      refs: check.pdfTokenIds,
      scope: check.regions.map((r) => ({
        pageNo: r.pageNo,
        bbox: [r.bbox[0] - 2, r.bbox[1] - 2, r.bbox[2] + 2, r.bbox[3] + 2],
      })),
    },
  };
  return { service, input, out, calls: () => calls, real };
}
test(
  "single edit, v1.1 handoff, immutable v1 evidence, duplicate and reverse edit",
  {},
  async () => {
    const { service, input, out, calls } = await setup();
    const baselineBytes = await readFile(join(out, "provenance.json"));
    const r = await service.submit(input);
    assert.equal(r.status, "applied");
    const h = await loadHandoff(out);
    assert.equal(h.marker.schemaVersion, "1.1.0");
    assert.equal(h.history.changes.length, 1);
    await assert.rejects(createReview(out,join(out,"another-review")), /review-baseline-required/);
    assert.deepEqual(
      await readFile(join(out, "provenance.json")),
      baselineBytes,
    );
    await readReview(out, join(out, "review"));
    assert.equal((await service.submit(input)).status, "applied");
    assert.equal(calls(), 1);
    await assert.rejects(
      service.submit({ ...input, after: "0.13 s" }),
      /duplicate-conflict/,
    );
    const undo = await service.undo({
      changeId: randomUUID(),
      undoOf: input.changeId,
      actor: "human",
      evidence: input.evidence,
    });
    assert.equal(undo.status, "uncertain");
    assert.equal((await loadHandoff(out)).history.changes.length, 2);
  },
);
test(
  "before conflict, absent proof, empty cell and foreign generation refuse before writes",
  {},
  async () => {
    const { service, input, calls } = await setup();
    await assert.rejects(
      service.submit({ ...input, before: "998" }),
      /before-conflict/,
    );
    await assert.rejects(
      service.submit({ ...input, generationId: "other" }),
      /stale-submission/,
    );
    await assert.rejects(
      service.submit({ ...input, before: "" }),
      /invalid-edit/,
    );
    await assert.rejects(
      service.submit({
        ...input,
        evidence: { ...input.evidence, refs: ["unknown"] },
      }),
      /unknown-evidence/,
    );
    await assert.rejects(
      service.submit({ ...input, after: "removed" }),
      /protected-token-mismatch/,
    );
    assert.equal(calls(), 0);
  },
);
for (const mode of ["failure", "lost", "partial"])
  test(
    "ambiguous " + mode + " never succeeds or automatically retries",
    {},
    async () => {
      const { service, input, out, calls, real } = await setup(mode);
      assert.equal((await service.submit(input)).status, "pending-reconcile");
      assert.equal(
        (await createCorrections(out, cli || real).reconcile()).status,
        "pending-reconcile",
      );
      await assert.rejects(loadHandoff(out), /pending-reconcile/);
      assert.equal((await service.submit(input)).status, "pending-reconcile");
      assert.equal(calls(), 1);
      assert.equal((await service.progress()).reviewComplete, false);
    },
  );
test(
  "stop/resume, checkpoints, manual edit invalidates revision and denies undo",
  {},
  async () => {
    const { service, input, out, real } = await setup();
    await service.stop();
    await assert.rejects(service.submit(input), /review-stopped/);
    await service.resume();
    await service.checkpoint({
      scopeId: input.groupId,
      revision: input.revision,
      state: "검사중",
      note: "only this group",
    });
    assert.equal(
      (await service.progress()).scopes.find((t) => t.id === "page:13").state,
      "미검사",
    );
    assert.equal((await service.submit(input)).status, "applied");
    const h = await loadHandoff(out),
      ops = join(out, "manual.json");
    await writeFile(
      ops,
      JSON.stringify([operation(input.target, "0.12 s", "0.11 s")]),
    );
    await real("apply-batch", [
      "--operations",
      ops,
      "--if-revision",
      h.snapshot.revision,
    ]);
    await assert.rejects(
      service.undo({ undoOf: input.changeId }),
      /undo-stale/,
    );
    await assert.rejects(loadHandoff(out));
    assert.equal((await service.progress()).completion, null);
  },
);

test(
  "observed receipt resumes interrupted sidecar publication without retransmission",
  {},
  async () => {
    const { service, input, out, calls, real } = await setup("publish-failure");
    assert.equal((await service.submit(input)).status, "pending-reconcile");
    await rmdir(join(out, "complete.json"));
    await rename(join(out, "saved-complete.json"), join(out, "complete.json"));
    assert.equal(
      (await createCorrections(out, cli || real).reconcile()).status,
      "reconciled",
    );
    assert.equal(calls(), 1);
    assert.equal((await loadHandoff(out)).history.changes.length, 1);
  },
);

// A digest is not a waiver for unexplained semantic changes.
test("resealed history still refuses gaps, invented values and false validation", async () => {
  for (const mutate of [
    (h) => (h.changes[0].beforeRevision = "a".repeat(64)),
    (h) => (h.currentSnapshot.nodes[1].text = "unrecorded"),
    (h) => (h.changes[0].validation.protectedTokens = false),
  ]) {
    const { service, input, out } = await setup();
    await service.submit(input);
    const history = JSON.parse(
      await readFile(join(out, "correction-history.json")),
    );
    mutate(history);
    const bytes = JSON.stringify(history);
    await writeFile(join(out, "correction-history.json"), bytes);
    const marker = JSON.parse(await readFile(join(out, "complete.json")));
    marker.files.find(
      (f) => f.relativePath === "correction-history.json",
    ).sha256 = digest(bytes);
    await writeFile(join(out, "complete.json"), JSON.stringify(marker));
    await assert.rejects(loadHandoff(out), /history-/);
  }
});
