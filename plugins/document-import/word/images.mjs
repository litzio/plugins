import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Formats Windows GDI+ can draw; each becomes a PNG at twice its size, at most 4,000px, on white.
const DRAWN = new Set(["emf", "wmf", "jpg", "jpeg", "gif", "bmp", "tif", "tiff"]);

const SCRIPT = list => `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$i = 0
foreach ($line in [System.IO.File]::ReadAllLines('${list.replace(/'/g, "''")}')) {
  $p = $line.Split([char]9)
  try {
    $img = [System.Drawing.Image]::FromFile($p[0])
    try {
      $w = [double]$img.Width * 2; $h = [double]$img.Height * 2
      $s = [Math]::Min(1.0, 4000 / [Math]::Max($w, $h))
      $w = [Math]::Max(1, [int][Math]::Round($w * $s)); $h = [Math]::Max(1, [int][Math]::Round($h * $s))
      $bmp = New-Object System.Drawing.Bitmap($w, $h)
      try {
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.Clear([System.Drawing.Color]::White)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($img, 0, 0, $w, $h)
        $g.Dispose()
        $bmp.Save($p[1], [System.Drawing.Imaging.ImageFormat]::Png)
      } finally { $bmp.Dispose() }
    } finally { $img.Dispose() }
    [Console]::Out.WriteLine("ok $i")
  } catch { [Console]::Out.WriteLine("fail $i") }
  [Console]::Out.Flush()
  $i++
}
`;

// Starts preparing every picture. PNG files are used as they are; the others are drawn by one
// PowerShell run. The job reports progress and keeps each result until the document is saved.
export function startImages(images, media, { platform = process.platform } = {}) {
  const job = { total: images.length, done: 0, results: new Map(), finished: false, dir: null };
  const pending = [];
  for (const image of images) {
    const ext = image.part ? path.extname(image.part).slice(1).toLowerCase() : "";
    const bytes = image.part ? media(image.part) : null;
    if (!bytes) job.results.set(image.key, { error: image.part ? "원본 그림 파일이 없습니다." : "그림 파일이 없는 도형입니다." });
    else if (ext === "png" && bytes.subarray(0, 8).equals(PNG)) job.results.set(image.key, { png: bytes });
    else if (DRAWN.has(ext) && platform === "win32") { pending.push({ key: image.key, ext, bytes }); continue; }
    else job.results.set(image.key, { error: DRAWN.has(ext) ? ext.toUpperCase() + " 그림은 Windows에서만 바꿀 수 있습니다." : ext.toUpperCase() + " 그림은 옮기지 못합니다." });
    job.done++;
  }
  job.promise = pending.length ? draw(job, pending) : Promise.resolve();
  job.promise = job.promise.catch(() => {
    for (const p of pending) if (!job.results.has(p.key)) { job.results.set(p.key, { error: "그림을 PNG로 바꾸지 못했습니다." }); job.done++; }
  }).finally(() => { job.finished = true; });
  return job;
}

async function draw(job, pending) {
  job.dir = await mkdtemp(path.join(os.tmpdir(), "word-import-"));
  const lines = [];
  for (const [i, p] of pending.entries()) {
    p.src = path.join(job.dir, i + "." + p.ext);
    p.dst = path.join(job.dir, i + ".png");
    await writeFile(p.src, p.bytes);
    lines.push(p.src + "\t" + p.dst);
  }
  const list = path.join(job.dir, "list.txt");
  await writeFile(list, lines.join("\r\n"), "utf8");
  const exe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const child = spawn(exe, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(SCRIPT(list), "utf16le").toString("base64")], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  job.child = child;
  let buffered = "";
  const settle = async line => {
    const m = line.trim().match(/^(ok|fail) (\d+)$/);
    const p = m && pending[+m[2]];
    if (!p || job.results.has(p.key)) return;
    let result = { error: "그림을 PNG로 바꾸지 못했습니다." };
    if (m[1] === "ok") {
      const png = await readFile(p.dst).catch(() => null);
      result = png ? { png } : result;
    }
    job.results.set(p.key, result);
    job.done++;
  };
  const reads = [];
  child.stdout.on("data", chunk => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop();
    for (const line of lines) reads.push(settle(line));
  });
  await new Promise(resolve => { child.on("close", resolve); child.on("error", resolve); });
  if (buffered) reads.push(settle(buffered));
  await Promise.all(reads);
  for (const p of pending) if (!job.results.has(p.key)) { job.results.set(p.key, { error: "그림을 PNG로 바꾸지 못했습니다." }); job.done++; }
}

export async function disposeImages(job) {
  if (!job) return;
  job.child?.kill();
  await job.promise?.catch(() => {});
  if (job.dir) await rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

// Final result for one picture: PNG bytes, or the reason it could not be moved.
export function imageResult(job, key) {
  const r = job.results.get(key);
  if (r?.png && r.png.length > MAX_IMAGE_BYTES) return { error: "PNG가 10MB를 넘어 저장할 수 없습니다." };
  return r;
}
