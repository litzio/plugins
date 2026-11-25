import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { listConverted } from "../recent.mjs";
import { recentDate } from "../../shared/time.mjs";

test("recent dates use Korean midnight and keep the year on older dates", () => {
  const now = Date.parse("2026-12-31T15:05:00Z");
  assert.equal(recentDate("2027-01-01 00:04:52", now), "오늘 00:04");
  assert.equal(recentDate("2026-12-31 14:20:00", now), "어제");
  assert.equal(recentDate("2026-11-17 14:20:00", now), "2026년 11월 17일");
  assert.equal(recentDate("2026-11-17 14:20:00", Date.parse("2026-11-23T00:00:00Z")), "11월 17일");
});
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
    const sidePath = path.join(output, "sample.pdf-source.json");
    await writeFile(sidePath, JSON.stringify(side));
    const legacyTime = new Date("2026-11-23T01:23:45Z");
    await utimes(sidePath, legacyTime, legacyTime);
    await writeFile(
      path.join(root, "sample.previous-1.pdf-source.json"),
      JSON.stringify(side),
    );
    await writeFile(path.join(root,"old.pdf-source.json"),JSON.stringify(side));
    await writeFile(path.join(root,"old.md"),"old");
    const missing = path.join(root, "gone");
    const found = await listConverted([root, missing],async()=>({status:"draft"}));
    assert.deepEqual(found.folders, [root]);
    assert.equal(found.rows.length, 1);
    assert.equal(found.rows[0].state, "");
    assert.equal(found.rows[0].reviewStatus, "초안");
    assert.equal(found.rows[0].warnings, 1);
    assert.equal(found.rows[0].convertedAt, "2026-11-23 10:23:45");
    const convertedAt = "2026-11-23T00:00:00.123Z";
    await writeFile(sidePath, JSON.stringify({ ...side, convertedAt }));
    const list = async () => (await listConverted([root], async () => ({status:"draft"}))).rows[0];
    assert.equal((await list()).convertedAt, "2026-11-23 09:00:00");
    await writeFile(sidePath, JSON.stringify({ ...side, convertedAt, verificationPending: false }));
    await utimes(sidePath, legacyTime, legacyTime);
    assert.equal((await list()).convertedAt, "2026-11-23 09:00:00");
    await writeFile(sidePath, JSON.stringify({ ...side, convertedAt: "2026-11-24T02:00:00.456Z" }));
    assert.equal((await list()).convertedAt, "2026-11-24 11:00:00");
    await writeFile(path.join(root, "sample.pdf"), "changed");
    assert.equal((await listConverted([root],async()=>({status:"approved"}))).rows[0].state, "원본이 바뀜");
    await rm(path.join(root, "sample.pdf"));
    assert.equal((await listConverted([root],async()=>({status:"approved"}))).rows[0].state, "원본 없음");
    await rm(path.join(output, "sample.md"));
    assert.equal((await listConverted([root],async()=>({status:"approved"}))).rows.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
