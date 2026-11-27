import assert from "node:assert/strict";
import test from "node:test";
import { readFolders, rememberFolder, saveFolders } from "../recent-folders.mjs";

test("migrates the browser list once and keeps the original", async t => {
  let legacy = JSON.stringify(["/samples/first"]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => legacy } });
  t.after(() => delete globalThis.localStorage);
  const values = new Map();
  const storage = { async get(key) { return values.get(key); }, async set(key, value) { values.set(key, value); } };
  const folders = await readFolders(storage, assert.fail);
  assert.deepEqual(folders, ["/samples/first"]);
  assert.equal(legacy, JSON.stringify(folders));
  const updated = rememberFolder(rememberFolder(folders, "/samples/second"), "/samples/first");
  await saveFolders(storage, updated);
  legacy = "invalid";
  assert.deepEqual(await readFolders(storage, assert.fail), ["/samples/first", "/samples/second"]);
});

test("reports corrupt or unavailable storage and allows the caller to continue", async () => {
  let failed = false;
  const bad = { async get() { return [null]; } };
  assert.deepEqual(await readFolders(bad, () => { failed = true; }), []);
  assert.ok(failed);
  failed = false;
  const offline = { async get() { throw Error("offline"); }, async set() { throw Error("limit"); } };
  assert.deepEqual(await readFolders(offline, () => { failed = true; }), []);
  assert.ok(failed);
  await assert.rejects(saveFolders(offline, ["/samples"]), /limit/);
});
