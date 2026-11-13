import { schemas, validateSchema } from "./schema.js";
import { readFile, writeFile, rename, open, unlink } from "node:fs/promises";

import { join, resolve } from "node:path";

import { randomUUID } from "node:crypto";

import { spawnSync } from "node:child_process";

import { loadHandoff, readRelative } from "./provenance.js";

import { readReview } from "./review.js";

import { protectedTokens } from "./tokens.js";

import {
  need,
  digest,
  valueAt,
  projectEdit,
  operation,
} from "./correction-history.js";

import { isDeepStrictEqual as equal } from "node:util";

const json = async (file) => JSON.parse(await readFile(file, "utf8"));

const save = async (file, v) => {
  const tmp = file + "." + randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(v, null, 2) + "\n", { flag: "wx" });
  await rename(tmp, file);
};

export function officialCli(cli, root) {
  return async (command, args) => {
    const r = spawnSync(
      process.execPath,
      [
        resolve(cli),
        command,
        join(root, "document.md"),
        ...args,
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: {
          ...process.env,
          LITZIO_DATA_DIR: join(root, "correction-host-data"),
        },
      },
    );

    need(!r.error && r.status === 0, "cli-failed");
    return JSON.parse(r.stdout);
  };
}

export function createCorrections(root, cli) {
  const file = join(root, "correction-ledger.json"),
    lock = join(root, "correction.lock");

  const call = typeof cli === "function" ? cli : officialCli(cli, root);

  const locked = async (fn) => {
    let handle;

    try {
      handle = await open(lock, "wx");
    } catch (e) {
      if (e.code !== "EEXIST") throw e;

      const owner = await json(lock);
      let dead = false;

      try {
        process.kill(owner.pid, 0);
      } catch (e) {
        dead = e.code === "ESRCH";
      }

      need(dead, "correction-busy");
      await unlink(lock);
      handle = await open(lock, "wx");
    }

    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    await handle.close();

    try {
      return await fn();
    } finally {
      await unlink(lock);
    }
  };

  const ledger = async () => {
    try {
      return await json(file);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }

    const h = await loadHandoff(root),
      { report, evidence } = await readReview(root, join(root, "review"));

    need(!h.history, "correction-ledger-required");
    const state = {
      version: 1,
      generationId: h.provenance.generationId,
      sourceHash: h.provenance.source.pdf.sha256,
      revision: h.snapshot.revision,
      baselineMarker: h.marker,
      changes: [],
      submissions: [],
      pending: null,
      stopped: false,
      completion: null,
      scopes: [
        ...report.groups.map((g) => ({
          id: g.id,
          state: "미검사",
          checkpoint: null,
        })),
        ...evidence.pages.map((p) => ({
          id: "page:" + p.pageNo,
          state: "미검사",
          checkpoint: null,
        })),
      ],
    };

    await save(file, state);
    return state;
  };

  const inspect = async () => {
    const snapshot = await call("inspect", []);

    need(
      snapshot.ok !== false &&
        digest(await readRelative(root, "document.md")) === snapshot.revision,
      "inspection-revision",
    );
    return snapshot;
  };

  const material = async (groupId) => {
    const h = await loadHandoff(root),
      { report, evidence } = await readReview(root, join(root, "review"));

    const group = report.groups.find((g) => g.id === groupId);
    need(group, "group-not-found");

    const snapshot = await inspect();
    need(equal(snapshot, h.snapshot), "stale-document");

    const findings = report.findings.filter((f) =>
      group.findingIds.includes(f.id),
    );

    const ids = new Set(findings.flatMap((f) => f.sourceIds));

    const items = h.provenance.items.filter((i) => ids.has(i.sourceId));

    const doc = JSON.parse(
      await readRelative(root, h.provenance.source.docling.relativePath),
    );

    const fragments = items.map((i) => ({
      sourceId: i.sourceId,
      selfRef: i.selfRef,
      raw: i.selfRef
        .slice(2)
        .split("/")
        .reduce((o, k) => o[k], doc),
      mapping: i,
    }));

    const paths = new Set(
      findings.flatMap((f) => f.targets.map((t) => t.path[0])),
    );

    return {
      generationId: h.provenance.generationId,
      documentRevision: snapshot.revision,
      baselineRevision: report.baselineRevision,
      sourceHash: h.provenance.source.pdf.sha256,
      group,
      findings,
      fragments,
      sourceNeighbors: h.provenance.items
        .filter(
          (i, index, all) =>
            ids.has(all[index - 1]?.sourceId) ||
            ids.has(all[index + 1]?.sourceId),
        )
        .map((i) => ({
          selfRef: i.selfRef,
          raw: i.selfRef
            .slice(2)
            .split("/")
            .reduce((o, k) => o[k], doc),
        })),
      checks: report.checks.filter((c) => ids.has(c.sourceId)),
      current: snapshot.nodes.filter((n) => paths.has(n.path[0])),
      neighbors: snapshot.nodes.filter((n) =>
        [...paths].some((p) => Math.abs(p - n.path[0]) === 1),
      ),
      pdf: evidence.pages.filter((p) => group.pageNos.includes(p.pageNo)),
      history: h.history?.changes ?? [],
    };
  };

  const publish = async (s) => {
    const snapshot = await inspect();

    need(
      snapshot.revision === s.pending.afterRevision &&
        equal(snapshot, s.pending.expected),
      "pending-reconcile",
    );

    need(
      s.pending.receipt?.ok === true &&
        s.pending.receipt.applied === 1 &&
        s.pending.receipt.revision === snapshot.revision,
      "pending-reconcile",
    );

    // Only the document and the new history may change. Original generation evidence is immutable.

    for (const f of s.baselineMarker.files)
      need(
        f.relativePath === "document.md" ||
          digest(await readRelative(root, f.relativePath)) === f.sha256,
        "baseline-changed",
      );

    const change = { ...s.pending };
    delete change.expected;
    delete change.requestHash;

    const changes = [...s.changes, change];

    const history = {
      schemaVersion: "1.1.0",
      generationId: s.generationId,
      baselineRevision: s.baselineMarker.documentRevision,
      changes,
      currentSnapshot: snapshot,
    };

    await save(join(root, "correction-history.json"), history);

    const marker = {
      ...s.baselineMarker,
      schemaVersion: "1.1.0",
      documentRevision: snapshot.revision,
      files: s.baselineMarker.files.map((f) =>
        f.relativePath === "document.md"
          ? { ...f, sha256: snapshot.revision }
          : f,
      ),
    };

    for (const name of [
      "review/pdf-evidence.json",
      "review/review-targets.json",
    ])
      marker.files.push({
        relativePath: name,
        sha256: digest(await readRelative(root, name)),
      });
    marker.files.push({
      relativePath: "correction-history.json",
      sha256: digest(await readFile(join(root, "correction-history.json"))),
    });

    await save(join(root, "complete.json"), marker);

    await loadHandoff(root, { reconciling: true }); // Publication is never success until every consumer-side invariant passes.

    s.changes = changes;
    s.revision = snapshot.revision;
    s.pending = null;
    s.completion = null;

    for (const scope of s.scopes) {
      scope.state = scope.id === change.groupId ? "교정후재검사" : "미검사";
      scope.checkpoint =
        scope.id === change.groupId
          ? {
              revision: s.revision,
              time: new Date().toISOString(),
              changeId: change.changeId,
              rulesVersion: "1.0.0",
            }
          : null;
    }

    Object.assign(
      s.submissions.find((x) => x.changeId === change.changeId),
      {
        status: change.validation.protectedTokens ? "applied" : "uncertain",
        afterRevision: change.afterRevision,
      },
    );

    await save(file, s);
    return change;
  };

  return {
    material,

    progress: () =>
      locked(async () => {
        const s = await ledger();
        const snap = await inspect();
        if (snap.revision !== s.revision) {
          s.completion = null;
          for (const t of s.scopes) {
            t.state = "미검사";
            t.checkpoint = null;
          }
          await save(file, s);
        }
        return { ...s, currentRevision: snap.revision, reviewComplete: false };
      }),

    submit: (input) =>
      locked(async () => {
        validateSchema(input, schemas["correction-submission"]);
        need(
          input &&
            typeof input.changeId === "string" &&
            /^[a-zA-Z0-9-]{1,80}$/.test(input.changeId),
          "invalid-submission",
        );

        const s = await ledger(),
          requestHash = digest(JSON.stringify(input));

        const prior = s.submissions.find((x) => x.changeId === input.changeId);

        if (prior) {
          need(prior.requestHash === requestHash, "duplicate-conflict");
          return prior;
        }

        need(!s.pending, "pending-reconcile");
        need(!s.stopped, "review-stopped");

        const m = await material(input.groupId);

        need(
          input.generationId === s.generationId &&
            m.generationId === s.generationId &&
            m.sourceHash === s.sourceHash &&
            input.revision === m.documentRevision &&
            input.revision === s.revision,
          "stale-submission",
        );

        need(
          ["assistant", "human"].includes(input.actor) &&
            typeof input.reason === "string" &&
            input.reason.trim().length > 0,
          "invalid-actor-reason",
        );

        const row = {
          changeId: input.changeId,
          requestHash,
          status: "uncertain",
        };

        if (input.decision === "uncertain") {
          s.submissions.push({
            ...row,
            decision: input.decision,
            actor: input.actor,
            time: new Date().toISOString(),
            generationId: s.generationId,
            revision: s.revision,
            sourceHash: s.sourceHash,
            groupId: input.groupId,
            reason: input.reason,
            evidence: input.evidence ?? null,
          });
          Object.assign(
            s.scopes.find((t) => t.id === input.groupId),
            {
              state: "판단불가",
              checkpoint: {
                revision: s.revision,
                time: new Date().toISOString(),
                changeId: input.changeId,
                rulesVersion: "1.0.0",
                note: input.reason,
              },
            },
          );
          await save(file, s);
          return row;
        }

        need(
          input.decision === "correct" &&
            typeof input.before === "string" &&
            input.before.trim().length > 0 &&
            typeof input.after === "string" &&
            input.before !== input.after,
          "invalid-edit",
        );

        need(
          input.target &&
            m.fragments.some((f) =>
              [
                ...f.mapping.targets,
                ...f.mapping.cells.flatMap((c) => c.targets),
              ].some(
                (t) =>
                  equal(t.path, input.target.path) &&
                  (input.target.kind === "cell"
                    ? t.selector.kind === "cell" &&
                      t.selector.row === input.target.row &&
                      t.selector.column === input.target.column
                    : t.selector.kind === "block"),
              ),
            ),
          "target-outside-group",
        );

        need(
          Array.isArray(input.evidence?.refs) &&
            input.evidence.refs.length > 0 &&
            Array.isArray(input.evidence.scope) &&
            input.evidence.scope.length > 0,
          "evidence-required",
        );

        const tokens = m.pdf.flatMap((p) => p.tokens);

        need(
          input.evidence.refs.every((id) => tokens.some((t) => t.id === id)),
          "unknown-evidence-ref",
        );

        need(
          input.evidence.scope.every(
            (r) =>
              m.pdf.some((p) => p.pageNo === r.pageNo) &&
              Array.isArray(r.bbox) &&
              r.bbox.length === 4 &&
              r.bbox.every(Number.isFinite),
          ),
          "invalid-inspection-scope",
        );

        const boundChecks = m.fragments.flatMap((f) =>
          input.target.kind === "cell"
            ? f.mapping.cells
                .filter((c) =>
                  c.targets.some(
                    (t) =>
                      equal(t.path, input.target.path) &&
                      t.selector.row === input.target.row &&
                      t.selector.column === input.target.column,
                  ),
                )
                .flatMap((c) =>
                  m.checks.filter(
                    (k) =>
                      k.sourceId === f.sourceId &&
                      k.selectorKey === "cell:" + c.cellIndex,
                  ),
                )
            : f.mapping.targets.some((t) => equal(t.path, input.target.path))
              ? m.checks.filter((k) => k.sourceId === f.sourceId)
              : [],
        );
        const allowed = new Set(boundChecks.flatMap((c) => c.pdfTokenIds));
        need(
          input.evidence.refs.every((id) => allowed.has(id)),
          "evidence-outside-target",
        );
        const selected = tokens.filter((t) => allowed.has(t.id));
        need(
          equal([...new Set(input.evidence.refs)].sort(), [...allowed].sort()),
          "incomplete-evidence",
        );
        need(
          selected.every((t) =>
            input.evidence.scope.some(
              (r) =>
                m.pdf.some(
                  (p) =>
                    p.pageNo === r.pageNo &&
                    p.tokens.some((x) => x.id === t.id),
                ) &&
                r.bbox[0] <= t.bbox[0] &&
                r.bbox[1] <= t.bbox[1] &&
                r.bbox[2] >= t.bbox[2] &&
                r.bbox[3] >= t.bbox[3],
            ),
          ),
          "uninspected-evidence",
        );

        if (input.undoOf) {
          const original = s.changes.find((c) => c.changeId === input.undoOf);

          need(
            original &&
              s.revision === original.afterRevision &&
              equal(input.target, original.target) &&
              input.before === original.after &&
              input.after === original.before,
            "undo-stale",
          );
        }

        const afterTokens = protectedTokens(input.after).map((t) => t.value);

        const protectedMatch = equal(
          afterTokens,
          selected.map((t) => t.value),
        );

        // Non-token text/formula semantic claims remain uncertain. Do not fill empty cells or infer headings.

        need(
          input.undoOf ||
            (!protectedTokens(input.before).length && !afterTokens.length) ||
            protectedMatch,
          "protected-token-mismatch",
        );

        const snapshot = await inspect();
        need(
          snapshot.revision === input.revision &&
            valueAt(snapshot, input.target) === input.before,
          "before-conflict",
        );

        projectEdit(
          snapshot,
          input.target,
          input.before,
          input.after,
          input.revision,
        ); // reject unsupported rich/structural edits before writing

        const now = new Date().toISOString();

        s.pending = {
          changeId: input.changeId,
          groupId: input.groupId,
          actor: input.actor,
          time: now,
          sourceHash: s.sourceHash,
          beforeRevision: input.revision,
          afterRevision: null,
          target: input.target,
          before: input.before,
          after: input.after,
          evidence: input.evidence,
          reason: input.reason,
          receipt: null,
          undoOf: input.undoOf ?? null,
          validation: {
            readback: false,
            protectedTokens: protectedMatch && input.target.kind !== "equation",
          },
          inverse: operation(input.target, input.after, input.before),
        };

        s.submissions.push({ ...row, status: "pending-reconcile" });
        s.completion = null;
        s.scopes.find((t) => t.id === input.groupId).state = "검사중";
        await save(file, s);

        const opfile = join(
          root,
          "correction-operation-" + input.changeId + ".json",
        );

        await writeFile(
          opfile,
          JSON.stringify([operation(input.target, input.before, input.after)]),
          { flag: "wx" },
        );

        try {
          const receipt = await call("apply-batch", [
            "--operations",
            opfile,
            "--if-revision",
            input.revision,
          ]);

          s.pending.receipt = receipt;
          s.pending.afterRevision = receipt.revision;

          s.pending.expected = projectEdit(
            snapshot,
            input.target,
            input.before,
            input.after,
            receipt.revision,
          );

          const actual = await inspect();
          s.pending.validation.readback = equal(actual, s.pending.expected);

          // Repeat independent protected token comparison on actual readback, not the submitted after value.

          s.pending.validation.protectedTokens =
            protectedMatch &&
            equal(
              protectedTokens(valueAt(actual, input.target)).map(
                (t) => t.value,
              ),
              selected.map((t) => t.value),
            ) &&
            input.target.kind !== "equation";

          await save(file, s);

          await publish(s);
        } catch {
          s.scopes.find((t) => t.id === input.groupId).state = "실패";
          await save(file, s);
        }

        return s.submissions.find((x) => x.changeId === input.changeId);
      }),

    reconcile: () =>
      locked(async () => {
        const s = await ledger();
        if (!s.pending) return { status: "idle" };
        try {
          await publish(s);
          return { status: "reconciled" };
        } catch {
          await save(file, s);
          return {
            status: "pending-reconcile",
            observedRevision: (await inspect()).revision,
          };
        }
      }),

    checkpoint: (input) =>
      locked(async () => {
        const s = await ledger(),
          snap = await inspect();
        need(
          !s.pending &&
            snap.revision === s.revision &&
            input.revision === s.revision,
          "stale-checkpoint",
        );

        const t = s.scopes.find((t) => t.id === input.scopeId);
        need(
          t &&
            [
              "미검사",
              "검사중",
              "차이없음",
              "교정후재검사",
              "판단불가",
              "실패",
            ].includes(input.state),
          "invalid-checkpoint",
        );

        need(
          typeof input.note === "string" && input.note.length > 0,
          "inspection-note-required",
        );
        t.state = input.state;
        t.checkpoint = {
          revision: s.revision,
          time: new Date().toISOString(),
          note: input.note,
          rulesVersion: "1.0.0",
        };
        await save(file, s);
        return t;
      }),

    stop: () =>
      locked(async () => {
        const s = await ledger();
        s.stopped = true;
        await save(file, s);
        return { stopped: true };
      }),

    resume: () =>
      locked(async () => {
        const s = await ledger();
        need(!s.pending, "pending-reconcile");
        need((await inspect()).revision === s.revision, "stale-document");
        s.stopped = false;
        await save(file, s);
        return { stopped: false };
      }),

    async undo(input) {
      const s = await json(file),
        c = s.changes.find((c) => c.changeId === input.undoOf);
      need(c, "change-not-found");

      need(
        s.revision === c.afterRevision &&
          (await inspect()).revision === c.afterRevision,
        "undo-stale",
      );

      return this.submit({
        ...input,
        generationId: s.generationId,
        revision: c.afterRevision,
        groupId: c.groupId,
        target: c.target,
        before: c.after,
        after: c.before,
        decision: "correct",
        reason: input.reason ?? "역연산",
        undoOf: c.changeId,
      });
    },
  };
}
