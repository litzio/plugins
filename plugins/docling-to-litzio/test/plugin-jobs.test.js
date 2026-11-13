import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  symlink,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createJobs, preflight, writeJob, runJob } from "../src/plugin-jobs.js";
import { hash } from "../src/convert.js";
const fixture = fileURLToPath(
  new URL("../../../fixtures/lsr-1.1/converted/", import.meta.url),
);
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "docling-installable-unit-"));
  const input = join(root, "inputs", "lsr");
  await mkdir(input, { recursive: true });
  const record = JSON.parse(
    await readFile(join(fixture, "conversion-record.json")),
  );
  for (const file of [
    "document.json",
    "conversion-record.json",
    record.source.file,
  ]) {
    const dest = resolve(input, file);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(resolve(fixture, file), dest);
  }
  return {
    root,
    input,
    settings: { workspaceDirectory: root, cliEntry: import.meta.filename },
  };
}
test("preflight checks a fixed input; rejects escape and unsupported schema without creating output", async () => {
  const { root, input } = await setup();
  const p = await preflight(root, "inputs/lsr");
  assert.equal(p.public.pages, 13);
  assert.equal(p.public.schemaVersion, "1.10.0");
  assert.equal(p.public.pictures, 2);
  assert(!JSON.stringify(p.public).includes(root));
  await assert.rejects(preflight(root, "../"), /outside-workspace/);
  const record = JSON.parse(
    await readFile(join(input, "conversion-record.json")),
  );
  record.source.file = "../../../outside.pdf";
  await writeFile(
    join(input, "conversion-record.json"),
    JSON.stringify(record),
  );
  await assert.rejects(preflight(root, "inputs/lsr"));
  assert.deepEqual(await readdir(root), ["inputs"]);
});
test("accept/status is asynchronous, duplicate request is idempotent, interruption is explicit", async () => {
  const { root, settings } = await setup();
  let release,
    data,
    calls = 0;
  const jobs = createJobs(settings, {
    launch: (d) => {
      data = d;
      calls++;
      return new Promise((done) => (release = done));
    },
  });
  const p = await jobs.preflight({ bundle: "inputs/lsr" }),
    request = {
      bundle: "inputs/lsr",
      fingerprint: p.fingerprint,
      requestId: randomUUID(),
    };
  const accepted = await jobs.start(request);
  assert.equal(accepted.state, "queued");
  assert.equal(calls, 1);
  assert.equal((await jobs.start(request)).jobId, accepted.jobId);
  assert.equal(calls, 1);
  await assert.rejects(
    jobs.start({ ...request, fingerprint: "0".repeat(64) }),
    /request-id-conflict/,
  );
  await assert.rejects(
    jobs.summary({ jobId: accepted.jobId }),
    /job-not-ready/,
  );
  const restarted = createJobs(settings);
  assert.equal(
    (await restarted.job({ jobId: accepted.jobId })).state,
    "interrupted",
  );
  await writeJob(data.stateFile, {
    ...data.state,
    state: "failed",
    phase: "failed",
    errorCode: "test-failure",
  });
  release();
  await jobs.dispose();
  assert.equal((await restarted.jobs()).jobs[0].state, "failed");
  assert(!JSON.stringify(await restarted.jobs()).includes(root));
});
test("changed input requires a fresh confirmation and job IDs cannot address arbitrary files", async () => {
  const { input, settings } = await setup(),
    jobs = createJobs(settings, {
      launch: async () => {
        throw new Error("must-not-start");
      },
    });
  const p = await jobs.preflight({ bundle: "inputs/lsr" });
  await assert.rejects(
    jobs.start({
      bundle: "inputs/lsr",
      fingerprint: "0".repeat(64),
      requestId: randomUUID(),
    }),
    /input-changed/,
  );
  await assert.rejects(jobs.job({ jobId: "../document" }), /invalid-job-id/);
  const json = JSON.parse(await readFile(join(input, "document.json")));
  json.version = "0.9.0";
  const raw = JSON.stringify(json);
  await writeFile(join(input, "document.json"), raw);
  const record = JSON.parse(
    await readFile(join(input, "conversion-record.json")),
  );
  record.document.sha256 = hash(raw);
  record.document.version = "0.9.0";
  await writeFile(
    join(input, "conversion-record.json"),
    JSON.stringify(record),
  );
  await assert.rejects(
    jobs.start({
      bundle: "inputs/lsr",
      fingerprint: p.fingerprint,
      requestId: randomUUID(),
    }),
    /unsupported-schema/,
  );
});
test("existing symlink store is refused before creating anything outside workspace", async (t) => {
  const { root, settings } = await setup(),
    outside = await mkdtemp(join(tmpdir(), "docling-installable-outside-"));
  try {
    await symlink(
      outside,
      join(root, ".docling-to-litzio"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (e) {
    if (["EPERM", "EACCES"].includes(e.code)) {
      t.skip("symlink creation unavailable");
      return;
    }
    throw e;
  }
  const jobs = createJobs(settings),
    p = await jobs.preflight({ bundle: "inputs/lsr" });
  await assert.rejects(
    jobs.start({
      bundle: "inputs/lsr",
      fingerprint: p.fingerprint,
      requestId: randomUUID(),
    }),
    /outside-workspace/,
  );
  assert.deepEqual(await readdir(outside), []);
});
test("failed generation persists failure and incomplete output cannot be summarized", async () => {
  const { root, settings } = await setup();
  const jobs = createJobs(settings, {
    launch: (data) => runJob({ ...data, cli: join(root, "missing-cli.mjs") }),
  });
  const p = await jobs.preflight({ bundle: "inputs/lsr" });
  const accepted = await jobs.start({
    bundle: "inputs/lsr",
    fingerprint: p.fingerprint,
    requestId: randomUUID(),
  });
  await jobs.dispose();
  assert.equal((await jobs.job({ jobId: accepted.jobId })).state, "failed");
  await assert.rejects(
    jobs.summary({ jobId: accepted.jobId }),
    /job-not-ready/,
  );
  await assert.rejects(readFile(join(root, accepted.output, "complete.json")), {
    code: "ENOENT",
  });
  assert.equal(
    JSON.parse(await readFile(join(root, accepted.output, "generation.json")))
      .status,
    "incomplete",
  );
});
test(
  "real worker uses generation/review code, preserves previous outputs and rejects later edits",
  { skip: !process.env.DOCLING_TEST_CLI },
  async () => {
    const { root, settings } = await setup();
    settings.cliEntry = process.env.DOCLING_TEST_CLI;
    const jobs = createJobs(settings),
      p = await jobs.preflight({ bundle: "inputs/lsr" }),
      request = {
        bundle: "inputs/lsr",
        fingerprint: p.fingerprint,
        requestId: randomUUID(),
      };
    const accepted = await jobs.start(request);
    await jobs.dispose();
    assert.equal((await jobs.job({ jobId: accepted.jobId })).state, "ready");
    const summary = await jobs.summary({ jobId: accepted.jobId });
    assert.equal(summary.blocks, 113);
    assert.equal(summary.losses, 31);
    assert.equal(summary.statistics.groups, 15);
    assert.equal(summary.reviewComplete, false);
    const groups = await jobs.groups({ jobId: accepted.jobId });
    assert.equal(groups.groups.length, 15);
    assert(
      (
        await jobs.group({
          jobId: accepted.jobId,
          groupId: groups.groups[0].id,
        })
      ).findings.length,
    );
    const again = createJobs(settings);
    assert.equal((await again.start(request)).jobId, accepted.jobId);
    const file = join(root, summary.document),
      original = await readFile(file);
    await writeFile(
      file,
      Buffer.concat([original, Buffer.from("\nHuman correction\n")]),
    );
    await assert.rejects(
      again.summary({ jobId: accepted.jobId }),
      /file-digest/,
    );
    await again.start(request);
    assert.equal((await readFile(file)).length, original.length + 18);
    console.log("Retained plugin worker test:", root);
  },
);
