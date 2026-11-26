import { dateFields, schema } from "./jql.mjs";

const root = "litzio.jira-dashboard.v1";
const metrics = new Set(["active", "unresolved", "resolved", "overdue", "assigned"]);
const screens = new Set(["Overview", "Issues", "Board", "Analytics"]);
const empty = () => ({ last: null, views: [] });

export function preferenceKey(live, scope) {
  if (!live) return root + ".demo";
  return typeof scope === "string" && /^[a-f\d]{64}$/.test(scope) ? root + "." + scope : null;
}

function cleanQuery(value) {
  if (!value?.filters || Array.isArray(value.filters) || typeof value.filters !== "object" ||
      !Object.hasOwn(schema, value.sort?.field) || !["ASC", "DESC"].includes(value.sort?.direction)) return null;
  const rawJql = value.rawJql ?? "";
  if (typeof rawJql !== "string" || rawJql.length > 8192) return null;
  const filters = {};
  for (const [field, values] of Object.entries(value.filters)) {
    if ((!Object.hasOwn(schema, field) && field !== "metric") || !Array.isArray(values) ||
        values.length > 30 || values.some(item => typeof item !== "string" || item.length > 220)) return null;
    if (field === "metric" && (values.length > 1 || (values.length && !metrics.has(values[0])))) return null;
    if (dateFields.includes(field) && (values.length > 2 || values.some(item => item &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(item) || !Number.isFinite(Date.parse(item)))))) return null;
    filters[field] = values;
  }
  return { filters, sort: { field: value.sort.field, direction: value.sort.direction }, rawJql };
}

function cleanLast(value) {
  const query = cleanQuery(value);
  return query ? { ...query, screen: screens.has(value.screen) ? value.screen : query.rawJql ? "Issues" : "Overview" } : null;
}

function cleanViews(views) {
  return Array.isArray(views) ? views.flatMap(view => {
    const query = cleanQuery(view);
    return query && typeof view.title === "string" && view.title.length <= 8192 ? [{ ...query, title: view.title }] : [];
  }) : [];
}

export function readPreferences(key) {
  if (!key) return empty();
  const read = name => {
    try { return JSON.parse(window.localStorage.getItem(key + "." + name)); }
    catch { return null; }
  };
  return { last: cleanLast(read("last")), views: cleanViews(read("views")) };
}

export function persistLast(key, value) {
  const last = cleanLast(value);
  if (last) write(key, "last", last);
}

export function persistViews(key, views) {
  write(key, "views", cleanViews(views));
}

function write(key, name, value) {
  if (!key) return;
  try { window.localStorage.setItem(key + "." + name, JSON.stringify(value)); }
  catch { /* The dashboard can continue without local preferences. */ }
}
