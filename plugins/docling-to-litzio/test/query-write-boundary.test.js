import { observed } from "./observed-submission.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, basename, relative } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";

const originalRead = fs.readFile.bind(fs);
let afterRead;
fs.readFile = async (...args) => {
  const bytes = await originalRead(...args);
  if (afterRead) await afterRead(String(args[0]), bytes);
  return bytes;
};
syncBuiltinESMExports();
const { syntheticGeneration, fakeCli } = await import(
  "./correction-fixture.js"
);
const { createReview, readReview } = await import("../src/review.js");
const { createCorrections } = await import("../src/corrections.js");
const { loadHandoff } = await import("../src/provenance.js");
const json = async (file) => JSON.parse(await originalRead(file));
const note = "Deterministic boundary test, not actual human review";
let prepared;
async function baseline() {
  return (prepared ??= (async () => {
    const parent = await fs.mkdtemp(join(tmpdir(), "review-boundary-"));
    const root = join(parent, "sealed");
    await syntheticGeneration(root, { header: false, text: "0.12 s" });
    await createReview(root, join(root, "review"));
    const fake = await fakeCli(root);
    const service = createCorrections(root, (cmd, args) =>
      cmd === "check" ? { ok: true } : fake(cmd, args),
    );
    let s = await service.progress();
    const report = await json(join(root, "review/review-targets.json"));
    for (const scope of s.scopes)
      await observed(service, "checkpoint", {
        scopeId: scope.id,
        revision: s.revision,
        state: "차이없음",
        note,
      });
    for (const group of s.humanQueue)
      await observed(service, "humanDecision", {
        groupId: group.id,
        revision: s.revision,
        decision: "confirmed",
        note,
      });
    for (const loss of s.losses) {
      const finding = report.findings.find(
        (f) => f.sourceIds.includes(loss.sourceId) && f.regions.length,
      );
      const group = report.groups.find((g) =>
        g.findingIds.includes(finding.id),
      );
      await observed(service, "lossDecision", {
        lossId: loss.lossId,
        groupId: group.id,
        revision: s.revision,
        targetPath: loss.targets[0].path,
        pageNo: finding.regions[0].pageNo,
        decision: "meaning-preserved",
        note,
      });
    }
    await service.finalize({ revision: s.revision });
    return { parent, root };
  })());
}
async function copy() {
  const b = await baseline(),
    root = join(b.parent, randomUUID());
  await fs.cp(b.root, root, { recursive: true });
  const h = await loadHandoff(root, { requireReviewed: true });
  const fake = await fakeCli(root, h.snapshot);
  let applies = 0;
  const service = createCorrections(root, (cmd, args) => {
    if (cmd === "check") return { ok: true };
    if (cmd === "apply-batch") applies++;
    return fake(cmd, args);
  });
  return { root, h, service, applies: () => applies };
}

for (const changed of ["document.md", "review/pdf-evidence.json"]) {
  test(`progress returns captured revision when ${changed} changes after last review read`, async () => {
    const x = await copy(),
      counts = new Map();
    let injected = false;
    afterRead = async (file) => {
      const name = relative(x.root, file).replaceAll("\\", "/");
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (name === "review/review-complete.json" && counts.get(name) === 2) {
        injected = true;
        await fs.writeFile(
          join(x.root, changed),
          "changed after captured judgment",
        );
      }
    };
    let result;
    try {
      result = await x.service.progress();
    } finally {
      afterRead = null;
    }
    assert(injected);
    assert.equal(result.reviewComplete, true);
    assert.equal(result.gate.ready, true);
    assert.equal(result.currentRevision, x.h.snapshot.revision);
    assert.equal(result.revision, result.currentRevision);
    for (const file of [
      "document.md",
      "source/document.json",
      "review/pdf-evidence.json",
      "review/review-targets.json",
    ])
      assert.equal(counts.get(file), 1, file);
    await assert.rejects(
      loadHandoff(x.root, { requireReviewed: true }),
      /file-digest/,
    );
    await assert.rejects(x.service.progress());
  });
}

