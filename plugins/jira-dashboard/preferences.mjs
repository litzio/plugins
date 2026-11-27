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

async function read(storage, key, clean, valid, onError) {
  try {
    const stored = await storage.get(key);
    const raw = stored === undefined ? globalThis.localStorage?.getItem(key) : null;
    const value = stored === undefined ? (raw == null ? undefined : JSON.parse(raw)) : stored;
    if (value === undefined) return clean(undefined);
    const cleaned = clean(value);
    if (!valid(value, cleaned)) onError();
    if (stored === undefined && valid(value, cleaned)) {
      try { await storage.set(key, cleaned); }
      catch { onError(); }
    }
    return cleaned;
  } catch {
    onError();
    return clean(undefined);
  }
}

export async function readPreferences(storage, key) {
  const failures = {};
  if (!key) return { ...empty(), failures };
  const [last, views] = await Promise.all([
    read(storage, key + ".last", cleanLast, (_, value) => value !== null, () => { failures.last = true; }),
    read(storage, key + ".views", cleanViews, (raw, value) => Array.isArray(raw) && raw.length === value.length,
      () => { failures.views = true; }),
  ]);
  return { last, views, failures };
}

export async function persistLast(storage, key, value) {
  if (!key) return;
  const last = cleanLast(value);
  if (!last) throw new Error("Invalid last search");
  await storage.set(key + ".last", last);
}

export async function persistViews(storage, key, views) {
  if (!key) return;
  const cleaned = cleanViews(views);
  if (cleaned.length !== views.length) throw new Error("Invalid saved views");
  await storage.set(key + ".views", cleaned);
}
