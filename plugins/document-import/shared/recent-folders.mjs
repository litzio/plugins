const key = "document-import-recent-folders";

export async function readFolders(storage, onError) {
  try {
    const stored = await storage.get(key);
    const raw = stored === undefined ? globalThis.localStorage?.getItem(key) : null;
    const value = stored === undefined ? (raw == null ? [] : JSON.parse(raw)) : stored;
    if (!Array.isArray(value) || value.some(folder => typeof folder !== "string" || !folder)) {
      throw new Error("Invalid recent folders");
    }
    if (raw != null) {
      try { await saveFolders(storage, value); }
      catch { onError(); }
    }
    return value;
  } catch {
    onError();
    return [];
  }
}

export async function saveFolders(storage, folders) {
  await storage.set(key, folders);
}

export function rememberFolder(folders, folder) {
  return [...new Set([folder, ...folders])].slice(0, 10);
}