for (const operation of [
  "humanDecision",
  "lossDecision",
  "finalize",
  "submit",
  "uncertain",
]) {
  test(`${operation} rejects document change immediately after its last judgment read`, async () => {
    const x = await copy(),
      revision = x.h.snapshot.revision;
    const ledgerBefore = await originalRead(
      join(x.root, "correction-ledger.json"),
    );
    const markerBefore = await originalRead(join(x.root, "complete.json"));
    const report = await json(join(x.root, "review/review-targets.json"));
    const groupId = report.groups[0].id;
    const seenMaterial = await x.service.material(groupId);
    const loss = x.h.ledger.lossConfirmations[0];
    let reviewReads = 0,
      armed = false,
      documentReads = 0,
      injected = false;
    afterRead = async (file) => {
      if (basename(file) === "review-complete.json" && ++reviewReads === 2) {
        armed = true;
        if (
          ["humanDecision", "lossDecision", "finalize", "uncertain"].includes(
            operation,
          )
        ) {
          injected = true;
          await fs.writeFile(join(x.root, "document.md"), "late external edit");
        }
      } else if (
        armed &&
        basename(file) === "document.md" &&
        ++documentReads === 1
      ) {
        injected = true;
        await fs.writeFile(join(x.root, "document.md"), "late external edit");
      }
    };
    const submit = {
      changeId: "late-edit",
      contentDigest: seenMaterial.contentDigest,
      generationId: x.h.provenance.generationId,
      revision,
      groupId,
      actor: "human",
      decision: operation === "uncertain" ? "uncertain" : "correct",
      reason: note,
      target: { kind: "cell", path: [1], row: 0, column: 0 },
      before: "0.12 s",
      after: "0.13 s",
      evidence: {
        kind: "human-source-region",
        refs: [],
        scope: report.findings[0].regions.map((r) => ({
          pageNo: r.pageNo,
          bbox: r.bbox,
        })),
      },
    };
    try {
      await assert.rejects(
        () =>
          operation === "humanDecision"
            ? observed(x.service, "humanDecision", {
                groupId,
                revision,
                contentDigest: seenMaterial.contentDigest,
                decision: "confirmed",
                note,
              })
            : operation === "lossDecision"
              ? observed(x.service, "lossDecision", { ...loss, note })
              : operation === "finalize"
                ? x.service.finalize({ revision })
                : observed(x.service, "submit", submit),
        /stale-write-revision/,
      );
    } finally {
      afterRead = null;
    }
    assert(injected);
    assert.equal(x.applies(), 0);
    assert.deepEqual(
      await originalRead(join(x.root, "correction-ledger.json")),
      ledgerBefore,
    );
    assert.deepEqual(
      await originalRead(join(x.root, "complete.json")),
      markerBefore,
    );
  });
}

test("finalize rechecks revision after a successful official check result", async () => {
  const x = await copy();
  const fake = await fakeCli(x.root, x.h.snapshot);
  const before = new Map();
  for (const name of [
    "correction-ledger.json",
    "complete.json",
    "human-review.json",
  ])
    before.set(name, await originalRead(join(x.root, name)));
  let checked = false;
  const service = createCorrections(x.root, async (cmd, args) => {
    if (cmd !== "check") return fake(cmd, args);
    checked = true;
    await fs.writeFile(
      join(x.root, "document.md"),
      "edit after successful check",
    );
    return { ok: true };
  });
  await assert.rejects(
    service.finalize({ revision: x.h.snapshot.revision }),
    /stale-write-revision/,
  );
  assert(checked);
  for (const [name, bytes] of before)
    assert.deepEqual(await originalRead(join(x.root, name)), bytes);
});

