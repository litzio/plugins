import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const repoPath = (...parts) =>
  resolve(fileURLToPath(new URL("../../../", import.meta.url)), ...parts);
