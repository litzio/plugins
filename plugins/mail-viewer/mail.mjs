// Reads one .eml file (RFC 5322 + MIME) into what the screen shows. No network, no rendering.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const CHARSET_ALIASES = { cp949: "euc-kr", "x-windows-949": "euc-kr", "ks_c_5601": "euc-kr" };

export const MAX_BYTES = 50 * 1024 * 1024;

/** A failure whose message is shown to the user as is. */
export class MailError extends Error {}
class NotMailError extends Error {}

/** Decodes bytes in the named charset; null when this runtime cannot decode it. */
function decodeText(bytes, charset) {
  const label = (charset || "utf-8").trim().toLowerCase().replace(/^"|"$/g, "");
  try { return new TextDecoder(CHARSET_ALIASES[label] || label).decode(bytes); }
  catch { return null; }
}

const binary = buffer => Buffer.from(buffer).toString("latin1");
const bytesOf = text => Buffer.from(text, "latin1");

/** Raw (8-bit) header text: UTF-8 when it is valid, else kept as single bytes. */
function rawText(text) {
  if (!/[\x80-\xff]/.test(text)) return text;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytesOf(text)); }
  catch { return text; }
}

function unquote(value) {
  return value.replace(/\\(.)/g, "$1");
}

/** RFC 2047 encoded words; adjacent words of one charset are joined before decoding. */
export function decodeWords(value, problems) {
  if (!value) return "";
  const pieces = [];
  const word = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;
  let last = 0, m;
  while ((m = word.exec(value))) {
    const between = value.slice(last, m.index);
    if (between && !(pieces.length && pieces.at(-1).word && /^\s+$/.test(between))) pieces.push({ text: rawText(between) });
    const charset = m[1].split("*")[0];
    const bytes = /b/i.test(m[2])
      ? Buffer.from(m[3], "base64")
      : bytesOf(m[3].replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));
    const prev = pieces.at(-1);
    if (prev?.word && prev.charset.toLowerCase() === charset.toLowerCase()) prev.bytes = Buffer.concat([prev.bytes, bytes]);
    else pieces.push({ word: true, charset, bytes });
    last = word.lastIndex;
  }
  if (last < value.length) pieces.push({ text: rawText(value.slice(last)) });
  return pieces.map(p => {
    if (!p.word) return p.text;
    const text = decodeText(p.bytes, p.charset);
    if (text === null) { problems?.add(`문자 집합 ${p.charset}을(를) 바꾸지 못했습니다.`); return "(읽지 못한 글자)"; }
    return text;
  }).join("");
}

/** Splits a header block into lower-cased names and unfolded values. */
function parseHeaders(block) {
  const headers = new Map();
  let current = null;
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && current) { current[1] += " " + line.trim(); continue; }
    const m = /^([!-9;-~]+):[ \t]*(.*)$/.exec(line);
    if (!m) { current = null; continue; }
    current = [m[1].toLowerCase(), m[2]];
    if (!headers.has(current[0])) headers.set(current[0], []);
    headers.get(current[0]).push(current);
  }
  const get = name => headers.get(name)?.map(h => h[1]) ?? [];
  return { get, first: name => get(name)[0], size: headers.size };
}

function splitHeader(text) {
  const m = /\r?\n\r?\n/.exec(text);
  return m ? [text.slice(0, m.index), text.slice(m.index + m[0].length)] : [text, ""];
}

