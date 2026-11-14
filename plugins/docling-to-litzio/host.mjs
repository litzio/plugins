import { PluginPublicError } from "@litzio/plugin-sdk";
import { diagnostic } from "./src/diagnostics.js";
import { createJobs, safeError } from "./src/plugin-jobs.js";
export function activate(context) {
  const jobs = createJobs(context.settings, { cli: context.cli });
  const call = async (fn, input) => {
    try {
      return await fn(input);
    } catch (error) {
      const known = /^[a-z][a-z0-9-]{0,63}$/.test(error?.code ?? "") ||
        ["ENOENT","EACCES","EPERM","EEXIST"].includes(error?.code) ||
        /^(?:handoff-|review-|schema-invalid)/.test(error?.message ?? "");
      if (!known) throw error;
      const code = safeError(error);
      const field = code === "schema-invalid" ? /^schema-invalid (\$(?:\.[A-Za-z][A-Za-z0-9]*|\[\d+\])*)/.exec(error.message)?.[1] : null;
      const message = diagnostic(code).replace(new RegExp(`^${code}: `), "");
      throw new PluginPublicError(code, message + (field ? ` Field: ${field}.` : ""));
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
