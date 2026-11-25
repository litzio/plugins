import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readDocx } from "../docx.mjs";
import { convert } from "../rules.mjs";
import { startImages, imageResult, disposeImages } from "../images.mjs";

const word = readDocx(readFileSync(new URL("./fixtures/sample.docx", import.meta.url)));
const { images } = convert(word, { limits: { tableRows: 500, tableColumns: 32, tableCells: 8000 } });

test("PNG pictures are used as they are; EMF waits for Windows", async () => {
  const job = startImages(images, word.media, { platform: "linux" });
  await job.promise;
  assert.equal(imageResult(job, "figure-001").png.subarray(1, 4).toString(), "PNG");
  assert.match(imageResult(job, "figure-002").error, /Windows/);
});

// Needs Windows PowerShell and GDI+; not run elsewhere.
test("EMF becomes a PNG twice its size (Windows only)", { skip: process.platform !== "win32" }, async () => {
  const job = startImages(images, word.media);
  await job.promise;
  const png = imageResult(job, "figure-002").png;
  assert.ok(png, imageResult(job, "figure-002").error);
  // The 200×100 picture's frame is inclusive, so GDI+ may count one more pixel.
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.ok(Math.abs(w - 400) <= 4 && Math.abs(h - 200) <= 4, w + "×" + h);
  assert.equal(job.done, 2);
  await disposeImages(job);
});
