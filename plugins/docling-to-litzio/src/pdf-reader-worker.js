import { parentPort, workerData } from "node:worker_threads";
import { readPdf } from "./pdf-reader.js";
try {
  parentPort.postMessage({ evidence: await readPdf(workerData) });
} catch (error) {
  parentPort.postMessage({ error: error.message });
} finally {
  parentPort.close();
}
