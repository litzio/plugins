import { PluginPublicError, machineNodes, getEditableDocument } from "@litzio/plugin-sdk";
import { readDocument } from "@litzio/plugin-sdk/node";
import { readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readDocx } from "./docx.mjs";
import { convert, withImages } from "./rules.mjs";
import { startImages, imageResult, disposeImages } from "./images.mjs";
import { outputPaths, backupOutput, recordImages, finishReplacement, blockPaths, documentExists, sha } from "./output.mjs";
import { listConverted } from "./recent.mjs";

const fail = message => new PluginPublicError("word_import_failed", message);
const optional = async promise => { try { return await promise; } catch (e) { if (e.code === "ENOENT") return null; throw e; } };

export function activate() {
  const sessions = new Map();
  const session = id => {
    const s = sessions.get(id);
    if (!s) throw fail("워드 문서를 다시 골라 주세요.");
    return s;
  };
  const drop = async s => { await disposeImages(s.job); s.job = null; };
  return {
    status: () => ({ available: true, message: "준비됨" }),
    operations: {
      recent: async ({ folders = [] }) => {
        try { return await listConverted(folders); }
        catch { throw fail("변환한 문서 목록을 읽지 못했습니다."); }
      },
      // Chosen file → its output place and, if it was converted before, the saved list.
      load: async ({ path: file }) => {
        if (path.extname(file).toLowerCase() !== ".docx") throw fail("워드 문서(.docx)를 골라 주세요.");
        const { folder, doc, side } = outputPaths(file);
        const bytes = await optional(readFile(file));
        const saved = JSON.parse(await optional(readFile(side, "utf8")) ?? "null");
        const hasDocument = await documentExists(doc);
        if (!bytes && !(saved && hasDocument)) throw fail("워드 문서를 읽을 수 없습니다.");
        const id = createHash("sha256").update(file).digest("hex");
        for (const old of sessions.values()) await drop(old);
        sessions.clear();
        sessions.set(id, { file, doc, side, digest: bytes && sha(bytes) });
        return {
          id, name: path.basename(file), folder: path.dirname(file), outputFolder: folder, document: doc,
          saved: saved && hasDocument ? { ...saved, sourceMissing: !bytes, sourceChanged: !!bytes && saved.word?.sha256 !== sha(bytes) } : null,
          documentOnly: hasDocument && !saved,
        };
      },
      // Reads the Word structure and starts preparing pictures; progress tells how far they are.
      convert: async ({ id }) => {
        const s = session(id);
        await drop(s);
        const started = performance.now();
        let word;
        try {
          const bytes = await readFile(s.file);
          s.digest = sha(bytes);
          word = readDocx(bytes);
        } catch (e) {
          throw fail(e.code ? "워드 문서를 읽을 수 없습니다." : "워드 문서의 구조를 읽지 못했습니다. 파일이 .docx 형식인지 확인해 주세요.");
        }
        s.result = convert(word);
        s.readMs = performance.now() - started;
        s.job = startImages(s.result.images, word.media);
        s.assetsBefore = new Set(await readdir(path.join(path.dirname(s.doc), "assets")).catch(e => { if (e.code === "ENOENT") return []; throw e; }));
        return { images: s.result.images.length, ready: s.job.done, blocks: s.result.blocks.length, readMs: s.readMs };
      },
      progress: async ({ id }) => {
        const job = session(id).job;
        if (!job) throw fail("변환을 다시 시작해 주세요.");
        return { done: job.done, total: job.total, finished: job.finished };
      },
      // The authoring input after the pictures are ready; failed pictures are written as text.
      plan: async ({ id }) => {
        const s = session(id);
        if (!s.job?.finished) throw fail("그림을 아직 만드는 중입니다.");
        const failed = new Map(), pngs = new Map();
        for (const image of s.result.images) {
          const r = imageResult(s.job, image.key);
          if (r?.png) pngs.set(image.key, r.png); else failed.set(image.key, r?.error || "그림을 PNG로 바꾸지 못했습니다.");
        }
        s.final = withImages(s.result, failed);
        s.pngs = pngs;
        return {
          authoring: { ...(s.final.title ? { title: s.final.title } : {}), status: "draft", inputs: [{ key: "word", blocks: s.final.blocks }] },
          images: [...pngs.keys()],
          imageBytes: [...pngs.values()].reduce((n, b) => n + b.length, 0),
        };
      },
      image: async ({ id, key }) => {
        const png = session(id).pngs?.get(key);
        if (!png) throw fail("그림을 찾을 수 없습니다.");
        return { key, mime: "image/png", base64: png.toString("base64") };
      },
      backup: async ({ id }) => {
        const s = session(id);
        try { s.previous = await backupOutput(s); }
        catch { throw fail("이전 문서를 옮기지 못했습니다. 문서가 다른 곳에서 열려 있는지 확인해 주세요."); }
        return { ok: true };
      },
      // After saving: block paths for the list of places to check, written next to the document.
      mapping: async ({ id, revision }) => {
        const s = session(id);
        if (!s.final) throw fail("변환 결과가 없습니다.");
        const snapshot = readDocument(s.doc);
        if (revision && snapshot.revision !== revision) throw fail("저장 뒤 문서가 바뀌어 확인할 곳을 연결하지 못했습니다.");
        let paths;
        try { paths = blockPaths(machineNodes(getEditableDocument(snapshot.document)), s.final.blocks); }
        catch (e) { throw fail(e.message + " 확인할 곳을 연결하지 못했습니다."); }
        const data = {
          word: { name: path.basename(s.file), sha256: s.digest },
          revision: snapshot.revision,
          convertedAt: new Date().toISOString(),
          warnings: s.final.warnings.map(w => ({ kind: w.kind, label: w.label, detail: w.detail, path: paths[w.block] })),
          stats: s.final.stats,
          ownedImages: await recordImages(s, s.pngs),
        };
        const pending = s.side + ".pending-" + randomUUID();
        try {
          await writeFile(pending, JSON.stringify(data), { flag: "wx" });
          await rename(pending, s.side);
        } catch {
          await unlink(pending).catch(() => {});
          throw fail("확인할 곳 목록을 저장하지 못했습니다.");
        }
        let cleanupError;
        try { await finishReplacement(s, data); } catch { cleanupError = "이전 변환 결과를 정리하지 못했습니다."; }
        await drop(s);
        s.pngs = null;
        return { ...data, cleanupError, readMs: s.readMs };
      },
    },
    async dispose() {
      for (const s of sessions.values()) await drop(s);
      sessions.clear();
    },
  };
}
