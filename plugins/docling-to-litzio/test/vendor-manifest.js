import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hash } from "../src/convert.js";
const folder = new URL("../vendor/pdfjs/", import.meta.url);
const entries = [];
async function scan(url, prefix = "") {
  for (const file of await readdir(url, { withFileTypes: true })) {
    if (
      file.name === "manifest.json" ||
      file.name === "NOTICE.md" ||
      file.name === ".gitattributes"
    )
      continue;
    const path = prefix + file.name,
      child = new URL(file.name + (file.isDirectory() ? "/" : ""), url);
    if (file.isDirectory()) await scan(child, path + "/");
    else entries.push({ path, sha256: hash(await readFile(child)) });
  }
}
await scan(folder);
await writeFile(
  new URL("manifest.json", folder),
  JSON.stringify(
    {
      package: "pdfjs-dist",
      version: "6.5.438",
      npmIntegrity:
        "sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==",
      upstream: {
        "build/pdf.mjs": "legacy/build/pdf.min.mjs",
        "build/pdf.worker.mjs": "legacy/build/pdf.worker.min.mjs",
      },
      embeddedCoreJs: "3.51.0",
      files: entries.sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  ) + "\n",
);
