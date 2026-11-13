import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { readBundle, makePlan, hash } from "./convert.js";
import { verifyNative, scoreOracle } from "./score.js";
export async function generate(
  bundleFolder,
  output,
  cli,
  oracleFile,
  bookmarkEvidenceFile,
) {
  const bundle = await readBundle(bundleFolder),
    plan = makePlan({
      ...bundle,
      bookmarkEvidence: bookmarkEvidenceFile
        ? JSON.parse(await readFile(bookmarkEvidenceFile, "utf8"))
        : undefined,
    }); // Validate before touching output.
  plan.generationId = randomUUID();
  await mkdir(output); // Exclusive directory claim: even an existing empty directory is refused.
  const save = (name, v) =>
    writeFile(join(output, name), JSON.stringify(v, null, 2) + "\n", {
      flag: "wx",
    });
  await save("generation.json", {
    status: "incomplete",
    generatorVersion: plan.generatorVersion,
  });
  await save("plan.json", plan);
  await save("request.json", plan.request);
  const call = (...args) => {
    const r = spawnSync(process.execPath, [resolve(cli), ...args], {
      cwd: output,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, LITZIO_DATA_DIR: join(output, "host-data") },
    });
    if (r.error || r.status !== 0) {
      writeFileSync(
        join(output, "generation.json"),
        JSON.stringify({
          status: "incomplete",
          generationId: plan.generationId,
          failure: { stage: args[0], exitCode: r.status },
        }),
      );
      throw new Error(`CLI ${args[0]} failed; output retained for inspection`);
    }
    return JSON.parse(r.stdout);
  };
  const file = join(output, "document.md"),
    receipt = call(
      "create",
      file,
      "--input",
      join(output, "request.json"),
      "--format",
      "json",
    );
  const check = call("check", file, "--format", "json"),
    snapshot = call("inspect", file, "--format", "json");
  // Never persist the CLI absolute path/source receipt in a published report.
  const safeReceipt = { revision: receipt.revision, inputs: receipt.inputs };
  await save("receipt.json", safeReceipt);
  await save("check.json", check);
  await save("snapshot.json", snapshot);
  const integrity = verifyNative(plan, safeReceipt, snapshot);
  await save("integrity.json", integrity);
  const bindings = new Map(receipt.inputs.map((i) => [i.key, i.targets]));
  const items = plan.items.map((i) => {
    const targets = i.links.flatMap((l) =>
      (bindings.get(l.key) ?? []).map((t) => ({
        ...t,
        selector: l.selector,
        bindingState: "current",
      })),
    );
    return {
      ...i,
      asset: i.asset
        ? {
            ...i.asset,
            relativePath: snapshot.nodes.find(
              (n) =>
                n.type === "figure" &&
                JSON.stringify(n.path) === JSON.stringify(targets[0]?.path),
            )?.imageUrl,
          }
        : undefined,
      targets,
      losses: i.losses.map((l) => ({ ...l, outputTargets: targets })),
      cells: i.cells?.map((c) => ({
        ...c,
        targets: targets.flatMap((t) =>
          c.selectors.map((selector) => ({ ...t, selector })),
        ),
      })),
    };
  });
  await save("correspondence-draft.json", {
    schemaVersion: "draft-pr1",
    generationId: plan.generationId,
    status: plan.provenanceStatus,
    generatorVersion: plan.generatorVersion,
    rulesVersion: plan.rulesVersion,
    source: plan.source,
    document: { relativePath: "document.md", revision: receipt.revision },
    items,
  });
  if (oracleFile)
    await save(
      "score.json",
      scoreOracle(
        JSON.parse(await readFile(oracleFile, "utf8")),
        bundle.doc,
        plan,
        receipt,
        snapshot,
      ),
    );
  const result = {
    status: integrity.mismatches.length
      ? "generation-mismatch"
      : "generated-draft",
    reviewComplete: false,
    generationId: plan.generationId,
    headingReview: plan.headingReview,
    formulaReview: plan.formulaReview,
    blocks: snapshot.nodes.filter(
      (n) => n.path.length === 1 && n.type !== "caption",
    ).length,
    losses: plan.losses.length,
    lossKinds: Object.fromEntries(
      [...new Set(plan.losses.map((l) => l.reasonCode))].map((k) => [
        k,
        plan.losses.filter((l) => l.reasonCode === k).length,
      ]),
    ),
    diagnostics: plan.diagnostics,
    source: plan.source,
    documentRevision: receipt.revision,
    documentSha256: hash(await readFile(file)),
    generationMismatches: integrity.mismatches.length,
  };
  // Own incomplete marker only; generated document is never overwritten.
  await writeFile(
    join(output, "generation.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const [bundle, out, cli, oracle, bookmarkEvidence] = process.argv.slice(2);
  if (!cli)
    throw new Error(
      "Usage: node src/generate.js BUNDLE NEW_OUTPUT BUILT_CLI [ORACLE]",
    );
  console.log(
    JSON.stringify(
      await generate(
        resolve(bundle),
        resolve(out),
        cli,
        oracle,
        bookmarkEvidence,
      ),
      null,
      2,
    ),
  );
}
