import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { persistLast, persistViews, preferenceKey, readPreferences } from "../preferences.mjs";

const query = { filters: { project: ["AT"], assignee: ["sam.rivera"] }, sort: { field: "updated", direction: "DESC" }, rawJql: "" };
const demo = preferenceKey(false);
const liveKey = (server, account) => preferenceKey(true, createHash("sha256").update(JSON.stringify([server, account])).digest("hex"));
const alice = liveKey("server-a", "alice");
const bob = liveKey("server-a", "bob");
const other = liveKey("server-b", "alice");

function fakeStorage() {
  const values = new Map();
  return {
    async get(key) { return structuredClone(values.get(key)); },
    async set(key, value) { values.set(key, structuredClone(value)); },
  };
}

test("last applied filters and saved views restore independently per server, account and demo", async () => {
  const storage = fakeStorage();
  await persistLast(storage, alice, { ...query, screen: "Board", ignoredData: "not stored" });
  await persistViews(storage, alice, [{ ...query, title: "My view" }]);
  await persistLast(storage, demo, { ...query, screen: "Overview" });
  const { last, views } = await readPreferences(storage, alice);
  assert.deepEqual(last, { ...query, screen: "Board" });
  assert.deepEqual(views, [{ ...query, title: "My view" }]);
  assert.equal((await readPreferences(storage, demo)).last.screen, "Overview");
  for (const key of [bob, other, preferenceKey(true, "server-a")]) {
    const value = await readPreferences(storage, key);
    assert.equal(value.last, null);
    assert.deepEqual(value.views, []);
  }
  await persistViews(storage, alice, []);
  assert.deepEqual((await readPreferences(storage, alice)).views, []);
  assert.equal((await readPreferences(storage, alice)).last.screen, "Board");
});

test("migrates missing keys and preserves both the legacy copy and existing Host preferences", async t => {
  const storage = fakeStorage();
  const lastKey = demo + ".last";
  const oldSearch = { ...query, screen: "Issues" };
  const old = new Map([[lastKey, JSON.stringify(oldSearch)], [demo + ".views", JSON.stringify([{ ...query, title: "Old" }])]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: key => old.get(key) } });
  t.after(() => delete globalThis.localStorage);
  await persistViews(storage, demo, []);
  const first = await readPreferences(storage, demo);
  assert.deepEqual(first.last, oldSearch);
  assert.deepEqual(first.views, []);
  assert.equal(old.get(lastKey), JSON.stringify(oldSearch));
  old.set(lastKey, "invalid");
  assert.deepEqual((await readPreferences(storage, demo)).last, oldSearch);
});

test("reports malformed reads and rejected writes without losing the other preference", async () => {
  const storage = fakeStorage();
  await storage.set(demo + ".last", { filters: { unknown: ["x"] } });
  await persistViews(storage, demo, [{ ...query, title: "Still available" }]);
  const value = await readPreferences(storage, demo);
  assert.equal(value.last, null);
  assert.equal(value.failures.last, true);
  assert.equal(value.views[0].title, "Still available");
  const offline = { async get() { throw Error("offline"); }, async set() { throw Error("limit"); } };
  assert.equal((await readPreferences(offline, demo)).failures.views, true);
  await assert.rejects(persistLast(offline, demo, { ...query, screen: "Issues" }), /limit/);
});
