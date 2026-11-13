// Test-process-only instrumentation. Timed samples run with metrics disabled.
import fs from "node:fs/promises";
import crypto from "node:crypto";
import child from "node:child_process";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Session } from "node:inspector/promises";
let active = null;
const originalRead = fs.readFile.bind(fs),
  originalWrite = fs.writeFile.bind(fs);
for (const [key, original] of [
  ["readFile", originalRead],
  ["writeFile", originalWrite],
]) {
  fs[key] = async (...args) => {
    const start = performance.now(),
      result = await original(...args);
    if (active) {
      const row = (active.files[basename(String(args[0]))] ??= {
        reads: 0,
        readBytes: 0,
        writes: 0,
        writeBytes: 0,
        ms: 0,
      });
      row[key === "readFile" ? "reads" : "writes"]++;
      row[key === "readFile" ? "readBytes" : "writeBytes"] += Buffer.byteLength(
        key === "readFile" ? result : args[1],
      );
      row.ms += performance.now() - start;
    }
    return result;
  };
}
const originalHash = crypto.createHash.bind(crypto);
crypto.createHash = (...args) => {
  if (active) active.hashes++;
  const h = originalHash(...args),
    update = h.update.bind(h);
  h.update = (v, ...rest) => {
    if (active)
      active.hashBytes +=
        typeof v === "string" ? Buffer.byteLength(v, rest[0]) : v.byteLength;
    return update(v, ...rest);
  };
  return h;
};
const originalSpawn = child.spawnSync.bind(child);
child.spawnSync = (...args) => {
  const start = performance.now(),
    result = originalSpawn(...args);
  if (active)
    active.cli.push({
      command: args[1]?.[1] ?? "unknown",
      ms: performance.now() - start,
      status: result.status,
    });
  return result;
};
syncBuiltinESMExports();
globalThis.__doclingSchemaMetric = (value, key, ms) => {
  if (!active) return;
  const row = (active.schema[key] ??= { calls: 0, bytes: 0, ms: 0 });
  row.calls++;
  row.bytes += Buffer.byteLength(JSON.stringify(value));
  row.ms += ms;
};
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (url.endsWith("/src/schema.js")) {
      result.source =
        String(result.source).replace(
          "export function validateSchema(",
          "function validateSchema(",
        ) +
        `
export function measuredValidateSchema(...args) {
  const start = performance.now();
  try { return validateSchema(...args); }
  finally { globalThis.__doclingSchemaMetric(args[0], Object.entries(schemas).find(([,s]) => s === args[1])?.[0] ?? "fragment", performance.now() - start); }
}
export { measuredValidateSchema as validateSchema };
`;
    }
    return result;
  },
});
export async function profile(fn) {
  active = { files: {}, hashes: 0, hashBytes: 0, schema: {}, cli: [] };
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 1000 });
  await session.post("Profiler.start");
  let value;
  try {
    value = await fn();
  } finally {
    const { profile } = await session.post("Profiler.stop");
    session.disconnect();
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const weights = new Map();
    for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
      const frame = nodes.get(profile.samples[i]).callFrame;
      const label =
        basename(frame.url || "runtime") +
        ":" +
        (frame.lineNumber + 1) +
        ":" +
        (frame.functionName || "anonymous");
      weights.set(
        label,
        (weights.get(label) ?? 0) + (profile.timeDeltas[i] ?? 0),
      );
    }
    const total = [...weights.values()].reduce((a, b) => a + b, 0);
    active.top = [...weights]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, us]) => ({
        label,
        ms: us / 1000,
        percent: (100 * us) / total,
      }));
  }
  const metrics = active;
  active = null;
  return { value, metrics };
}
