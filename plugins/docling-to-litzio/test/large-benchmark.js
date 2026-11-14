import { profile } from "./perf-instrument.js";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

// Fixed test clock/IDs make before/after artifact bytes comparable, not just projections.
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ["2026-11-14T00:00:00.000Z"]));
  }
  static now() {
    return RealDate.parse("2026-11-14T00:00:00.000Z");
  }
};
let uuid = 0;
crypto.randomUUID = () =>
  "00000000-0000-4000-8000-" + (++uuid).toString(16).padStart(12, "0");
syncBuiltinESMExports();
const [
  codeArg,
  workspaceArg,
  phase,
  resultFile,
  sizesArg = "13,65,130,260,mixed",
] = process.argv.slice(2);
const code = resolve(codeArg),
  workspace = resolve(workspaceArg),
  cli = process.env.DOCLING_TEST_CLI;
const mod = (name) => import(pathToFileURL(join(code, "src", name + ".js")));
const { generate } = await mod("generate");
const { createReview, readReview } = await mod("review");
const { loadHandoff } = await mod("provenance");
const { createCorrections } = await mod("corrections");
const { lossCatalog, completionGate } = await mod("human-review");
const { reviewBindings } = await mod("review-bindings");
const read = async (p) => JSON.parse(await fs.readFile(p));
const save = (p, v) => fs.writeFile(p, JSON.stringify(v, null, 2) + "\n");
const sizes = sizesArg.split(",");
await fs.mkdir(workspace, { recursive: true });
const results = [];
function processes() {
  const r = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      new URL("perf-processes.ps1", import.meta.url).pathname.replace(
        /^\/(\w:)/,
        "$1",
      ),
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const snapshot = JSON.parse(r.stdout);
  return {
    at: snapshot.at,
    entries: new Map(
      snapshot.rows
        .filter(
          (p) =>
            p.CPU !== null && p.Id !== process.pid && p.ProcessName !== "pwsh",
        )
        .map((p) => [p.Id, p]),
    ),
  };
}
function load(before, after, ms) {
  ms = after.at - before.at;
  const rows = [...after.entries.values()].map((p) => ({
    name: p.ProcessName,
    seconds: Math.max(0, p.CPU - (before.entries.get(p.Id)?.CPU ?? 0)),
  }));
  const nodeSeconds = rows
    .filter((p) => p.name === "node")
    .reduce((n, p) => n + p.seconds, 0);
  const totalSeconds = rows.reduce((n, p) => n + p.seconds, 0);
  return {
    windowMs: ms,
    otherNodeCores: (nodeSeconds * 1000) / ms,
    otherTotalCores: (totalSeconds * 1000) / ms,
    busiestCores: (Math.max(0, ...rows.map((p) => p.seconds)) * 1000) / ms,
  };
}
for (const size of sizes) {
  const seed = join(workspace, "seed-" + size),
    bundle =
      phase === "original"
        ? fileURLToPath(
            new URL("../../../fixtures/lsr-1.1/converted/", import.meta.url),
          )
        : join(workspace, "bundle-" + size);
  if (phase === "prepare" || phase === "approve" || phase === "original") {
    if (phase !== "approve") {
      if (phase !== "original") {
        const args =
          size === "mixed"
            ? ["--mixed"]
            : ["--copies", String(Number(size) / 13)];
        const py = spawnSync(
          "python",
          [
            new URL("large-corpus.py", import.meta.url).pathname.replace(
              /^\/(\w:)/,
              "$1",
            ),
            bundle,
            ...args,
          ],
          { encoding: "utf8" },
        );
        assert.equal(py.status, 0, py.stderr);
      }
      await generate(bundle, seed, cli);
      await createReview(seed, join(seed, "review"));
    }
    const h = await loadHandoff(seed),
      { report, evidence } = await readReview(seed, join(seed, "review"));
    const time = new Date().toISOString(),
      note = "Deterministic performance state, not actual review or approval";
    const s = {
      version: 1,
      generationId: h.provenance.generationId,
      sourceHash: h.provenance.source.pdf.sha256,
      revision: h.snapshot.revision,
      baselineMarker: h.marker,
      changes: [],
      submissions: [],
      pending: null,
      stopped: false,
      completion: null,
      scopes: [
        ...report.groups.map((g) => g.id),
        ...evidence.pages.map((p) => "page:" + p.pageNo),
      ].map((id) => ({
        id,
        state: "차이없음",
        checkpoint: {
          revision: h.snapshot.revision,
          time,
          note,
          rulesVersion: "1.0.0",
        },
      })),
      humanDecisions: report.groups.map((g) => ({
        groupId: g.id,
        revision: h.snapshot.revision,
        decision: "confirmed",
        note,
        actor: "human",
        time,
      })),
      lossConfirmations: [],
    };
    for (const loss of lossCatalog(h.losses.items, h).filter(
      (l) => l.classification === "expression",
    )) {
      const f = report.findings.find(
          (f) => f.sourceIds.includes(loss.sourceId) && f.regions.length,
        ),
        g = report.groups.find((g) => g.findingIds.includes(f.id));
      s.lossConfirmations.push({
        lossId: loss.lossId,
        sourceId: loss.sourceId,
        reasonCode: loss.reasonCode,
        groupId: g.id,
        revision: s.revision,
        targetPath: loss.targets[0].path,
        pageNo: f.regions[0].pageNo,
        decision: "meaning-preserved",
        note,
        actor: "human",
        time,
        changeCount: 0,
        meaning: "expression-semantic-preservation",
        comparison: "source-and-current-side-by-side",
      });
    }
    if (process.env.PERF_REVIEW_VERSION === "1.3.0") {
      s.reviewVersion = "1.3.0";
      const bindings = reviewBindings(report,h,evidence);
      for (const scope of s.scopes) scope.checkpoint.contentDigest = bindings.get(scope.id);
      for (const record of [...s.humanDecisions,...s.lossConfirmations]) record.contentDigest = bindings.get(record.groupId);
    }
    const gate = completionGate(
      s,
      report,
      h.losses.items,
      s.revision,
      h,
      evidence,
    );
    if (size !== "mixed") assert.equal(gate.ready, true, JSON.stringify(gate));
    await save(join(seed, "correction-ledger.json"), s);
    if (gate.ready)
      await createCorrections(seed, cli).finalize({ revision: s.revision });
    console.log(
      JSON.stringify({
        prepared: size,
        pages: evidence.pages.length,
        groups: report.groups.length,
        ready: gate.ready,
        gate,
      }),
    );
    continue;
  }
  const h = await loadHandoff(seed),
    report = await read(join(seed, "review/review-targets.json"));
  const item = h.provenance.items.find(
    (i) =>
      i.cells.some((c) => c.targets.length && c.sourceCell.text) &&
      report.findings.some((f) => f.sourceIds.includes(i.sourceId)),
  );
  const cell = item.cells.find((c) => c.targets.length && c.sourceCell.text),
    target = cell.targets[0];
  const group = report.groups.find((g) =>
    g.findingIds.some((id) =>
      report.findings
        .find((f) => f.id === id)
        .sourceIds.includes(item.sourceId),
    ),
  );
  const currentCellText = h.snapshot.nodes.find(
    (n) =>
      JSON.stringify(n.path) ===
      JSON.stringify([
        ...target.path,
        target.selector.row,
        target.selector.column,
      ]),
  ).text;
  const loss = h.ledger.lossConfirmations.find(
      (l) => l.revision === h.snapshot.revision && !l.invalidatedAt,
    ),
    note = "Deterministic performance action, not actual review";
  const operations = process.env.PERF_OPERATIONS?.split(",") ?? [
    "humanDecision",
    "lossDecision",
    "progress",
    "submit",
    "finalize",
    "handoff",
  ];
  const rows = [];
  const retries = new Map();
  for (const operation of operations) {
    if (operation === "lossDecision" && !loss) continue;
    for (
      let repeat = 0;
      repeat < Number(process.env.PERF_REPEATS ?? 3) + 1;
      repeat++
    ) {
      const root = await fs.mkdtemp(
        join(workspace, `run-${phase}-${size}-${operation}-${repeat}-`),
      );
      await fs.cp(seed, root, { recursive: true, errorOnExist: true });
      const service = createCorrections(root, cli);
      const fn = () =>
        operation === "humanDecision"
          ? service.humanDecision({
              groupId: group.id,
              revision: h.snapshot.revision,
              decision: "confirmed",
              note,
            })
          : operation === "lossDecision"
            ? service.lossDecision({ ...loss, note })
            : operation === "progress"
              ? service.progress()
              : operation === "finalize"
                ? service
                    .finalize({ revision: h.snapshot.revision })
                    .catch((e) => {
                      if (size === "mixed" && e.code === "review-incomplete")
                        return { reviewComplete: false, blocked: true };
                      throw e;
                    })
                : operation === "handoff"
                  ? loadHandoff(root, { requireReviewed: h.reviewComplete })
                  : service.submit({
                      changeId: "performance-edit",
                      generationId: h.provenance.generationId,
                      revision: h.snapshot.revision,
                      groupId: group.id,
                      actor: "human",
                      decision: "correct",
                      reason: note,
                      target: {
                        kind: "cell",
                        path: target.path,
                        row: target.selector.row,
                        column: target.selector.column,
                      },
                      before: currentCellText,
                      after: currentCellText + " synthetic",
                      evidence: {
                        kind: "human-source-region",
                        refs: [],
                        scope: item.regions.map((r) => ({
                          pageNo: r.pageNo,
                          bbox: r.bbox,
                        })),
                      },
                    });
      const measured = repeat === Number(process.env.PERF_REPEATS ?? 3);
      const beforeLoad = processes(),
        start = performance.now();
      const response = measured ? await profile(fn) : { value: await fn() };
      const ms = performance.now() - start;
      const outside = load(beforeLoad, processes(), ms);
      const quiet =
        outside.otherNodeCores < 0.15 &&
        outside.otherTotalCores < 0.75 &&
        outside.busiestCores < 0.5;
      if (operation === "submit")
        assert.equal(
          response.value.status,
          "applied",
          JSON.stringify(response.value),
        );
      if (operation === "progress" || operation === "finalize")
        assert.equal(response.value.reviewComplete, h.reviewComplete);
      rows.push({
        operation,
        repeat,
        instrumented: measured,
        ms,
        quiet,
        outside,
        ...(response.metrics ? { metrics: response.metrics } : {}),
      });
      await save(resultFile, [
        ...results,
        {
          size,
          pages: h.provenance.pages.length,
          groups: report.groups.length,
          reviewed: h.reviewComplete,
          historyChanges: h.history?.changes.length ?? 0,
          rows,
        },
      ]);
      console.log(
        JSON.stringify({
          size,
          operation,
          repeat,
          measured,
          quiet,
          outside,
          ms: Math.round(ms),
        }),
      );
      if (!quiet && process.env.PERF_LOAD_STRICT === "1") {
        const key = operation + ":" + repeat;
        const attempts = (retries.get(key) ?? 0) + 1;
        retries.set(key, attempts);
        if (attempts >= 3)
          throw new Error(
            "uncontrolled-load: coordinate a quiet window before repeating this sample",
          );
        repeat--;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  results.push({
    size,
    pages: h.provenance.pages.length,
    groups: report.groups.length,
    reviewed: h.reviewComplete,
    historyChanges: h.history?.changes.length ?? 0,
    rows,
  });
}
if (phase !== "prepare") await save(resultFile, results);
