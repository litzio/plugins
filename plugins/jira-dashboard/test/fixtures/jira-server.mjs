import { createServer } from "node:http";

const author = { name: "sam.rivera", key: "user-1", displayName: "Sam Rivera" };
const other = { name: "srivera.ops", key: "user-2", displayName: "Sam Rivera" };
const project = { key: "AT", name: "Atlas Platform" };
const rows = Array.from({ length: 63 }, (_, index) => ({
  key: "AT-" + (index + 1), fields: { summary: "Review workflow " + (index + 1), project,
    status: { name: index % 3 === 0 ? "Done" : index % 3 === 1 ? "In progress" : "To do" },
    issuetype: { name: "Task" }, priority: { name: "High" }, assignee: index % 2 ? author : other,
    reporter: other, created: "2026-11-21", updated: "2026-11-26",
    resolutiondate: index % 3 === 0 ? "2026-11-25" : null, duedate: "2026-11-26",
    description: "Review the release workflow.", labels: ["review"], attachment: [{ filename: "fixture.txt", size: 42 }],
  },
}));

export function fixtureServer(calls, token = "fixture-jira-pat") {
  const send = (response, status, value) => response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(value));
  return createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/test-requests") return send(response, 200, calls);
    const method = request.method;
    const jql = url.searchParams.get("jql") ?? "";
    const maxResults = Number(url.searchParams.get("maxResults")) || 50;
    calls.push({ method, path: url.pathname, maxResults, jqlPresent: Boolean(jql) });
    if (request.headers.authorization !== "Bearer " + token) return send(response, 401, {});
    const path = url.pathname.replace("/rest/api/2/", "");
    if (path === "myself") return send(response, 200, author);
    if (path === "projects/picker") return send(response, 200, { projects: [project] });
    if (path === "user/picker") return send(response, 200, { users: url.searchParams.get("query") === "sam" ? [author, other] : [] });
    if (path === "search") {
      if (!jql || /BROKEN/.test(jql)) return send(response, 400, {});
      const startAt = Number(url.searchParams.get("startAt")) || 0;
      const candidates = rows.filter(row => (
        (!jql.includes('assignee = "srivera.ops"') || row.fields.assignee === other) &&
        (!jql.includes("resolution IS EMPTY") || !row.fields.resolutiondate) &&
        (!jql.includes("assignee = currentUser()") || row.fields.assignee === author) &&
        (!jql.includes('statusCategory = "In Progress"') || row.fields.status.name === "In progress")
      ));
      const due = jql.includes("endOfDay");
      const matches = due ? candidates.slice(0, 3) : candidates;
      const fields = (url.searchParams.get("fields") || "").split(",");
      const issues = matches.slice(startAt, startAt + maxResults).map(row => ({
        key: row.key, fields: Object.fromEntries(fields.filter(field => Object.hasOwn(row.fields, field)).map(field => [field, row.fields[field]])),
      }));
      return send(response, 200, { total: matches.length, issues, startAt, maxResults });
    }
    if (/^issue\/AT-\d+\/comment$/.test(path)) {
      return send(response, 200, { total: 1, comments: [{ author, created: "2026-11-26", body: "Reviewed the workflow." }] });
    }
    const row = rows.find(row => path === "issue/" + row.key);
    if (row) return send(response, 200, { ...row, changelog: { total: 1,
      histories: [{ created: "2026-11-26", items: [{ field: "status", toString: "Done" }] }] } });
    send(response, 404, {});
  });
}
