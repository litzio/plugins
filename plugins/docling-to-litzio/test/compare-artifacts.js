import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const [a, b, out] = process.argv.slice(2).map((p) => resolve(p));
const before = JSON.parse(await readFile(join(a, "complete.json"))),
  after = JSON.parse(await readFile(join(b, "complete.json")));
assert.deepEqual(before.files, after.files);
const names = [
  ...before.files.map((f) => f.relativePath),
  "complete.json",
  "correction-ledger.json",
  "review/review-complete.json",
];
const rows = [];
for (const name of names) {
  const bytes = await readFile(join(a, name));
  assert.deepEqual(bytes, await readFile(join(b, name)), name);
  rows.push({
    name,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  out,
  JSON.stringify({ identical: true, files: rows }, null, 2) + "\n",
);
console.log(JSON.stringify({ identicalFiles: rows.length }));
