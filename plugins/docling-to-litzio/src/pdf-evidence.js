import { Worker } from "node:worker_threads";
// Isolate upstream diagnostic stdout from the caller's JSON CLI output.
// No global console mutation, renderer shim or optional native installation.
export function extractPdf(bytes) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./pdf-reader-worker.js", import.meta.url),
      {
        workerData: Uint8Array.from(bytes),
        execArgv: [],
        stdout: true,
        stderr: true,
      },
    );
    let response;
    worker.stdout.on("data", (data) => process.stderr.write(data));
    worker.stderr.on("data", (data) => process.stderr.write(data));
    worker.on("message", (value) => {
      response = value;
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0 || !response)
        reject(new Error("PDF reader worker failed"));
      else if (response.error) reject(new Error(response.error));
      else resolve(response.evidence);
    });
  });
}
