import { linkedItems, sourcePagePositions } from "../shared/linked-items.mjs";
import { browseScales } from "../shared/browse-scale.mjs";
import { sourceForPath, sourceLocations, blockAtSource, sourceScrollTop, sourceVisibleTop, sourceAlignScrollTop } from "../shared/scroll-sync.mjs";
import { renderPage, cancelRender, renderFailed } from "../shared/page-render.mjs";

// The same kind names and colors as PDF import's source boxes.
export const LABELS = { heading: "제목", paragraph: "본문", list: "목록", table: "표", figure: "그림" };
const COLORS = { heading: "accent", paragraph: "info", list: "success", table: "border-focus", figure: "text" };
const SCALE_KEY = "document-import-browse-scale";
const key = path => path.join(".");

// Source pages on the left, the converted document on the right, joined by ui.LinkedDocumentView.
export default function Compare({ React, ui, pdf, source, saved, file, onViewState, onReady }) {
  const { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } = React;
  const [scale, setScale] = useState(() => { try { const v = Number(localStorage.getItem(SCALE_KEY)); return browseScales.includes(v) ? v : 0.75; } catch { return 0.75; } });
  const [viewport, setViewport] = useState(null);
  const [width, setWidth] = useState(600);
  const [pageGap, setPageGap] = useState(0);
  const [pageNo, setPageNo] = useState(1), [pageLast, setPageLast] = useState(1);
  const [target, setTarget] = useState(null);
  const [selected, setSelected] = useState(null);
  const [warningIndex, setWarningIndex] = useState(-1);
  const [tip, setTip] = useState("");
  const pane = useRef(null), scrollOwner = useRef(null), sourceAuto = useRef(null), scrollTimer = useRef(null);
  const documentLayout = useRef(null), alignRequest = useRef(0), scaleAnchor = useRef(null);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  const warnings = saved.warnings || [];
  const blocks = useMemo(() => {
    const byPath = new Map();
    warnings.forEach(w => { if (w.path && !byPath.has(key(w.path))) byPath.set(key(w.path), w); });
    return source.blocks.map(b => ({ ...b, id: key(b.path), warning: byPath.get(key(b.path)) }));
  }, [source, saved]);
  const sourceOf = useMemo(() => new Map(blocks.map(b => [b.id, b])), [blocks]);

  const sourceRef = useCallback(element => { pane.current = element; setViewport(element); }, []);
  const measurePageGap = useCallback(element => { if (element) setPageGap(parseFloat(getComputedStyle(element).rowGap) || 0); }, []);
  useLayoutEffect(() => {
    if (!viewport) return;
    const measure = () => setWidth(Math.max(1, viewport.clientWidth - 16));
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);
  const positions = useMemo(() => sourcePagePositions(source.pages, width * scale, pageGap), [source, width, scale, pageGap]);
  const locations = useMemo(() => sourceLocations(blocks, positions), [blocks, positions]);
  const items = useMemo(() => linkedItems(blocks.map(b => ({ ...b, warning: b.warning && { reason: "확인할 곳" } })), positions, width * scale, width + 16, LABELS, COLORS),
    [blocks, positions, width, scale]);

  function updatePages() {
    if (!pane.current) return;
    const top = pane.current.scrollTop, bottom = top + pane.current.clientHeight;
    setPageNo(Math.max(1, positions.findIndex(p => p.top + p.height > top + 1) + 1));
    const last = positions.findIndex(p => p.top >= bottom);
    setPageLast(last < 0 ? positions.length : last);
  }
  useLayoutEffect(() => {
    const anchor = scaleAnchor.current, hit = anchor && locations[anchor.index];
    if (pane.current && hit && hit.b.id === anchor.id) {
      pane.current.scrollTop = Math.max(0, hit.top - anchor.offset);
      sourceAuto.current = pane.current.scrollTop;
      scaleAnchor.current = null;
    }
    updatePages();
  }, [locations, viewport]);

  function changeScale(value) {
    if (value === scale || !browseScales.includes(value)) return;
    if (pane.current) {
      const top = pane.current.scrollTop, y = top + pane.current.clientHeight / 3;
      const hit = locations.find(x => x.top <= y && x.bottom >= y) || locations.find(x => x.top >= y) || locations.at(-1);
      if (hit) scaleAnchor.current = { index: locations.indexOf(hit), id: hit.b.id, offset: hit.top - top };
    }
    setScale(value);
    try { localStorage.setItem(SCALE_KEY, String(value)); } catch {}
  }

  // Whoever the user scrolls leads; the other side follows.
  function ownScroll(event) {
    if (event?.type === "keydown" && (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) || event.ctrlKey || event.altKey || event.metaKey)) return;
    if (event?.type === "wheel" && event.ctrlKey) return;
    scrollOwner.current = pane.current?.contains(event.target) ? "source" : "document";
    sourceAuto.current = null;
    clearTimeout(scrollTimer.current);
  }
  function moveSource(b) {
    if (!pane.current) return;
    pane.current.scrollTop = Math.max(0, sourceScrollTop(b, positions, pane.current.clientHeight));
    sourceAuto.current = pane.current.scrollTop;
  }
  function sourceScroll() {
    clearTimeout(scrollTimer.current);
    if (scrollOwner.current !== "source" || sourceAuto.current !== null) return;
    scrollTimer.current = setTimeout(() => {
      if (scrollOwner.current !== "source" || !pane.current) return;
      const b = blockAtSource(locations, pane.current.scrollTop + pane.current.clientHeight / 3);
      if (b) setTarget(old => old?.id === b.id && old.highlight === false ? old : { id: b.id, path: b.path, highlight: false });
    }, 150);
  }
  function documentVisible(report) {
    if (scrollOwner.current !== "document" || report.revision !== source.revision) return;
    const b = sourceForPath(blocks, report.path, true);
    if (!b) return;
    clearTimeout(scrollTimer.current);
    setTarget(null);
    moveSource(b);
  }
  // A source box brings its document pair to the same height; a document block brings its source
  // box to the block's height.
  function select(b, from) {
    clearTimeout(scrollTimer.current);
    setSelected(b.id);
    if (from === "document") {
      const el = pane.current, hit = documentLayout.current?.revision === source.revision && documentLayout.current.blocks.find(x => x.path[0] === b.path[0]);
      if (el && hit) {
        const next = sourceAlignScrollTop(b, positions, hit.top, el.scrollTop, el.scrollHeight - el.clientHeight);
        if (next !== null) el.scrollTop = next;
        sourceAuto.current = el.scrollTop;
      } else moveSource(b);
      setTarget({ id: b.id, path: b.path, highlight: true });
      return;
    }
    if (from === "jump") moveSource(b);
    const el = pane.current, top = el && sourceVisibleTop(b, positions, el.scrollTop, el.clientHeight);
    setTarget(top == null ? { id: b.id, path: b.path, highlight: true } : { id: b.id, path: b.path, highlight: true, top, request: ++alignRequest.current });
  }
  function jump(index) {
    const w = warnings[index];
    if (!w) return;
    setWarningIndex(index);
    scrollOwner.current = null;
    const b = w.path && sourceOf.get(key(w.path));
    if (b) select(b, "jump");
    else if (w.path) { setSelected(null); setTarget({ id: key(w.path), path: w.path, highlight: true }); }
  }

  const Page = useMemo(() => function Page({ index, scale }) {
    const ref = useRef(null);
    const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
    useEffect(() => {
      let gone = false, canvas = null;
      (async () => {
        const p = await pdf.getPage(index + 1);
        canvas = ref.current;
        if (gone || !canvas) return;
        if (await renderPage(canvas, p, p.getViewport({ scale }), () => gone) && !gone) setFailed(false);
      })().catch(e => { if (renderFailed(e, gone)) setFailed(true); });
      return () => { gone = true; cancelRender(canvas); };
    }, [index, scale, attempt]);
    return <>
      <canvas ref={ref} style={{ display: "block", width: "100%" }} />
      {failed && <div style={{ position: "absolute", top: "var(--space-4)", left: "var(--space-4)", right: "var(--space-4)", zIndex: 1 }}>
        <ui.Notice tone="error">이 쪽을 그리지 못했습니다. <ui.Button onClick={() => setAttempt(n => n + 1)}>다시 그리기</ui.Button></ui.Notice>
      </div>}
    </>;
  }, [pdf]);

  const boxLabel = b => LABELS[b.kind] + (b.warning ? " · 확인할 곳: " + b.warning.detail : "");
  const lastPage = positions.at(-1);
  const left = Math.max(0, width + 16 - width * scale);
  const pages = (
    <div ref={measurePageGap} style={{ position: "relative", rowGap: "var(--space-2)", minHeight: "100%", height: lastPage ? lastPage.top + lastPage.height : 0, background: "var(--id-color-canvas)" }}>
      {positions.map((pos, i) => (
        <div key={i} data-source-page={i + 1} style={{ position: "absolute", top: pos.top, left, width: width * scale, height: pos.height, background: "var(--id-color-paper)", boxShadow: "var(--shadow-paper)" }}>
          {i + 1 >= pageNo - 2 && i + 1 <= pageLast + 2 && <div style={{ position: "relative" }}>
            <Page index={i} scale={pos.scale} />
            <div style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", pointerEvents: "none" }}>
              {blocks.flatMap(b => b.boxes.filter(x => x.page === i).map((x, j) => (
                <ui.Button key={b.id + "-" + j} className="word-import-box"
                  data-linked-item={b.id} aria-pressed={b.id === selected} aria-label={boxLabel(b)}
                  onMouseEnter={() => setTip(boxLabel(b))} onMouseLeave={() => setTip("")}
                  onFocus={() => setTip(boxLabel(b))} onBlur={() => setTip("")}
                  style={{ pointerEvents: "auto", left: x.x0 * pos.scale, top: x.top * pos.scale, width: Math.max(1, (x.x1 - x.x0) * pos.scale), height: Math.max(1, (x.bottom - x.top) * pos.scale),
                    "--block-color": "var(--id-color-" + COLORS[b.kind] + ")", "--strip-color": "var(--id-color-" + (b.warning ? "warning" : COLORS[b.kind]) + ")" }}>
                  {b.warning && <span className="type-helper" style={{ position: "absolute", right: "100%", top: 0, paddingRight: 4, pointerEvents: "none", color: "var(--id-color-warning)" }}>!</span>}
                </ui.Button>
              )))}
            </div>
          </div>}
        </div>
      ))}
    </div>
  );

  const current = warnings[warningIndex];
  const guide = current ? current.label + " · " + current.detail + (current.path && !sourceOf.has(key(current.path)) ? " · 원본 위치 없음" : "") : tip;
  return <>
    <style>{`
.word-import-box{position:absolute!important;min-height:0!important;padding:0!important;border-radius:0!important;border:0!important;box-shadow:none!important;background:transparent!important;color:inherit!important}
.word-import-box::before{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--block-color) 12%,transparent);pointer-events:none}
.word-import-box::after{content:"";position:absolute;inset:0 auto 0 -3px;width:2px;background:var(--strip-color,var(--block-color));pointer-events:none}
.word-import-box:hover::before,.word-import-box:focus-visible::before{background:color-mix(in srgb,var(--block-color) 18%,transparent)}
.word-import-key{display:inline-block;width:16px;height:12px;margin-right:var(--space-1);background:color-mix(in srgb,var(--block-color) 12%,transparent);border-left:2px solid var(--block-color)}
.word-import-pane-labels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:800px){.word-import-pane-labels{display:none}}
`}</style>
    <ui.Toolbar><div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)", minHeight: 32 }}>
        {Object.keys(LABELS).map(k => <span key={k} className="type-helper"><span aria-hidden="true" className="word-import-key" style={{ "--block-color": "var(--id-color-" + COLORS[k] + ")" }} />{LABELS[k]}</span>)}
        <span className="type-helper"><span aria-hidden="true" style={{ color: "var(--id-color-warning)", marginRight: "var(--space-1)" }}>!</span>확인할 곳</span>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)", minHeight: 32, flexShrink: 0 }}>
        {warnings.length > 0 && <>
          <span className="type-helper">확인할 곳 {warningIndex < 0 ? 0 : warningIndex + 1} / {warnings.length}</span>
          <ui.Button disabled={warningIndex <= 0} onClick={() => jump(warningIndex - 1)}>이전</ui.Button>
          <ui.Button disabled={warningIndex >= warnings.length - 1} onClick={() => jump(warningIndex + 1)}>다음</ui.Button>
        </>}
        <ui.Select label="배율" hideLabel value={String(scale)} options={browseScales.map(v => ({ value: String(v), label: Math.round(v * 100) + "%" }))} onValueChange={v => changeScale(Number(v))} />
      </div>
    </div></ui.Toolbar>
    <div className="type-helper" style={{ height: 24, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {guide && <span role={current ? "status" : "tooltip"} title={guide}>{guide}</span>}
    </div>
    <div className="word-import-pane-labels">
      <div className="type-item-name">원본 · {pageNo} / {source.pages.length}쪽</div>
      <div className="type-item-name">변환된 문서</div>
    </div>
    <div style={{ display: "contents" }}
      onWheelCapture={ownScroll} onPointerDownCapture={ownScroll} onKeyDownCapture={e => ownScroll(e.key === "Enter" ? { type: "pointerdown", target: e.target } : e)}
      onScrollCapture={e => { if (e.target !== pane.current) return; updatePages(); setTip(""); sourceScroll(); }}>
      <ui.LinkedDocumentView
        document={{
          path: file.document, height: "fill", label: "변환된 문서", scale,
          target: target ? { revision: source.revision, path: target.path, highlight: target.highlight !== false, ...(target.top == null ? {} : { top: target.top, request: target.request }) } : undefined,
          onStateChange: s => { onViewState(s); if (s.state === "ready") onReady(); },
          onVisibleBlockChange: documentVisible,
          onVisibleBlockLayoutChange: layout => { documentLayout.current = layout; },
        }}
        revision={source.revision}
        source={pages}
        sourceLabel="원본 쪽"
        sourceRef={sourceRef}
        sourceScale={scale}
        items={items}
        selectedId={selected ?? undefined}
        onSelect={id => { const b = sourceOf.get(id); if (b) select(b, scrollOwner.current === "source" ? "source" : "document"); }}
      />
    </div>
  </>;
}
