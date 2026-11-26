import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { JiraClient } from "../jira.ts";
import { createWorkspace } from "../workspace.mjs";
import { fixtureServer } from "./fixtures/jira-server.mjs";

test("scope, six-request Overview, shared pagination, independent lazy detail tabs", async t => {
  const calls = [];
  const metrics = [];
  const server = fixtureServer(calls);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin = "http://127.0.0.1:" + server.address().port;
  const client = new JiraClient(origin, { origin, token: "fixture-jira-pat" }, {
    loopbackTest: true, observe: entry => metrics.push(entry),
  });
  t.after(() => client.dispose());
  const workflow = createWorkspace(client, origin + "/");
  const filters = { project: ["AT"] };
  const before = calls.length;
  assert.equal(await workflow.overview({ filters: {} }), null);
  assert.equal(calls.length, before);
  const overview = await workflow.overview({ filters });
  assert.equal(overview.total, 63);
  assert.equal(overview.sample.length, 50);
  assert.equal(overview.counts.unresolved, 42);
  assert.equal(overview.counts.resolved, 21);
  assert.ok(overview.due.length > 0);
  assert.equal(calls.length, 6);
  assert.equal(calls.filter(call => call.maxResults === 1).length, 4);
  const first = await workflow.search({ filters });
  assert.equal(first.rows.length, 50);
  assert.ok(overview.at);
  assert.equal(first.at, overview.at);
  assert.equal(calls.length, 6);
  const next = await workflow.search({ filters, startAt: first.received });
  assert.equal(next.rows.length, 13);
  assert.equal(next.rows[0].id, "AT-51");
  assert.equal(calls.length, 7);
  assert.equal((await workflow.detail({ key: "AT-1", tab: "Overview" })).description, "Review the release workflow.");
  assert.equal(calls.length, 8);
  assert.equal((await workflow.detail({ key: "AT-1", tab: "Comments" })).comments.length, 1);
  assert.equal((await workflow.detail({ key: "AT-1", tab: "History" })).history.length, 1);
  assert.equal((await workflow.detail({ key: "AT-1", tab: "Attachments" })).attachments.length, 1);
  const users = await workflow.lookup("assignee", "sam");
  assert.deepEqual(users.map(user => user.id), ["sam.rivera", "srivera.ops"]);
  assert.deepEqual(users.map(user => user.name), ["Sam Rivera", "Sam Rivera"]);
  assert.ok(metrics.every(metric => metric.bytes < 150 * 1024));
  t.diagnostic(JSON.stringify({ count: metrics.length, totalBodyBytes: metrics.reduce((sum, metric) => sum + metric.bytes, 0),
    overviewBodyBytes: metrics.slice(0, 6).reduce((sum, metric) => sum + metric.bytes, 0),
    overviewRequests: metrics.slice(0, 6).map(metric => ({ bytes: metric.bytes, elapsedMs: Math.round(metric.elapsedMs) })) }));
});