/** "type/sub; a=b; c*=utf-8''%..; d*0=..; d*1=.." → {value, params}. */
function parseParams(value = "") {
  const parts = [];
  let cur = "", quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && quoted) { cur += c + (value[++i] ?? ""); continue; }
    if (c === '"') quoted = !quoted;
    if (c === ";" && !quoted) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  const head = parts.shift().trim().toLowerCase();
  const raw = new Map();
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    let name = p.slice(0, eq).trim().toLowerCase();
    let v = p.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = unquote(v.slice(1, -1));
    const m = /^([^*]+)(?:\*(\d+))?(\*)?$/.exec(name);
    if (!m) continue;
    if (!raw.has(m[1])) raw.set(m[1], []);
    raw.get(m[1]).push({ index: m[2] ? +m[2] : 0, extended: !!m[3], v });
  }
  const params = {};
  for (const [name, segs] of raw) {
    segs.sort((a, b) => a.index - b.index);
    if (!segs.some(s => s.extended)) { params[name] = segs.map(s => s.v).join(""); continue; }
    // RFC 2231: charset'language'percent-encoded, only on the first segment.
    let charset = "us-ascii";
    const bytes = [];
    segs.forEach((s, i) => {
      let v = s.v;
      if (i === 0 && s.extended) {
        const q = /^([^']*)'[^']*'(.*)$/.exec(v);
        if (q) { charset = q[1] || charset; v = q[2]; }
      }
      bytes.push(s.extended ? Buffer.from(v.replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1") : Buffer.from(v, "latin1"));
    });
    params[name] = decodeText(Buffer.concat(bytes), charset) ?? segs.map(s => s.v).join("");
  }
  return { value: head, params };
}

/** "Name" <a@b>, c@d, Group: e@f; → [{name, address}] */
export function parseAddresses(value, problems) {
  if (!value) return [];
  const list = [];
  let cur = "", quoted = false, angle = 0, comment = 0;
  const push = () => { if (cur.trim()) list.push(cur.trim()); cur = ""; };
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\") { cur += c + (value[++i] ?? ""); continue; }
    if (c === '"' && !comment) quoted = !quoted;
    else if (!quoted && c === "(") comment++;
    else if (!quoted && c === ")" && comment) comment--;
    else if (!quoted && !comment && c === "<") angle++;
    else if (!quoted && !comment && c === ">" && angle) angle--;
    else if (!quoted && !comment && !angle && c === ",") { push(); continue; }
    else if (!quoted && !comment && !angle && c === ";") { push(); continue; }
    else if (!quoted && !comment && !angle && c === ":") { cur = ""; continue; } // group name
    cur += c;
  }
  push();
  return list.map(item => {
    const m = /^(.*)<([^>]*)>\s*(?:\(.*\))?$/.exec(item);
    let name = m ? m[1].trim() : "", address = (m ? m[2] : item.replace(/\(.*\)/, "")).trim();
    if (!m) { const c = /\((.*)\)/.exec(item); if (c) name = c[1]; }
    if (name.startsWith('"') && name.endsWith('"')) name = unquote(name.slice(1, -1));
    return { name: decodeWords(name, problems).trim(), address: rawText(address) };
  }).filter(p => p.name || p.address);
}

const pad = n => String(n).padStart(2, "0");

/** {text: KST "YYYY-MM-DD HH:mm", original?: header value when its zone is not +0900}. */
export function formatDate(value) {
  if (!value) return null;
  const clean = value.replace(/\([^)]*\)/g, "").trim();
  const time = Date.parse(clean);
  if (Number.isNaN(time)) return { text: clean, original: null };
  const kst = new Date(time + 9 * 3600e3);
  const text = `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
  const zone = /([+-]\d{4})\s*$/.exec(clean)?.[1];
  return { text, original: zone === "+0900" ? null : clean };
}

function decodeTransfer(body, encoding, problems) {
  const e = (encoding || "7bit").trim().toLowerCase();
  if (e === "base64") {
    const compact = body.replace(/[^A-Za-z0-9+/=]/g, "");
    if (compact.replace(/=+$/, "").length % 4 === 1) problems.add("첨부나 본문의 일부가 잘려 있습니다.");
    return Buffer.from(compact, "base64");
  }
  if (e === "quoted-printable") {
    return bytesOf(body.replace(/=\r?\n/g, "").replace(/=([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));
  }
  return bytesOf(body);
}

/** One MIME entity → leaves in document order. message/rfc822 is a leaf. */
function walk(text, problems, depth, leaves) {
  const [headBlock, body] = splitHeader(text);
  const h = parseHeaders(headBlock);
  const type = parseParams(h.first("content-type") || "text/plain");
  const disposition = parseParams(h.first("content-disposition") || "");
  const entity = { h, type, disposition, body };
  if (type.value.startsWith("multipart/") && type.params.boundary && depth < 20) {
    const boundary = "--" + type.params.boundary;
    const lines = body.split(/(?<=\n)/);
    let part = null, closed = false;
    for (const line of lines) {
      const bare = line.replace(/[ \t]*\r?\n$/, "");
      if (bare === boundary || bare === boundary + "--") {
        if (part !== null) walk(part.replace(/\r?\n$/, ""), problems, depth + 1, leaves);
        part = bare === boundary ? "" : null;
        if (bare !== boundary) { closed = true; break; }
        continue;
      }
      if (part !== null) part += line;
    }
    if (!closed) {
      if (part !== null) walk(part, problems, depth + 1, leaves);
      problems.add("메일의 끝이 잘려 있어 일부만 보입니다.");
    }
    return;
  }
  leaves.push(entity);
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", middot: "·", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•" };
function entities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return NAMED[e.toLowerCase()] ?? all;
  });
}

const BLOCK = /^(p|div|h[1-6]|tr|table|ul|ol|blockquote|pre|section|article|header|footer|hr|dl|dt|dd)$/;

/** HTML → plain text. Keeps paragraphs, line breaks, list items and link targets; drops all else. */
export function htmlToText(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title|template|noscript|iframe|object|svg)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|head|title|template|noscript|iframe|object|svg)\b[\s\S]*$/gi, "");
  let out = "", href = null, linkText = "", pre = 0;
  const emit = t => { if (href !== null) linkText += t; else out += t; };
  const tag = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;
  let m;
  while ((m = tag.exec(s))) {
    if (m[3] !== undefined || m[4]) {
      const t = entities(m[3] ?? "<");
      emit(pre ? t : t.replace(/\s+/g, " "));
      continue;
    }
    const name = m[1].toLowerCase(), closing = m[0][1] === "/";
    if (name === "br") emit("\n");
    else if (name === "pre") { pre += closing ? -1 : 1; out += "\n\n"; }
    else if (name === "li" && !closing) emit("\n• ");
    else if (name === "td" || name === "th") { if (!closing) emit(" "); }
    else if (name === "a" && !closing) {
      const target = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2]);
      const url = target ? entities(target[1] ?? target[2] ?? target[3]).trim() : "";
      if (href !== null) out += linkText;
      href = /^(https?:|mailto:)/i.test(url) ? url : "";
      linkText = "";
    } else if (name === "a" && closing && href !== null) {
      const t = linkText.trim(), shown = href.replace(/^mailto:/i, "");
      out += linkText + (href && t !== href && t !== shown ? ` (${href})` : "");
      href = null; linkText = "";
    } else if (BLOCK.test(name)) emit("\n\n");
  }
  if (href !== null) out += linkText;
  return out
    .split("\n").map(line => line.replace(/^[ \t]+|[ \t]+$/g, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const KIND = [[/^image\//, "그림"], [/^application\/pdf$/, "PDF"], [/^message\/rfc822$/, "메일"], [/^text\//, "텍스트"], [/^audio\//, "소리"], [/^video\//, "동영상"], [/zip|compressed|x-7z|x-rar/, "압축 파일"]];

function kindOf(mime, name) {
  for (const [re, label] of KIND) if (re.test(mime)) return label;
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name || "")?.[1];
  return ext ? ext.toUpperCase() + " 파일" : "파일";
}

function decodedLength(entity, problems) {
  return decodeTransfer(entity.body, entity.h.first("content-transfer-encoding"), problems).length;
}

/** Parses an .eml buffer. Throws NotMailError when it does not look like a message. */
export function parseMail(buffer) {
  const text = binary(buffer);
  const [headBlock] = splitHeader(text);
  const top = parseHeaders(headBlock);
  const known = ["from", "to", "subject", "date", "message-id", "mime-version", "received", "return-path"];
  if (text.slice(0, 4096).includes("\0") || !known.some(name => top.first(name) !== undefined)) throw new NotMailError();

  const problems = new Set();
  const leaves = [];
  walk(text, problems, 0, leaves);

  let plain = null, html = null;
  const attachments = [];
  for (const leaf of leaves) {
    const mime = leaf.type.value || "text/plain";
    const rawName = leaf.disposition.params.filename ?? leaf.type.params.name;
    const name = rawName ? decodeWords(rawName, problems) : "";
    const isAttachment = leaf.disposition.value === "attachment" || !!name;
    if (!isAttachment && (mime === "text/plain" || mime === "text/html")) {
      if ((mime === "text/plain" ? plain : html) !== null) continue;
      const bytes = decodeTransfer(leaf.body, leaf.h.first("content-transfer-encoding"), problems);
      const charset = leaf.type.params.charset;
      const decoded = decodeText(bytes, charset);
      if (decoded === null) problems.add(`본문의 문자 집합 ${charset}을(를) 바꾸지 못했습니다.`);
      if (mime === "text/plain") plain = decoded; else html = decoded;
      continue;
    }
    const cid = leaf.h.first("content-id");
    const inline = !!cid && mime.startsWith("image/") && leaf.disposition.value !== "attachment";
    let label = name;
    if (!label && mime === "message/rfc822") {
      const [inner] = splitHeader(leaf.body);
      label = decodeWords(parseHeaders(inner).first("subject") || "", problems) || "(제목 없음)";
    }
    attachments.push({
      name: label || "(이름 없음)",
      kind: inline ? "본문 그림" : kindOf(mime, label),
      size: decodedLength(leaf, problems),
    });
  }

  let body;
  if (plain !== null) body = { from: "plain", text: plain.replace(/\r\n/g, "\n").trimEnd() };
  else if (html !== null) body = { from: "html", text: htmlToText(html) };
  else body = { from: "none", text: "" };

  return {
    subject: decodeWords(top.first("subject") || "", problems).trim(),
    from: parseAddresses(top.get("from").join(", "), problems),
    to: parseAddresses(top.get("to").join(", "), problems),
    cc: parseAddresses(top.get("cc").join(", "), problems),
    date: formatDate(top.first("date")),
    body,
    attachments,
    problems: [...problems],
  };
}

/** Reads and parses one .eml file; failures are MailError with a one-sentence message. */
export async function readMail(file) {
  if (path.extname(file).toLowerCase() !== ".eml") throw new MailError("메일 파일(.eml)을 골라 주세요.");
  let bytes;
  try {
    if ((await stat(file)).size > MAX_BYTES) throw new MailError("파일이 50MB를 넘어 열지 않습니다.");
    bytes = await readFile(file);
  } catch (e) {
    throw e instanceof MailError ? e : new MailError("파일을 읽지 못했습니다.");
  }
  try {
    return { name: path.basename(file), ...parseMail(bytes) };
  } catch (e) {
    throw new MailError(e instanceof NotMailError ? "메일 형식이 아닙니다." : "메일을 해석하지 못했습니다.");
  }
}
