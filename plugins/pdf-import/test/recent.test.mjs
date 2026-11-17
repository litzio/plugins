import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { listConverted } from "../recent.mjs";
test("recent folders scan sidecars, omit previous/deleted documents and report original state", async () => {
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
    await writeFile(path.join(root, "sample.md"), "saved");
    await writeFile(
      path.join(root, "sample.pdf-source.json"),
      JSON.stringify(side),
    );
    await writeFile(
      path.join(root, "sample.previous-1.pdf-source.json"),
      JSON.stringify(side),
    );
    const missing = path.join(root, "gone");
    const found = await listConverted([root, missing]);
    assert.deepEqual(found.folders, [root]);
    assert.equal(found.rows.length, 1);
    assert.equal(found.rows[0].state, "");
    assert.equal(found.rows[0].warnings, 1);
    await writeFile(path.join(root, "sample.pdf"), "changed");
    assert.equal((await listConverted([root])).rows[0].state, "원본이 바뀜");
    await rm(path.join(root, "sample.pdf"));
    assert.equal((await listConverted([root])).rows[0].state, "원본 없음");
    await rm(path.join(root, "sample.md"));
    assert.equal((await listConverted([root])).rows.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
