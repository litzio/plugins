import { dateFields, schema } from "./jql.mjs";
export { createJql, dateFields, schema } from "./jql.mjs";

export const people = [
  ["maya.chen", "Maya Chen"], ["jonah.reed", "Jonah Reed"], ["sam.rivera", "Sam Rivera"],
  ["priya.shah", "Priya Shah"], ["srivera.ops", "Sam Rivera"], ["alex.park", "Alex Park"],
].map(([id, name]) => ({ id, name, initials: name.split(" ").map(word => word[0]).join("") }));

export const statuses = ["To do", "In progress", "In review", "Done"];
export const priorities = ["Critical", "High", "Medium", "Low"];
export const types = ["Story", "Task", "Bug"];
export const projects = [["AT", "Atlas Platform"], ["NW", "Northwind"]];
export const labels = ["accessibility", "billing", "exports", "integration", "reliability"];
export const today = "2026-11-27";
const day = 86_400_000;
const format = date => date.toISOString().slice(0, 10);
export const shift = (date, days) => format(new Date(Date.parse(date) + days * day));

const subjects = [
  "Restore keyboard focus after sign-in", "Verify billing webhooks on retry",
  "Add audit trail for project exports", "Update empty states for access requests",
  "Stabilize invoice PDF generation", "Add service tokens to integration docs",
  "Consolidate staging environment alerts", "Validate renewal dates across time zones",
  "Improve export history retention", "Document read-only access roles",
  "Add keyboard hints to account settings", "Correct totals in monthly usage exports",
  "Improve API error recovery", "Review alert routing", "Verify project permissions",
  "Make workspace navigation discoverable", "Review account lifecycle events",
];
const areas = ["web", "desktop", "onboarding", "workspace", "billing", "reporting", "integrations", "admin"];

export const issues = Array.from({ length: 328 }, (_, i) => {
  const project = i < 248 ? "AT" : "NW";
  const created = shift(today, -(i * 13 % 30 + 1));
  const status = statuses[i % 20 < 12 ? 3 : (i * 17 % 3)];
  const updated = [shift(created, i * 19 % 18), shift(today, -1)].sort()[0];
  const number = 350 - i;
  return {
    id: project + "-" + number,
    project,
    summary: i < subjects.length ? subjects[i] : subjects[i % subjects.length] + " · " + areas[Math.floor(i / subjects.length) % areas.length],
    status,
    priority: priorities[[1, 1, 1, 2, 2, 3, 0][i % 7]],
    type: types[i % types.length],
    assignee: people[i % 13 === 0 ? 0 : 1 + (i * 11 % 17) % 5].id,
    reporter: people[(i * 11 + 2) % people.length].id,
    created, updated,
    resolved: status === "Done" ? updated : "",
    due: i % 5 === 0 ? "" : shift(today, i * 23 % 42 - 6),
    label: labels[i % labels.length],
  };
}).map((issue, i) => i < 3 ? {
  ...issue, status: statuses[[1, 1, 2][i]], resolved: "", updated: "2026-11-26",
  due: shift(today, i - 2),
} : issue).sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id, undefined, { numeric: true }));

export const completion = issue => issue.isResolved ?? Boolean(issue.resolved);
export const overdue = issue => Boolean(!completion(issue) && issue.due &&
  issue.due < (issue.url ? new Date().toISOString().slice(0, 10) : today));

