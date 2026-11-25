import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { koreanTime } from "../shared/time.mjs";
import { sha } from "./output.mjs";

// Converted documents directly under the folders the screen remembers: <folder>/X/X.word-source.json.
export async function listConverted(input) {
  const rows = [], folders = [];
  for (const folder of [...new Set(input)].slice(0, 10)) {
    if (typeof folder !== "string" || !path.isAbsolute(folder)) continue;
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); }
    catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") continue; throw e; }
    folders.push(folder);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const side = path.join(folder, entry.name, entry.name + ".word-source.json");
      try {
        const data = JSON.parse(await readFile(side, "utf8"));
        if (!data.word?.name || path.basename(data.word.name) !== data.word.name || !Array.isArray(data.warnings)) continue;
        await stat(side.replace(/\.word-source\.json$/, ".md"));
        const docx = path.join(folder, data.word.name);
        let state = "";
        try { if (sha(await readFile(docx)) !== data.word.sha256) state = "원본이 바뀜"; }
        catch (e) { if (e.code === "ENOENT") state = "원본 없음"; else throw e; }
        const at = Date.parse(data.convertedAt);
        rows.push({ id: side, path: docx, name: data.word.name.replace(/\.docx$/i, ""), folder: path.basename(folder),
          warnings: data.warnings.length, convertedAt: koreanTime(Number.isFinite(at) ? at : (await stat(side)).mtime), state });
      } catch (e) {
        if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
      }
    }
  }
  return { folders, rows: rows.sort((a, b) => b.convertedAt.localeCompare(a.convertedAt)) };
}
