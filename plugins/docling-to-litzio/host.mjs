import { diagnostic } from "./src/diagnostics.js";
import { createJobs, safeError } from "./src/plugin-jobs.js";
export function activate(context) {
  const jobs = createJobs(context.settings, { cli: context.cli });
  const call = async (fn, input) => {
    try {
      return await fn(input);
    } catch (error) {
      const code = safeError(error);
      const field = code === "schema-invalid" ? /^schema-invalid (\$(?:\.[A-Za-z][A-Za-z0-9]*|\[\d+\])*)/.exec(error.message)?.[1] : null;
      throw Object.assign(new Error(diagnostic(code) + (field ? ` Field: ${field}.` : "")), { code });
    }
  };
  return {
    operations: {
      revision: (input) => call(jobs.revision, input),
      compare: (input) => call(jobs.compare, input),
      "loss-decision": (input) => call(jobs.lossDecision, input),
      "human-decision": (input) => call(jobs.humanDecision, input),
      "review-finalize": (input) => call(jobs.reviewFinalize, input),
      material: (input) => call(jobs.material, input),
      "correction-submit": (input) => call(jobs.correctionSubmit, input),
      "correction-undo": (input) => call(jobs.correctionUndo, input),
      "correction-reconcile": (input) => call(jobs.correctionReconcile, input),
      "review-progress": (input) => call(jobs.reviewProgress, input),
      "review-checkpoint": (input) => call(jobs.reviewCheckpoint, input),
      "review-stop": (input) => call(jobs.reviewStop, input),
      "review-resume": (input) => call(jobs.reviewResume, input),
      health: (input) => call(jobs.health, input),
      preflight: (input) => call(jobs.preflight, input),
      start: (input) => call(jobs.start, input),
      jobs: (input) => call(jobs.jobs, input),
      job: (input) => call(jobs.job, input),
      summary: (input) => call(jobs.summary, input),
      groups: (input) => call(jobs.groups, input),
      group: (input) => call(jobs.group, input),
    },
    status: async () => {
      const health = await jobs.health();
      return { available: health.ok, message: health.message };
    },
    async dispose() {
      await jobs.dispose();
    },
  };
}
