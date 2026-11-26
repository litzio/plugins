import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { JiraClient, JiraError, normalizeBaseUrl } from "../jira.ts";

function testClient(options = {}) {
  const origin = "https://jira.example.com";
  return new JiraClient(origin + "/jira", { origin, token: "synthetic-test-token" }, options);
}

test("only authorized origin, verified scheme and context path", async () => {
  assert.throws(() => normalizeBaseUrl("https://user:pass@jira.example.com/jira"), JiraError);
  assert.throws(() => normalizeBaseUrl("http://jira.example.com/jira"), JiraError);
  assert.throws(() => new JiraClient("https://unrelated.example.com", { origin: "https://jira.example.com", token: "token" }), JiraError);
  const client = testClient({ send: async (url, request) => {
    assert.equal(url.toString(), "https://jira.example.com/jira/rest/api/2/myself");
    assert.equal(request.redirect, "manual");
    assert.equal(request.headers.Authorization, "Bearer synthetic-test-token");
    return new Response(null, { status: 302, headers: { Location: "https://unrelated.example.com" } });
  } });
  await assert.rejects(client.myself(), { status: 302 });
});

test("picker threshold, fixed limit, duplicate search and TTL hits", async () => {
  const metrics = [];
  const client = testClient({
    observe: metric => metrics.push(metric),
    send: async url => {
      assert.equal(url.pathname, "/jira/rest/api/2/user/picker");
      assert.equal(url.searchParams.get("maxResults"), "15");
      assert.equal(url.searchParams.get("showAvatar"), "false");
      assert.equal(url.searchParams.get("query"), "sam");
      await delay(8);
      return Response.json({ users: [{ name: "sam.rivera" }, { name: "srivera.ops" }] });
    },
  });
  assert.deepEqual(await client.userPicker("s"), { users: [] });
  const replies = await Promise.all([client.userPicker("sam"), client.userPicker(" sam ")]);
  assert.deepEqual(replies[0], replies[1]);
  assert.deepEqual(await client.userPicker("sam"), replies[0]);
  assert.equal(metrics.length, 1);
  assert.deepEqual(Object.keys(metrics[0]).sort(), ["bytes", "elapsedMs", "operation", "status"]);
});

test("cancelling a consumer keeps the shared transport alive", async () => {
  const client = testClient({ send: async (_url, { signal }) => {
    await delay(25, undefined, { signal });
    return Response.json({ username: "demo" });
  } });
  const controller = new AbortController();
  const cancelled = client.myself(controller.signal);
  const active = client.myself();
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.deepEqual(await active, { username: "demo" });
});

test("limits concurrency, ready requests retain their own pagination", async () => {
  let running = 0;
  let peak = 0;
  const client = testClient({ send: async url => {
    peak = Math.max(peak, ++running);
    await delay(20);
    running--;
    return Response.json({ startAt: Number(url.searchParams.get("startAt")) });
  } });
  const replies = await Promise.all(Array.from({ length: 7 }, (_, startAt) =>
    client.search({ jql: 'project = "AT"', fields: ["summary"], startAt })));
  assert.equal(peak, 3);
  assert.deepEqual(replies.map(row => row.startAt), [0, 1, 2, 3, 4, 5, 6]);
});

test("Retry-After limits subsequent work without repeated calls", async () => {
  let calls = 0;
  const client = testClient({ send: async () => {
    calls++;
    return new Response(null, { status: 429, headers: { "Retry-After": "10" } });
  } });
  await assert.rejects(client.myself(), { status: 429 });
  await assert.rejects(client.userPicker("sam"), { status: 429 });
  assert.equal(calls, 1);
});

test("401 and 403 keep response text out of errors", async () => {
  for (const status of [400, 401, 403, 404]) {
    const client = testClient({ send: async () => new Response("private-response", { status }) });
    await assert.rejects(client.myself(), error => error.status === status && !error.message.includes("private-response"));
  }
});

test("a temporary gateway failure gets one bounded retry", async () => {
  let calls = 0;
  const client = testClient({ send: async () => {
    calls++;
    return calls === 1 ? new Response(null, { status: 503 }) : Response.json({ key: "account" });
  } });
  assert.deepEqual(await client.myself(), { key: "account" });
  assert.equal(calls, 2);
});

test("the HTTP transport never follows a credential-bearing redirect", async t => {
  let visits = 0;
  const server = createServer((request, response) => {
    visits++;
    assert.equal(request.url, "/rest/api/2/myself");
    response.writeHead(302, { Location: "/receive" }).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin = "http://127.0.0.1:" + server.address().port;
  const client = new JiraClient(origin, { origin, token: "fixture-token" }, { loopbackTest: true });
  await assert.rejects(client.myself(), { status: 302 });
  assert.equal(visits, 1);
});

test("existing WireMock Jira contract", { skip: !process.env.JIRA_DASHBOARD_MOCK_ORIGIN }, async t => {
  const origin = process.env.JIRA_DASHBOARD_MOCK_ORIGIN;
  const token = ["mock", "jira", "token"].join("-");
  const observe = metric => t.diagnostic(JSON.stringify(metric));
  const client = new JiraClient(origin, { origin, token }, { loopbackTest: true, observe });
  t.after(() => client.dispose());
  assert.equal((await client.myself()).key, "mock-user-a-key");
  const query = {
    jql: "assignee = currentUser() ORDER BY updated DESC",
    fields: ["summary", "status", "priority", "updated", "assignee", "reporter", "resolution", "created", "resolutiondate"],
    maxResults: 2,
  };
  const first = await client.search(query);
  assert.equal(first.total, 4);
  assert.deepEqual(first.issues.map(issue => issue.key), ["MOCK-1", "MOCK-2"]);
  assert.strictEqual(await client.search(query), first);
  const second = await client.search({ ...query, startAt: first.startAt + first.issues.length });
  assert.deepEqual(second.issues.map(issue => issue.key), ["MOCK-6", "MOCK-8"]);
  await assert.rejects(client.userPicker("mock"), { status: 404 });
});
