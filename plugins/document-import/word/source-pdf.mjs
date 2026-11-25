import { spawn } from "node:child_process";
import { rename, unlink, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;
const quote = s => "'" + s.replace(/'/g, "''") + "'";

// Word runs in its own new instance. The instance is told apart from the user's Word by the one
// WINWORD process that appeared while it started; when there is not exactly one, nothing is touched.
const SCRIPT = (docx, pdf) => `
$ErrorActionPreference = 'Stop'
function Say($s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
$before = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
try { $word = New-Object -ComObject Word.Application } catch { Say 'fail no-word'; exit 2 }
$mine = @(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id })
if ($mine.Count -ne 1) {
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  Say 'fail instance'; exit 3
}
$p = $mine[0]
Say ('pid ' + $p.Id + ' ' + $p.StartTime.ToUniversalTime().Ticks)
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open(${quote(docx)}, $false, $true, $false)
  Say 'opened'
  $doc.ExportAsFixedFormat(${quote(pdf)}, 17, $false, 0, 0, 0, 0, 0, $false, $true, 1, $true, $true, $false)
  Say 'exported'
  $doc.Close($false)
} catch {
  Say 'fail export'
} finally {
  try { $word.Quit() } catch {}
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force }
  Say 'closed'
}
`;

const powershell = () => path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const run = script => spawn(powershell(), ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });

// Ends the Word process this export started, and only it: the PID must still have the start time
// the export reported.
function stopWord(word) {
  if (!word) return Promise.resolve();
  const child = run(`Get-Process -Id ${word.pid} -ErrorAction SilentlyContinue | Where-Object { $_.StartTime.ToUniversalTime().Ticks -eq ${word.ticks} } | Stop-Process -Force`);
  return new Promise(resolve => { child.on("close", resolve); child.on("error", resolve); });
}

const REASONS = {
  "no-word": "Word를 찾을 수 없어 원본 쪽을 준비하지 못했습니다.",
  instance: "Word를 따로 띄우지 못해 원본 쪽을 준비하지 못했습니다.",
  export: "Word가 워드 문서를 PDF로 내보내지 못해 원본 쪽을 준비하지 못했습니다.",
  timeout: "Word가 10분 안에 PDF를 내보내지 못해 원본 쪽을 준비하지 못했습니다.",
  platform: "Word가 있는 Windows에서만 원본 쪽을 준비할 수 있습니다.",
};

// Exports the Word document to PDF next to the result. The PDF appears under its final name only
// when Word finished writing it. Resolves {ok} or {error}; never rejects.
export async function exportPdf(docx, pdf, { timeout = EXPORT_TIMEOUT_MS, platform = process.platform, signal } = {}) {
  if (platform !== "win32") return { error: REASONS.platform };
  const pending = pdf.replace(/\.pdf$/i, "") + ".pending-" + randomUUID() + ".pdf";
  const child = run(SCRIPT(docx, pending));
  let word = null, failure = null, exported = false, buffered = "";
  const read = line => {
    const m = line.trim().match(/^pid (\d+) (\d+)$/);
    if (m) word = { pid: +m[1], ticks: m[2] };
    else if (line.trim() === "exported") exported = true;
    else if (line.startsWith("fail ")) failure = line.trim().slice(5).split(" ")[0];
  };
  child.stdout.on("data", chunk => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop();
    lines.forEach(read);
  });
  let timedOut = false;
  const stop = () => { timedOut = true; child.kill(); };
  const timer = setTimeout(stop, timeout);
  signal?.addEventListener("abort", stop, { once: true });
  const code = await new Promise(resolve => { child.on("close", resolve); child.on("error", () => resolve(-1)); });
  clearTimeout(timer);
  signal?.removeEventListener("abort", stop);
  if (buffered) read(buffered);
  // The script did not get to close its Word: end that process only.
  if (timedOut) await stopWord(word);
  const written = exported && !timedOut && (await stat(pending).catch(() => null))?.size > 0;
  if (!written) {
    await unlink(pending).catch(() => {});
    if (signal?.aborted) return { error: "cancelled" };
    return { error: REASONS[timedOut ? "timeout" : failure] || (code === -1 ? REASONS["no-word"] : REASONS.export) };
  }
  try { await rename(pending, pdf); }
  catch { await unlink(pending).catch(() => {}); return { error: "원본 PDF를 결과 폴더에 저장하지 못했습니다." }; }
  return { ok: true };
}
