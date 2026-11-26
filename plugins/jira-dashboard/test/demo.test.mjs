import assert from "node:assert/strict";
import test from "node:test";
import { createJql, demoDetail, overdue, parseDemoJql, searchDemo, people } from "../demo.mjs";

const sort = { field: "updated", direction: "DESC" };
test("project scope, page boundaries and distinct assignees", () => {
  const project = { project: ["AT"] };
  const all = searchDemo(project, sort);
  assert.equal(all.length, 248);
  assert.notEqual(all[49].id, all[50].id);
  const [first, second] = people.filter(user => user.name === "Sam Rivera");
  for (const user of [first, second]) {
    const found = searchDemo({ ...project, assignee: [user.id] }, sort);
    assert.ok(found.length > 0 && found.every(issue => issue.assignee === user.id));
  }
  assert.equal(searchDemo({ ...project, metric: ["overdue"] }, sort).length, all.filter(overdue).length);
  assert.ok(demoDetail(all[0]).comments.length > 0);
});

test("basic search round-trips quotes, values, range and order in demo JQL", () => {
  const query = { project: ["AT", "NW"], created: ["2026-11-01", "2026-11-24"], summary: ['\" AND project = "bad"'] };
  assert.deepEqual(parseDemoJql(createJql(query, sort)), { filters: query, sort });
  assert.throws(() => parseDemoJql('project = "AT" AND ORDER BY updated DESC'), /Add a condition/);
});
