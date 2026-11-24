import { readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const sha = b => createHash("sha256").update(b).digest("hex");

// X.docx stays where it is; the result goes to X/X.md, X/assets/ and X/X.word-source.json.
export function outputPaths(docx) {
  const name = path.basename(docx, path.extname(docx));
  const folder = path.join(path.dirname(docx), name);
  return { folder, doc: path.join(folder, name + ".md"), side: path.join(folder, name + ".word-source.json") };
}

async function optional(promise) {
  try { return await promise; } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

// Replacing keeps a recovery copy until the new document and its list are written.
export async function backupOutput({ doc, side }) {
  const suffix = ".previous-" + Date.now();
  const data = await optional(readFile(side, "utf8"));
  const previous = { doc: doc.replace(/\.md$/, suffix + ".md"), side: data === null ? null : side + suffix, data: data === null ? null : JSON.parse(data) };
  await rename(doc, previous.doc);
  if (previous.side) {
    try { await rename(side, previous.side); }
    catch (e) {
      if (e.code === "ENOENT") { previous.side = null; previous.data = null; }
      else { await rename(previous.doc, doc); throw e; }
    }
  }
  return previous;
}

// The pictures this conversion wrote: key.png, or key-<hash>.png when another file had the name.
export async function recordImages(s, pngs) {
  const folder = path.join(path.dirname(s.doc), "assets");
  const names = await readdir(folder).catch(e => { if (e.code === "ENOENT") return []; throw e; });
  const owned = [];
  for (const [key, png] of pngs) {
    const digest = sha(png);
    for (const name of names.filter(n => n === key + ".png" || n.startsWith(key + "-") && n.endsWith(".png"))) {
      if (sha(await readFile(path.join(folder, name))) !== digest) continue;
      if (!s.assetsBefore.has(name) || s.previous?.data?.ownedImages?.some(i => i.name === name && i.sha256 === digest)) owned.push({ name, sha256: digest });
    }
  }
  return owned;
}

export async function finishReplacement(s, data) {
  if (!s.previous) return;
  const folder = path.dirname(s.doc);
  // Another document in the folder may use the old pictures; keep them then.
  const others = (await readdir(folder)).filter(n => /\.md$/i.test(n) && n !== path.basename(s.doc) && n !== path.basename(s.previous.doc));
  if (!others.length) for (const image of s.previous.data?.ownedImages || []) {
    if (!/^figure-\d{3,}(?:-[a-f0-9]+)?\.png$/.test(image.name) || data.ownedImages.some(i => i.name === image.name)) continue;
    const file = path.join(folder, "assets", image.name);
    try { if (sha(await readFile(file)) === image.sha256) await unlink(file); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  await unlink(s.previous.doc);
  if (s.previous.side) await unlink(s.previous.side);
  s.previous = null;
}

// Saved top-level blocks, in order, against the authoring blocks. Figure captions are their own
// nodes in the read model and are not authoring blocks.
export function blockPaths(nodes, blocks) {
  const top = nodes.filter(n => n.path.length === 1 && n.type !== "caption");
  if (top.length !== blocks.length) throw new Error("저장된 블록 수(" + top.length + ")가 변환 결과(" + blocks.length + ")와 다릅니다.");
  top.forEach((n, i) => {
    if (n.type !== blocks[i].kind) throw new Error((i + 1) + "번째 블록의 종류가 변환 결과와 다릅니다.");
  });
  return top.map(n => n.path);
}

export const documentExists = async file => (await optional(stat(file)))?.isFile() === true;
