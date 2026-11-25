// Reports which pdf.js document signals a PDF carries, one JSON line per file.
// Usage: node pdfjs-probe.mjs <file.pdf> [...]
// Prints counts only, never page text, so results can be shared for copyrighted inputs.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

const top = (counts, n = 16) => Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n));

for (const file of process.argv.slice(2)) {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
  const doc = await task.promise;
  const optional = async (read) => { try { return await read(); } catch { return null; } };
  const metadata = await optional(() => doc.getMetadata());
  const outline = await optional(() => doc.getOutline());
  const labels = await optional(() => doc.getPageLabels());
  const layers = await optional(() => doc.getOptionalContentConfig());
  const attachments = await optional(() => doc.getAttachments());
  const fields = await optional(() => doc.getFieldObjects());
  const links = { internal: 0, external: 0, other: 0 };
  const roles = {};
  let taggedPages = 0, imagePages = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    for (const a of await page.getAnnotations()) {
      if (a.subtype !== "Link") continue;
      if (a.dest) links.internal++; else if (a.url) links.external++; else links.other++;
    }
    const tree = await optional(() => page.getStructTree());
    if (tree?.children?.length) {
      taggedPages++;
      const walk = (node) => { if (node.role) roles[node.role] = (roles[node.role] ?? 0) + 1; (node.children ?? []).forEach(walk); };
      walk(tree);
    }
    const ops = await page.getOperatorList();
    if (ops.fnArray.some((fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject)) imagePages++;
    page.cleanup();
  }
  const countOutline = (items) => (items ?? []).reduce((n, item) => n + 1 + countOutline(item.items), 0);
  console.log(JSON.stringify({
    file: path.basename(file),
    pages: doc.numPages,
    producer: metadata?.info?.Producer ?? null,
    outlineEntries: countOutline(outline),
    pageLabels: labels ? { first: labels[0], differsFromIndex: labels.some((label, i) => label !== String(i + 1)) } : null,
    taggedPages,
    structureRoles: top(roles),
    links,
    imagePages,
    layers: layers ? [...layers].length : 0,
    attachments: attachments ? Object.keys(attachments).length : 0,
    formFields: fields ? Object.keys(fields).length : 0,
  }));
  await task.destroy();
}
