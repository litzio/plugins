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

test("last applied filters and saved views restore independently per server, account and demo", () => {
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key), setItem: (key, text) => values.set(key, text) } };
  try {
    persistLast(alice, { ...query, screen: "Board", ignoredData: "not stored" });
    persistViews(alice, [{ ...query, title: "My view" }]);
    persistLast(demo, { ...query, screen: "Overview" });
    assert.deepEqual(readPreferences(alice), {
      last: { ...query, screen: "Board" }, views: [{ ...query, title: "My view" }],
    });
    assert.equal(readPreferences(demo).last.screen, "Overview");
    for (const key of [bob, other, preferenceKey(true, "server-a")]) {
      assert.deepEqual(readPreferences(key), { last: null, views: [] });
    }
    assert.ok([...values.values()].every(text => !text.includes("ignoredData")));
    persistViews(alice, []);
    assert.deepEqual(readPreferences(alice).views, []);
    assert.equal(readPreferences(alice).last.screen, "Board");
  } finally {
    delete globalThis.window;
  }
});

test("malformed and unavailable browser storage fall back to default filters", () => {
  globalThis.window = { localStorage: { getItem: key => key.endsWith(".last") ? '{"filters":{"unknown":["x"]}}' : "invalid" } };
  try {
    assert.deepEqual(readPreferences(demo), { last: null, views: [] });
    Object.defineProperty(window, "localStorage", { get() { throw new Error("unavailable"); } });
    assert.doesNotThrow(() => persistLast(demo, { ...query, screen: "Issues" }));
    assert.deepEqual(readPreferences(demo), { last: null, views: [] });
  } finally {
    delete globalThis.window;
  }
});
