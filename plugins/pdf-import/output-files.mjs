import { readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
const sha = b=>createHash("sha256").update(b).digest("hex");
async function optionalFile(promise) {
  try { return await promise; }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
export async function documentWithoutMapping({doc, side}) {
  const [document, mapping] = await Promise.all([optionalFile(stat(doc)), optionalFile(stat(side))]);
  return document?.isFile() === true && mapping === null;
}
export async function backupOutput({doc, side}) {
  const suffix = ".previous-" + Date.now();
  const data = await optionalFile(readFile(side, "utf8"));
  const previous = {
    doc: doc.replace(/\.md$/, suffix + ".md"),
    side: data === null ? null : side + suffix,
    data: data === null ? null : JSON.parse(data),
  };
  await rename(doc, previous.doc);
  if (previous.side) {
    try { await rename(side, previous.side); }
    catch (e) {
      if (e.code === "ENOENT") {
        previous.side = null;
        previous.data = null;
      } else {
        await rename(previous.doc, doc);
        throw e;
      }
    }
  }
  return previous;
}
export async function recordImages(s, images) {
  const folder = path.join(path.dirname(s.doc), 'assets');
  const names = await readdir(folder).catch(e => {if(e.code==='ENOENT') return [];throw e;});
  const owned = [];
  for (const image of images) {
    if (!/^(table|figure)-\d{3,}$/.test(image.key)) throw Error('잘못된 그림 이름');
    for (const name of names.filter(n => n === image.key+'.png' || n.startsWith(image.key+'-') && n.endsWith('.png'))) {
      const digest = sha(await readFile(path.join(folder,name)));
      if (digest !== image.sha256) continue;
      if (!s.assetsBefore.has(name) || s.previous?.data?.ownedImages?.some(i=>i.name===name && i.sha256===digest))
        owned.push({name,sha256:digest});
    }
  }
  return owned;
}
export async function finishReplacement(s, data) {
  if (!s.previous) return;
  const folder = path.dirname(s.doc);
  // A second document may reuse assets: preserve all old images in that case.
  const otherDocuments = (await readdir(folder)).filter(n=>/\.md$/i.test(n) && n!==path.basename(s.doc) && n!==path.basename(s.previous.doc));
  if (!otherDocuments.length) for (const image of s.previous.data?.ownedImages || []) {
    if (!/^(table|figure)-\d{3,}(?:-[a-f0-9]+)?\.png$/.test(image.name) || data.ownedImages.some(i=>i.name===image.name)) continue;
    const file = path.join(folder,'assets',image.name);
    try {if (sha(await readFile(file))===image.sha256) await unlink(file);} catch(e) {if(e.code!=='ENOENT') throw e;}
  }
  await unlink(s.previous.doc);
  if (s.previous.side) await unlink(s.previous.side);
  s.previous = null;
}
