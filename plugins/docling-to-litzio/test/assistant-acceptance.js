// Manual acceptance setup. Uses public Host operations; never calls AI itself.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hash } from "../src/convert.js";
const [rootArg, cliArg, host, evaluationFile] = process.argv.slice(2);
if (!evaluationFile)
  throw new Error(
    "Usage: node test/assistant-acceptance.js WORK CLI HOST EVALUATION_FILE",
  );
const root = resolve(rootArg),
  cli = resolve(cliArg),
  bundle = join(root, "inputs/lsr");
await mkdir(join(root, "inputs"), { recursive: true });
await cp(resolve("fixtures/lsr-1.1"), bundle, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const converted = join(bundle, "converted"),
  docFile = join(converted, "document.json"),
  recordFile = join(converted, "conversion-record.json");
const doc = JSON.parse(await readFile(docFile)),
  record = JSON.parse(await readFile(recordFile));
const injected = [];
for (const [before, after] of [
  ["0.12 s", "999"],
  ["0.22 s", "888"],
]) {
  const table = doc.tables.find((t) =>
    t.data.table_cells.some((c) => c.text === before),
  );
  const cellIndex = table.data.table_cells.findIndex((c) => c.text === before);
  table.data.table_cells[cellIndex].text = after;
  injected.push({
    selfRef: table.self_ref,
    cellIndex,
    pdfValue: before,
    convertedValue: after,
  });
}
const raw = JSON.stringify(doc);
await writeFile(docFile, raw);
record.document.sha256 = hash(raw);
await writeFile(recordFile, JSON.stringify(record));
await mkdir(join(root, "requests"));
const call = async (id, input) => {
  const file = join(root, "requests", randomUUID() + ".json");
  await writeFile(file, JSON.stringify(input));
  const r = JSON.parse(
    execFileSync(
      process.execPath,
      [
        cli,
        "operation",
        "invoke",
        "local.docling-to-litzio." + id,
        "--input",
        file,
        "--host",
        host,
        "--json",
      ],
      { encoding: "utf8" },
    ),
  );
  if (r.receipt?.outcome !== "success")
    throw new Error("public-operation-" + id + "-" + r.receipt?.outcome);
  return r.result;
};
const preflight = await call("preflight", { bundle: "inputs/lsr/converted" }),
  jobId = randomUUID();
await call("start", {
  bundle: "inputs/lsr/converted",
  fingerprint: preflight.fingerprint,
  requestId: jobId,
});
for (let i = 0; i < 90; i++) {
  const job = await call("job", { jobId });
  if (job.state === "ready") break;
  if (!["queued", "running"].includes(job.state))
    throw new Error("generation-" + job.state);
  await new Promise((r) => setTimeout(r, 1000));
}
const output = join(root, "generations", jobId),
  report = JSON.parse(
    await readFile(join(output, "review/review-targets.json")),
  );
const groupOf = (f) => report.groups.find((g) => g.findingIds.includes(f.id));
const errorGroups = injected.map(
  (i) =>
    groupOf(
      report.findings.find(
        (f) =>
          f.kind === "protected-token-difference" &&
          f.selfRefs.includes(i.selfRef) &&
          f.evidence.nativeValues.includes(i.convertedValue),
      ),
    ).id,
);
const normalGroups = report.groups
  .filter(
    (g) => g.kinds.length === 1 && g.kinds[0] === "formula-review-required",
  )
  .slice(0, 2)
  .map((g) => g.id);
const remaining = report.groups
  .filter(
    (g) =>
      !errorGroups.includes(g.id) &&
      !normalGroups.includes(g.id) &&
      g.kinds.some((k) =>
        ["source-cell-unavailable", "formula-suspicion"].includes(k),
      ),
  )
  .slice(0, 2)
  .map((g) => g.id);
const groupIds = [...new Set([...errorGroups, ...normalGroups, ...remaining])];
if (groupIds.length !== 6) throw new Error("six-independent-groups-required");
const pilot = { jobId, groupIds };
await writeFile(join(root, "pilot.json"), JSON.stringify(pilot, null, 2));
await writeFile(
  evaluationFile,
  JSON.stringify(
    {
      jobId,
      groupIds,
      errorGroups,
      normalGroups,
      injected,
      baselineSnapshot: JSON.parse(
        await readFile(join(output, "snapshot.json")),
      ),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(pilot));
