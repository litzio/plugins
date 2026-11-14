import { parentPort, workerData } from "node:worker_threads";
import { readPdf } from "./pdf-reader.js";
try {
  const coverage=workerData?.coverage === true;
  const result=await readPdf(coverage ? workerData.bytes : workerData,{coverage});
  parentPort.postMessage(coverage ? result : {evidence:result});
} catch (error) {
  parentPort.postMessage({ error: error.message });
} finally {
  parentPort.close();
}
