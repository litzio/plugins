export type JiraField = "summary" | "status" | "priority" | "updated" | "project" |
  "issuetype" | "assignee" | "reporter" | "resolution" | "created" | "resolutiondate" |
  "duedate" | "description" | "labels" | "parent" | "subtasks" | "issuelinks" | "attachment";
type Method = "GET" | "POST";
type Metrics = { operation: string; status: number; bytes: number; elapsedMs: number };
type Send = typeof fetch;
type CacheItem = { expires: number; value: unknown };
export type Lease = { origin: string; token: string };

export class JiraError extends Error {
  readonly status: number;
  readonly retryAfter?: number;

  constructor(status: number, reason: string, retryAfter?: number) {
    super(reason);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const MAX_BODY = 2 * 1024 * 1024;
const MAX_ACTIVE = 3;
const MAX_CACHE = 16;
const MAX_QUEUE = 24;
const messages: Readonly<Record<number, string>> = {
  400: "Check the search expression.",
  401: "Check the Jira personal access token.",
  403: "The current account lacks permission.",
  404: "The Jira resource is unavailable.",
  429: "Jira is limiting requests. Try again later.",
};

export function normalizeBaseUrl(raw: string, loopbackTest = false, allowHttp = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new JiraError(0, "Check the Jira base URL.");
  }
  if (!(url.protocol === "https:" || (url.protocol === "http:" && (allowHttp || (loopbackTest && url.hostname === "127.0.0.1")))) ||
      url.username || url.password || url.search || url.hash) throw new JiraError(0, "Check the Jira base URL.");
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url;
}

function retryDelay(value: string | null, now: number): number {
  if (!value) return 0;
  const seconds = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

async function readPayload(response: Response): Promise<{ data: unknown; bytes: number }> {
  if (!response.body) return { data: null, bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_BODY) {
        await reader.cancel();
        throw new JiraError(response.status, "The Jira response exceeded the size limit.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const decoder = new TextDecoder();
  const body = chunks.map(chunk => decoder.decode(chunk, { stream: true })).join("") + decoder.decode();
  try {
    return { data: JSON.parse(body), bytes };
  } catch {
    throw new JiraError(response.status, "The Jira response was not JSON.");
  }
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export class JiraClient {
  readonly #base: URL;
  readonly #token: string;
  readonly #send: Send;
  readonly #observe: (metric: Metrics) => void;
  readonly #lifetime = new AbortController();
  readonly #cache = new Map<string, CacheItem>();
  readonly #receivedAt = new WeakMap<object, string>();
  readonly #active = new Map<string, { promise: Promise<unknown>; controller: AbortController; subscribers: number }>();
  readonly #queue: Array<() => void> = [];
  #slots = 0;
  #cooldown = 0;
  #authGeneration = 0;

  constructor(base: string, lease: Lease, options: { loopbackTest?: boolean; allowHttp?: boolean; send?: Send; observe?: (metric: Metrics) => void } = {}) {
    this.#base = normalizeBaseUrl(base, options.loopbackTest, options.allowHttp);
    if (this.#base.origin !== lease.origin || !lease.token || /[\r\n]/.test(lease.token)) {
      throw new JiraError(0, "The Jira credential is not bound to this origin.");
    }
    this.#token = lease.token;
    this.#send = options.send ?? fetch;
    this.#observe = options.observe ?? (() => {});
  }

  dispose() {
    this.#lifetime.abort();
    this.#cache.clear();
  }

  retrievedAt(value: object) {
    return this.#receivedAt.get(value);
  }

  myself(signal?: AbortSignal, refresh = false) {
    return this.#request("identity", "myself", undefined, 60_000, signal, refresh);
  }

  userPicker(query: string, signal?: AbortSignal) {
    const term = query.trim();
    if (Array.from(term).length < 2) return Promise.resolve({ users: [] });
    if (term.length > 100) throw new JiraError(400, "The user search term is too long.");
    const params = new URLSearchParams({ query: term, maxResults: "15", showAvatar: "false" });
    return this.#request("user-picker", "user/picker?" + params, undefined, 300_000, signal);
  }

  projectPicker(query: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ query: query.trim(), maxResults: "15" });
    return this.#request("project-picker", "projects/picker?" + params, undefined, 1_800_000, signal);
  }

  projects(signal?: AbortSignal) {
    return this.#request("projects", "project", undefined, 1_800_000, signal);
  }

  lookup(field: "status" | "priority" | "issuetype" | "labels", query: string, signal?: AbortSignal) {
    const route = field === "labels" ? "jql/autocompletedata/suggestions?" +
      new URLSearchParams({ fieldName: field, fieldValue: query }) : field;
    return this.#request("filter-metadata", route, undefined, 1_800_000, signal);
  }

  search(input: { jql: string; fields: readonly JiraField[]; startAt?: number; maxResults?: number; refresh?: boolean }, signal?: AbortSignal) {
    const { jql, fields, startAt = 0, maxResults = 50, refresh } = input;
    if (!jql.trim() || jql.length > 8192 || !Number.isSafeInteger(startAt) || startAt < 0 ||
        !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50 || !fields.length) {
      throw new JiraError(400, "Check the Jira search range.");
    }
    const projected = [...new Set(fields)];
    const params = new URLSearchParams({ jql, fields: projected.join(","), startAt: String(startAt), maxResults: String(maxResults) });
    if (params.toString().length < 1600) {
      return this.#request("search", "search?" + params, undefined, 60_000, signal, refresh);
    }
    return this.#request("search", "search", { jql, fields: projected, startAt, maxResults }, 60_000, signal, refresh);
  }

  detail(key: string, section: "overview" | "comments" | "attachments" | "history", startAt = 0, signal?: AbortSignal) {
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key) || !Number.isSafeInteger(startAt) || startAt < 0) {
      throw new JiraError(400, "Check the issue key.");
    }
    const route = "issue/" + key;
    if (section === "comments") return this.#request("comments", route + "/comment?maxResults=20&startAt=" + startAt, undefined, 60_000, signal);
    if (section === "history") return this.#request("history", route + "?fields=summary&expand=changelog", undefined, 60_000, signal);
    const fields = section === "attachments"
      ? "attachment" : "summary,description,project,status,priority,assignee,reporter,created,updated,duedate,resolutiondate,labels,parent,subtasks,issuelinks";
    return this.#request(section, route + "?fields=" + fields, undefined, 60_000, signal);
  }

  async #slot(signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.#slots < MAX_ACTIVE) {
      this.#slots++;
      return;
    }
    if (this.#queue.length >= MAX_QUEUE) throw new JiraError(0, "Jira request queue is full.");
    await new Promise<void>((resolve, reject) => {
      const enter = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        const index = this.#queue.indexOf(enter);
        if (index >= 0) this.#queue.splice(index, 1);
        reject(signal.reason);
      };
      this.#queue.push(enter);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  async #request(operation: string, route: string, body: unknown, ttl: number, signal?: AbortSignal, refresh = false) {
    this.#lifetime.signal.throwIfAborted();
    signal?.throwIfAborted();
    const method: Method = body === undefined ? "GET" : "POST";
    const json = body === undefined ? undefined : JSON.stringify(body);
    const key = method + " " + route + (json ?? "");
    if (!refresh) {
      const saved = this.#cache.get(key);
      if (saved && saved.expires > Date.now()) return saved.value;
    }
    let entry = this.#active.get(key);
    if (!entry || entry.controller.signal.aborted) {
      const controller = new AbortController();
      const authGeneration = this.#authGeneration;
      const requestSignal = AbortSignal.any([controller.signal, this.#lifetime.signal]);
      const promise = this.#run(operation, route, method, json, requestSignal).then(value => {
        requestSignal.throwIfAborted();
        if (authGeneration !== this.#authGeneration) throw new JiraError(401, messages[401]);
        this.#cache.delete(key);
        this.#cache.set(key, { expires: Date.now() + ttl, value });
        while (this.#cache.size > MAX_CACHE) {
          const oldest = this.#cache.keys().next().value;
          if (oldest !== undefined) this.#cache.delete(oldest);
        }
        return value;
      }).finally(() => {
        if (this.#active.get(key)?.controller === controller) this.#active.delete(key);
      });
      entry = { promise, controller, subscribers: 0 };
      this.#active.set(key, entry);
    }
    const shared = entry;
    shared.subscribers++;
    try {
      if (!signal) return await shared.promise;
      return await new Promise<unknown>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        shared.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
        if (signal.aborted) abort();
      });
    } finally {
      shared.subscribers--;
      if (!shared.subscribers && this.#active.get(key) === shared) shared.controller.abort();
    }
  }

  async #run(operation: string, route: string, method: Method, body: string | undefined, signal: AbortSignal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    await this.#slot(deadline);
    try {
      for (let attempt = 0; ; attempt++) {
        deadline.throwIfAborted();
        if (this.#cooldown > Date.now()) throw new JiraError(429, messages[429], this.#cooldown);
        const start = performance.now();
        let status = 0;
        let bytes = 0;
        try {
          const response = await this.#send(new URL("rest/api/2/" + route, this.#base), {
            method, body, redirect: "manual", signal: AbortSignal.any([deadline, AbortSignal.timeout(3500)]),
            headers: { Accept: "application/json", Authorization: "Bearer " + this.#token, ...(body && { "Content-Type": "application/json" }) },
          });
          status = response.status;
          if (!response.ok) {
            await response.body?.cancel();
            if (status === 401) {
              this.#authGeneration++;
              this.#cache.clear();
            }
            if (status === 429) this.#cooldown = Date.now() + (retryDelay(response.headers.get("Retry-After"), Date.now()) || 1000);
            throw new JiraError(status, messages[status] ?? "Jira did not return the requested resource.", status === 429 ? this.#cooldown : undefined);
          }
          const result = await readPayload(response);
          bytes = result.bytes;
          if (result.data && typeof result.data === "object") this.#receivedAt.set(result.data, new Date().toISOString());
          return result.data;
        } catch (error) {
          if (deadline.aborted) throw deadline.reason;
          if (attempt || (status && ![502, 503, 504].includes(status))) {
            throw error instanceof JiraError ? error : new JiraError(0, "Jira could not be reached.");
          }
        } finally {
          this.#observe({ operation, status, bytes, elapsedMs: performance.now() - start });
        }
        await wait(180 + Math.random() * 120, deadline);
      }
    } finally {
      const next = this.#queue.shift();
      if (next) next();
      else this.#slots--;
    }
  }
}
