import { JiraError } from "./jira.ts";
import { createJql, dateFields, schema, whereJql } from "./jql.mjs";

const order = { field: "updated", direction: "DESC" };
const summaryFields = ["summary", "project", "issuetype", "status", "priority", "assignee", "reporter", "created", "updated", "resolution", "resolutiondate", "duedate", "labels"];
const metricKeys = ["active", "unresolved", "overdue", "assigned"];
const date = value => typeof value === "string" ? value.slice(0, 10) : "";
const array = value => Array.isArray(value) ? value : [];
const name = value => typeof value === "string" ? value : value?.name ?? "";

function actor(value) {
  if (!value) return null;
  const id = value.name ?? value.key;
  if (!id) return null;
  const name = value.displayName ?? id;
  return { id, name, initials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join(""), key: value.key ?? id };
}

function issue(raw, base) {
  const fields = raw?.fields ?? {};
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(raw?.key ?? "")) return null;
  const assignee = actor(fields.assignee), reporter = actor(fields.reporter);
  return {
    id: raw.key, summary: fields.summary ?? raw.key, project: fields.project?.key ?? raw.key.split("-")[0],
    projectName: fields.project?.name, type: name(fields.issuetype), status: name(fields.status),
    priority: name(fields.priority), assignee: assignee?.id ?? "", reporter: reporter?.id ?? "",
    assigneeUser: assignee, reporterUser: reporter, created: date(fields.created),
    updated: date(fields.updated), resolved: date(fields.resolutiondate),
    isResolved: Boolean(fields.resolution || fields.resolutiondate),
    due: date(fields.duedate), labels: array(fields.labels),
    url: new URL("browse/" + raw.key, base).href,
  };
}

function relation(raw, base, role) {
  const key = raw?.key;
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key ?? "")) return null;
  return { key, summary: raw.fields?.summary ?? key, url: new URL("browse/" + key, base).href, role };
}

function validateScope(input) {
  const result = {};
  for (const [key, values] of Object.entries(input ?? {})) {
    if ((!Object.hasOwn(schema, key) && key !== "metric") || !Array.isArray(values) || values.length > 30 ||
        values.some(value => typeof value !== "string" || value.length > 220 || /[\u0000-\u001f]/.test(value))) {
      throw new JiraError(400, "Check the filter values.");
    }
    if (dateFields.includes(key) && (values.length > 2 || values.some(value =>
      value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
        new Date(Date.parse(value)).toISOString().slice(0, 10) !== value)))) {
      throw new JiraError(400, "Use valid date filters.");
    }
    if (key === "metric" && values.length && ![...metricKeys, "resolved"].includes(values[0])) {
      throw new JiraError(400, "Check the metric filter.");
    }
    if (values.length) result[key] = values;
  }
  return result;
}

