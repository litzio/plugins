import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The text layer of the PDF Word exported, page by page: `items` without headers and footers (Word
// marks them as artifacts) and those apart in `artifacts`, and the heading bookmarks with where
// they point.
export async function readPdfText(file) {
  const dir = path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
  const pdfjs = await import(pathToFileURL(path.join(dir, "legacy/build/pdf.mjs")).href);
  const task = pdfjs.getDocument({
    data: new Uint8Array(await readFile(file)),
    standardFontDataUrl: dir.replaceAll("\\", "/") + "/standard_fonts/",
    cMapUrl: dir.replaceAll("\\", "/") + "/cmaps/",
    cMapPacked: true, verbosity: 0, enableScripting: false, isEvalSupported: false,
  });
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
