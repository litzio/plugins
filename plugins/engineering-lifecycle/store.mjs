
import { constants } from "node:fs";
import { link, lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { makeWorkspace } from "./runtime/seed.mjs";
import { command } from "./runtime/operations.mjs";

const name = "engineering-lifecycle.ell";
const sizeLimit = 48 * 1024 * 1024;
const object = value => value && typeof value === "object" && !Array.isArray(value);
const equalPath = (a,b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

async function canonicalDirectory(path) {
  if (typeof path !== "string" || !isAbsolute(path)) throw new Error("Select an opened Host folder.");
  const requested = resolve(path);
  const actual = await realpath(requested);
  if (!equalPath(requested, actual) || !(await lstat(actual)).isDirectory()) {
    throw new Error("Choose an existing folder directly inside the Host workspace.");
  }
  return actual;
}

async function canonicalPack(path) {
  if (typeof path !== "string" || !isAbsolute(path) || extname(path).toLowerCase() !== ".ell") throw new Error("Choose an Engineering Lifecycle data pack.");
  const directory = await canonicalDirectory(dirname(path));
  const file = join(directory, basename(path));
  if (!(await lstat(file)).isFile() || !equalPath(await realpath(file), file)) throw new Error("Open the original data pack file directly.");
  return file;
}

function validSnapshot(value, project) {
  if (!object(value) || value.model !== "4.1" || !object(value.items) || !Array.isArray(value.links) || !Array.isArray(value.expectations) || !Array.isArray(value.processes) ||
      !object(value.assessments) || !Array.isArray(value.assessorRecords) || !Array.isArray(value.reviews) || !Array.isArray(value.approvals) || !Array.isArray(value.audit)) return false;
  const prefix = project + "/";
  return Object.entries(value.items).every(([id,item])=>id.startsWith(prefix)&&object(item)&&item.id===id&&typeof item.code==="string"&&id===prefix+item.code&&typeof item.kind==="string"&&typeof item.title==="string"&&typeof item.body==="string"&&Number.isSafeInteger(item.revision))
    && value.links.every(l=>object(l)&&typeof l.from==="string"&&typeof l.to==="string"&&l.from.startsWith(prefix)&&l.to.startsWith(prefix)&&typeof l.id==="string")
    && value.expectations.every(e=>object(e)&&typeof e.from==="string"&&e.from.startsWith(prefix)&&(!e.to||(typeof e.to==="string"&&e.to.startsWith(prefix))));
}

export async function readPack(file) {
  const handle = await open(file, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW));
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > sizeLimit) throw new Error("The data pack exceeds the supported file limit.");
    let value;
    try { value = JSON.parse(await handle.readFile("utf8")); } catch { throw new Error("The data pack could not be read as JSON."); }
    const supported = value?.marker==="litzio.engineering-lifecycle" && value.schema===1 && Number.isSafeInteger(value.revision) && value.revision>=0 && Array.isArray(value.applied)
      && Array.isArray(value.users) && Array.isArray(value.projects) && value.projects.length===2 && new Set(value.projects.map(p=>p?.id)).size===2
      && value.projects.every(p=>object(p)&&["OBC-22","ITMC-08"].includes(p.id)&&object(p.releases)&&Object.hasOwn(p.releases,p.latest)&&Object.entries(p.releases).every(([id,r])=>r?.id===id&&validSnapshot(r,p.id)&&Array.isArray(r.baselines)&&r.baselines.every(b=>typeof b?.id==="string"&&validSnapshot(b.snapshot,p.id))));
    if (!supported) throw new Error("This file is not a supported Engineering Lifecycle workspace.");
    return value;
  } finally { await handle.close(); }
}

async function tempPath(directory, data) {
  const file = join(directory, ".eng-write-"+randomUUID()+".tmp");
  const fd = await open(file, "wx");
  try { await fd.writeFile(data); await fd.sync(); }
  catch (error) { await fd.close().catch(()=>{}); await unlink(file).catch(()=>{}); throw error; }
  await fd.close();
  return file;
}
function encode(workspace) {
  const data=JSON.stringify(workspace);
  if(Buffer.byteLength(data)>sizeLimit) throw new Error("The update exceeds the data pack size limit.");
  return data;
}
async function commit(file, data, createOnly) {
  const temporary = await tempPath(dirname(file), data);
  try {
    if (createOnly) {
      try { await link(temporary, file); } catch (error) {
        if(error.code==="EEXIST")throw new Error("A data pack already exists in this folder. Reopen it instead.");
        throw error;
      }
    } else { await rename(temporary, file); }
  } finally { await unlink(temporary).catch(()=>{}); }
}

export async function createPack(folder) {
  const root = await canonicalDirectory(folder);
  const file = join(root, name);
  const workspace = makeWorkspace();
  await commit(file, encode(workspace), true);
  return { file, workspace };
}
export async function openPack(path) {
  const file = await canonicalPack(path);
  return { file, workspace: await readPack(file) };
}
export async function updatePack(file, expected, operation, project, release, input) {
  if (!Number.isSafeInteger(expected)||typeof operation!=="string"||!/^[A-Za-z0-9_-]{12,90}$/.test(operation)) throw new Error("Replay the action from the current workspace.");
  const canonical = await canonicalPack(file);
  const path = canonical + ".lock";
  let lock;
  try { lock = await open(path,"wx"); } catch (error) {
    if(error.code==="EEXIST")throw new Error("The data pack is locked by another writer. Reopen and try again when it finishes.");
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));
    const previous = await readPack(canonical);
    if (previous.applied.includes(operation)) return previous;
    if (previous.revision !== expected) throw new Error("This data pack changed in another window. Refresh the workspace and review the action.");
    const next = command(previous, project, release, input, operation, new Date().toISOString());
    await commit(canonical + ".bak", encode(previous), false);
    await commit(canonical, encode(next), false);
    return next;
  } finally { await lock.close().finally(()=>unlink(path)); }
}
export async function exportCsv(folder, filename, csv) {
  const root=await canonicalDirectory(folder);
  if (!/^[a-z0-9-]{8,100}\.csv$/i.test(filename) || Buffer.byteLength(csv)>5*1024*1024) throw new Error("The export name or size is invalid.");
  await commit(join(root,filename),csv,true);
  return filename;
}
export async function readSourceFile(path) {
  if(typeof path!=="string"||!isAbsolute(path))throw new Error("Select a PDF or Word document.");
  const root=await canonicalDirectory(dirname(path));
  const filename=basename(path), extension=extname(filename).toLowerCase();
  const mime=extension===".pdf"?"application/pdf":extension===".docx"?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":null;
  if(!mime||filename.length>180)throw new Error("Select a PDF or Word document with a valid filename.");
  const file=join(root,filename);
  if(!equalPath(await realpath(file),file)||!(await lstat(file)).isFile())throw new Error("Select the original file directly.");
  const fd=await open(file,constants.O_RDONLY | (process.platform==="win32"?0:constants.O_NOFOLLOW));
  try{
    const stat=await fd.stat();
    if(!stat.isFile()||stat.size>4*1024*1024)throw new Error("Source documents must be 4 MiB or smaller.");
    const data=await fd.readFile();
    if(data.length>4*1024*1024)throw new Error("Source documents must be 4 MiB or smaller.");
    const valid=extension===".pdf"?data.subarray(0,5).toString()==="%PDF-":data.subarray(0,4).equals(Buffer.from([0x50,0x4b,3,4]));
    if(!valid)throw new Error("The extension does not match the selected document.");
    return {filename,mime,sha256:createHash("sha256").update(data).digest("hex"),base64:data.toString("base64")};
  }finally{await fd.close();}
}
