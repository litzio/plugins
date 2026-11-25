const key = "document-import-recent-folders";

export function readFolders() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveFolders(folders) {
  localStorage.setItem(key, JSON.stringify(folders));
}

export function rememberFolder(folder) {
  saveFolders([...new Set([folder, ...readFolders()])].slice(0, 10));
}
