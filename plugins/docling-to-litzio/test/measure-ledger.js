// No AI/server calls. Retains disposable outputs; fixtures are read-only.
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
let counters = null;
for (const key of ["readFile", "writeFile"]) {
  const original = fs[key].bind(fs);
  fs[key] = async (...args) => {
    const result = await original(...args);
    if (counters) {
      const file = relative(counters.root, String(args[0])).replaceAll(
        "\\",
        "/",
      );
      const row = (counters.files[file] ??= {
        reads: 0,
        writes: 0,
        readBytes: 0,
        writeBytes: 0,
      });
      row[key === "readFile" ? "reads" : "writes"]++;
      row[key === "readFile" ? "readBytes" : "writeBytes"] += Buffer.byteLength(
        key === "readFile" ? result : args[1],
      );
    }
    return result;
  };
}
syncBuiltinESMExports();
const { generate } = await import("../src/generate.js");
const { createReview } = await import("../src/review.js");
const { loadHandoff } = await import("../src/provenance.js");
const { createCorrections } = await import("../src/corrections.js");
const { hash } = await import("../src/convert.js");
const { projectEdit, valueAt } = await import("../src/correction-history.js");
const { repoPath } = await import("./paths.js");
const [base, phase, resultFile] = process.argv.slice(2);
const cli = process.env.DOCLING_TEST_CLI;
const read = async (p) => JSON.parse(await fs.readFile(p));
const save = (p, v) => fs.writeFile(p, JSON.stringify(v, null, 2) + "\n");
const results = [];
for (const factor of process.env.BENCH_FACTOR
  ? [Number(process.env.BENCH_FACTOR)]
  : [1, 10]) {
  const root = join(resolve(base), "x" + factor);
  if (phase === "prepare") {
    const bundle = join(resolve(base), "bundle" + factor);
    await fs.mkdir(bundle, { recursive: true });
    const doc = await read(
      repoPath("fixtures/lsr-1.1/converted/document.json"),
    );
    const collections = [
      "texts",
      "tables",
      "pictures",
      "groups",
      "key_value_items",
      "form_items",
    ].filter((k) => Array.isArray(doc[k]));
    const source = structuredClone(doc);
    for (const k of collections) doc[k] = [];
    doc.body.children = [];
    doc.furniture.children = [];
    doc.pages = {};
    function copy(v, n) {
      if (Array.isArray(v)) return v.map((x) => copy(x, n));
      if (v && typeof v === "object")
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            k === "page_no" ? x + 13 * n : copy(x, n),
          ]),
        );
      if (typeof v === "string") {
        const m = v.match(/^#\/(\w+)\/(\d+)$/);
        if (m && collections.includes(m[1]))
          return "#/" + m[1] + "/" + (Number(m[2]) + source[m[1]].length * n);
      }
      return v;
    }
    for (let n = 0; n < factor; n++) {
      for (const k of collections) doc[k].push(...copy(source[k], n));
      doc.body.children.push(...copy(source.body.children, n));
      doc.furniture.children.push(...copy(source.furniture.children, n));
      for (const p of Object.values(source.pages))
        doc.pages[p.page_no + 13 * n] = copy(p, n);
    }
    const pdf = join(bundle, "source.pdf");
    const py = spawnSync(
      "python",
      [
        "-c",
        "from pypdf import PdfReader,PdfWriter\nimport sys\nr=PdfReader(sys.argv[1]); w=PdfWriter()\nfor _ in range(int(sys.argv[3])):\n for p in r.pages: w.add_page(p)\nw.write(sys.argv[2])",
        repoPath("fixtures/lsr-1.1/LSR-1.1-standards.pdf"),
        pdf,
        String(factor),
      ],
      { encoding: "utf8" },
    );
    if (py.status !== 0) throw Error(py.stderr);
    const record = await read(
      repoPath("fixtures/lsr-1.1/converted/conversion-record.json"),
    );
    const bytes = await fs.readFile(pdf),
      raw = JSON.stringify(doc);
    record.source = {
      ...record.source,
      file: "source.pdf",
      sha256: hash(bytes),
      bytes: bytes.length,
    };
    record.document = {
      ...record.document,
      sha256: hash(raw),
      page_count: 13 * factor,
    };
    await fs.writeFile(join(bundle, "document.json"), raw);
    await save(join(bundle, "conversion-record.json"), record);
    await generate(bundle, root, cli);
    await createReview(root, join(root, "review"));
    continue;
  }
  let snapshot = (await loadHandoff(root)).snapshot;
  // In-process deterministic editor isolates ledger cost from CLI process startup.
  const call = async (cmd, args) => {
    if (cmd === "inspect") return structuredClone(snapshot);
    if (cmd === "check") return { ok: true };
    const ops = await read(args[args.indexOf("--operations") + 1]);
    const op = ops[0],
      p = op.path.split(",").map(Number),
      target = { kind: "cell", path: [p[0]], row: p[1], column: p[2] },
      bytes = JSON.stringify(ops);
    snapshot = projectEdit(
      snapshot,
      target,
      valueAt(snapshot, target),
      op.text,
      hash(bytes),
    );
    await fs.writeFile(join(root, "document.md"), bytes);
    return {
      ok: true,
      command: "apply-batch",
      applied: 1,
      revision: snapshot.revision,
    };
  };
  const service = createCorrections(root, call),
    report = await read(join(root, "review/review-targets.json"));
  const rows = [];
  async function measure(operation, fn) {
    counters = { root, files: {} };
    const start = performance.now();
    let outcome;
    try {
      outcome = await fn();
    } catch (e) {
      outcome = { error: e.message };
      console.error(operation, e.message);
    }
    const ms = performance.now() - start,
      files = counters.files;
    counters = null;
    rows.push({ operation, ms, files, outcome: outcome?.error ?? "ok" });
    return outcome;
  }
  let state = await service.progress();
  const handoff = await loadHandoff(root),
    item = handoff.provenance.items.find(
      (i) =>
        i.cells.length &&
        report.findings.some((f) => f.sourceIds.includes(i.sourceId)) &&
        i.cells.some((c) => c.targets.length && c.sourceCell.text),
    ),
    cell = item.cells.find((c) => c.targets.length && c.sourceCell.text),
    t = cell.targets[0];
  const group = report.groups.find((g) =>
    g.findingIds.some((id) =>
      report.findings
        .find((f) => f.id === id)
        .sourceIds.includes(item.sourceId),
    ),
  );
  for (let i = 0; i < 1; i++)
    await measure("correction-submit", () =>
      service.submit({
        changeId: "bench-" + i,
        generationId: state.generationId,
        revision: snapshot.revision,
        groupId: group.id,
        actor: "human",
        decision: "correct",
        target: {
          kind: "cell",
          path: t.path,
          row: t.selector.row,
          column: t.selector.column,
        },
        before: valueAt(snapshot, {
          kind: "cell",
          path: t.path,
          row: t.selector.row,
          column: t.selector.column,
        }),
        after: i % 2 ? "0.12 s" : "0.120 s",
        reason: "Deterministic performance test",
        evidence: {
          kind: "human-source-region",
          refs: [],
          scope: item.regions.map((r) => ({ pageNo: r.pageNo, bbox: r.bbox })),
        },
      }),
    );
  // Build the remaining deterministic state directly so 130-page setup is not hundreds
  // of timed operations. Every resulting handoff still runs the full production validator.
  const ledgerFile = join(root, "correction-ledger.json");
  let ledger = await read(ledgerFile),
    history = await read(join(root, "correction-history.json")),
    marker = await read(join(root, "complete.json"));
  for (let i = 1; i < factor; i++) {
    const c = structuredClone(history.changes[0]);
    c.changeId = "setup-" + i;
    c.beforeRevision = snapshot.revision;
    c.before = valueAt(snapshot, c.target);
    c.after = i % 2 ? "0.12 s" : "0.120 s";
    c.beforeContent = snapshot.nodes.find(
      (n) =>
        JSON.stringify(n.path) ===
        JSON.stringify([...c.target.path, c.target.row, c.target.column]),
    ).content;
    delete c.afterContent;
    c.inverse = {
      command: "update-table-cell",
      path: [...c.target.path, c.target.row, c.target.column].join(","),
      content: c.beforeContent,
    };
    const bytes = "deterministic-state-" + i;
    c.afterRevision = hash(bytes);
    c.receipt = {
      ok: true,
      command: "apply-batch",
      applied: 1,
      revision: c.afterRevision,
    };
    snapshot = projectEdit(
      snapshot,
      c.target,
      c.before,
      c.after,
      c.afterRevision,
      undefined,
      c.beforeContent,
    );
    await fs.writeFile(join(root, "document.md"), bytes);
    history.changes.push(c);
    ledger.changes.push(c);
    ledger.submissions.push({
      changeId: c.changeId,
      requestHash: hash(c.changeId),
      status: "applied",
      afterRevision: c.afterRevision,
    });
  }
  history.currentSnapshot = snapshot;
  ledger.revision = snapshot.revision;
  await save(join(root, "correction-history.json"), history);
  marker.documentRevision = snapshot.revision;
  for (const f of marker.files)
    if (f.relativePath === "document.md") f.sha256 = snapshot.revision;
    else if (f.relativePath === "correction-history.json")
      f.sha256 = hash(await fs.readFile(join(root, f.relativePath)));
  await save(join(root, "complete.json"), marker);
  await save(ledgerFile, ledger);
  state = await service.progress();
  const note = "Deterministic performance declaration, not actual review",
    time = new Date().toISOString();
  const confirmations = state.losses
    .filter((l) => l.classification === "expression")
    .map((loss) => {
      const g = report.groups.find((g) =>
          g.findingIds.some((id) =>
            report.findings
              .find((f) => f.id === id)
              .sourceIds.includes(loss.sourceId),
          ),
        ),
        f = report.findings.find(
          (f) =>
            g.findingIds.includes(f.id) &&
            f.sourceIds.includes(loss.sourceId) &&
            f.regions.length,
        );
      return {
        lossId: loss.lossId,
        sourceId: loss.sourceId,
        reasonCode: loss.reasonCode,
        groupId: g.id,
        revision: state.revision,
        targetPath: loss.targets[0].path,
        pageNo: f.regions[0].pageNo,
        decision: "meaning-preserved",
        note,
        actor: "human",
        time,
        changeCount: ledger.changes.length,
        meaning: "expression-semantic-preservation",
        comparison: "source-and-current-side-by-side",
      };
    });
  ledger.lossConfirmations = confirmations;
  for (const scope of ledger.scopes) {
    scope.state = "차이없음";
    scope.checkpoint = {
      revision: ledger.revision,
      time,
      note,
      rulesVersion: "1.0.0",
    };
  }
  ledger.humanDecisions = state.humanQueue.map((g) => ({
    groupId: g.id,
    revision: state.revision,
    decision: "confirmed",
    note,
    actor: "human",
    time,
  }));
  await save(ledgerFile, ledger);
  for (const c of [confirmations[0], confirmations.at(-1)].filter(Boolean))
    await measure("loss-decision", () => service.lossDecision(c));
  for (const scope of [ledger.scopes[0], ledger.scopes.at(-1)])
    await measure("checkpoint", () =>
      service.checkpoint({
        scopeId: scope.id,
        revision: ledger.revision,
        state: "차이없음",
        note,
      }),
    );
  for (const d of [
    ledger.humanDecisions[0],
    ledger.humanDecisions.at(-1),
  ].filter(Boolean))
    await measure("human-decision", () => service.humanDecision(d));
  for (let i = 0; i < 3; i++)
    await measure("progress", () => service.progress());
  await measure("finalize", () =>
    service.finalize({ revision: state.revision }),
  );
  for (let i = 0; i < 3; i++) await measure("handoff", () => loadHandoff(root));
  const sizes = {};
  for (const name of [
    "correction-ledger.json",
    "correction-history.json",
    "review/pdf-evidence.json",
    "snapshot.json",
  ])
    sizes[name] = await fs.stat(join(root, name)).then(
      (s) => s.size,
      (e) => 0,
    );
  results.push({
    factor,
    pages: 13 * factor,
    groups: report.groups.length,
    sizes,
    rows,
  });
  await save(resultFile, results);
  if (rows.some((r) => r.outcome !== "ok")) process.exitCode = 1;
  console.log(
    JSON.stringify({
      factor,
      rows: rows.length,
      sizes,
      errors: rows
        .filter((r) => r.outcome !== "ok")
        .map((r) => [r.operation, r.outcome]),
    }),
  );
}
