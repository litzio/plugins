import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hash } from "./convert.js";
import { protectedTokens } from "./tokens.js";
export function operatorCoverage(operators,OPS) {
  let rasterObjects=0,vectorPaints=0;
  const rasterOps=new Set(Object.entries(OPS).filter(([name])=>/^paint.*Image/.test(name)).map(([,value])=>value));
  const vectorOps=new Set(["stroke","closeStroke","fill","eoFill","fillStroke","eoFillStroke","closeFillStroke","closeEOFillStroke","shadingFill","rawFillPath"].map((name)=>OPS[name]).filter(Number.isInteger));
  for (const [index,operation] of operators.fnArray.entries()) {
    if (rasterOps.has(operation)) rasterObjects++;
    if (vectorOps.has(operation)) vectorPaints++;
    if (operation === OPS.constructPath) {
      // PDF.js 6 stores the painting opcode in constructPath's first argument.
      // Counting only standalone fill/stroke silently misses optimized paths.
      const paint=operators.argsArray[index]?.[0];
      if (vectorOps.has(paint)) vectorPaints++;
      else if (paint !== OPS.endPath) throw new Error("unknown-path-paint");
    }
  }
  return {rasterObjects,vectorPaints};
}

// These structures can execute paint outside the page's flat operator list.
// Do not interpret their programs or infer that an unobserved program is empty.
export function assertInspectablePaints(operators,OPS,font) {
  const nested=new Set(["paintFormXObjectBegin","paintFormXObjectEnd","beginGroup","endGroup",
    "setFillColorN","setStrokeColorN","beginAnnotation","endAnnotation","paintXObject",
    "beginInlineImage","beginImageData","endInlineImage"].map((name)=>OPS[name]).filter(Number.isInteger));
  const inspectFont=(id)=> {
    const value=font(id);
    if (!value || typeof value.isType3Font !== "boolean" || value.isType3Font || value.isInvalidPDFjsFont === true)
      throw new Error("unassessed-font-program");
  };
  for (const [index,operation] of operators.fnArray.entries()) {
    if (nested.has(operation)) throw new Error("unassessed-nested-paint");
    const args=operators.argsArray[index];
    if (operation === OPS.setFont) inspectFont(args?.[0]);
    if (operation === OPS.setGState) for (const [key,value] of args?.[0] ?? []) {
      if (key === "Font") inspectFont(value?.[0]);
      if (key === "SMask") throw new Error("unassessed-soft-mask");
    }
  }
}
export async function readPdf(bytes, { coverage = false } = {}) {
  const { getDocument, GlobalWorkerOptions, version, OPS } = await import(
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
  const pages = [], coveragePages = [];
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
      if (coverage) {
        let rasterObjects=0, vectorPaints=0, operatorScan="complete";
        try {
          const operators=await page.getOperatorList();
          ({rasterObjects,vectorPaints}=operatorCoverage(operators,OPS));
          assertInspectablePaints(operators,OPS,(id)=>page.commonObjs.get(id));
          // Appearance streams may be separate from the display operator list.
          // Even a hidden/print-only or appearance-less annotation stays human.
          if (pdf.isPureXfa || (await page.getAnnotations({intent:"any"})).length) throw new Error("unassessed-annotation");
        } catch { operatorScan="unavailable"; }
        coveragePages.push({pageNo,textLayer:items.length ? "available" : "unavailable",operatorScan,rasterObjects,vectorPaints,
          notCompared:[...(!items.length ? ["missing-text-layer"] : []),...(operatorScan !== "complete" ? ["operator-scan-unavailable"] : []),...(rasterObjects ? ["raster-content"] : []),...(vectorPaints ? ["vector-painted-content"] : [])]});
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
    const evidence = {
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
    return coverage ? {evidence,pageCoverage:{schemaVersion:"1.3.0",pdfSha256:hash(bytes),reader:{name:"pdfjs-dist",version},method:"pdfjs-6.5.438-text-and-optimized-paint-v2",pages:coveragePages,
      semanticLimits:["heading-hierarchy","reading-order","meaning"],regionPrecision:"whole-page"}} : evidence;
  } finally {
    await task.destroy();
  }
}
