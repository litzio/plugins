import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hash } from "./convert.js";
import { protectedTokens } from "./tokens.js";
export async function readPdf(bytes) {
  const { getDocument, GlobalWorkerOptions, version } = await import(
    "../vendor/pdfjs/build/pdf.mjs"
  );
  GlobalWorkerOptions.workerSrc = new URL(
    "../vendor/pdfjs/build/pdf.worker.mjs",
    import.meta.url,
  ).href;
  const task = getDocument({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
    useWorkerFetch: false,
    cMapUrl: fileURLToPath(
      new URL("../vendor/pdfjs/cmaps/", import.meta.url),
    ).replaceAll("\\", "/"),
    cMapPacked: true,
    verbosity: 0,
  });
  const pages = [];
  try {
    const pdf = await task.promise;
    let outline;
    try {
      const stack = [...((await pdf.getOutline()) ?? [])];
      let count = 0;
      while (stack.length) {
        const n = stack.pop();
        count++;
        stack.push(...(n.items ?? []));
      }
      outline = { status: count ? "present" : "absent", count };
    } catch {
      outline = { status: "unknown", count: 0 };
    }
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo),
        viewport = page.getViewport({ scale: 1, rotation: 0 }),
        content = await page.getTextContent(),
        items = [],
        tokens = [];
      for (const [index, item] of content.items.entries()) {
        if (typeof item.str !== "string" || !item.str.trim()) continue;
        const [a, b, c, d, x, y] = item.transform,
          h = Math.hypot(c, d) || item.height || 1,
          ascent = content.styles[item.fontName]?.ascent ?? 0.8;
        const len = Math.hypot(a, b) || 1,
          dx = (a / len) * item.width,
          dy = (b / len) * item.width;
        const pts = [
          [x, y + ascent * h],
          [x + dx, y + dy + ascent * h],
          [x, y - (1 - ascent) * h],
          [x + dx, y + dy - (1 - ascent) * h],
        ];
        const bbox = [
          Math.min(...pts.map((p) => p[0])),
          viewport.height - Math.max(...pts.map((p) => p[1])),
          Math.max(...pts.map((p) => p[0])),
          viewport.height - Math.min(...pts.map((p) => p[1])),
        ];
        const entry = {
          id: `p${pageNo}-t${index}`,
          text: item.str,
          bbox,
          approximate: true,
          dir: item.dir,
        };
        items.push(entry);
        for (const t of protectedTokens(item.str)) {
          const l = bbox[0] + ((bbox[2] - bbox[0]) * t.start) / item.str.length,
            r = bbox[0] + ((bbox[2] - bbox[0]) * t.end) / item.str.length;
          tokens.push({
            ...t,
            id: `${entry.id}-${t.start}`,
            itemId: entry.id,
            bbox: [l, bbox[1], r, bbox[3]],
          });
        }
      }
      pages.push({
        pageNo,
        width: viewport.width,
        height: viewport.height,
        rotation: page.rotate,
        unit: "pt",
        origin: "TOPLEFT",
        status: items.length ? "available" : "unavailable",
        items,
        tokens,
      });
      await page.cleanup();
    }
    return {
      schemaVersion: "1.0.0",
      pdfSha256: hash(bytes),
      outline,
      reader: {
        name: "pdfjs-dist",
        version,
        license: "Apache-2.0",
        mode: "text-only; no canvas; no system font rendering",
      },
      coordinateMethod:
        "text item ascent/descent + proportional character offsets; approximate; unrotated TOPLEFT PDF pt",
      pages,
    };
  } finally {
    await task.destroy();
  }
}
