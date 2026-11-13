import { repoPath } from "./paths.js";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generate } from "../src/generate.js";
import { createReview, readReview } from "../src/review.js";
const cli = process.env.DOCLING_TEST_CLI;
if (!cli)
  throw new Error("Set DOCLING_TEST_CLI to an isolated source-built CLI");
const root = await mkdtemp(join(tmpdir(), "docling-pr3-corpus-"));
console.log("Retained corpus:", root);
const results = {};
for (const [name, bundle, oracle] of [
  [
    "lsr",
    "fixtures/lsr-1.1/converted",
    "fixtures/lsr-1.1/ground_truth/standards.json",
  ],
  [
    "no-bookmarks",
    "fixtures/lsr-1.1/converted/no-bookmarks",
    "fixtures/lsr-1.1/ground_truth/standards-no-bookmarks.json",
  ],
  ["nist", "fixtures/nist-sp1108r4/converted"],
]) {
  const output = join(root, name);
  await generate(
    repoPath(bundle),
    output,
    resolve(cli),
    oracle && repoPath(oracle),
  );
  const report = await createReview(output, join(root, name + "-review"));
  await readReview(output, join(root, name + "-review"));
  results[name] = report.statistics;
  console.log(name, JSON.stringify(report.statistics));
}
await writeFile(join(root, "summary.json"), JSON.stringify(results, null, 2));
