import { inflateRawSync } from "node:zlib";

// Reads the entries of a .docx (zip) file. Only stored and deflated entries occur in Word files.
export function readZip(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("zip 파일이 아닙니다.");
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error("zip 목록이 깨졌습니다.");
    const method = buffer.readUInt16LE(at + 10), size = buffer.readUInt32LE(at + 20),
      nameLength = buffer.readUInt16LE(at + 28), extra = buffer.readUInt16LE(at + 30),
      comment = buffer.readUInt16LE(at + 32), local = buffer.readUInt32LE(at + 42),
      name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    entries.set(name, { method, size, local });
    at += 46 + nameLength + extra + comment;
  }
  return {
    has: name => entries.has(name),
    names: () => [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.local + 30 + buffer.readUInt16LE(e.local + 26) + buffer.readUInt16LE(e.local + 28);
      const data = buffer.subarray(start, start + e.size);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return inflateRawSync(data);
      throw new Error("지원하지 않는 zip 압축입니다.");
    },
  };
}
