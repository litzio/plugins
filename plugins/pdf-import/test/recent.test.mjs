import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { listConverted } from "../recent.mjs";
test("recent folders scan PDF output folders, ignore flat files and report original state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pdf-recent-"));
  try {
    const pdf = Buffer.from("public fixture");
    const side = {
      pdf: {
        name: "sample.pdf",
        sha256: createHash("sha256").update(pdf).digest("hex"),
      },
      pages: [{}],
      blocks: [{ warning: { code: "sample" } }],
    };
    await writeFile(path.join(root, "sample.pdf"), pdf);
    const output = path.join(root,"sample");
    await mkdir(output);
    await writeFile(path.join(output, "sample.md"), "saved");
    await writeFile(
      path.join(output, "sample.pdf-source.json"),
      JSON.stringify(side),
    );
    await writeFile(
      path.join(root, "sample.previous-1.pdf-source.json"),
      JSON.stringify(side),
    );
    await writeFile(path.join(root,"old.pdf-source.json"),JSON.stringify(side));
    await writeFile(path.join(root,"old.md"),"old");
    const missing = path.join(root, "gone");
    const found = await listConverted([root, missing]);
    assert.deepEqual(found.folders, [root]);
    assert.equal(found.rows.length, 1);
    assert.equal(found.rows[0].state, "");
    assert.equal(found.rows[0].warnings, 1);
    assert.match(found.rows[0].modified,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    await writeFile(path.join(root, "sample.pdf"), "changed");
    assert.equal((await listConverted([root])).rows[0].state, "원본이 바뀜");
    await rm(path.join(root, "sample.pdf"));
    assert.equal((await listConverted([root])).rows[0].state, "원본 없음");
    await rm(path.join(output, "sample.md"));
    assert.equal((await listConverted([root])).rows.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
