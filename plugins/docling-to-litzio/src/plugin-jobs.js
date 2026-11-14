import { diagnostic } from "./diagnostics.js";
import { snapshotLookup } from "./lookup.js";
import { createCorrections } from "./corrections.js";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  realpath,
  readdir,
  stat,
} from "node:fs/promises";
import { resolve, join, relative, isAbsolute, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { readBundle, makePlan, hash } from "./convert.js";
import { loadHandoff } from "./provenance.js";
import { readReview } from "./review.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const need = (value, code) => {
  if (!value) throw Object.assign(new Error(diagnostic(code)), { code });
};
export function safeError(error) {
  if (error?.code === "ENOENT") return "file-not-found";
  if (["EACCES", "EPERM"].includes(error?.code)) return "access-denied";
  if (error?.code === "EEXIST") return "already-exists";
  if (error instanceof SyntaxError) return "invalid-json";
  const message = String(error?.message ?? error);
  const match = /^(?:[a-z][a-z0-9-]+|CLI (?:create|check|inspect) failed)/.exec(
    message,
  );
  return match?.[0] ?? "generation-failed";
}
export async function confined(root, path) {
  const base = await realpath(root),
    target = await realpath(resolve(base, path)),
    rel = relative(base, target);
  need(
    !isAbsolute(rel) &&
      rel !== ".." &&
      !rel.startsWith("..\\") &&
      !rel.startsWith("../"),
    "outside-workspace",
  );
  return target;
}
async function ownedDirectory(root, path) {
  let current = await realpath(root);
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    current = await confined(root, current);
  }
  return current;
}
export async function settingsPaths(settings, suppliedCli) {
  need(
    typeof settings.workspaceDirectory === "string" &&
      isAbsolute(settings.workspaceDirectory),
    "workspace-setting-required",
  );
  need(
    suppliedCli ||
      (typeof settings.cliEntry === "string" && isAbsolute(settings.cliEntry)),
    "cli-setting-required",
  );
  const paths = {
    root: await realpath(settings.workspaceDirectory),
    cli: suppliedCli ?? (await realpath(settings.cliEntry)),
  };
  need((await stat(paths.root)).isDirectory(), "workspace-directory-required");
  if (!suppliedCli) need((await stat(paths.cli)).isFile(), "cli-file-required");
  return paths;
}
export async function preflight(root, bundle) {
  need(typeof bundle === "string" && bundle.length > 0, "bundle-required");
  const folder = await confined(root, bundle);
  await confined(root, join(folder, "document.json"));
  const recordPath = await confined(
    root,
    join(folder, "conversion-record.json"),
  );
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  need(typeof record.source?.file === "string", "source-file-required");
  const pdf = await confined(root, resolve(folder, record.source.file));
  const input = await readBundle(folder),
    plan = makePlan(input);
  const fingerprint = hash(JSON.stringify(input.source));
  return {
    folder,
    public: {
      bundle:
        relative(await realpath(root), folder)
          .split("\\")
          .join("/") || ".",
      fingerprint,
      sourceName: basename(pdf),
      pages: record.document.page_count,
      schemaVersion: input.doc.version,
      pictures: input.doc.pictures.length,
      diagnostics: [
        ...plan.diagnostics,
        ...plan.losses
          .filter((l) => l.reasonCode === "picture-image-missing")
          .map((l) => ({ code: l.reasonCode, selfRef: l.selfRef })),
      ],
      supported: true,
    },
  };
}
export async function writeJob(file, value, exclusive = false) {
  const raw = JSON.stringify(value, null, 2) + "\n";
  if (exclusive) return writeFile(file, raw, { flag: "wx" });
  const temporary = file + "." + randomUUID() + ".tmp";
  await writeFile(temporary, raw, { flag: "wx" });
  await rename(temporary, file);
}
export async function runJob({ root, cli, stateFile, state }) {
  const update = async (patch) => {
    Object.assign(state, patch, { updatedAt: new Date().toISOString() });
    await writeJob(stateFile, state);
  };
  try {
    const input = await preflight(root, state.bundle);
    need(input.public.fingerprint === state.fingerprint, "input-changed");
    await update({
      state: "running",
      phase: "generation",
      message: "문서를 만드는 중입니다",
    });
    const { generate } = await import("./generate.js");
    await generate(input.folder, join(root, state.output), cli);
    await update({
      phase: "detection",
      message: "검수 대상을 만드는 중입니다",
    });
    const { createReview } = await import("./review.js");
    await createReview(
      join(root, state.output),
      join(root, state.output, "review"),
    );
    await loadHandoff(join(root, state.output));
    await readReview(
      join(root, state.output),
      join(root, state.output, "review"),
    );
    await update({
      state: "ready",
      phase: "ready",
      message: "생성·검사 완료 — 검수 전",
    });
  } catch (error) {
    await update({
      state: "failed",
      phase: "failed",
      errorCode: safeError(error),
      message: "생성에 실패했습니다. 부분 결과를 보존했습니다",
    });
  }
}
const publicJob = (s, owner, active) => {
  const { ownerSession, ...job } = s;
  if (
    ["queued", "running"].includes(job.state) &&
    ownerSession !== owner &&
    !active.has(job.jobId)
  )
    return {
      ...job,
      state: "interrupted",
      phase: "interrupted",
      message: "이전 실행이 중단됐습니다. 부분 결과를 완성품으로 읽지 않습니다",
    };
  return job;
};
export function createJobs(
  settings,
  { launch, claim = writeJob, cli: suppliedCli } = {},
) {
  const owner = randomUUID(),
    active = new Map();
  let closing = false;
  const paths = () => settingsPaths(settings, suppliedCli);
  const store = async () => {
    const p = await paths();
    await ownedDirectory(p.root, ".docling-to-litzio/jobs");
    return p;
  };
  const stateFile = (root, id) => {
    need(uuid.test(id), "invalid-job-id");
    return join(root, ".docling-to-litzio", "jobs", id + ".json");
  };
  const read = async (id) => {
    const { root } = await paths();
    const file = stateFile(root, id);
    await confined(root, file);
    const s = JSON.parse(await readFile(file, "utf8"));
    need(
      s.jobId === id && s.output === `generations/${id}`,
      "invalid-job-state",
    );
    return s;
  };
  const current = async (id) => publicJob(await read(id), owner, active);
  const matchingRequest = async ({ requestId, bundle, fingerprint }) => {
    const existing = await read(requestId);
    need(
      existing.bundle === bundle && existing.fingerprint === fingerprint,
      "request-id-conflict",
    );
    return publicJob(existing, owner, active);
  };
  const ready = async (id) => {
    const s = await current(id);
    need(s.state === "ready", "job-not-ready");
    const { root } = await paths();
    const output = await confined(root, s.output);
    const { handoff, report } = await readReview(
      output,
      join(output, "review"),
    );
    return { s, output, handoff, report };
  };
  const correction = async (method, { jobId, ...input }) => {
    const s = await current(jobId);
    need(s.state === "ready", "job-not-ready");
    const { root, cli } = await paths();
    const output = await confined(root, s.output);
    const service = createCorrections(output, cli);
    return service[method](method === "material" ? input.groupId : input);
  };
  return {
    async revision({ jobId }) {
      const s = await current(jobId),
        { root } = await paths();
      need(s.state === "ready", "job-not-ready");
      return {
        revision: hash(
          await readFile(await confined(root, join(s.output, "document.md"))),
        ),
      };
    },
    async compare({ jobId, groupId, changeId }) {
      const s = await current(jobId),
        { root, cli } = await paths();
      need(s.state === "ready", "job-not-ready");
      const output = await confined(root, s.output),
        service = createCorrections(output, cli);
      const context = await readReview(output, join(output, "review"));
      const h = context.handoff;
      const progress = changeId ? h.ledger : { changes: [] };
      const change =
        changeId && progress?.changes.find((c) => c.changeId === changeId);
      need(!changeId || change, "change-not-found");
      const m = await service.material(change?.groupId ?? groupId, context);
      const lookup = snapshotLookup(h.snapshot);
      const ids = new Set(m.findings.flatMap((f) => f.sourceIds));
      let targets = h.provenance.items
        .filter((i) => ids.has(i.sourceId))
        .flatMap((i) =>
          [...i.targets, ...i.cells.flatMap((c) => c.targets)]
            .filter((t) => t.role !== "explanation")
            .map((t) => ({
              ...t,
              sourceId: i.sourceId,
              regions: m.findings
                .filter((f) => f.sourceIds.includes(i.sourceId))
                .flatMap((f) => f.regions),
            })),
        );
      for (const f of m.findings)
        for (const t of f.targets) {
          if (t.selector.kind !== "cell") continue;
          const path = [...t.path, t.selector.row, t.selector.column];
          if (!lookup.node(path)) continue;
          if (
            !targets.some(
              (x) =>
                JSON.stringify(x.path) === JSON.stringify(t.path) &&
                x.selector.kind === "cell" &&
                x.selector.row === t.selector.row &&
                x.selector.column === t.selector.column,
            )
          )
            targets.push({
              ...t,
              sourceId: f.sourceIds[0],
              bindingState: "current",
              regions: f.regions,
            });
        }
      if (change) {
        targets = targets.filter(
          (t) =>
            JSON.stringify(t.path) === JSON.stringify(change.target.path) &&
            (change.target.kind !== "cell" ||
              (t.selector.kind === "cell" &&
                t.selector.row === change.target.row &&
                t.selector.column === change.target.column)),
        );
      }
      return {
        selection: changeId ? { changeId } : { groupId },
        pageCount: h.provenance.pages.length,
        material: m,
        document: join(output, "document.md"),
        revision: m.documentRevision,
        targets: targets
          .filter((t) => t.bindingState === "current")
          .map((t) => ({
            sourceId: t.sourceId,
            regions: change?.evidence.scope ?? t.regions,
            revision: m.documentRevision,
            path:
              t.selector.kind === "cell"
                ? [...t.path, t.selector.row, t.selector.column]
                : t.path,
          })),
        regions: change?.evidence.scope ?? m.findings.flatMap((f) => f.regions),
        pdf: (
          await readFile(
            await confined(
              root,
              join(output, h.provenance.source.pdf.relativePath),
            ),
          )
        ).toString("base64"),
        worker: await readFile(
          new URL("../vendor/pdfjs/build/pdf.worker.mjs", import.meta.url),
          "utf8",
        ),
      };
    },
    lossDecision: (input) => correction("lossDecision", input),
    humanDecision: (input) => correction("humanDecision", input),
    reviewFinalize: (input) => correction("finalize", input),
    material: (input) => correction("material", input),
    correctionSubmit: (input) => correction("submit", input),
    correctionUndo: (input) => correction("undo", input),
    correctionReconcile: (input) => correction("reconcile", input),
    reviewProgress: (input) => correction("progress", input),
    reviewCheckpoint: (input) => correction("checkpoint", input),
    reviewStop: (input) => correction("stop", input),
    reviewResume: (input) => correction("resume", input),
    async health() {
      try {
        await paths();
        return { ok: true, message: "작업 폴더와 공식 CLI가 설정됐습니다" };
      } catch {
        return {
          ok: false,
          message: "작업 폴더 설정을 확인하세요",
        };
      }
    },
    async preflight({ bundle }) {
      const { root } = await paths();
      return (await preflight(root, bundle)).public;
    },
    async start({ bundle, fingerprint, requestId }) {
      need(!closing, "plugin-closing");
      const { root, cli } = await store(),
        file = stateFile(root, requestId);
      try {
        return await matchingRequest({ requestId, bundle, fingerprint });
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const input = await preflight(root, bundle);
      need(input.public.fingerprint === fingerprint, "input-changed");
      await ownedDirectory(root, "generations");
      const now = new Date().toISOString(),
        state = {
          jobId: requestId,
          bundle,
          fingerprint,
          output: `generations/${requestId}`,
          ownerSession: owner,
          state: "queued",
          phase: "queued",
          message: "접수했습니다",
          createdAt: now,
          updatedAt: now,
        };
      try {
        await claim(file, state, true);
      } catch (e) {
        if (e.code === "EEXIST")
          return matchingRequest({ requestId, bundle, fingerprint });
        throw e;
      }
      const data = { root, cli, stateFile: file, state };
      const completion = launch
        ? launch(data)
        : new Promise((done) => {
            const worker = new Worker(
              new URL("./plugin-job-worker.js", import.meta.url),
              { workerData: data, execArgv: [], stdout: true, stderr: true },
            );
            worker.stdout.on("data", () => {});
            worker.stderr.on("data", () => {});
            let failure;
            worker.once("error", (e) => {
              failure = e;
            });
            worker.once("exit", async (code) => {
              if (code !== 0 || failure) {
                try {
                  const current = JSON.parse(await readFile(file, "utf8"));
                  await writeJob(file, {
                    ...current,
                    state: "failed",
                    phase: "worker",
                    errorCode: safeError(failure ?? new Error("worker-exit")),
                    message: "처리 작업이 중단됐습니다",
                    updatedAt: new Date().toISOString(),
                  });
                } catch {}
              }
              done();
            });
          });
      active.set(requestId, completion);
      completion.then(
        () => active.delete(requestId),
        () => active.delete(requestId),
      );
      return publicJob(state, owner, active);
    },
    job: ({ jobId }) => current(jobId),
    async jobs() {
      const { root } = await paths();
      let names;
      try {
        await confined(root, ".docling-to-litzio/jobs");
        names = await readdir(join(root, ".docling-to-litzio", "jobs"));
      } catch (e) {
        if (e.code === "ENOENT") return { jobs: [] };
        throw e;
      }
      const files = names.filter(
        (n) => uuid.test(n.slice(0, -5)) && n.endsWith(".json"),
      );
      return {
        jobs: await Promise.all(files.map((n) => current(n.slice(0, -5)))),
      };
    },
    async summary({ jobId }) {
      const { s, output, handoff: h, report: r } = await ready(jobId);
      const losses = h.provenance.items.flatMap((i) => i.losses);
      const count = (key) =>
        Object.fromEntries(
          [...new Set(losses.map((l) => l[key]))].map((k) => [
            k,
            losses.filter((l) => l[key] === k).length,
          ]),
        );
      return {
        job: s,
        generationId: h.provenance.generationId,
        revision: h.provenance.document.revision,
        document: await confined(output, "document.md"),
        blocks: h.coverage.blocks,
        assets: h.coverage.assets,
        sourceElements: h.coverage.sourceItems,
        losses: losses.length,
        lossKinds: count("reasonCode"),
        lossCategories: count("category"),
        statistics: r.statistics,
        check: true,
        reviewComplete: h.reviewComplete,
      };
    },
    async groups({ jobId }) {
      const { report } = await ready(jobId);
      return { groups: report.groups, series: report.series };
    },
    async group({ jobId, groupId }) {
      const { report } = await ready(jobId),
        group = report.groups.find((g) => g.id === groupId);
      need(group, "group-not-found");
      return {
        group,
        findings: report.findings.filter((f) =>
          group.findingIds.includes(f.id),
        ),
      };
    },
    async dispose() {
      closing = true;
      await Promise.allSettled([...active.values()]);
    },
  };
}
