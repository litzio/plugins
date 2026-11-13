import { workerData } from "node:worker_threads";
import { runJob } from "./plugin-jobs.js";
await runJob(workerData);
