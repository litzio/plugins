import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readDocx } from "./docx.mjs";
import { convert } from "./rules.mjs";
import { exportPdf } from "./source-pdf.mjs";
import { readPdfText } from "./source-text.mjs";
import { locate, locateStats } from "./locate.mjs";
import { pageFrames } from "./frames.mjs";
import { sha } from "./output.mjs";

const optional = async promise => { try { return await promise; } catch (e) { if (e.code === "ENOENT") return null; throw e; } };

// The side file's source part is usable when the PDF on disk is the one recorded, it was made
// from the converted Word document, and the places belong to the saved revision.
export function readySource(side, pdfBytes) {
  const s = side?.source;
  return !!(s?.blocks && pdfBytes && s.pdf?.sha256 === sha(pdfBytes) && s.pdf.wordSha256 === side.word?.sha256 && s.revision === side.revision);
}

// Writes the source part into X.word-source.json. Another conversion may have replaced the file
// meanwhile; its places are not these. → "written" | "replaced" | "failed".
async function store(out, revision, source) {
  const now = JSON.parse(await optional(readFile(out.side, "utf8")) ?? "null");
  if (now?.revision !== revision) return "replaced";
  const pending = out.side + ".pending-" + randomUUID();
  try {
    await writeFile(pending, JSON.stringify({ ...now, source }), { flag: "wx" });
    await rename(pending, out.side);
    return "written";
  } catch {
    await unlink(pending).catch(() => {});
    return "failed";
  }
}

// Prepares X.source.pdf, the block places and the header and footer regions, then adds them to
// X.word-source.json.
// out: {file, side, pdf}; converted: {revision, blocks, images, paths} kept from this conversion,
// or null to read them again; pathsFor(blocks) reads the saved document's block paths.
// Resolves {state: "ready", source} | {state: "failed", reason} | {state: "none"}.
export async function prepareSource(out, { converted, pathsFor, signal, exporter = exportPdf }) {
  const side = JSON.parse(await optional(readFile(out.side, "utf8")) ?? "null");
  if (!side) return { state: "none" };
  let pdfBytes = await optional(readFile(out.pdf));
  if (readySource(side, pdfBytes)) {
    if (Array.isArray(side.source.excluded)) return { state: "ready", source: side.source };
    // Prepared before headers and footers were looked for: only they are read from the saved PDF,
    // without Word. When that fails the pages show without them.
    let text;
    try { text = await readPdfText(out.pdf); } catch { return { state: "ready", source: side.source }; }
    const source = { ...side.source, excluded: pageFrames(text.pages, side.source.blocks) };
    return await store(out, side.revision, source) === "replaced" ? { state: "none" } : { state: "ready", source };
  }
  const docx = await optional(readFile(out.file));
  // The PDF must show the same Word document the conversion read.
  if (!docx || sha(docx) !== side.word?.sha256) return { state: "none" };
  const timings = {};
  const pdfKnown = pdfBytes && side.source?.pdf?.sha256 === sha(pdfBytes) && side.source.pdf.wordSha256 === side.word.sha256;
  if (!pdfKnown) {
    const started = performance.now();
    const r = await exporter(out.file, out.pdf, { signal });
    if (r.error) return r.error === "cancelled" ? { state: "none" } : { state: "failed", reason: r.error };
    timings.exportMs = Math.round(performance.now() - started);
    pdfBytes = await readFile(out.pdf);
  }
  let blocks, images, paths;
  if (converted?.revision === side.revision) ({ blocks, images, paths } = converted);
  else {
    ({ blocks, images } = convert(readDocx(docx)));
    try { paths = await pathsFor(blocks, side.revision); }
    catch { return { state: "failed", reason: "변환한 뒤 문서가 바뀌어 원본 위치를 연결하지 못했습니다." }; }
  }
  let started = performance.now();
  let text;
  try { text = await readPdfText(out.pdf); }
  catch { return { state: "failed", reason: "원본 PDF의 글자를 읽지 못해 원본 쪽을 준비하지 못했습니다." }; }
  timings.readMs = Math.round(performance.now() - started);
  started = performance.now();
  const places = locate(blocks, text, images);
  timings.locateMs = Math.round(performance.now() - started);
  const placed = places.flatMap((p, i) => p ? [{ path: paths[i], kind: blocks[i].kind, ...p }] : []);
  const source = {
    pdf: { name: path.basename(out.pdf), sha256: sha(pdfBytes), wordSha256: side.word.sha256 },
    revision: side.revision,
    pages: text.pages.map(p => ({ width: Math.round(p.width * 100) / 100, height: Math.round(p.height * 100) / 100 })),
    blocks: placed,
    excluded: pageFrames(text.pages, placed),
    stats: { kinds: locateStats(blocks, places), ...timings },
  };
  const stored = await store(out, side.revision, source);
  if (stored === "replaced") return { state: "none" };
  if (stored === "failed") return { state: "failed", reason: "원본 위치를 저장하지 못했습니다." };
  return { state: "ready", source };
}
