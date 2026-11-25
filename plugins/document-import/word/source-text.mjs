import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The text layer of the PDF Word exported, page by page: `items` without headers and footers (Word
// marks them as artifacts) and those apart in `artifacts`, and the heading bookmarks with where
// they point.
async function openPdf(file) {
  const dir = path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
  const pdfjs = await import(pathToFileURL(path.join(dir, "legacy/build/pdf.mjs")).href);
  const task = pdfjs.getDocument({
    data: new Uint8Array(await readFile(file)),
    standardFontDataUrl: dir.replaceAll("\\", "/") + "/standard_fonts/",
    cMapUrl: dir.replaceAll("\\", "/") + "/cmaps/",
    cMapPacked: true, verbosity: 0, enableScripting: false, isEvalSupported: false,
  });
  return { pdfjs, task };
}

export async function readPdfText(file) {
  const { task } = await openPdf(file);
  try {
    const doc = await task.promise;
    const pages = [], viewports = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      viewports.push(viewport);
      const content = await page.getTextContent({ includeMarkedContent: true });
      const items = [], artifacts = [], marks = [];
      for (const it of content.items) {
        if (it.type === "beginMarkedContent" || it.type === "beginMarkedContentProps") { marks.push(it.tag === "Artifact"); continue; }
        if (it.type === "endMarkedContent") { marks.pop(); continue; }
        if (!it.str) continue;
        const [a, b, c, d, e, f] = it.transform;
        const size = Math.hypot(c, d) || Math.hypot(a, b);
        if (!size) continue;
        // Upright text only; the box runs from the ascent to the descent of the font size.
        const [x0, top] = viewport.convertToViewportPoint(e, f + size * 0.85);
        const [x1, bottom] = viewport.convertToViewportPoint(e + it.width, f - size * 0.2);
        (marks.includes(true) ? artifacts : items).push({ str: it.str, x0: Math.min(x0, x1), x1: Math.max(x0, x1), top: Math.min(top, bottom), bottom: Math.max(top, bottom) });
      }
      pages.push({ width: viewport.width, height: viewport.height, items, artifacts });
      page.cleanup();
    }
    const outline = [];
    const walk = async entries => {
      for (const entry of entries || []) {
        try {
          const dest = typeof entry.dest === "string" ? await doc.getDestination(entry.dest) : entry.dest;
          if (Array.isArray(dest) && dest[0]) {
            const page = typeof dest[0] === "number" ? dest[0] : await doc.getPageIndex(dest[0]);
            const y = dest[1]?.name === "XYZ" && Number.isFinite(dest[3]) ? dest[3] : null;
            const top = y === null ? 0 : viewports[page].convertToViewportPoint(0, y)[1];
            outline.push({ title: entry.title, page, top });
          }
        } catch {}
        await walk(entry.items);
      }
    };
    await walk(await doc.getOutline());
    return { pages, outline };
  } finally {
    await task.destroy();
  }
}

// Real image draws and the form bounds Word writes for inline metafiles. Inspect only the
// pages around an unplaced picture; a PDF may contain many images elsewhere.
export async function readPdfGraphics(file, pages) {
  const { task, pdfjs: { OPS, Util } } = await openPdf(file);
  const graphics = [];
  try {
    const doc = await task.promise;
    for (const index of pages) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const figureMarks = new Set();
      const walk = (node, figure = false) => {
        figure ||= node?.role === "Figure";
        const id = figure && node?.id?.match(/_mc(\d+)$/);
        if (id) figureMarks.add(Number(id[1]));
        for (const child of node?.children || []) walk(child, figure);
      };
      walk(await page.getStructTree());
      const ops = await page.getOperatorList();
      const stack = [], marks = [];
      let matrix = viewport.transform;
      const add = (rect, kind) => {
        const box = [Infinity, Infinity, -Infinity, -Infinity];
        Util.axialAlignedBoundingBox(rect, matrix, box);
        const [x0, top, x1, bottom] = box;
        if (x0 < 0 || top < 0 || x1 > viewport.width || bottom > viewport.height || x1 <= x0 || bottom <= top) return;
        graphics.push({ kind, page: index, x0, top, x1, bottom });
      };
      for (let i = 0; i < ops.fnArray.length; i++) {
        const args = ops.argsArray[i];
        switch (ops.fnArray[i]) {
          case OPS.save: stack.push(matrix); break;
          case OPS.restore: matrix = stack.pop() ?? matrix; break;
          case OPS.transform: matrix = Util.transform(matrix, args); break;
          case OPS.beginMarkedContent:
          case OPS.beginMarkedContentProps: marks.push(args); break;
          case OPS.endMarkedContent: marks.pop(); break;
          case OPS.paintFormXObjectBegin: {
            stack.push(matrix);
            const [transform, rect] = args;
            if (transform) matrix = Util.transform(matrix, transform);
            // Word's inline EMF/WMF export uses a 72pt square scaled to the display size.
            if (rect && transform && marks.at(-1)?.[0] === "Span" && !marks.some(mark => mark[0] === "Artifact") &&
                Math.abs((rect[2] - rect[0]) * transform[0] - 72) < 0.1 &&
                Math.abs((rect[3] - rect[1]) * transform[3] - 72) < 0.1) add(rect, "metafile");
            break;
          }
          case OPS.paintFormXObjectEnd: matrix = stack.pop() ?? matrix; break;
          case OPS.paintImageXObject:
          case OPS.paintInlineImageXObject:
            if (marks.some(mark => figureMarks.has(mark[1])) && !marks.some(mark => mark[0] === "Artifact")) add([0, 0, 1, 1], "raster");
            break;
        }
      }
      page.cleanup();
    }
    return graphics;
  } finally {
    await task.destroy();
  }
}
