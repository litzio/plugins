import { statusLabel } from './document-status.mjs';
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { koreanTime } from "./time.mjs";
import { createHash } from "node:crypto";
export async function listConverted(input, inspect = async file => (await import('./document-io.mjs')).inspectDocument(file)) {
  const rows = [],
    folders = [];
  for (const folder of [...new Set(input)].slice(0, 10)) {
    if (typeof folder !== "string" || !path.isAbsolute(folder)) continue;
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") continue;
      throw e;
    }
    folders.push(folder);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const side = path.join(folder, entry.name, entry.name + ".pdf-source.json");
      try {
        const data = JSON.parse(await readFile(side, "utf8")),
          info = await stat(side);
        if (
          !data.pdf?.name ||
          path.basename(data.pdf.name) !== data.pdf.name ||
          !Array.isArray(data.pages) ||
          !Array.isArray(data.blocks)
        )
          continue;
        await stat(side.replace(/\.pdf-source\.json$/, ".md"));
        const pdf = path.join(folder, data.pdf.name);
        let state = "";
        try {
          if (
            createHash("sha256")
              .update(await readFile(pdf))
              .digest("hex") !== data.pdf.sha256
          )
            state = "원본이 바뀜";
        } catch (e) {
          if (e.code === "ENOENT") state = "원본 없음";
          else throw e;
        }
        rows.push({
          id: side,
          path: pdf,
          name: data.pdf.name.replace(/\.pdf$/i, ""),
          folder: path.basename(folder),
          pages: data.pages.length,
          warnings: data.blocks.filter((b) => b.warning).length,
          modified: koreanTime(info.mtime),
          state,
          reviewStatus:statusLabel((await inspect(side.replace(/\.pdf-source\.json$/, ".md"))).status),
        });
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  }
  return {
    folders,
    rows: rows.sort((a, b) => b.modified.localeCompare(a.modified)),
  };
}
