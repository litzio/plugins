import { checkSaveSize } from "./save-size.mjs";
import { statusLabel, statusAction } from './document-status.mjs';
import { imageKeys, imageReceipt } from "./output.mjs";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import PagePicker from "./page-picker.jsx";
import {blockActions} from "./block-actions.mjs";
import Flow, { FlowToggle } from "../shared/flow.jsx";
import Compare from "../shared/compare.jsx";
import { togglePageRange, readPageTitles, applyPageSuggestion } from "./page-selection.mjs";
import { authoring } from "./authoring.mjs";
import { references } from "./corrections.mjs";
import { rememberFolder } from "../shared/recent-folders.mjs";
const legend = ["heading", "paragraph", "list", "table", "figure", "footnote", "margin"];
const none = [];
function exclusionSummary(pages) {
  const ranges = [];
  for (const p of [...pages].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && p === last[1] + 1) last[1] = p;
    else ranges.push([p, p]);
  }
  return ranges.length > 5
    ? pages.size + "쪽 제외"
    : ranges.map(([a, b]) => (a === b ? a : a + "–" + b)).join(", ") +
        "쪽 제외";
}
function Screen({
  React,
  ui,
  invoke,
  pickPath,
  saveDocument,
  openDocument,
  confirm,
  request,
  onHome,
}) {
  const { useState, useRef, useEffect, useMemo } = React;
  const [seen, setSeen] = useState(new Set());
  const markSeen = React.useCallback(id => setSeen(old => old.has(id) ? old : new Set([...old, id])), []);
  const [expanded,setExpanded] = useState(false);
  const flowId = React.useId();
  const compare = useRef(null);
  const [selection, setSelection] = useState([]), [splitting, setSplitting] = useState(false),
    [undoCount, setUndoCount] = useState(0), [reloadKey, setReloadKey] = useState(0),
    [actionHelp, setActionHelp] = useState(null);
  const historyId = useRef(crypto.randomUUID()), editing = useRef(false), selectionAnchor = useRef(null);
  const [documentStatus,setDocumentStatus]=useState(undefined);
  const [status, setStatus] = useState(""),
    [conversion, setConversion] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState(null),
    [pdf, setPdf] = useState(null),
    [result, setResult] = useState(null),
    [mapping, setMapping] = useState(null),
    [stale, setStale] = useState(false),
    [cached, setCached] = useState(false),
    [missingMapping, setMissingMapping] = useState(false);
  useEffect(() => { load(request.path, request.cachedOnly); }, []);
  const [pageTitles, setPageTitles] = useState([]);
  const replacementApproved = useRef(false), pickerSession = useRef(null);
  const [pickerHelp, setPickerHelp] = useState(false);
  useEffect(()=>()=>{if(pickerSession.current)pickerSession.current.active=false;},[]);
  const [picking, setPicking] = useState(false),
    [excludedPages, setExcludedPages] = useState(new Set());
  const anchor = useRef(null),
    metrics = useRef({});
  useEffect(
    () => () => {
      pdf?.loadingTask.destroy();
    },
    [pdf],
  );
  const warnings = mapping?.blocks.filter(b=>b.warning) || [];
  const checks = useMemo(() => warnings.map(b => ({flowId: b.id, blockId: b.id, reason: b.warning.reason})), [mapping]);
  const chosen = mapping?.blocks.filter(b => selection.includes(b.id)) || [];
  const canEdit = !!mapping && !stale;
  function actionItems(blocks,focusSource=false) {
    return blockActions(blocks,mapping?.blocks||[],mapping?.snapshotNodes||[]).map(a=>({...a,icon:null,
      disabled:a.disabled||busy||stale,
      disabledReason:a.action==='merge'&&a.disabled
        ? a.disabledReason+' 원본 상자 하나를 누른 뒤 Shift를 누른 채 다른 상자를 눌러 범위를 고르세요. 키보드로는 Enter나 Space로 첫 상자를 고르고, 다른 상자에 초점을 옮겨 Shift+Enter 또는 Shift+Space를 누르세요.'
        : a.disabledReason,
      run:()=>{
        if(a.action==='split') {setSelection(blocks.map(b=>b.id));compare.current?.pick(blocks[0]);setSplitting(true);}
        else return correct(a.action,a.extra,blocks,focusSource);
      }}));
  }
  const tools=actionItems(chosen),kindTools=tools.filter(a=>a.action==='kind'||a.action==='title');
  const kindDisabled=kindTools.every(a=>a.disabled), titleTool=kindTools.find(a=>a.action==='title');
  const kindHelp=kindDisabled?kindTools[0].disabledReason:titleTool.disabled?'문서 제목: '+titleTool.disabledReason:null;
  const actionTipStyle={position:'absolute',top:'100%',left:0,zIndex:3,background:'var(--id-color-surface)',padding:'var(--space-2)',width:240};
  function toolButton(a) {
    return <span key={a.id} tabIndex={a.disabled?0:undefined} style={{position:'relative'}}
      onMouseEnter={()=>setActionHelp(a.id)} onMouseLeave={()=>setActionHelp(null)} onFocus={()=>setActionHelp(a.id)} onBlur={()=>setActionHelp(null)}>
      <ui.Button disabled={a.disabled} onClick={a.run}>{a.label}</ui.Button>
      {(a.disabled||a.help)&&actionHelp===a.id&&<span role="tooltip" className="type-helper"
        style={a.action==='merge'?{...actionTipStyle,width:420,maxWidth:'65vw'}:actionTipStyle}>{a.disabled?a.disabledReason:a.help}</span>}
    </span>;
  }
  async function changeDocumentStatus() {
    if(editing.current||busy||stale)return;
    editing.current=true;setBusy(true);setError('');setStatus('검토 상태 바꾸는 중');
    try {
      const r=await invoke('correct',{document:file.document,revision:mapping.revision,action:'status',status:statusAction(documentStatus).value,historyId:historyId.current});
      if(r.stale){setStale(true);setError(r.message);setStatus('문서가 바뀜');return;}
      setMapping(r.mapping);setDocumentStatus(r.status);setReloadKey(k=>k+1);setStatus('변환 완료 · 확인할 곳 '+r.mapping.blocks.filter(b=>b.warning).length);
    } catch(e){setError(e.message);setStatus('검토 상태 변경 실패');} finally{editing.current=false;setBusy(false);}
  }
  async function runCorrection(input) {
    const {jobId} = await invoke('correct',{...input,background:true});
    for (;;) {
      const response = await invoke('correctionResult',{jobId});
      if (!response.pending) return response.result;
      await new Promise(resolve=>setTimeout(resolve,150));
    }
  }
  async function correct(action, extra = {}, blocks = chosen, focusSource = false) {
    if (editing.current) return;
    const before=mapping, oldSelection=selection, oldSelected=compare.current?.selected();
    compare.current?.stopFollow();
    editing.current=true; setBusy(true); setError(''); setStatus('고치는 중'); setSplitting(false);
    let started=performance.now();
    try {
      const input={document:file.document,revision:before.revision,ids:blocks.map(b=>b.id),action,
        historyId:historyId.current,...extra};
      const irreversible=action==='remove' && before.snapshotNodes?.some(n=>blocks.some(b=>b.path[0]===n.path[0]) && references(n).length);
      if(irreversible) {
        if(!await confirm({title:'문서에서 빼기',message:'각주 호출이 들어 있어 이 동작은 되돌릴 수 없습니다. 문서에서 뺄까요?',confirmLabel:'문서에서 빼기'})) {
          setStatus('취소됨');return;
        }
        input.confirmed=true;started=performance.now();
      }
      let r=await runCorrection(input);
      if(r.requiresConfirm&&action==='title') {
        if(!await confirm({title:'문서 제목 바꾸기',message:'이 문서에는 이미 제목 “'+r.title+'”이 있습니다. 고른 블록의 글자로 바꿀까요? 이전 제목은 본문으로 돌아오지 않습니다.',confirmLabel:'제목 바꾸기'})) {
          setStatus('취소됨');return;
        }
        started=performance.now();r=await runCorrection({...input,confirmed:true});
      }
      if(r.stale) {setMapping(before);setStale(true);setError(r.message);setStatus('문서가 바뀜');return;}
      setMapping(r.mapping);setUndoCount(r.undoCount);setReloadKey(k=>k+1);setStale(r.mapping.stale);
      const b=r.mapping.blocks.find(b=>b.id===r.targetId);
      setSelection(b?[b.id]:[]);compare.current?.show(b,focusSource);
      metrics.current.correction={started,timings:r.timings,action};
      setError(r.message || '');setStatus(r.mapping.stale?'문서가 바뀜':r.brokenLinks?'고침 완료 · 이 제목을 가리키는 링크 '+r.brokenLinks+'개가 끊깁니다.':'고침 완료');
    } catch(e) {
      setMapping(before);setSelection(oldSelection);compare.current?.pick(oldSelected);
      setError(e.message);setStatus('고치기 실패');
    } finally {editing.current=false;setBusy(false);}
  }
  const frontPages = new Set([...excludedPages].map((p) => p - 1));
  async function choose() {
    try {
      const f = await pickPath({ kind: "pdf" });
      if (f) await load(f.path);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError("PDF를 고를 수 없습니다. 열린 폴더가 없다면 왼쪽 탐색기의 ‘폴더 열기’에서 PDF가 든 폴더를 먼저 여세요. 이미 열었다면 폴더에 접근할 수 있는지 확인하고 다시 시도하세요.");
    }
  }
  function resetDocument() {
    setConversion(null);
    if(pickerSession.current) pickerSession.current.active=false;
    pickerSession.current = null;
    selectionAnchor.current = null;
    replacementApproved.current=false;
    setPickerHelp(false);
    setPageTitles([]);
    setSelection([]); setSplitting(false); setUndoCount(0); historyId.current=crypto.randomUUID();
    anchor.current = null;
    setExcludedPages(new Set());
    setPicking(false);

    setError("");
    setMapping(null);
    setResult(null);
    setStale(false);
    setCached(false);
    setMissingMapping(false);
    setExpanded(false);
    setSeen(new Set());
    setFile(null);
    setPdf(null);
    setDocumentStatus(undefined);
  }
  async function load(path, cachedOnly = false) {
    resetDocument();
    const session = {active:true,touched:new Set()};
    pickerSession.current = session;
    setBusy(true);
    setStatus("PDF 읽는 중");
    metrics.current = { start: performance.now() };
    const loadingMetrics=metrics.current;
    let f;
    try {
      f = await invoke("load", { path, cachedOnly });
      metrics.current.loadMs=performance.now()-metrics.current.start;
      const suggestStarted=performance.now();
      const suggestionPromise=f.cached||f.missingMapping?null:invoke("suggest",{id:f.id}).then(
        value=>({value,ms:performance.now()-suggestStarted}),error=>({error}));
      const pdfStarted=performance.now();
      try {
        rememberFolder(f.folder);
      } catch {
        setError("최근 폴더 목록을 보관하지 못했습니다.");
      }
      setFile(f);
      const binary=atob(f.base64), bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
      const loadingTask = pdfjs.getDocument({
        data: bytes,
        verbosity: 0,
        enableScripting: false,
      });
      const doc = await loadingTask.promise;
      doc.pageSizes = await Promise.all(
        Array.from({ length: doc.numPages }, async (_, i) => {
          const p = await doc.getPage(i + 1),
            v = p.getViewport({ scale: 1 });
          return { width: v.width, height: v.height };
        }),
      );
      metrics.current.pdfMs=performance.now()-pdfStarted;
      const titlesStarted=performance.now();
      const titles = await readPageTitles(doc);
      metrics.current.bookmarksMs=performance.now()-titlesStarted;
      setPageTitles(titles);

      metrics.current.readMs = performance.now() - metrics.current.start;
      setDocumentStatus(f.documentStatus);
      if (f.cached) {
        setExcludedPages(
          new Set(
            f.cached.excludedPages,
          ),
        );
        setPdf(doc);
        if(cachedOnly) setMapping(f.cached);
        else {setPicking(true);setStatus("뺄 쪽을 고른 뒤 변환하세요.");}
        setStale(f.cached.stale);
        setCached(true);
        if(cachedOnly) setStatus(
          "변환 완료 · 확인할 곳 " +
            f.cached.blocks.filter((b) => b.warning).length,
        );
      } else if (f.missingMapping) {
        setPdf(doc);
        setMissingMapping(true);
        setStatus("저장된 문서에 원본 연결이 없습니다.");
      } else {
        setPdf(doc);
        setPicking(true);
        setStatus("뺄 쪽 제안 확인 중");
        performance.measure("pdf-import-page-picker", {start:loadingMetrics.start,detail:{...loadingMetrics}});
        suggestionPromise.then(suggested=>{
          if(!session.active || pickerSession.current!==session) return;
          if(suggested.error) {
            setError("뺄 쪽 제안을 확인하지 못했습니다. 지금 고른 쪽으로 변환할 수 있습니다.");
            setStatus("뺄 쪽을 고른 뒤 변환하세요.");
            return;
          }
          loadingMetrics.suggestMs=suggested.ms;
          setExcludedPages(current=>applyPageSuggestion(current,suggested.value.excludedPages,session.touched));
          setStatus("뺄 쪽을 고른 뒤 변환하세요.");
          performance.measure("pdf-import-suggestion",{start:loadingMetrics.start,detail:{...loadingMetrics}});
        });
      }
    } catch (e) {
      const message = e.message || "PDF 파일과 저장 위치를 확인해 주세요.";
      if (!f) { onHome(message); return; }
      setError(message);
      setStatus("PDF를 읽지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function run(f, doc, stage) {
    stage("구조 분석 중", "PDF 구조를 분석하지 못했습니다.");
    let at = performance.now();
    const r = await invoke("convert", {
      id: f.id,
      excludedPages: [...excludedPages],
    });
    setResult(r);
    metrics.current.analysisMs = performance.now() - at;
    metrics.current.node = r.timings;
    const keys = imageKeys(r.blocks);
    const images = [],
      objects = r.blocks.filter((b) => ["table", "figure"].includes(b.kind) && !b.table);
    at = performance.now();
    for (let i = 0; i < objects.length; i++) {
      stage("그림 만드는 중 " + (i + 1) + " / " + objects.length, "그림을 만들지 못했습니다.", {value:(i + 1) / objects.length,label:"그림 " + (i + 1) + " / " + objects.length});
      const b = objects[i],
        box = b.boxes[0],
        p = await doc.getPage(box.page + 1),
        v = p.getViewport({ scale: 2.5 }),
        canvas = document.createElement("canvas");
      canvas.width = Math.ceil((box.x1 - box.x0) * 2.5);
      canvas.height = Math.ceil((box.bottom - box.top) * 2.5);
      await p.render({
        canvasContext: canvas.getContext("2d"),
        viewport: v,
        transform: [1, 0, 0, 1, -box.x0 * 2.5, -box.top * 2.5],
      }).promise;
      const base64 = canvas.toDataURL("image/png").split(",")[1];
      images.push({ key: keys.get(b.id), mime: "image/png", base64 });
      canvas.width = canvas.height = 0;
      await new Promise(requestAnimationFrame);
    }
    metrics.current.imageMs = performance.now() - at;
    metrics.current.imageCount = images.length;
    metrics.current.imageBytes = images.reduce(
      (n, i) => n + Math.floor((i.base64.length * 3) / 4),
      0,
    );
    stage("문서 저장 중", "문서를 저장하지 못했습니다.");
    const plan = authoring(r);
    at = performance.now();
    const request = {
      name: f.name.replace(/\.pdf$/i, ".md"),
      folder: f.outputFolder,
      authoring: {...plan.authoring,status:"draft"},
      images,
    };
    checkSaveSize(request);
    const saved = await saveDocument(request);
    metrics.current.saveMs = performance.now() - at;
    setMissingMapping(true);
    stage("원본 연결 만드는 중", "문서는 저장됐지만 원본 연결을 만들지 못했습니다.");
    at = performance.now();
    const m = await invoke("mapping", {
      id: f.id,
      units: plan.units,
      revision: saved.revision,
      images: await Promise.all(images.map(imageReceipt)),
    });
    metrics.current.mappingMs = performance.now() - at;
    metrics.current.documentBytes = m.documentBytes;
    metrics.current.blocks = plan.units.length;
    metrics.current.totalMs = performance.now() - metrics.current.start;
    metrics.current.savedAt = performance.now();
    performance.measure("pdf-import-conversion", {
      start: metrics.current.start,
      detail: { ...metrics.current },
    });
    setMapping(m);
    setDocumentStatus(m.documentStatus);
    setCached(true);
    setMissingMapping(false);
    if (m.cleanupError) setError(m.cleanupError);
    setStatus(
      "변환 완료 · 확인할 곳 " + m.blocks.filter((b) => b.warning).length,
    );
  }
  async function rewrite() {
    if(!await confirm({title:"다시 변환",message:"새로 변환한 문서는 초안이 됩니다. 새 변환이 끝나면 이전 문서와 쓰지 않는 그림을 정리합니다. 실패하면 복구용 사본을 남깁니다.",confirmLabel:"뺄 쪽 고르기"})) return;
    replacementApproved.current=true;
    setExpanded(false);
    setSeen(new Set());
    setConversion(null);
    setError("");
    setUndoCount(0);historyId.current=crypto.randomUUID();
    setSelection([]);setSplitting(false);
    anchor.current = null;
    setPicking(true);
    setMapping(null);
    setResult(null);
    selectionAnchor.current = null;
    setStatus("뺄 쪽을 고른 뒤 변환하세요.");
  }
  async function convertSelected() {
    if(pickerSession.current) pickerSession.current.active=false;
    setPickerHelp(false);
    const replacing = cached || missingMapping;
    let failure = "이전 문서를 옮기지 못했습니다.";
    function stage(label, failureLabel, progress) {
      failure = failureLabel;
      setStatus(label);
      const key = label.startsWith("이전 문서") ? "이전 문서 정리" : label.startsWith("구조") ? "구조 분석" : label.startsWith("그림") ? "그림 만들기" : label.startsWith("문서") ? "문서 저장" : "원본 연결";
      setConversion({replacing, key, progress});
    }
    try {
      if (
        replacing && !replacementApproved.current &&
        !(await confirm({
          title: "다시 변환",
          message:
            "새로 변환한 문서는 초안이 됩니다. 새 변환이 끝나면 이전 문서와 쓰지 않는 그림을 정리합니다. 실패하면 복구용 사본을 남깁니다.",
          confirmLabel: "변환",
        }))
      )
        return;
      setBusy(true);
      setError("");
      setPicking(false);
      setConversion({replacing, key: replacing ? "이전 문서 정리" : "구조 분석"});
      metrics.current = { start: performance.now() };
      if (replacing) {
        stage("이전 문서 옮기는 중", failure);
        await invoke("backup", { id: file.id });
        setCached(false);
        setMissingMapping(false);
      }
      setPicking(false);
      setStale(false);
      await run(file, pdf, stage);
      setConversion(null);
    } catch (e) {
      setError(e.message || "변환에 실패했습니다.");
      setStatus(failure);
    } finally {
      setBusy(false);
    }
  }
  function togglePage(page, shift) {
    if (busy || !picking) return;
    const from=anchor.current;
    const first=shift && from!==null ? from : page;
    for(let p=Math.min(first,page);p<=Math.max(first,page);p++) pickerSession.current?.touched.add(p);
    setExcludedPages(current=>togglePageRange(current,from,page,shift));
    anchor.current = page;
  }
  function returnHome() {
    if (busy || editing.current) return;
    onHome();
  }

  // Selecting in the comparison: Shift extends the range from the last single selection.
  function selectBlock(b, shift) {
    setSplitting(false);
    if (b.documentTitle) {setSelection([b.id]);selectionAnchor.current=null;return;}
    // The error box has no close button; the next successful action clears it.
    setError("");
    if (shift && selectionAnchor.current) {
      const z = mapping.blocks.findIndex(x=>x.id===b.id);
      const anchor = mapping.blocks.findIndex(x=>x.id===selectionAnchor.current);
      const a = anchor < 0 ? z : anchor;
      setSelection(mapping.blocks.slice(Math.min(a,z),Math.max(a,z)+1).map(x=>x.id));
    } else {selectionAnchor.current=b.id;setSelection([b.id]);}
  }
  const clearSelection = () => {setSplitting(false);setSelection([]);selectionAnchor.current=null;};
  const viewState = React.useCallback(
    (s) => {
      if(s.state === 'ready' && metrics.current.correction) {
        performance.measure('pdf-import-correction',{start:metrics.current.correction.started,
          detail:{...metrics.current.correction.timings,action:metrics.current.correction.action,
            visibleMs:performance.now()-metrics.current.correction.started}});
        metrics.current.correction=null;
      }
      if (
        s.state === "ready" &&
        metrics.current.savedAt &&
        !metrics.current.readyMs
      ) {
        metrics.current.readyMs = performance.now() - metrics.current.savedAt;
        performance.measure("pdf-import-ready", {
          start: metrics.current.savedAt,
          detail: metrics.current.readyMs,
        });
      }
      if (s.revision && mapping && s.revision !== mapping.revision)
        setStale(true);
      if (s.state === "stale-target") setStale(true);
      if (s.state === "error") setError("변환된 문서를 표시하지 못했습니다.");
    },
    [mapping],
  );
  const flow = {kind:"pdf", profile:mapping?.profile ?? result?.profile, phase:conversion?.key,
    failed:!!conversion && !!error, approved:documentStatus === "approved",
    viewed:seen.size > 0, remaining:checks.filter(c => !seen.has(c.flowId)).length};
  if (!file && !busy) return null;
  return (
    <ui.ScreenLayout
      fillHeight={Boolean(pdf && !picking && !missingMapping && !conversion)}
      back={file && !picking ? { label: "변환한 문서", onBack: returnHome, disabled: busy } : undefined}
      description={
        file
          ? file.name +
            (pdf && !picking ? " · " + pdf.numPages + "쪽" + (conversion && excludedPages.size ? " 중 " + (pdf.numPages - excludedPages.size) + "쪽" : "") : "") +
            (picking && pdf ? " · " + pdf.numPages + "쪽 중 " + excludedPages.size + "쪽 제외" : "") +
            (excludedPages.size && !conversion ? " · " + (picking ? exclusionSummary(excludedPages).replace(/ 제외$/, "") : exclusionSummary(excludedPages)) : "")
          : undefined
      }
      status={
        <span className="pdf-picker-status" tabIndex={picking?0:undefined}
          onMouseEnter={()=>setPickerHelp(true)} onMouseLeave={()=>setPickerHelp(false)}
          onFocus={()=>setPickerHelp(true)} onBlur={()=>setPickerHelp(false)}
          aria-describedby={picking&&pickerHelp?'pdf-picker-status-help':undefined} style={{position:'relative',display:'inline-flex',gap:'var(--space-2)',alignItems:'center'}}>
          <ui.Status tone={error?"error":busy||(picking&&status==="뺄 쪽 제안 확인 중")?"progress":missingMapping&&!picking?"warning":mapping?"ok":"neutral"} label={status}/>
          {mapping&&!picking&&statusLabel(documentStatus)&&<ui.Status tone={documentStatus==='approved'?'ok':'neutral'} label={statusLabel(documentStatus)}/>}
          {picking&&pickerHelp&&<span id="pdf-picker-status-help" role="tooltip" className="type-helper" style={{position:'absolute',left:'50%',transform:'translateX(-50%)',top:'100%',width:300,maxWidth:'80vw',padding:'var(--space-2)',background:'var(--id-color-surface)',color:'var(--id-color-text)',border:'1px solid var(--id-color-border)',boxShadow:'var(--shadow-overlay)',zIndex:2}}>누르면 포함·제외가 바뀝니다. Shift와 함께 누르면 범위를 고릅니다.</span>}
        </span>
      }
      actions={
        <>
          {mapping && !picking && !conversion && <FlowToggle React={React} ui={ui} state={flow} open={expanded} controls={flowId} toggle={()=>setExpanded(!expanded)} />}
          {!picking && <ui.Button
            variant={file ? "outline" : "default"}
            disabled={busy}
            onClick={choose}
          >
            PDF 고르기
          </ui.Button>}
          {picking && (
            <>
              <ui.Button disabled={busy} onClick={returnHome}>취소</ui.Button>
              <ui.Button
                variant="default"
                disabled={busy}
                onClick={convertSelected}
              >
                변환
              </ui.Button>
            </>
          )}
          {(cached || missingMapping) && !picking && (
            <ui.Button variant="destructive" disabled={busy} onClick={rewrite}>
              다시 변환
            </ui.Button>
          )}
          {mapping && !picking && toolButton({id:'document-status',label:statusAction(documentStatus).label,
            disabled:busy||stale,disabledReason:stale?'문서가 바뀌어 대응을 표시할 수 없음':'문서를 고치는 중입니다.',
            help:warnings.length?'확인할 곳이 '+warnings.length+'곳 남아 있습니다':null,run:changeDocumentStatus})}
          {(mapping || missingMapping) && !picking && (
            <ui.Button
              disabled={busy}
              onClick={async () => {
                try {
                  const r = await openDocument({ path: file.document });
                  setError(r.status === "opened" ? "" : "문서를 열지 못했습니다.");
                } catch {
                  setError("문서를 열지 못했습니다.");
                }
              }}
            >
              문서 열기
            </ui.Button>
          )}
        </>
      }
    >
      <style>{`
.pdf-picker-status:focus-visible{outline:2px solid var(--id-color-border-focus);outline-offset:2px}
@media(max-width:800px){.pdf-picker-status [role=tooltip]{left:0!important;transform:none!important}}
`}</style>
      {(conversion || (mapping && !picking)) && <Flow key={conversion ? "run" : "compare"} React={React} ui={ui}
        mode={conversion ? "run" : "compare"} {...flow} controls={flowId} expanded={conversion ? undefined : expanded} />}
      {!conversion && error && <ui.Notice tone="error">{error}</ui.Notice>}
      {conversion && <div style={{width:'min(100%, 560px)',margin:'var(--space-8) auto',display:'flex',flexDirection:'column',gap:'var(--space-4)'}}>
        <ui.Steps steps={[...(conversion.replacing ? ['이전 문서 정리'] : []),'구조 분석','그림 만들기','문서 저장','원본 연결']} current={[...(conversion.replacing ? ['이전 문서 정리'] : []),'구조 분석','그림 만들기','문서 저장','원본 연결'].indexOf(conversion.key)}/>
        {error ? <ui.Notice tone="error">{status} {error}</ui.Notice> : <ui.Progress value={conversion.progress?.value} label={conversion.progress?.label || conversion.key}/>}
      </div>}
      {!picking && stale && (
        <ui.Notice tone="warning">
          문서가 바뀌어 대응을 표시할 수 없음
        </ui.Notice>
      )}
      {pdf && picking && <PagePicker React={React} ui={ui} pdf={pdf} titles={pageTitles} excluded={excludedPages} toggle={togglePage} busy={busy}/> }
      {pdf && mapping && !picking && !missingMapping && !conversion && (
        <Compare onCheckViewed={markSeen} React={React} ui={ui} pdf={pdf} handle={compare}
          pages={mapping.pages || result?.pages || pdf.pageSizes} blocks={mapping.blocks}
          excluded={mapping.excluded || result?.excluded || none} excludedPages={frontPages}
          document={file.document} revision={mapping.revision} reloadKey={reloadKey}
          checks={checks} legend={legend} sourceLabel="원본 PDF" busy={busy} stale={stale}
          guide={splitting ? "새 문단이 시작될 줄을 고르세요." : undefined}
          onViewState={viewState}
          edit={{
            selection, editing, onSelect: selectBlock, onClear: clearSelection,
            menu: b => canEdit && ['paragraph','heading','list'].includes(b.documentKind) ? actionItems(selection.includes(b.id)?chosen:[b],true) : null,
            splitLines: splitting && chosen.length===1 ? chosen[0].lines : null,
            onSplit: line => correct('split',{line}),
            tools: canEdit && selection.length>0 ? <>
                <span>{selection.length}개 선택</span>
                {tools.filter(a=>a.action==='merge'||a.action==='split').map(a=>toolButton(a))}
                <span tabIndex={kindDisabled?0:undefined} style={{position:'relative'}}
                  onFocus={()=>setActionHelp('kind')} onBlur={()=>setActionHelp(null)} onMouseEnter={()=>setActionHelp('kind')} onMouseLeave={()=>setActionHelp(null)}>
                  <ui.Select label="종류" hideLabel placeholder="종류" disabled={kindDisabled} value={chosen.length===1&&['paragraph','heading'].includes(chosen[0].documentKind)&&chosen[0].kind!=='heading_unnumbered'?(chosen[0].documentKind==='heading'?'h'+chosen[0].level:'paragraph'):''}
                    options={kindTools.map(a=>({value:a.id,label:a.id==='paragraph'?'본문':a.id==='title'?'문서 제목':'제목 '+a.extra.level}))}
                    onValueChange={v=>{const a=kindTools.find(a=>a.id===v);if(a?.disabled)setError(a.disabledReason);else if(a)a.run();}}/>
                  {kindHelp&&actionHelp==='kind'&&<span role="tooltip" className="type-helper" style={actionTipStyle}>{kindHelp}</span>}
                </span>
                {toolButton(tools.find(a=>a.action==='remove'))}
              </> : null,
            extraTools: undoCount>0&&<ui.Button disabled={busy} onClick={()=>correct('undo')}>되돌리기</ui.Button>,
          }} />
      )}
    </ui.ScreenLayout>
  );
}
export { Screen as default };
