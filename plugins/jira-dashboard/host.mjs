import { PluginPublicError } from "@litzio/plugin-sdk";
import { JiraClient, JiraError, normalizeBaseUrl } from "./jira.ts";
import { createWorkspace } from "./workspace.mjs";

export function activate(context) {
  const token = context.secrets?.pat?.trim();
  const rawUrl = context.settings.baseUrl;
  const operations = new Map();
  let client, workspace, invalidUrl = false;
  if (rawUrl) {
    try {
      const base = normalizeBaseUrl(rawUrl, false, true);
      if (token) {
        client = new JiraClient(base.href, { origin: base.origin, token }, { allowHttp: true });
        workspace = createWorkspace(client, base);
      }
    } catch { invalidUrl = true; }
  }

  function message(error) {
    return error instanceof JiraError ? error.message
      : error?.name === "TimeoutError" ? "The Jira request timed out."
        : error?.name === "AbortError" ? "The Jira request was cancelled." : "Unable to reach Jira.";
  }

  async function connection() {
    if (!workspace) return { ok: false, message: invalidUrl ? "Check the Jira Base URL." : "Enter the Base URL and PAT in plugin settings." };
    try {
      const user = await workspace.identity(undefined, true);
      return { ok: true, message: ("Connected as " + user.name).slice(0, 300) };
    } catch (error) {
      return { ok: false, message: message(error) };
    }
  }

  async function invoke(operation, input) {
    if (!workspace) throw new PluginPublicError("jira_setup", "Enter the Base URL and PAT in plugin settings.");
    const { requestId } = input ?? {};
    if (operations.size >= 32 || typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{1,110}$/.test(requestId) || operations.has(requestId)) {
      throw new PluginPublicError("jira_request", "The request is unavailable. Try again.");
    }
    const controller = new AbortController();
    operations.set(requestId, controller);
    try {
      return await operation(input, controller.signal);
    } catch (error) {
      const code = error instanceof JiraError && error.status ? "jira_http_" + error.status : "jira_unavailable";
      throw new PluginPublicError(code, message(error));
    } finally {
      operations.delete(requestId);
    }
  }

  return {
    status: () => ({ available: true, message: workspace ? "Jira configured" : "Demo available" }),
    operations: {
      connection: () => connection(),
      configuration: () => ({ configured: Boolean(workspace), invalidUrl }),
      identity: input => invoke((_input, signal) => workspace.identity(signal), input),
      "search-issues": input => invoke(workspace?.agentSearch, { ...input, requestId: "agent-" + crypto.randomUUID() }),
      search: input => invoke(workspace?.search, input),
      overview: input => invoke(workspace?.overview, input),
      lookup: input => invoke(({ field, query }, signal) => workspace.lookup(field, query, signal), input),
      detail: input => invoke(workspace?.detail, input),
      cancel: ({ requestId }) => { operations.get(requestId)?.abort(); return { ok: true }; },
    },
    dispose() {
      for (const controller of operations.values()) controller.abort();
      client?.dispose();
    },
  };
}
