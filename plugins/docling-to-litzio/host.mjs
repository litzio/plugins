import { createJobs, safeError } from "./src/plugin-jobs.js";
export function activate(context) {
  const jobs = createJobs(context.settings);
  const call = async (fn, input) => {
    try {
      return await fn(input);
    } catch (error) {
      throw new Error(safeError(error));
    }
  };
  return {
    operations: {
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
