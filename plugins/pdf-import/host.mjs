import { PluginPublicError } from "@litzio/plugin-sdk";
import { readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extract } from "./extract.mjs";
import { convert, suggestExcludedPages } from "./rules.mjs";
import { listConverted } from "./recent.mjs";
const exec = promisify(execFile),
  sha = (b) => createHash("sha256").update(b).digest("hex");
export function activate(context) {
  const inspect = async (p) => {
    if (!context.cli)
      throw new PluginPublicError(
        "pdf_import_failed",
        "이 Host에는 공식 문서 조회 기능이 없습니다.",
      );
    const r = await exec(
      context.cli.bin,
      [...context.cli.args, "inspect", p, "--format", "json"],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    );
    return JSON.parse(r.stdout);
  };
  const sessions = /* @__PURE__ */ new Map();
  return {
    status: () => ({
      available: !!context.cli,
      message: context.cli ? "준비됨" : "공식 CLI 없음",
    }),
    operations: {
      recent: async ({ folders = [] }) => {
        try {
          return await listConverted(folders);
        } catch {
          throw new PluginPublicError(
            "pdf_import_failed",
            "저장된 문서 목록을 읽지 못했습니다.",
          );
        }
      },
      load: async ({ path: p, cachedOnly = false }) => {
        if (path.extname(p).toLowerCase() !== ".pdf")
          throw new PluginPublicError(
            "pdf_import_failed",
            "PDF 파일을 골라 주세요.",
          );
        const bytes = await readFile(p),
          digest = sha(bytes),
          doc = path.join(
            path.dirname(p),
            path.basename(p, path.extname(p)) + ".md",
          ),
          side = doc.replace(/\.md$/, ".pdf-source.json");
        const id = sha(Buffer.from(p));
        sessions.set(id, { p, digest, doc, side });
        let cached = null;
        try {
          const s = JSON.parse(await readFile(side, "utf8"));
          if (s.pdf.sha256 === digest) {
            const current = await inspect(doc);
            cached = { ...s, stale: current.revision !== s.revision };
          }
        } catch (e) {
          if (e.code !== "ENOENT")
            throw new PluginPublicError(
              "pdf_import_failed",
              "저장된 대응 자료나 문서를 읽을 수 없습니다.",
            );
        }
        if (cachedOnly && !cached)
          throw new PluginPublicError(
            "pdf_import_failed",
            "원본이 바뀌었거나 저장된 대응 자료가 없습니다. PDF를 다시 골라 주세요.",
          );
        return {
          id,
          base64: bytes.toString("base64"),
          name: path.basename(p),
          folder: path.dirname(p),
          document: doc,
          cached,
        };
      },
      suggest: async ({ id }) => {
        const s = sessions.get(id);
        if (!s)
          throw new PluginPublicError(
            "pdf_import_failed",
            "PDF를 다시 골라 주세요.",
          );
        s.raw = await extract(s.p);
        return { excludedPages: suggestExcludedPages(s.raw) };
      },
      convert: async ({ id, excludedPages = [] }) => {
        const s = sessions.get(id);
        if (!s)
          throw new PluginPublicError(
            "pdf_import_failed",
            "PDF를 다시 골라 주세요.",
          );
        const t = performance.now(),
          raw = s.raw || (await extract(s.p)),
          extracted = performance.now(),
          result = convert(raw, excludedPages);
        s.result = result;
        return {
          ...result,
          timings: {
            extractMs: extracted - t,
            rulesMs: performance.now() - extracted,
          },
        };
      },
      backup: async ({ id }) => {
        const s = sessions.get(id);
        if (!s)
          throw new PluginPublicError(
            "pdf_import_failed",
            "PDF를 다시 골라 주세요.",
          );
        const suffix = ".previous-" + Date.now();
        await rename(s.doc, s.doc.replace(/\.md$/, suffix + ".md"));
        try {
          await rename(s.side, s.side + suffix);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        return { ok: true };
      },
      mapping: async ({ id, units, revision }) => {
        const s = sessions.get(id);
        if (!s?.result)
          throw new PluginPublicError(
            "pdf_import_failed",
            "변환 결과가 없습니다.",
          );
        const current = await inspect(s.doc);
        if (revision && current.revision !== revision)
          throw new PluginPublicError(
            "document_changed",
            "저장 뒤 문서가 바뀌어 대응을 만들 수 없습니다.",
          );
        const nodes = current.nodes.filter(
          (n) => n.path.length === 1 && n.type !== "caption",
        );
        if (nodes.length !== units.length)
          throw new PluginPublicError(
            "pdf_import_failed",
            "저장된 블록 수가 변환 결과와 달라 대응을 만들 수 없습니다.",
          );
        const mapped = [];
        nodes.forEach((n, i) => {
          if (n.type !== units[i].kind)
            throw new PluginPublicError(
              "block_mismatch",
              "저장된 블록 종류가 변환 결과와 다릅니다.",
            );
          for (const source of units[i].sources) {
            const b = s.result.blocks.find((b2) => b2.id === source);
            if (!b)
              throw new PluginPublicError(
                "pdf_import_failed",
                "변환 블록을 찾을 수 없습니다.",
              );
            mapped.push({
              id: b.id,
              path: n.path,
              kind: b.kind,
              ...(b.level ? { level: b.level } : {}),
              boxes: b.boxes,
              ...(b.warning ? { warning: b.warning } : {}),
            });
          }
        });
        const data = {
          pdf: { name: path.basename(s.p), sha256: s.digest },
          revision: current.revision,
          pages: s.result.pages,
          blocks: mapped,
          excluded: s.result.excluded,
          excludedPages: s.result.excludedPages,
          stats: s.result.stats,
        };
        await writeFile(s.side, JSON.stringify(data));
        const info = await stat(s.doc);
        return { ...data, documentBytes: info.size };
      },
    },
    dispose() {
      sessions.clear();
    },
  };
}