test("schema reuse is bound to exact bytes even if a captured buffer and review marker change", async () => {
  const x = await copy();
  // Establish the history validation receipt, then exercise the supported
  // unsealed review-marker path. Other tests cover the stronger outer seal;
  // this probe must still reach the exact-byte cache recheck itself.
  const report = await json(join(x.root,"review/review-targets.json"));
  const groupId = report.groups[0].id;
  await observed(x.service,"submit",{changeId:"cache-probe",generationId:x.h.provenance.generationId,revision:x.h.snapshot.revision,
    groupId,actor:"human",decision:"correct",target:{kind:"cell",path:[1],row:0,column:0},before:"0.12 s",after:"0.12 s temporary",
    reason:note,evidence:{kind:"human-source-region",refs:[],scope:report.findings[0].regions.map((region)=>({pageNo:region.pageNo,bbox:region.bbox}))}});
  await observed(x.service,"undo",{changeId:"cache-undo",undoOf:"cache-probe",actor:"human",reason:note});
  const marker = await json(join(x.root,"complete.json"));
  marker.files = marker.files.filter((file)=>file.relativePath !== "review/review-complete.json");
  await fs.writeFile(join(x.root,"complete.json"),JSON.stringify(marker));
  let reportBuffer,
    injected = false;
  afterRead = async (file, bytes) => {
    if (basename(file) === "review-targets.json") reportBuffer = bytes;
    if (basename(file) !== "review-complete.json" || injected) return;
    injected = true;
    const changed = reportBuffer
      .toString()
      .replace('"detectorVersion": "1.1.0"', '"detectorVersion": "9.9.9"');
    assert.notEqual(changed, reportBuffer.toString());
    assert.equal(Buffer.byteLength(changed), reportBuffer.length);
    reportBuffer.write(changed);
    const marker = JSON.parse(bytes);
    marker.reportSha256 = createHash("sha256")
      .update(reportBuffer)
      .digest("hex");
    const markerBytes = JSON.stringify(marker, null, 2) + "\n";
    assert.equal(Buffer.byteLength(markerBytes), bytes.length);
    bytes.write(markerBytes);
    await fs.writeFile(
      join(x.root, "review/review-targets.json"),
      reportBuffer,
    );
    await fs.writeFile(file, bytes);
  };
  try {
    await assert.rejects(
      readReview(x.root, join(x.root, "review")),
      /review-file-digest/,
    );
  } finally {
    afterRead = null;
  }
  assert(injected);
});

test("reusing correction readback still checks fresh document bytes before publication", async () => {
  const x = await copy();
  const markerBefore = await originalRead(join(x.root, "complete.json"));
  const report = await json(join(x.root, "review/review-targets.json"));
  const seenMaterial = await x.service.material(report.groups[0].id);
  let documentReads = 0,
    injected = false;
  afterRead = async (file) => {
    if (basename(file) === "document.md" && ++documentReads === 4) {
      injected = true;
      await fs.writeFile(
        join(x.root, "document.md"),
        "external edit after correction readback",
      );
    }
  };
  let row;
  try {
    row = await observed(x.service, "submit", {
      changeId: "late-publish",
      contentDigest: seenMaterial.contentDigest,
      generationId: x.h.provenance.generationId,
      revision: x.h.snapshot.revision,
      groupId: report.groups[0].id,
      actor: "human",
      decision: "correct",
      reason: note,
      target: { kind: "cell", path: [1], row: 0, column: 0 },
      before: "0.12 s",
      after: "0.13 s",
      evidence: {
        kind: "human-source-region",
        refs: [],
        scope: report.findings[0].regions.map((r) => ({
          pageNo: r.pageNo,
          bbox: r.bbox,
        })),
      },
    });
  } finally {
    afterRead = null;
  }
  assert(injected);
  assert.equal(x.applies(), 1);
  assert.equal(row.status, "pending-reconcile");
  assert((await json(join(x.root, "correction-ledger.json"))).pending);
  assert.deepEqual(
    await originalRead(join(x.root, "complete.json")),
    markerBefore,
  );
});
