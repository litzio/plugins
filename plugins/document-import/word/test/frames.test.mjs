import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pageFrames, textLines } from "../frames.mjs";
import { prepareSource } from "../source.mjs";
import { sha } from "../output.mjs";

const item = (str, x0, top, x1, bottom = top + 10) => ({ str, x0, x1, top, bottom });
const page = (artifacts, items = []) => ({ width: 612, height: 792, items, artifacts });

test("a header and a page number footer at the same place on every page are hatched", () => {
  const pages = [1, 2, 3].map(n => page([item("합성 표본 머리글", 72, 40, 150), item(String(n), 300, 760, 300 + 5 * String(n).length)]));
  const frames = pageFrames(pages, []);
  assert.equal(frames.length, 6);
  assert.deepEqual(frames.filter(f => f.page === 2).map(f => f.box), [
    { page: 2, x0: 72, top: 40, x1: 150, bottom: 50 },
    { page: 2, x0: 300, top: 760, x1: 305, bottom: 770 },
  ]);
  assert.ok(frames.every(f => f.kind === "margin"));
});

test("a line on one page only, in the middle of the page, or under a placed block is not hatched", () => {
  const pages = [
    page([item("표지 머리글", 72, 40, 150), item("가운데 artifact", 72, 400, 150)]),
    page([item("가운데 artifact", 72, 400, 150), item("머리글", 72, 60, 150)]),
    page([item("머리글", 72, 60, 150)]),
  ];
  // The second page's header line is covered by a placed table box.
  const blocks = [{ boxes: [{ page: 1, x0: 70, top: 55, x1: 540, bottom: 300 }] }];
  assert.deepEqual(pageFrames(pages, blocks), []);
  // Without the block the header at 60 comes back on two pages.
  assert.deepEqual(pageFrames(pages, []).map(f => f.page), [1, 2]);
});

test("only artifact text counts: an untouched table of contents line in the band is not a header", () => {
  const toc = n => item("3." + n + " 항목 ........ " + n, 72, 73, 540);
  const pages = [1, 2, 3].map(n => page([], [toc(n)]));
  assert.deepEqual(pageFrames(pages, []), []);
});

test("a header with text on the left and on the right becomes two pieces", () => {
  assert.deepEqual(textLines([item("문서 이름", 72, 40, 130), item("개정 3", 480, 41, 540, 50), item("판", 131, 40, 140)]), [
    { x0: 72, x1: 140, top: 40, bottom: 50 },
    { x0: 480, x1: 540, top: 41, bottom: 50 },
  ]);
});

// A two-page PDF like Word's: a header and a page number as Artifact marked content, a body line.
function taggedPdf() {
  const content = n => `/Artifact <</Type /Pagination>> BDC BT /F1 10 Tf 72 742 Td (Sample header) Tj ET EMC\nBT /F1 10 Tf 72 500 Td (Body line ${n}) Tj ET\n/Artifact <</Type /Pagination>> BDC BT /F1 10 Tf 300 40 Td (${n}) Tj ET EMC`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const n of [1, 2]) {
    const stream = content(n);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = "%PDF-1.7\n";
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

test("a source prepared before headers were looked for gets them from the saved PDF, without Word", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "word-import-frames-"));
  try {
    const out = { file: path.join(dir, "x.docx"), side: path.join(dir, "x.word-source.json"), pdf: path.join(dir, "x.source.pdf") };
    const pdf = taggedPdf();
    await writeFile(out.pdf, pdf);
    const body = { path: [0], kind: "paragraph", page: 0, boxes: [{ page: 0, x0: 72, top: 280, x1: 140, bottom: 295 }] };
    const side = { word: { sha256: "w" }, revision: "r1", warnings: [],
      source: { pdf: { name: "x.source.pdf", sha256: sha(pdf), wordSha256: "w" }, revision: "r1", pages: [{ width: 612, height: 792 }, { width: 612, height: 792 }], blocks: [body], stats: {} } };
    await writeFile(out.side, JSON.stringify(side));
    const exporter = () => { throw new Error("Word must not run"); };
    const r = await prepareSource(out, { converted: null, pathsFor: () => { throw new Error("no paths needed"); }, exporter });
    assert.equal(r.state, "ready");
    assert.deepEqual(r.source.excluded.map(e => [e.page, e.kind, e.box.top < 396 ? "top" : "bottom"]),
      [[0, "margin", "top"], [0, "margin", "bottom"], [1, "margin", "top"], [1, "margin", "bottom"]]);
    assert.deepEqual(r.source.blocks, [body]);
    const saved = JSON.parse(await readFile(out.side, "utf8"));
    assert.deepEqual(saved.source.excluded, r.source.excluded);
    assert.deepEqual({ ...saved, source: { ...saved.source, excluded: undefined } }, { ...side, source: { ...side.source, excluded: undefined } });
    // Opening again uses what was written.
    assert.deepEqual((await prepareSource(out, { converted: null, pathsFor: null, exporter })).source, saved.source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
