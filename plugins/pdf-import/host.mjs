import { PluginPublicError } from "@litzio/plugin-sdk";
import { readFile, writeFile, rename, stat, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { backupOutput, documentWithoutMapping, recordImages, finishReplacement } from "./output-files.mjs";
import { outputPaths } from "./output-paths.mjs";
import { createHash, randomUUID } from "node:crypto";
import { inspectDocument } from "./document-io.mjs";
import { extract } from "./extract.mjs";
import { createExtractionCache } from "./extraction-cache.mjs";
import { convert, suggestExcludedPages } from "./rules.mjs";
import { listConverted } from "./recent.mjs";
import { correctionHandler } from "./correct-host.mjs";
import { snapshotNodes, assertMapping } from "./corrections.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
export function activate(context = {}) {
  const correct = correctionHandler({cli:context.cli});
  const inspect = inspectDocument;
  const sessions = /* @__PURE__ */ new Map();
  const extractedFile = createExtractionCache(extract);
  return {
    status: () => ({
      available: true,
      message: "준비됨",
    }),
    operations: {
      correct: async (input) => {
        try { return await correct(input); }
        catch (e) { throw new PluginPublicError("pdf_import_failed", e.code ? "저장된 문서와 대응 자료를 읽거나 기록하지 못했습니다." : e.message); }
      },
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
          {doc, side, folder: outputFolder} = outputPaths(p);
        const id = sha(Buffer.from(p));
        sessions.set(id, { p, digest, doc, side });
        let cached = null, documentStatus;
        try {
          const s = JSON.parse(await readFile(side, "utf8"));
          if (s.pdf.sha256 === digest) {
            const current = await inspect(doc);
            documentStatus = current.status;
            cached = { ...s, stale: current.revision !== s.revision };
            if (!cached.stale) {
              try { assertMapping(s,current); } catch { cached.stale=true; }
              if (!cached.stale) {
                cached.snapshotNodes=snapshotNodes(current);
                cached.verificationPending=false;
                await writeFile(side,JSON.stringify(cached));
              }
            }
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
          outputFolder,
          document: doc,
          cached,
          missingMapping: !cached && await documentWithoutMapping({doc, side}),
          documentStatus,
        };
      },
      suggest: async ({ id }) => {
        const s = sessions.get(id);
        if (!s)
          throw new PluginPublicError(
            "pdf_import_failed",
            "PDF를 다시 골라 주세요.",
          );
        const raw = await extractedFile(s.p, s.digest).promise;
        return { excludedPages: suggestExcludedPages(raw) };
      },
      convert: async ({ id, excludedPages = [] }) => {
        const s = sessions.get(id);
        if (!s)
          throw new PluginPublicError(
            "pdf_import_failed",
            "PDF를 다시 골라 주세요.",
          );
        const t = performance.now(),
          extraction = extractedFile(s.p, s.digest),
          raw = await extraction.promise,
          extracted = performance.now(),
          result = convert(raw, excludedPages);
        s.result = result;
        s.assetsBefore = new Set(await readdir(path.join(path.dirname(s.doc), "assets")).catch(e => { if(e.code === "ENOENT") return []; throw e; }));
        return {
          ...result,
          timings: {
            extractMs: extracted - t,
            extractionReused: extraction.reused,
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
        s.previous = await backupOutput(s);
        return { ok: true };
      },
      mapping: async ({ id, units, revision, images = [] }) => {
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
              ...(b.formula ? {formula:true} : {}),
              documentKind: n.type,
              lines: (b.lines || []).map(({page,box,text})=>({page,box,text})),
              ...(b.level ? { level: b.level } : {}),
              boxes: b.boxes,
              ...(b.grid ? {grid:b.grid, tableRecord:b.table.record} : {}),
              ...(b.warning ? { warning: b.warning } : {}),
            });
          }
        });
        const data = {
          ownedImages: await recordImages(s, images),
          snapshotNodes: snapshotNodes(current),
          pdf: { name: path.basename(s.p), sha256: s.digest },
          revision: current.revision,
          pages: s.result.pages,
          blocks: mapped,
          excluded: s.result.excluded,
          excludedPages: s.result.excludedPages,
          stats: s.result.stats,
          profile: s.result.profile,
        };
        const info = await stat(s.doc);
        const pending = s.side + ".pending-" + randomUUID();
        try {
          data.convertedAt = new Date().toISOString();
          await writeFile(pending, JSON.stringify(data), {flag:"wx"});
          await rename(pending, s.side);
        } catch (e) {
          await unlink(pending).catch(() => {});
          throw e;
        }
        let cleanupError;
        try { await finishReplacement(s, data); }
        catch { cleanupError = "이전 변환 결과를 정리하지 못했습니다."; }
        return { ...data, documentStatus:current.status, documentBytes: info.size, cleanupError };
      },
    },
    dispose() {
      sessions.clear();
    },
  };
}