export function createWorkspace(client, base) {
  const lookup = async (field, query, signal) => {
    if (typeof query !== "string" || query.length > 100) return [];
    if (field === "assignee" || field === "reporter") {
      return array((await client.userPicker(query, signal))?.users).map(actor).filter(Boolean).slice(0, 15);
    }
    if (field === "project") {
      let result;
      try { result = await client.projectPicker(query, signal); }
      catch (error) {
        if (error?.status !== 404) throw error;
        result = await client.projects(signal);
      }
      return array(result?.projects ?? result).filter(item => item?.key &&
        (item.key + " " + item.name).toLowerCase().includes(query.toLowerCase())).slice(0, 15)
        .map(item => ({ id: item.key, name: item.name ?? item.key }));
    }
    const endpoint = { status: "status", priority: "priority", type: "issuetype", label: "labels" }[field];
    if (!endpoint) return [];
    const data = await client.lookup(endpoint, query, signal);
    return array(data?.results ?? data).flatMap(item => {
      const label = item?.name ?? item?.value;
      return typeof label === "string" && label.toLowerCase().includes(query.toLowerCase()) ? [{ id: label, name: label }] : [];
    }).slice(0, 15);
  };
  const readPage = async (jql, startAt, refresh, signal) => {
    const raw = await client.search({ jql, fields: summaryFields, startAt, refresh }, signal);
    if (!Array.isArray(raw?.issues) || !Number.isSafeInteger(raw.total) || raw.total < 0) {
      throw new JiraError(0, "Jira returned an unexpected search result.");
    }
    const rows = raw.issues.map(value => issue(value, base)).filter(Boolean);
    return { rows, total: raw.total, received: raw.issues.length, at: client.retrievedAt(raw) ?? null };
  };
  return {
    async identity(signal, refresh) {
      const user = actor(await client.myself(signal, refresh));
      if (!user) throw new JiraError(0, "Jira did not return a usable account.");
      return user;
    },
    lookup,
    async search({ jql, filters, sort, startAt = 0, refresh = false }, signal) {
      if (typeof jql === "string" && jql.trim()) return readPage(jql, startAt, refresh, signal);
      const scope = validateScope(filters);
      if (!scope.project?.length) return { rows: [], total: 0, received: 0, at: null };
      const sorting = sort && Object.hasOwn(schema, sort.field) && ["ASC", "DESC"].includes(sort.direction) ? sort : order;
      return readPage(createJql(scope, sorting, true), startAt, refresh, signal);
    },
    async agentSearch({ project, keyword }, signal) {
      const filters = validateScope({ project: [project], ...(keyword ? { summary: [keyword] } : {}) });
      const result = await client.search({ jql: createJql(filters, order, true), fields: ["summary", "status"], maxResults: 20 }, signal);
      if (!Array.isArray(result?.issues) || !Number.isSafeInteger(result.total) || result.total < 0) {
        throw new JiraError(0, "Jira returned an unexpected search result.");
      }
      return { total: result.total, issues: result.issues.slice(0, 20).map(value => issue(value, base)).filter(Boolean)
        .map(({ id: key, summary, status, url }) => ({ key, summary, status, url })) };
    },
    async overview({ filters, refresh = false, extended = false }, signal) {
      const scope = validateScope(filters);
      if (!scope.project?.length) return null;
      const generated = createJql(scope, order, true);
      const first = readPage(generated, 0, refresh, signal);
      const baseWhere = whereJql(scope, true);
      const dueJql = baseWhere + ' AND resolution IS EMPTY AND duedate >= startOfDay() AND duedate <= endOfDay("+7d") ORDER BY duedate ASC';
      const getCount = async metric => {
        const predicate = whereJql({ metric: [metric] });
        const result = await client.search({ jql: baseWhere + " AND " + predicate, fields: ["summary"], maxResults: 1, refresh }, signal);
        return Number.isSafeInteger(result?.total) && result.total >= 0 ? result.total : null;
      };
      const pieces = await Promise.allSettled([first, ...metricKeys.map(getCount),
        client.search({ jql: dueJql, fields: summaryFields, maxResults: 5, refresh }, signal)]);
      if (pieces[0].status === "rejected") throw pieces[0].reason;
      const auth = pieces.find(part => part.status === "rejected" && part.reason?.status === 401);
      if (auth) throw auth.reason;
      signal?.throwIfAborted();
      const page = pieces[0].value;
      const sample = [...page.rows];
      let offset = page.received;
      for (let i = 0; extended && i < 3 && offset && offset < page.total; i++) {
        const next = await readPage(generated, offset, refresh, signal);
        if (!next.received) break;
        sample.push(...next.rows);
        offset += next.received;
      }
      const counts = Object.fromEntries(metricKeys.map((key, i) => [key, pieces[i + 1].status === "fulfilled" ? pieces[i + 1].value : null]));
      const resolved = counts.unresolved !== null && counts.unresolved <= page.total ? page.total - counts.unresolved : null;
      const due = pieces[5].status === "fulfilled" ? array(pieces[5].value?.issues).map(value => issue(value, base)).filter(Boolean) : null;
      return { total: page.total, counts: { ...counts, resolved }, sample: [...new Map(sample.map(row => [row.id, row])).values()],
        recent: page.rows.slice(0, 2), due, at: page.at };
    },
    async detail({ key, tab, startAt = 0 }, signal) {
      const category = { Overview: "overview", Comments: "comments", Attachments: "attachments", History: "history" }[tab];
      if (!category) throw new JiraError(400, "Unknown issue section.");
      const data = await client.detail(key, category, startAt, signal);
      if (category === "comments") {
        const items = array(data?.comments).map(entry => ({ author: actor(entry.author)?.name, date: date(entry.created), text: typeof entry.body === "string" ? entry.body : "" }));
        return { comments: items, next: items.length && startAt + items.length < data.total ? startAt + items.length : null };
      }
      if (category === "attachments") return { attachments: array(data?.fields?.attachment).map(file => ({ name: file.filename, size: file.size + " bytes" })) };
      if (category === "history") return { history: array(data?.changelog?.histories).slice(-100).reverse().map(entry => ({
        date: date(entry.created), text: array(entry.items).map(change => [change.field, change.fromString, change.toString].filter(Boolean).join(" · ")).join("\n"),
      })), historyLimited: Number(data?.changelog?.total) > 100 };
      const f = data?.fields ?? {};
      return { description: typeof f.description === "string" ? f.description : "", labels: array(f.labels),
        relationships: [relation(f.parent, base, "Parent"), ...array(f.subtasks).map(value => relation(value, base, "Subtask")),
          ...array(f.issuelinks).map(value => relation(value.outwardIssue ?? value.inwardIssue, base, "Related"))].filter(Boolean) };
    },
  };
}
