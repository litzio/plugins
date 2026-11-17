import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
async function extract(pdfPath) {
  const pdfjsDir = path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
  const pdfjs = await import(pathToFileURL(path.join(pdfjsDir, "legacy/build/pdf.mjs")).href);
  const { getDocument, OPS } = pdfjs;
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({
    data,
    standardFontDataUrl: pdfjsDir.replaceAll("\\", "/") + "/standard_fonts/",
    cMapUrl: pdfjsDir.replaceAll("\\", "/") + "/cmaps/",
    cMapPacked: true,
    verbosity: 0,
    enableScripting: false
  }).promise;
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  function boxOf(m, x0, y0, x1, y1) {
    const pts = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const overlap = (a, b, pad) => a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];
  function cluster(boxes, pad = 3) {
    const out = [];
    for (const src of boxes) {
      let b = { box: [...src.box], n: 1, thin: src.thin ? 1 : 0 };
      for (let merged = true; merged; ) {
        merged = false;
        for (let i = 0; i < out.length; i++) {
          if (overlap(b.box, out[i].box, pad)) {
            const c = out.splice(i, 1)[0];
            b = {
              box: [Math.min(b.box[0], c.box[0]), Math.min(b.box[1], c.box[1]), Math.max(b.box[2], c.box[2]), Math.max(b.box[3], c.box[3])],
              n: b.n + c.n,
              thin: b.thin + c.thin
            };
            merged = true;
            break;
          }
        }
      }
      out.push(b);
    }
    return out;
  }
  const pages = [];
  for (let pno = 1; pno <= doc.numPages; pno++) {
    const page = await doc.getPage(pno);
    const [vx0, vy0, vx1, vy1] = page.view;
    const H = vy1 - vy0, W = vx1 - vx0;
    const top = (y) => H - (y - vy0);
    const ops = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const shapes = [], images = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(ctm);
        if (args[0]) ctm = mul(ctm, args[0]);
      } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.constructPath) {
        const [paintOp, , minMax] = args;
        if (paintOp === OPS.endPath || !minMax) continue;
        const b = boxOf(ctm, minMax[0], minMax[1], minMax[2], minMax[3]);
        const box = [b[0] - vx0, top(b[3]), b[2] - vx0, top(b[1])];
        const w = box[2] - box[0], h = box[3] - box[1];
        if (w * h > W * H * 0.8) continue;
        shapes.push({ box, thin: w < 1.5 || h < 1.5 });
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
        const b = boxOf(ctm, 0, 0, 1, 1);
        images.push([b[0] - vx0, top(b[3]), b[2] - vx0, top(b[1])]);
      }
    }
    const tables = [], figures = [...images];
    if (shapes.length <= 6e3) {
      for (const c of cluster(shapes)) {
        const w = c.box[2] - c.box[0], h = c.box[3] - c.box[1];
        if (c.n >= 6 && c.thin >= 4 && w > 80 && h > 15) tables.push(c.box);
        else if (w > 60 && h > 40) figures.push(c.box);
      }
    }
    const tc = await page.getTextContent({ disableNormalization: false });
    const fontName = (id) => {
      try {
        return page.commonObjs.get(id)?.name ?? id;
      } catch {
        return id;
      }
    };
    const words = [];
    let nchars = 0;
    for (const it of tc.items) {
      if (it.str === void 0) continue;
      nchars += it.str.replace(/\s/g, "").length;
      if (!it.str.trim()) continue;
      const t = it.transform;
      const size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
      const lead = it.str.length - it.str.trimStart().length;
      const x0 = t[4] - vx0 + (lead ? it.width * lead / it.str.length : 0);
      words.push({
        text: it.str,
        x0,
        x1: t[4] - vx0 + it.width,
        base: top(t[5]),
        top: top(t[5]) - size * 0.8,
        bottom: top(t[5]) + size * 0.2,
        size,
        font: fontName(it.fontName),
        upright: Math.abs(t[1]) < 0.01 && Math.abs(t[2]) < 0.01
      });
    }
    words.sort((a, b) => a.top - b.top || a.x0 - b.x0);
    const rows = [];
    for (const w of words) {
      const mid = (w.top + w.bottom) / 2;
      let row = null;
      for (let i = rows.length - 1; i >= Math.max(0, rows.length - 6); i--) {
        if (rows[i].top - 0.5 <= mid && mid <= rows[i].bottom + 0.5) {
          row = rows[i];
          break;
        }
      }
      if (row) {
        row.words.push(w);
        if (w.size >= row.size) {
          row.top = Math.min(row.top, w.top);
          row.bottom = Math.max(row.bottom, w.bottom);
          row.size = w.size;
        }
      } else rows.push({ top: w.top, bottom: w.bottom, size: w.size, words: [w] });
    }
    const raw = [];
    for (const r of rows) {
      const ws = r.words.sort((a, b) => a.x0 - b.x0);
      const segs = [[ws[0]]];
      for (const w of ws.slice(1)) {
        const cur = segs[segs.length - 1];
        if (w.x0 - cur[cur.length - 1].x1 > 14) segs.push([w]);
        else cur.push(w);
      }
      for (const seg of segs) {
        const main = Math.max(...seg.map((w) => w.size));
        const base = Math.max(...seg.filter((w) => w.size === main).map((w) => w.base));
        const spans = [];
        seg.forEach((w, i) => {
          let flags = /bold/i.test(w.font) ? 16 : 0;
          if (w.size < main * 0.8 && w.base < base - 1) flags |= 1;
          const prev = seg[i - 1];
          const gap = prev ? w.x0 - prev.x1 : 0;
          const needSpace = prev && gap > 0.12 * main && !/\s$/.test(prev.text) && !/^\s/.test(w.text);
          const text = (needSpace ? " " : "") + w.text;
          const last = spans[spans.length - 1];
          if (last && last.flags === flags && Math.abs(last.size - w.size) < 0.3) last.text += text;
          else spans.push({ text, size: w.size, flags, font: w.font });
        });
        raw.push({
          bbox: [seg[0].x0, Math.min(...seg.map((w) => w.top)), seg[seg.length - 1].x1, Math.max(...seg.map((w) => w.bottom))],
          spans
        });
      }
    }
    pages.push({ width: W, height: H, raw, tables, figures, nchars });
    page.cleanup();
  }
  const toc = [];
  const walk = (items, level) => {
    for (const it of items ?? []) {
      toc.push([level, it.title]);
      walk(it.items, level + 1);
    }
  };
  walk(await doc.getOutline(), 1);
  await doc.destroy();
  return { pages, toc };
}
export {
  extract
};
