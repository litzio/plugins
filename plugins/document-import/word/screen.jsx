import { WARNING_KINDS } from "./rules.mjs";
import { rememberFolder } from "../shared/recent-folders.mjs";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import Flow, { FlowToggle } from "../shared/flow.jsx";
import Compare from "../shared/compare.jsx";

const STEPS = ["구조 읽기", "그림 만들기", "문서 저장"];
const GROUPS = WARNING_KINDS.map(([id, title]) => ({ id, title, tone: "warning" }));
const REPLACE = {
  title: "다시 변환",
  message: "워드 문서를 다시 변환해 지금 문서를 바꿉니다. 문서에서 고친 내용은 사라집니다. 새 문서를 저장하면 이전 문서를 지우고, 실패하면 이전 문서를 남깁니다.",
  confirmLabel: "다시 변환",
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const LEGEND = ["heading", "paragraph", "list", "table", "figure", "margin"];
const key = path => path.join(".");

function Screen({ React, ui, invoke, pickPath, saveDocument, openDocument, confirm, request, onHome }) {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  const [seen, setSeen] = useState(new Set());
  const markSeen = React.useCallback(id => setSeen(old => old.has(id) ? old : new Set([...old, id])), []);
  const [expanded,setExpanded] = useState(false);
  const flowId = React.useId();
  const [file, setFile] = useState(null);
  const [saved, setSaved] = useState(null);
  const [run, setRun] = useState(null); // {step, progress, failed}
  const [error, setError] = useState("");
  const [target, setTarget] = useState(null);
  const [viewState, setViewState] = useState(null);
  const [source, setSource] = useState(null); // {state, reason, source} from the host
  const [pdf, setPdf] = useState(null);
  const metrics = useRef({});
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const busy = !!run && !run.failed;
  const done = !!file && !run && !!saved;
  const warnings = saved?.warnings || [];
  // Source boxes carry the first place to check of their block; every place stays in the order.
  const blocks = useMemo(() => {
    const first = new Map();
    for (const w of warnings) if (w.path && !first.has(key(w.path))) first.set(key(w.path), w);
    return (source?.source?.blocks || []).map(b => ({ ...b, id: key(b.path), warning: first.has(key(b.path)) ? { reason: first.get(key(b.path)).detail } : undefined }));
  }, [source, saved]);
  const checks = useMemo(() => {
    const ids = new Set(blocks.map(b => b.id));
    return warnings.map((w,flowId) => ({ flowId, blockId: w.path && ids.has(key(w.path)) ? key(w.path) : null, path: w.path, reason: w.label + " · " + w.detail }));
  }, [blocks]);
  const compareState = useCallback(s => {
    setViewState(s.state);
    if (s.state !== "ready" || !metrics.current.compareFrom) return;
    performance.measure("word-import-compare-ready", { start: metrics.current.compareFrom });
    metrics.current.compareFrom = null;
  }, []);

  // After conversion, or on opening a converted document: the source pages come when ready.
  useEffect(() => {
    if (!done) return;
    let gone = false, task = null;
    (async () => {
      let r;
      for (;;) {
        r = await invoke("source", { id: file.id });
        if (gone) return;
        setSource(r);
        if (r.state !== "preparing") break;
        await wait(1000);
        if (gone) return;
      }
      if (r.state !== "ready") return;
      const { base64 } = await invoke("sourcePdf", { id: file.id });
      if (gone) return;
      const binary = atob(base64), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      task = pdfjs.getDocument({ data: bytes, verbosity: 0, enableScripting: false });
      const doc = await task.promise;
      if (gone) return;
      setPdf(doc);
    })().catch(() => { if (!gone) setSource({ state: "failed", reason: "원본 쪽을 불러오지 못했습니다." }); });
    return () => { gone = true; task?.destroy(); setPdf(null); setSource(null); };
  }, [done, file?.id, saved?.revision]);

  useEffect(() => { open(request.path); }, []);

  function home() {
    if (!busy) onHome();
  }

  async function choose() {
    let picked;
    try { picked = await pickPath({ kind: "file", extensions: [".docx"] }); }
    catch (e) {
      if (e?.name === "AbortError") return;
      setError("워드 문서를 고를 수 없습니다. 열린 폴더가 없다면 왼쪽 탐색기의 ‘폴더 열기’에서 워드 문서가 든 폴더를 먼저 여세요.");
      return;
    }
    if (picked) await open(picked.path);
  }

  async function open(path) {
    setError(""); setTarget(null); setViewState(null);
    let f;
    try { f = await invoke("load", { path }); }
    catch (e) {
      const message = e.message || "워드 문서를 읽을 수 없습니다.";
      if (file) setError(message); else onHome(message);
      return;
    }
    try { rememberFolder(f.folder); } catch {}
    setExpanded(false);
    setSeen(new Set());
    setFile(f);
    metrics.current = { opened: performance.now(), compareFrom: performance.now() };
    if (f.saved || f.documentOnly) { setSaved(f.saved); setRun(null); return; }
    await convert(f, false);
  }

  async function convert(f, replacing) {
    setExpanded(false);
    setSeen(new Set());
    setSaved(null); setTarget(null); setViewState(null); setError("");
    let step = 0;
    const stage = (index, progress) => { step = index; setRun({ step: index, progress }); };
    const started = performance.now();
    try {
      stage(0);
      const read = await invoke("convert", { id: f.id });
      stage(1, read.images ? { value: read.ready / read.images, label: "그림 " + read.ready + " / " + read.images } : undefined);
      const imagesStarted = performance.now();
      for (;;) {
        const p = await invoke("progress", { id: f.id });
        if (p.total) stage(1, { value: p.done / p.total, label: "그림 " + p.done + " / " + p.total });
        if (p.finished) break;
        await wait(250);
        if (!alive.current) return;
      }
      const imageMs = performance.now() - imagesStarted;
      stage(2);
      const plan = await invoke("plan", { id: f.id });
      const images = [];
      for (const key of plan.images) images.push(await invoke("image", { id: f.id, key }));
      if (replacing) await invoke("backup", { id: f.id });
      const saveStarted = performance.now();
      const receipt = await saveDocument({ name: f.name.replace(/\.docx$/i, ".md"), folder: f.outputFolder, authoring: plan.authoring, images });
      const saveMs = performance.now() - saveStarted;
      const data = await invoke("mapping", { id: f.id, revision: receipt.revision });
      performance.measure("word-import-conversion", { start: started, detail: { readMs: read.readMs, imageMs, saveMs, imageBytes: plan.imageBytes, blocks: plan.authoring.inputs[0].blocks.length } });
      if (!alive.current) return;
      setFile({ ...f, documentOnly: false });
      setSaved(data);
      setRun(null);
      metrics.current = { opened: performance.now(), compareFrom: performance.now() };
      if (data.cleanupError) setError(data.cleanupError);
    } catch (e) {
      if (!alive.current) return;
      setRun({ step, failed: true });
      setError(e.message || STEPS[step] + "에 실패했습니다.");
    }
  }

  async function reconvert() {
    if (busy || !(await confirm(REPLACE))) return;
    await convert(file, true);
  }

  async function openSaved() {
    try {
      const r = await openDocument({ path: file.document });
      setError(r.status === "opened" ? "" : "문서를 열지 못했습니다.");
    } catch { setError("문서를 열지 못했습니다."); }
  }

  function show(w) {
    if (!saved) return;
    metrics.current.clicked = { at: performance.now(), path: w.path.join(".") };
    const next = { revision: saved.revision, path: w.path };
    // Pressing the same line again: clear the target first so the view moves to it again.
    if (target && target.path.join(".") === next.path.join(".")) {
      setTarget(null);
      requestAnimationFrame(() => setTarget(next));
    } else setTarget(next);
  }

  const chooseButton = (primary) => <ui.Button variant={primary ? "default" : "outline"} disabled={busy} onClick={choose}>워드 문서 고르기</ui.Button>;

  if (!file) return null;

  if (run) {
    return (
      <ui.ScreenLayout width="full" back={{ label: "변환한 문서", onBack: home, disabled: busy }} description={file.name}
        status={<ui.Status tone={run.failed ? "error" : "progress"} label={run.failed ? STEPS[run.step] + " 실패" : STEPS[run.step] + " 중"} />}
        actions={run.failed ? chooseButton(true) : undefined}>
        <Flow React={React} ui={ui} mode="run" kind="word" phase={STEPS[run.step]} failed={run.failed} />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", margin: "var(--space-8) 0" }}>
          <ui.Steps steps={STEPS} current={run.step} />
          {run.failed ? <ui.Notice tone="error">{error}</ui.Notice> : <ui.Progress value={run.progress?.value} label={run.progress?.label || STEPS[run.step]} />}
        </div>
      </ui.ScreenLayout>
    );
  }

  const flow = {kind:"word", documentOnly:!saved, source:source?.state === "ready" && !pdf ? "preparing" : source?.state, viewed:seen.size > 0, remaining:warnings.filter((_,i)=>!seen.has(i)).length};
  const comparing = !!pdf && source?.state === "ready";
  const items = warnings.map((w, i) => ({ id: String(i), label: w.label, details: [w.detail], group: w.kind }));
  const notice = !saved ? "확인할 곳 목록이 없습니다. 다시 변환하면 목록을 만듭니다."
    : saved.sourceMissing ? "원본 워드 문서가 없습니다. 저장된 문서와 확인할 곳만 볼 수 있습니다."
      : saved.sourceChanged ? "변환한 뒤 원본 워드 문서가 바뀌었습니다. 다시 변환하면 새 내용으로 만듭니다."
        : viewState === "stale-target" ? "변환한 뒤 문서가 바뀌어 확인할 곳으로 이동할 수 없습니다. 다시 변환하면 새로 연결합니다."
          : viewState === "target-not-found" ? "문서에서 이 블록을 찾을 수 없습니다." : "";
  return (
    <ui.ScreenLayout fillHeight back={{ label: "변환한 문서", onBack: home }} description={file.name}
      status={<ui.Status tone={saved ? (warnings.length ? "warning" : "ok") : "neutral"} label={saved ? "변환 완료 · 확인할 곳 " + warnings.length : "확인할 곳 목록 없음"} />}
      actions={<>
        <FlowToggle React={React} ui={ui} state={flow} open={expanded} controls={flowId} toggle={()=>setExpanded(!expanded)} />
        <ui.Button onClick={openSaved}>문서 열기</ui.Button>
        <ui.Button variant="destructive" disabled={!!saved?.sourceMissing} onClick={reconvert}>다시 변환</ui.Button>
        {chooseButton(false)}
      </>}>
      <style>{`
.word-import-pair{display:flex;gap:var(--space-4);flex:1;min-height:0}
.word-import-checks{flex:0 0 320px;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:var(--space-2)}
.word-import-doc{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
@media (max-width:800px){.word-import-pair{flex-direction:column}.word-import-checks{flex:0 0 auto;max-height:40%}}
`}</style>
      <Flow React={React} ui={ui} mode="compare" {...flow} expanded={expanded} controls={flowId} />
      {error && <ui.Notice tone="error">{error}</ui.Notice>}
      {notice && <ui.Notice tone="warning">{notice}</ui.Notice>}
      {comparing ? <Compare onCheckViewed={markSeen} React={React} ui={ui} pdf={pdf} pages={source.source.pages} blocks={blocks}
        excluded={source.source.excluded} document={file.document} revision={source.source.revision}
        checks={checks} legend={LEGEND} sourceLabel="원본 쪽" onViewState={compareState} /> : <>
      {(source?.state === "preparing" || source?.state === "ready") && <div><ui.Status tone="progress" label="원본 쪽 준비 중" /></div>}
      {source?.state === "failed" && <ui.Notice tone="warning">{source.reason}</ui.Notice>}
      <div className="word-import-pair">
        <section className="word-import-checks" aria-label="확인할 곳">
          <h2 className="type-section-title">확인할 곳</h2>
          {saved && (items.length
            ? <ui.ItemList items={items} groups={GROUPS} onOpen={item => { markSeen(+item.id); show(warnings[+item.id]); }} />
            : <ui.EmptyState title="확인할 곳이 없습니다" description="워드 문서의 모든 내용을 그대로 옮겼습니다." />)}
        </section>
        <div className="word-import-doc">
          <ui.DocumentView path={file.document} height="fill" label="변환된 문서"
            target={target ? { ...target, highlight: true } : undefined}
            onStateChange={s => {
              setViewState(s.state);
              if (s.state === "ready" && metrics.current.opened) {
                performance.measure("word-import-document-ready", { start: metrics.current.opened });
                metrics.current.opened = null;
              }
            }}
            onVisibleBlockLayoutChange={layout => {
              const c = metrics.current.clicked;
              if (c && layout.blocks.some(b => b.path.join(".") === c.path && b.top >= 0 && b.top < layout.height)) {
                performance.measure("word-import-target", { start: c.at, detail: { path: c.path } });
                metrics.current.clicked = null;
              }
            }} />
        </div>
      </div>
      </>}
    </ui.ScreenLayout>
  );
}
export { Screen as default };
