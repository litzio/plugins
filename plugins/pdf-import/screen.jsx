import { statusLabel, statusAction } from './document-status.mjs';
import { imageKeys, imageReceipt } from "./output.mjs";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import workerSource from "./worker-source.js";
import PagePicker from "./page-picker.jsx";
import { linkedItems, sourcePagePositions } from "./linked-items.mjs";
import {browseScales,steppedScale} from "./browse-scale.mjs";
import {blockActions} from "./block-actions.mjs";
import {sourceForPath, sourceLocations, blockAtSource, sourceScrollTop, sourceVisibleTop, sourceAlignScrollTop} from "./scroll-sync.mjs";
import { togglePageRange, readPageTitles, applyPageSuggestion } from "./page-selection.mjs";
import { authoring } from "./authoring.mjs";
import { references } from "./corrections.mjs";
import { renderPage, cancelRender, renderFailed } from "./page-render.mjs";
import { recentDate } from "./time.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
  new Blob([workerSource], { type: "text/javascript" }),
);
const labels = {
  heading: "제목",
  heading_unnumbered: "제목",
  paragraph: "본문",
  note: "참고",
  caption: "캡션",
  list: "목록",
  table: "표",
  figure: "그림",
  footnote: "각주",
  margin: "제외",
  front: "제외",
};
const colors = {
  heading: "accent",
  heading_unnumbered: "accent",
  paragraph: "info",
  note: "info",
  caption: "info",
  list: "success",
  table: "border-focus",
  figure: "text",
  footnote: "text-muted",
  margin: "border",
  front: "border",
};
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
function SourceBlock({ui,canEdit,busy,stale,block,actions,trigger}) {
  if(!['paragraph','heading','list'].includes(block.documentKind)||!canEdit)return trigger;
  return <ui.ContextMenu disabled={busy||stale} trigger={trigger} actions={actions}/>;
}
const reviewGroups = [
  { id: "검토 중", title: "검토 중", tone: "warning" },
  { id: "초안", title: "초안", tone: "neutral" },
  { id: "검토 완료", title: "검토 완료", tone: "ok" },
  { id: "상태 미지정", title: "상태 미지정", tone: "neutral" },
];
function Screen({
  React,
  ui,
  invoke,
  pickPath,
  saveDocument,
  openDocument,
  confirm,
}) {
  const { useState, useRef, useEffect, useMemo, useLayoutEffect } = React;
  const [browseScale,setBrowseScale]=useState(()=>{try{const value=Number(localStorage.getItem('pdf-import-browse-scale'));return browseScales.includes(value)?value:0.75;}catch{return 0.75;}});
  const scaleValue=useRef(browseScale),scaleChange=useRef(null),scaleAnchor=useRef(null);
  const comparisonPair = useRef(null);
  const [viewport, setViewport] = useState(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [pageLast,setPageLast]=useState(1);
  const recentKey = "pdf-import-recent-folders";
  const [recent, setRecent] = useState(null);
  const homeContent = useRef(null);
  const focusHome = useRef(false);
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
    [selected, setSelected] = useState(null),
    [stale, setStale] = useState(false),
    [cached, setCached] = useState(false),
    [missingMapping, setMissingMapping] = useState(false),
    [pageNo, setPageNo] = useState(1),
    [width, setWidth] = useState(600),
    [tip, setTip] = useState(null);
  const atHome = !file && !busy;
  useEffect(() => {
    if (!atHome) return;
    let gone = false;
    (async () => {
      const folders = JSON.parse(localStorage.getItem(recentKey) || "[]");
      const found = await invoke("recent", {
        folders: Array.isArray(folders) ? folders : [],
      });
      if (!gone) {
        setRecent(found.rows);
        localStorage.setItem(recentKey, JSON.stringify(found.folders));
      }
    })().catch(() => {
      if (!gone) {
        setRecent(current => current ?? []);
        setError("저장된 문서 목록을 읽지 못했습니다.");
      }
    });
    return () => { gone = true; };
  }, [atHome]);
  useLayoutEffect(() => {
    if (!atHome || recent === null || !focusHome.current) return;
    homeContent.current?.querySelector("button")?.focus();
    focusHome.current = false;
  }, [atHome, recent]);
  const [pageTitles, setPageTitles] = useState([]);
  const replacementApproved = useRef(false), pickerSession = useRef(null);
  const [pickerHelp, setPickerHelp] = useState(false);
  useEffect(()=>()=>{if(pickerSession.current)pickerSession.current.active=false;},[]);
  const [picking, setPicking] = useState(false),
    [excludedPages, setExcludedPages] = useState(new Set()),
    [follow, setFollow] = useState(true),
    [followed, setFollowed] = useState(null),
    [target, setTarget] = useState(null);
  useEffect(()=>{
    const pair=comparisonPair.current;if(!pair)return;
    const wheel=e=>{if(!e.ctrlKey||!e.deltaY)return;e.preventDefault();scaleChange.current?.(steppedScale(scaleValue.current,e.deltaY));};
    pair.addEventListener('wheel',wheel,{capture:true,passive:false});return ()=>pair.removeEventListener('wheel',wheel,true);
  },[viewport]);
  const anchor = useRef(null),
    scrollTimer = useRef(null),
    scrollOwner = useRef(null), sourceAuto = useRef(null),
    documentLayout = useRef(null), alignRequest = useRef(0), pairHeld = useRef(false);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  const pane = useRef(null),
    metrics = useRef({});
  const [pageGap, setPageGap] = useState(0);
  const measurePageGap = React.useCallback(element => {
    if (element) setPageGap(parseFloat(getComputedStyle(element).rowGap) || 0);
  }, []);
  const sourceRef = React.useCallback(element => {
    pane.current = element;
    setViewport(element);
  }, []);
  useLayoutEffect(() => {
    if (!viewport) return;
    const measure = () => {
      setWidth(Math.max(1, viewport.clientWidth - 16));
      setViewportHeight(viewport.clientHeight);
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);
  useEffect(
    () => () => {
      pdf?.loadingTask.destroy();
    },
    [pdf],
  );
  const warnings = mapping?.blocks.filter(b=>b.warning) || [];
  const warningIndex = warnings.findIndex((b) => b.id === selected?.id);
  const chosen = mapping?.blocks.filter(b => selection.includes(b.id)) || [];
  const canEdit = !!mapping && !stale;
  function actionItems(blocks,focusSource=false) {
    return blockActions(blocks,mapping?.blocks||[],mapping?.snapshotNodes||[]).map(a=>({...a,icon:null,
      disabled:a.disabled||busy||stale,
      disabledReason:a.action==='merge'&&a.disabled
        ? a.disabledReason+' 원본 상자 하나를 누른 뒤 Shift를 누른 채 다른 상자를 눌러 범위를 고르세요. 키보드로는 Enter나 Space로 첫 상자를 고르고, 다른 상자에 초점을 옮겨 Shift+Enter 또는 Shift+Space를 누르세요.'
        : a.disabledReason,
      run:()=>{
        if(a.action==='split') {setSelection(blocks.map(b=>b.id));setSelected(blocks[0]);setSplitting(true);}
        else return correct(a.action,a.extra,blocks,focusSource);
      }}));
  }
  const tools=actionItems(chosen),kindTools=tools.filter(a=>a.action==='kind');
  const kindDisabled=kindTools.every(a=>a.disabled);
  function prepareContext(b) {
    if(!busy&&!stale&&!editing.current&&!selection.includes(b.id))select(b);
  }
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
      setMapping(r.mapping);setDocumentStatus(r.status);setReloadKey(k=>k+1);setStatus('변환 완료 · 변환 경고 '+r.mapping.blocks.filter(b=>b.warning).length+'개');
    } catch(e){setError(e.message);setStatus('검토 상태 변경 실패');} finally{editing.current=false;setBusy(false);}
  }
  async function correct(action, extra = {}, blocks = chosen, focusSource = false) {
    if (editing.current) return;
    const before=mapping, oldSelection=selection, oldSelected=selected;
    clearTimeout(scrollTimer.current);
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
      const r=await invoke('correct',input);
      if(r.stale) {setMapping(before);setStale(true);setError(r.message);setStatus('문서가 바뀜');return;}
      setMapping(r.mapping);setUndoCount(r.undoCount);setReloadKey(k=>k+1);setStale(r.mapping.stale);
      clearTimeout(scrollTimer.current); setFollowed(null);
      const b=r.mapping.blocks.find(b=>b.id===r.targetId);
      setSelection(b?[b.id]:[]);setSelected(b||null);setTarget(b?sourceTarget(b):null);
      if(focusSource&&b)requestAnimationFrame(()=>pane.current?.querySelector('[data-linked-item="'+b.id+'"]')?.focus({preventScroll:true}));
      metrics.current.correction={started,timings:r.timings,action};
      setError(r.message || '');setStatus(r.mapping.stale?'문서가 바뀜':'고침 완료');
    } catch(e) {
      setMapping(before);setSelection(oldSelection);setSelected(oldSelected);
      setError(e.message);setStatus('고치기 실패');
    } finally {editing.current=false;setBusy(false);}
  }
  useEffect(() => {
    const cancel = e => {if(e.key==='Escape'&&!e.defaultPrevented&&!e.target.closest?.('[role=menu],[role=listbox],[role=dialog]')) {setSplitting(false);setSelection([]);setSelected(null);setTarget(null);selectionAnchor.current=null;}};
    window.addEventListener('keydown',cancel); return ()=>window.removeEventListener('keydown',cancel);
  },[]);
  const frontPages = new Set([...excludedPages].map((p) => p - 1));
  const positions = useMemo(
    () => sourcePagePositions(mapping?.pages || result?.pages || pdf?.pageSizes || [],
      width * browseScale, pageGap),
    [mapping, result, pdf, width, browseScale, pageGap],
  );
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
    scrollOwner.current=null; sourceAuto.current=null; scaleAnchor.current=null;
    documentLayout.current = null; pairHeld.current = false;
    selectionAnchor.current = null;
    replacementApproved.current=false;
    setPickerHelp(false);
    setPageTitles([]);
    setSelection([]); setSplitting(false); setUndoCount(0); historyId.current=crypto.randomUUID();
    clearTimeout(scrollTimer.current);
    anchor.current = null;
    setPageNo(1);
    setTip(null);
    setExcludedPages(new Set());
    setPicking(false);
    setFollowed(null);
    setTarget(null);

    setError("");
    setMapping(null);
    setResult(null);
    setSelected(null);
    setStale(false);
    setCached(false);
    setMissingMapping(false);
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
    try {
      const f = await invoke("load", { path, cachedOnly });
      metrics.current.loadMs=performance.now()-metrics.current.start;
      const suggestStarted=performance.now();
      const suggestionPromise=f.cached||f.missingMapping?null:invoke("suggest",{id:f.id}).then(
        value=>({value,ms:performance.now()-suggestStarted}),error=>({error}));
      const pdfStarted=performance.now();
      try {
        const folders = JSON.parse(localStorage.getItem(recentKey) || "[]");
        localStorage.setItem(
          recentKey,
          JSON.stringify(
            [
              ...new Set([
                f.folder,
                ...(Array.isArray(folders) ? folders : []),
              ]),
            ].slice(0, 10),
          ),
        );
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
          "변환 완료 · 변환 경고 " +
            f.cached.blocks.filter((b) => b.warning).length + "개",
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
      setError(e.message || "PDF 파일과 저장 위치를 확인해 주세요.");
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
    const saved = await saveDocument({
      name: f.name.replace(/\.pdf$/i, ".md"),
      folder: f.outputFolder,
      authoring: {...plan.authoring,status:"draft"},
      images,
    });
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
      "변환 완료 · 변환 경고 " + m.blocks.filter((b) => b.warning).length + "개",
    );
  }
  async function rewrite() {
    if(!await confirm({title:"다시 변환",message:"새로 변환한 문서는 초안이 됩니다. 새 변환이 끝나면 이전 문서와 쓰지 않는 그림을 정리합니다. 실패하면 복구용 사본을 남깁니다.",confirmLabel:"뺄 쪽 고르기"})) return;
    replacementApproved.current=true;
    setConversion(null);
    setError("");
    setUndoCount(0);historyId.current=crypto.randomUUID();
    setSelection([]);setSplitting(false);
    clearTimeout(scrollTimer.current);
    anchor.current = null;
    setPicking(true);
    setMapping(null);
    setResult(null);
    setSelected(null);
    selectionAnchor.current = null;
    setTarget(null);
    setFollowed(null);
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
    focusHome.current = true;
    setRecent(null);
    resetDocument();
    setStatus("");
  }

  const locations = useMemo(()=>sourceLocations(mapping?.blocks || [], positions),[mapping,positions]);
  function updateSourceViewport(){
    if(!pane.current)return;
    const top=pane.current.scrollTop,bottom=top+pane.current.clientHeight;
    setPageNo(Math.max(1,positions.findIndex(p=>p.top+p.height>top+1)+1));
    const last=positions.findIndex(p=>p.top>=bottom);setPageLast(last<0?positions.length:last);
  }
  function changeScale(value){
    if(value===scaleValue.current||!browseScales.includes(value))return;
    clearTimeout(scrollTimer.current);
    if(pane.current){
      const top=pane.current.scrollTop,y=top+pane.current.clientHeight/3;
      // A clicked pair nobody has scrolled away from stays the anchor and is aligned again after the change.
      const held=pairHeld.current&&target?.top!=null&&locations.find(x=>x.b.id===target.id&&x.bottom>top&&x.top<top+pane.current.clientHeight);
      const hit=held||locations.find(x=>x.top<=y&&x.bottom>=y)||locations.find(x=>x.top>=y)||locations.at(-1);
      if(hit)scaleAnchor.current={index:locations.indexOf(hit),id:hit.b.id,offset:hit.top-top,realign:!!held};
    }
    scaleValue.current=value;setBrowseScale(value);setError('');
    try{localStorage.setItem('pdf-import-browse-scale',String(value));}catch{setError('배율을 기억하지 못했습니다.');}
  }
  scaleChange.current=changeScale;
  useLayoutEffect(()=>{
    if(!pane.current)return;
    const anchor=scaleAnchor.current,hit=anchor&&locations[anchor.index];
    if(hit&&hit.b.id===anchor.id){
      pane.current.scrollTop=Math.max(0,hit.top-anchor.offset);sourceAuto.current=pane.current.scrollTop;scaleAnchor.current=null;
      if(anchor.realign)setTarget(t=>t?.id===anchor.id?sourceTarget(t,t.highlight):t);
    }
    updateSourceViewport();
  },[locations,viewport,viewportHeight]);
  function ownScroll(side, event) {
    if(event?.type==='keydown' && (!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key) || event.ctrlKey || event.altKey || event.metaKey))return;
    // Ctrl+wheel changes the scale; it is not a scroll.
    if(event?.type==='wheel' && event.ctrlKey)return;
    scrollOwner.current=side;
    pairHeld.current=false;
    sourceAuto.current=null;
    clearTimeout(scrollTimer.current);
  }
  function moveSource(b) {
    if(!pane.current || !b.boxes.length)return;
    pane.current.scrollTop=Math.max(0,sourceScrollTop(b,positions,pane.current.clientHeight));
    // Remember the clamped position, including no-op moves. Only fresh input clears it.
    sourceAuto.current=pane.current.scrollTop;
  }
  // The document pair of a source box comes to the box's visible height. A new request realigns
  // the same block after the document alone was scrolled.
  function sourceTarget(b, highlight = true) {
    const el = pane.current, top = el && sourceVisibleTop(b, positions, el.scrollTop, el.clientHeight);
    pairHeld.current = top != null;
    return top == null ? {...b, highlight} : {...b, highlight, top, request: ++alignRequest.current};
  }
  // The source box comes to the clicked document block's visible height. True when it got there,
  // false at a scroll limit or without a reported block position.
  function alignSource(b) {
    const el = pane.current, layout = documentLayout.current;
    if (!el || !b.boxes.length) return false;
    const hit = layout?.revision === mapping?.revision && layout.blocks.find(x => x.path[0] === b.path?.[0]);
    if (!hit) {moveSource(b); return false;}
    const next = sourceAlignScrollTop(b, positions, hit.top, el.scrollTop, el.scrollHeight - el.clientHeight);
    if (next !== null) el.scrollTop = next;
    sourceAuto.current = el.scrollTop;
    const top = sourceVisibleTop(b, positions, el.scrollTop, el.clientHeight);
    return top != null && Math.abs(top - hit.top) <= 8;
  }
  function sourceScroll() {
    const scrollAt=performance.now();
    clearTimeout(scrollTimer.current);
    if(scrollOwner.current!=='source' || sourceAuto.current!==null || !follow || stale || !mapping || picking || busy)return;
    scrollTimer.current=setTimeout(()=>{
      if(scrollOwner.current!=='source')return;
      const b=blockAtSource(locations,pane.current.scrollTop+pane.current.clientHeight/3);
      if(b){
        setFollowed(b);
        setTarget(old=>old?.id===b.id && old.highlight===false?old:{...b,highlight:false});
        performance.measure('pdf-import-follow',{start:scrollAt,detail:{id:b.id,direction:'source'}});
      }
    },150);
  }
  function documentVisible(report) {
    if(scrollOwner.current!=='document' || !follow || stale || busy || editing.current || !mapping || report.revision!==mapping.revision)return;
    const b=sourceForPath(mapping.blocks,report.path,true);
    if(!b)return;
    clearTimeout(scrollTimer.current);
    setFollowed(b);
    // Clear a previous click highlight without navigating back into the user's scroll.
    setTarget(null);
    moveSource(b);
  }
  function selectLinkedBlock(id) {
    if (editing.current) return;
    const block = mapping?.blocks.find(item => item.id === id);
    if (block) select(block, scrollOwner.current === 'source' ? false : 'document');
  }
  async function select(b, scroll = false, shift = false) {
    if (stale || busy) return;
    try {
      const t = performance.now();
      clearTimeout(scrollTimer.current);
      // The error box has no close button; the next successful action clears it.
      setError("");
      setFollowed(null);
      // A document click keeps the document still and moves the source to it.
      // Once the source has reached it, the pair is held like a source click (the document stays
      // within 8px and does not move); at a source limit the document keeps its place.
      const reached = scroll === 'document' && alignSource(b);
      if (scroll === true) moveSource(b);
      if (scroll === 'document' && !reached) pairHeld.current = false;
      setTarget(scroll === 'document' && !reached ? {...b,highlight:true} : sourceTarget(b));
      setSelected(b);
      setSplitting(false);
      if (shift && selectionAnchor.current) {
        const z = mapping.blocks.findIndex(x=>x.id===b.id);
        const anchor = mapping.blocks.findIndex(x=>x.id===selectionAnchor.current);
        const a = anchor < 0 ? z : anchor;
        setSelection(mapping.blocks.slice(Math.min(a,z),Math.max(a,z)+1).map(x=>x.id));
      } else {selectionAnchor.current=b.id;setSelection([b.id]);}
      metrics.current.lastSelection = {
        id: b.id,
        start: t,
        targetAt: performance.now(),
      };
    } catch (e) {
      setError("문서 대응을 확인하지 못했습니다.");
    }
  }
  const Page = useMemo(
    () =>
      function Page2({ index, scale }) {
        const ref = useRef(null);
        const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
        useEffect(() => {
          let gone = false, canvas = null;
          (async () => {
            const p = await pdf.getPage(index + 1);
            canvas = ref.current;
            // The page may have left the visible range (canvas detached) before getPage resolved.
            if (gone || !canvas) return;
            if (await renderPage(canvas, p, p.getViewport({ scale }), () => gone) && !gone) setFailed(false);
          })().catch((e) => {
            // A failure stays on this page only; it never becomes the screen's error.
            if (renderFailed(e, gone)) setFailed(true);
          });
          return () => {
            gone = true;
            cancelRender(canvas);
          };
        }, [index, scale, attempt]);
        return <>
          <canvas ref={ref} style={{ display: "block", width: "100%" }} />
          {failed && <div data-page-render-failed style={{ position: "absolute", top: "var(--space-4)", left: "var(--space-4)", right: "var(--space-4)", zIndex: 1 }}>
            <ui.Notice tone="error">
              이 쪽을 그리지 못했습니다. <ui.Button onClick={() => setAttempt((n) => n + 1)}>다시 그리기</ui.Button>
            </ui.Notice>
          </div>}
        </>;
      },
    [pdf],
  );
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
      if (s.state === "stale-target") {
        setStale(true);
        setSelected(null);
      }
      if (s.state === "error") setError("변환된 문서를 표시하지 못했습니다.");
    },
    [mapping],
  );
  const linkedSelection = stale ? undefined : selected?.id;
  const items = useMemo(
    () => linkedItems(mapping?.blocks ?? [], positions, width * browseScale, width + 16, labels, colors),
    [mapping, positions, width, browseScale],
  );
  function ownComparisonScroll(event) {
    const side = pane.current?.contains(event.target) ? 'source' : 'document';
    ownScroll(side, event.type === 'keydown' && event.key === 'Enter' ? undefined : event);
  }
  const lastPage = positions.at(-1);
  const sourcePages = pdf && !picking && !missingMapping && (
    <div ref={measurePageGap} style={{
      position: "relative",
      rowGap: "var(--space-2)",
      minHeight: "100%",
      height: lastPage ? lastPage.top + lastPage.height : 0,
      background: "var(--id-color-canvas)",
    }}>
      {positions.map((pos, i) => (
        <div
          data-source-page={i + 1}
          key={i}
          style={{
            height: pos.height,
            position: "absolute",
            top: pos.top,
            width:width*browseScale,
            left: Math.max(0, width + 16 - width * browseScale),
            background: "var(--id-color-paper)",
            boxShadow: "var(--shadow-paper)",
          }}
        >
          {i+1>=pageNo-2 && i+1<=pageLast+2 && (
            <div
              style={{
                position: "relative",
                outline: frontPages.has(i)
                  ? "3px solid var(--id-color-danger)"
                  : undefined,
                outlineOffset: -3,
              }}
            >
              <div
                style={{ opacity: frontPages.has(i) ? 0.4 : 1 }}
              >
                <Page index={i} scale={pos.scale} />
              </div>
              {frontPages.has(i) && (
                <svg
                  aria-label="제외"
                  viewBox="0 0 400 500"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    color: "var(--id-color-danger)",
                    opacity: 0.55,
                  }}
                >
                  <g transform="translate(200 250) rotate(-35) scale(5)">
                    <text
                      x="0"
                      y="0"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="currentColor"
                      style={{ color: "var(--id-color-danger)" }}
                      className="type-screen-title"
                    >
                      제외
                    </text>
                  </g>
                </svg>
              )}
              <div style={{position:"absolute",inset:0,mixBlendMode:"multiply",pointerEvents:"none"}}>
              {(mapping?.blocks || result?.blocks || []).flatMap(
                (b) =>
                  b.boxes
                    .filter((x) => x.page === i)
                    .map((x, j) => (
                      <SourceBlock key={b.id+'-'+j} ui={ui} canEdit={canEdit} busy={busy} stale={stale} block={b} actions={actionItems(selection.includes(b.id)?chosen:[b],true)} trigger={<ui.Button
                        className="pdf-import-box"
                        data-selected={selection.includes(b.id) && b.id !== linkedSelection}
                        data-linked-item={mapping && b.path ? b.id : undefined}
                        aria-pressed={b.id === linkedSelection}
                        aria-label={
                          labels[b.kind] +
                          (b.warning ? " · " + b.warning.reason : "")
                        }
                        onMouseEnter={() => setTip({
                            text:
                              labels[b.kind] +
                              (b.warning
                                ? " · " + b.warning.reason
                                : ""),
                            page: i,
                            top: x.bottom * pos.scale,
                          })
                        }
                        onMouseLeave={() => setTip(null)}
                        onFocus={() =>
                          setTip({
                            text:
                              labels[b.kind] +
                              (b.warning
                                ? " · " + b.warning.reason
                                : ""),
                            page: i,
                            top: x.bottom * pos.scale,
                          })
                        }
                        onBlur={() => setTip(null)}
                        onContextMenu={e=>{if(canEdit&&['paragraph','heading','list'].includes(b.documentKind))prepareContext(b);else e.preventDefault();}}
                        onClick={e => {
                          ownScroll('source');
                          if (e.shiftKey && mapping) {
                            e.stopPropagation();
                            select(b, false, true);
                          }
                        }}
                        style={{
                          pointerEvents: "auto",
                          left: x.x0 * pos.scale,
                          top: x.top * pos.scale,
                          width: Math.max(
                            1,
                            (x.x1 - x.x0) * pos.scale,
                          ),
                          height: Math.max(
                            1,
                            (x.bottom - x.top) * pos.scale,
                          ),
                          "--block-color": "var(--id-color-" + colors[b.kind] + ")",
                          "--strip-color": "var(--id-color-" + (b.warning ? "warning" : followed?.id === b.id ? "accent" : colors[b.kind]) + ")",
                        }}
                      >
                        <span className="type-helper" style={{position:'absolute',left:-x.x0*pos.scale,top:0,width:Math.max(0,x.x0*pos.scale-4),display:'flex',justifyContent:'flex-end',gap:0,overflow:'hidden',whiteSpace:'nowrap',pointerEvents:'none',background:'var(--id-color-surface)',color:'var(--id-color-text)'}}>
                          {b.level && (["heading","heading_unnumbered"].includes(b.kind) || (b.kind==='list' && b.level>=2)) && <span>{browseScale===.4?'·':b.kind==='list'?b.level:'H'+Math.min(6,b.level)}</span>}
                          {b.warning && <span style={{color:'var(--id-color-warning)'}}>!</span>}
                          {b.edited && <span>{browseScale===.4?'·':'고침'}</span>}
                        </span>
                      </ui.Button>}/>

                    )),
              )}
              {splitting && chosen.length===1 && chosen[0].lines.map((l,j)=>l.page===i && <ui.Button
                key={'line'+j} className="pdf-import-box pdf-import-line" data-source-line={j} disabled={j===0 || busy}
                aria-label={j===0?'첫째 줄은 나눌 수 없습니다.':(j+1)+'번째 줄 앞에서 나누기'}
                onClick={()=>correct('split',{line:j})}
                style={{pointerEvents:'auto',left:l.box.x0*pos.scale,top:l.box.top*pos.scale,width:(l.box.x1-l.box.x0)*pos.scale,
                  height:Math.max(1,(l.box.bottom-l.box.top)*pos.scale),outline:'1px solid var(--id-color-accent)',outlineOffset:2}} />)}
              {(mapping?.excluded || result?.excluded || [])
                .filter((x) => x.page === i)
                .map((e, j) => (
                  <div
                    key={"e" + j}
                    className="pdf-import-excluded"
                    onContextMenu={e=>e.preventDefault()}
                    tabIndex={0}
                    aria-label={e.kind==='removed'?'제외 · 문서에서 뺌':'제외 · 머리글·바닥글'}
                    onMouseEnter={()=>setTip({page:i,top:0,text:e.kind==='removed'?'제외 · 문서에서 뺌':'제외 · 머리글·바닥글'})}
                    onMouseLeave={()=>setTip(null)}
                    onFocus={()=>setTip({page:i,top:0,text:e.kind==='removed'?'제외 · 문서에서 뺌':'제외 · 머리글·바닥글'})}
                    onBlur={()=>setTip(null)}
                    style={{
                      position: "absolute",
                      pointerEvents: "auto",
                      left: e.box.x0 * pos.scale - 3,
                      top: e.box.top * pos.scale - 3,
                      width: (e.box.x1 - e.box.x0) * pos.scale + 6,
                      height: (e.box.bottom - e.box.top) * pos.scale + 6,
                    }}
                   />
                ))}
              </div>

            </div>
          )}
        </div>
      ))}
    </div>
  );
  if (atHome) {
    const rows = recent ?? [];
    const statuses = new Set(rows.map(row => row.reviewStatus));
    const grouped = statuses.size > 1;
    const names = new Map();
    for (const row of rows) names.set(row.name, (names.get(row.name) ?? 0) + 1);
    const now = Date.now();
    const items = rows.map(row => {
      const group = reviewGroups.find(group => group.id === row.reviewStatus) ?? reviewGroups.at(-1);
      return {
        id: row.id,
        label: names.get(row.name) > 1 ? `${row.name} (${row.folder})` : row.name,
        group: group.id,
        status: { tone: group.tone, label: group.title },
        details: [
          `${row.pages}쪽`,
          group.id !== "검토 완료" && row.warnings > 0 ? `변환 경고 ${row.warnings}개` : null,
          recentDate(row.convertedAt, now),
          row.state || null,
        ],
      };
    });
    const choosePdf = <ui.Button variant="default" onClick={choose}>PDF 고르기</ui.Button>;
    return (
      <ui.ScreenLayout
        width="narrow"
        status={recent === null ? <ui.Status tone="progress" label="저장된 문서 목록 읽는 중" /> : undefined}
        actions={items.length > 0 ? choosePdf : undefined}
      >
        {error && <ui.Notice tone="error">{error}</ui.Notice>}
        {recent !== null && (
          <section ref={homeContent} aria-label="변환한 문서">
            {items.length > 0 ? (
              <>
                <h2 className="type-section-title">변환한 문서</h2>
                <ui.ItemList
                  items={items}
                  groups={grouped ? reviewGroups : undefined}
                  hideStatusLabel={grouped}
                  onOpen={item => {
                    const row = rows.find(row => row.id === item.id);
                    if (row.state) {
                      setError(row.state === "원본 없음"
                        ? "원본 PDF가 없어 저장된 결과를 열 수 없습니다."
                        : "원본 PDF가 바뀌어 저장된 결과를 열 수 없습니다. PDF를 다시 골라 주세요.");
                    } else {
                      load(row.path, true);
                    }
                  }}
                />
              </>
            ) : (
              <ui.EmptyState
                title="변환한 문서가 없습니다"
                description="PDF를 변환하면 원본과 결과를 나란히 보며 확인할 수 있습니다."
                action={choosePdf}
              />
            )}
          </section>
        )}
      </ui.ScreenLayout>
    );
  }
  return (
    <ui.ScreenLayout
      fillHeight={Boolean(pdf && !picking && !missingMapping && !conversion)}
      back={file && !picking ? { label: "변환한 문서", onBack: returnHome, disabled: busy } : undefined}
      description={
        file
          ? file.name +
            (pdf && !picking ? " · " + pdf.numPages + "쪽" : "") +
            (picking && pdf ? " · " + pdf.numPages + "쪽 중 " + excludedPages.size + "쪽 제외" : "") +
            (excludedPages.size ? " · " + (picking ? exclusionSummary(excludedPages).replace(/ 제외$/, "") : exclusionSummary(excludedPages)) : "")
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
            help:warnings.length?'변환 경고 '+warnings.length+'개가 남아 있습니다':null,run:changeDocumentStatus})}
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
@container pdf-tools (max-width:940px){[data-comparison-navigation]{flex-basis:100%;justify-content:flex-end}}
.pdf-import-pane-labels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.pdf-import-narrow{display:none}
.pdf-picker-status:focus-visible{outline:2px solid var(--id-color-border-focus);outline-offset:2px}
.pdf-import-box{position:absolute!important;min-height:0!important;padding:0!important;border-radius:0!important;border:0!important;box-shadow:none!important;background:transparent!important;color:inherit!important}
.pdf-import-box::before{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--block-color) 12%,transparent);pointer-events:none}
.pdf-import-box::after{content:"";position:absolute;inset:0 auto 0 -3px;width:2px;background:var(--strip-color,var(--block-color));pointer-events:none}
.pdf-import-box:hover::before,.pdf-import-box:focus-visible::before{background:color-mix(in srgb,var(--block-color) 18%,transparent)}
.pdf-import-box[data-selected=true]::before{background:color-mix(in srgb,var(--block-color) 22%,transparent)}
.pdf-import-box[data-selected=true]{outline:1px solid var(--block-color);outline-offset:4px}
.pdf-import-box:not([data-linked-item]):focus-visible{outline:2px solid var(--id-color-border-focus)!important;outline-offset:6px}
.pdf-import-line::before,.pdf-import-line::after{display:none}
.pdf-import-line{outline:1px solid var(--id-color-accent);outline-offset:2px}
.pdf-import-excluded{position:absolute;--excluded-ink:color-mix(in srgb,var(--id-color-text-muted) 70%,var(--id-color-surface));--excluded-face:repeating-linear-gradient(135deg,color-mix(in srgb,var(--excluded-ink) 80%,transparent) 0 2px,transparent 2px 7px),color-mix(in srgb,var(--excluded-ink) 35%,transparent);background:var(--excluded-face);mix-blend-mode:multiply}
.pdf-import-excluded:focus-visible{outline:2px solid var(--id-color-border-focus);outline-offset:6px}
.pdf-import-key{display:inline-block;width:16px;height:12px;margin-right:var(--space-1);background:color-mix(in srgb,var(--block-color) 12%,transparent);border-left:2px solid var(--block-color)}
.pdf-import-key.pdf-import-excluded{position:static;border:0;background:var(--excluded-face);mix-blend-mode:normal}
@media(max-width:800px){.pdf-picker-status [role=tooltip]{left:0!important;transform:none!important}.pdf-import-pane-labels{display:none}
.pdf-import-narrow{display:block}
}
`}</style>
      {!conversion && error && <ui.Notice tone="error">{error}</ui.Notice>}
      {conversion && <div style={{width:'min(100%, 560px)',margin:'var(--space-8) auto',display:'flex',flexDirection:'column',gap:'var(--space-4)'}}>
        <div>{file.name} · {pdf.numPages}쪽 중 {pdf.numPages-excludedPages.size}쪽</div>
        <ui.Steps steps={[...(conversion.replacing ? ['이전 문서 정리'] : []),'구조 분석','그림 만들기','문서 저장','원본 연결']} current={[...(conversion.replacing ? ['이전 문서 정리'] : []),'구조 분석','그림 만들기','문서 저장','원본 연결'].indexOf(conversion.key)}/>
        {error ? <ui.Notice tone="error">{status} {error}</ui.Notice> : <><div>{conversion.progress?.label || conversion.key}</div><ui.Progress value={conversion.progress?.value} label={conversion.progress?.label || conversion.key}/></>}
      </div>}
      {!picking && stale && (
        <ui.Notice tone="warning">
          문서가 바뀌어 대응을 표시할 수 없음
        </ui.Notice>
      )}
      {pdf && picking && <PagePicker React={React} ui={ui} pdf={pdf} titles={pageTitles} excluded={excludedPages} toggle={togglePage} busy={busy}/> }
      {pdf && !picking && !missingMapping && !conversion && (
        <>
          <div className="pdf-import-narrow">
            <ui.Notice>넓은 창에서 보기</ui.Notice>
          </div>
          <ui.Toolbar><div data-comparison-tools style={{containerType:'inline-size',containerName:'pdf-tools',display:'flex',alignItems:'center',flexWrap:'wrap',gap:'var(--space-2)',width:'100%'}}>
            <div data-block-tools style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:'var(--space-2)',minHeight:32}}>
              {canEdit && selection.length>0 ? <>
                <span>{selection.length}개 선택</span>
                {tools.filter(a=>a.action==='merge'||a.action==='split').map(a=>toolButton(a))}
                <span tabIndex={kindDisabled?0:undefined} style={{position:'relative'}}
                  onFocus={()=>setActionHelp('kind')} onBlur={()=>setActionHelp(null)} onMouseEnter={()=>setActionHelp('kind')} onMouseLeave={()=>setActionHelp(null)}>
                  <ui.Select label="종류" hideLabel placeholder="종류" disabled={kindDisabled} value={chosen.length===1&&['paragraph','heading'].includes(chosen[0].documentKind)&&chosen[0].kind!=='heading_unnumbered'?(chosen[0].documentKind==='heading'?'h'+chosen[0].level:'paragraph'):''}
                    options={kindTools.map(a=>({value:a.id,label:a.id==='paragraph'?'본문':'제목 '+a.extra.level}))}
                    onValueChange={v=>{const a=kindTools.find(a=>a.id===v);if(a&&!a.disabled)a.run();}}/>
                  {kindDisabled&&actionHelp==='kind'&&<span role="tooltip" className="type-helper" style={actionTipStyle}>{kindTools[0].disabledReason}</span>}
                </span>
                {toolButton(tools.find(a=>a.action==='remove'))}
              </> : <>{['heading','paragraph','list','table','figure','footnote','margin'].map(k=><span key={k} className="type-helper"><span aria-hidden="true" className={'pdf-import-key'+(k==='margin'?' pdf-import-excluded':'')} style={{'--block-color':'var(--id-color-'+colors[k]+')'}}/>{labels[k]}</span>)}<span className="type-helper">고침</span></>}
            </div>
            <div data-comparison-navigation style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'var(--space-2)',minHeight:32,flexShrink:0}}>
              {warnings.length>0&&<><span className="type-helper">변환 경고 {warningIndex<0?0:warningIndex+1} / {warnings.length}</span>
                <ui.Button disabled={busy||stale||warningIndex===0} onClick={()=>select(warnings[Math.max(0,warningIndex-1)],true)}>이전</ui.Button>
                <ui.Button disabled={busy||stale||warningIndex===warnings.length-1} onClick={()=>select(warnings[warningIndex+1],true)}>다음</ui.Button></>}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                position: "relative",
              }}
              onMouseEnter={() => setTip({ page: -2 })}
              onMouseLeave={() => setTip(null)}
              onFocus={() => setTip({ page: -2 })}
              onBlur={() => setTip(null)}
              aria-describedby={
                tip?.page === -2 ? "pdf-follow-help" : undefined
              }
              title="한쪽을 스크롤하면 다른 쪽이 따라옵니다."
              tabIndex={0}
            >
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => {
                  clearTimeout(scrollTimer.current);
                  setFollow(e.target.checked);
                }}
              />{" "}
              함께 스크롤
              {tip?.page === -2 && (
                <span
                  id="pdf-follow-help"
                  role="tooltip"
                  className="type-helper"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    width: 300,
                    padding: "var(--space-2)",
                    background: "var(--id-color-surface)",
                    border: "1px solid var(--id-color-border)",
                    zIndex: 1,
                  }}
                >
                  한쪽을 스크롤하면 다른 쪽이 따라옵니다.
                </span>
              )}
            </label>
              <ui.Select label="훑어보기 배율" hideLabel value={String(browseScale)} options={browseScales.map(value=>({value:String(value),label:Math.round(value*100)+'%'}))} onValueChange={value=>changeScale(Number(value))}/>
              {undoCount>0&&<ui.Button disabled={busy} onClick={()=>correct('undo')}>되돌리기</ui.Button>}
            </div>
          </div></ui.Toolbar>
          <div data-comparison-guide className="type-helper" style={{height:24,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',textAlign:!splitting&&warningIndex>=0?'right':undefined}}>
            {splitting ? <span role="status">새 문단이 시작될 줄을 고르세요.</span> : warningIndex>=0 ? <span title={warnings[warningIndex].warning.reason}>{warnings[warningIndex].warning.reason}</span> : tip?.page>=0&&<span role="tooltip">{tip.text}</span>}
          </div>
          <div className="pdf-import-pane-labels">
            <div className="type-item-name">원본 · {pageNo} / {pdf.numPages}쪽</div>
            <div className="type-item-name">변환된 문서</div>
          </div>
          <div style={{display:'contents'}} ref={comparisonPair}
            onWheelCapture={ownComparisonScroll}
            onPointerDownCapture={ownComparisonScroll}
            onKeyDownCapture={ownComparisonScroll}
            onScrollCapture={event => {
              if (event.target !== pane.current) return;
              updateSourceViewport();
              setTip(null);
              sourceScroll();
            }}>
            {mapping ? (
              <ui.LinkedDocumentView
                document={{
                  reloadKey,
                  path: file.document,
                  target: target && !stale
                    ? {revision: mapping.revision, path: target.path, highlight: target.highlight !== false,
                       ...(target.top == null ? {} : {top: target.top, request: target.request})}
                    : undefined,
                  height: "fill",
                  label: "변환된 문서",
                  scale: browseScale,
                  onStateChange: viewState,
                  onVisibleBlockChange: documentVisible,
                  onVisibleBlockLayoutChange: layout => {documentLayout.current = layout;},
                }}
                revision={mapping.revision}
                source={sourcePages}
                sourceLabel="원본 PDF"
                sourceRef={sourceRef}
                sourceScale={browseScale}
                items={items}
                selectedId={linkedSelection}
                onSelect={selectLinkedBlock}
              />
            ) : (
              <div ref={sourceRef} tabIndex={0} aria-label="원본 PDF"
                style={{flex:1,minHeight:0,overflow:'auto',background:'var(--id-color-canvas)'}}>
                {sourcePages}
              </div>
            )}
          </div>
        </>
      )}
    </ui.ScreenLayout>
  );
}
export { Screen as default };