const sortable = ["id", "summary", "status", "priority", "assignee", "updated", "created", "resolved", "due", "project", "type", "reporter"];
export function searchDemo(filters, sort) {
  const metrics = {
    active: issue => ["In progress", "In review"].includes(issue.status),
    unresolved: issue => !completion(issue), resolved: completion, overdue,
    assigned: issue => issue.assignee === people[0].id,
  };
  return issues.filter(issue => Object.entries(filters).every(([key, values]) => {
    if (!values.length) return true;
    if (key === "metric") return metrics[values[0]]?.(issue) ?? false;
    if (dateFields.includes(key)) {
      return Boolean(issue[key] && (!values[0] || issue[key] >= values[0]) && (!values[1] || issue[key] <= values[1]));
    }
    if (key === "summary") return (issue.id + " " + issue.summary).toLowerCase().includes(values[0].toLowerCase());
    return values.includes(issue[key]);
  })).sort((a, b) => {
    const key = sort.field;
    const compare = key === "priority" ? priorities.indexOf(a[key]) - priorities.indexOf(b[key])
      : a[key].localeCompare(b[key], undefined, { numeric: true });
    return (sort.direction === "ASC" ? compare : -compare) || a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

export function parseDemoJql(source) {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|>=|<=|[=~,()]|[\w-]+|[^\s]/g) || [];
  let cursor = 0;
  const peek = () => tokens[cursor]?.toUpperCase();
  const require = expected => {
    if (peek() !== expected) throw new Error("Expected " + expected + " near token " + (cursor + 1) + ".");
    cursor++;
  };
  const value = () => {
    const token = tokens[cursor++];
    if (!token?.startsWith('"')) throw new Error("Put values in double quotes.");
    return JSON.parse(token);
  };
  const filters = {};
  while (cursor < tokens.length && peek() !== "ORDER") {
    const name = tokens[cursor++]?.toLowerCase();
    const field = Object.keys(schema).find(key => schema[key][1] === name);
    if (!field) throw new Error("Unsupported demo field near token " + cursor + ".");
    const operator = tokens[cursor++]?.toUpperCase();
    if (operator === "IN" && !dateFields.includes(field) && field !== "summary") {
      require("(");
      const values = [value()];
      while (peek() === ",") { require(","); values.push(value()); }
      require(")");
      filters[field] = values;
    } else if ((operator === "=" && !dateFields.includes(field) && field !== "summary") || (operator === "~" && field === "summary")) {
      filters[field] = [value()];
    } else if (dateFields.includes(field) && [">=", "<="].includes(operator)) {
      const pair = filters[field] ?? ["", ""];
      const date = value();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter dates as YYYY-MM-DD.");
      pair[operator === ">=" ? 0 : 1] = date;
      filters[field] = pair;
    } else throw new Error("Unsupported demo operator near token " + cursor + ".");
    if (peek() === "ORDER" || cursor === tokens.length) break;
    require("AND");
    if (cursor === tokens.length || peek() === "ORDER") throw new Error("Add a condition after AND.");
  }
  let sort = { field: "updated", direction: "DESC" };
  if (cursor < tokens.length) {
    require("ORDER");
    require("BY");
    const name = tokens[cursor++]?.toLowerCase();
    const field = sortable.find(key => schema[key][1] === name);
    const direction = peek();
    if (!field || !["ASC", "DESC"].includes(direction) || ++cursor !== tokens.length) throw new Error("Check the ORDER BY field and direction.");
    sort = { field, direction };
  }
  if (!source.trim()) throw new Error("Enter a JQL expression.");
  return { filters, sort };
}

export function demoDetail(issue) {
  return {
    description: issue.summary + ". Review the affected workflow in the next release, verify the expected outcome, and record the acceptance results in the issue.",
    parent: issues.find(candidate => candidate.project === issue.project && candidate.type === "Story" && candidate.id !== issue.id),
    related: issues.find(candidate => candidate.project === issue.project && candidate.label === issue.label && candidate.id !== issue.id),
    comments: [
      { author: people.find(person => person.id === issue.reporter).name, date: issue.updated, text: "Added a reproducible example to the release review." },
      { author: people.find(person => person.id === issue.assignee).name, date: issue.updated, text: "I will check the acceptance criteria and update the team." },
    ],
    attachments: [{ name: "acceptance-notes.txt", size: "2 KB" }],
    history: [{ date: issue.created, text: "Issue created" }, { date: issue.updated, text: "Status set to " + issue.status }],
  };
}
