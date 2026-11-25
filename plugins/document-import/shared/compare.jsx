import { linkedItems, sourcePagePositions, sourceOverlays } from "./linked-items.mjs";
import { browseScales, steppedScale } from "./browse-scale.mjs";
import { sourceForPath, sourceLocations, blockAtSource, sourceScrollTop, sourceVisibleTop, sourceAlignScrollTop } from "./scroll-sync.mjs";
import { renderPage, cancelRender, renderFailed } from "./page-render.mjs";

// One comparison screen for PDF and Word: source pages on the left, the converted document on the
// right, joined by ui.LinkedDocumentView. Correcting (PDF only) comes in through `edit`.
export const LABELS = {
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
export const COLORS = {
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
const SCALE_KEY = "document-import-browse-scale";
const excludedLabel = e => e.kind === "title" ? "문서 제목으로 쓰임" : e.kind === "removed" ? "제외 · 문서에서 뺌" : "제외 · 머리글·바닥글";
const boxLabel = b => LABELS[b.kind] + (b.warning ? " · 확인할 곳: " + b.warning.reason : "");
const helpStyle = { position: "absolute", top: "100%", left: 0, width: 300, padding: "var(--space-2)", background: "var(--id-color-surface)", border: "1px solid var(--id-color-border)", zIndex: 1 };

// pdf: the pdf.js document of the source pages; pages: their sizes [{width, height}].
// blocks: [{id, path?, kind, boxes: [{page, x0, top, x1, bottom}], warning?: {reason}, level?, edited?, documentKind?}].
// excluded: regions drawn hatched, [{page, kind, box}] (kind "title": the document title's source).
// excludedPages: 0-based pages left out of the conversion. document, revision: the saved document.
// checks: places to check in order, [{blockId?, path?, reason}]. legend: block kinds in the legend.
// busy, stale: interactions wait. guide: a line that replaces the place-to-check line.
// edit (optional): {selection, menu(block) → actions | null, tools, extraTools, splitLines,
//   onSplit(line), onSelect(block, shift), onClear(), editing}. Without it the screen is read-only.
// handle (optional ref): gets {selected(), stopFollow(), show(block, focus), pick(block)}.
export default function Compare({
  React, ui, pdf, pages, blocks, excluded = [], excludedPages, document, revision, reloadKey,
  checks = [], legend, sourceLabel, busy = false, stale = false, guide, edit, handle, onViewState, onCheckViewed,
}) {
  const { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } = React;
  const [browseScale, setBrowseScale] = useState(() => { try { const value = Number(localStorage.getItem(SCALE_KEY)); return browseScales.includes(value) ? value : 0.75; } catch { return 0.75; } });
  const [scaleError, setScaleError] = useState(false);
  const scaleValue = useRef(browseScale), scaleChange = useRef(null), scaleAnchor = useRef(null);
  const comparisonPair = useRef(null);
  const [viewport, setViewport] = useState(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [pageNo, setPageNo] = useState(1), [pageLast, setPageLast] = useState(1);
  const [width, setWidth] = useState(600);
  const [pageGap, setPageGap] = useState(0);
  const [selected, setSelected] = useState(null);
  const [follow, setFollow] = useState(true), [followed, setFollowed] = useState(null);
  const [target, setTarget] = useState(null);
  const [tip, setTip] = useState(null);
  const [checkAt, setCheckAt] = useState(-1);
  const pane = useRef(null), scrollTimer = useRef(null), scrollOwner = useRef(null), sourceAuto = useRef(null);
  const documentLayout = useRef(null), alignRequest = useRef(0), pairHeld = useRef(false);
  const editing = () => !!edit?.editing?.current;
  const editRef = useRef(edit);
  editRef.current = edit;
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  useEffect(() => {
    const pair = comparisonPair.current; if (!pair) return;
    const wheel = e => { if (!e.ctrlKey || !e.deltaY) return; e.preventDefault(); scaleChange.current?.(steppedScale(scaleValue.current, e.deltaY)); };
    pair.addEventListener("wheel", wheel, { capture: true, passive: false }); return () => pair.removeEventListener("wheel", wheel, true);
  }, [viewport]);
  const measurePageGap = useCallback(element => { if (element) setPageGap(parseFloat(getComputedStyle(element).rowGap) || 0); }, []);
  const sourceRef = useCallback(element => { pane.current = element; setViewport(element); }, []);
  useLayoutEffect(() => {
    if (!viewport) return;
    const measure = () => { setWidth(Math.max(1, viewport.clientWidth - 16)); setViewportHeight(viewport.clientHeight); };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);
  useEffect(() => {
    const cancel = e => {
      if (e.key !== "Escape" || e.defaultPrevented || e.target.closest?.("[role=menu],[role=listbox],[role=dialog]")) return;
      setSelected(null); setTarget(null); setCheckAt(-1); editRef.current?.onClear?.();
    };
    window.addEventListener("keydown", cancel); return () => window.removeEventListener("keydown", cancel);
  }, []);

  const positions = useMemo(() => sourcePagePositions(pages, width * browseScale, pageGap), [pages, width, browseScale, pageGap]);
  const locations = useMemo(() => sourceLocations(blocks, positions), [blocks, positions]);
  const byId = useMemo(() => new Map(blocks.map(b => [b.id, b])), [blocks]);
  const overlays = useMemo(() => sourceOverlays(excluded), [excluded]);
  const selection = edit?.selection ?? (selected ? [selected.id] : []);
  const linkedSelection = stale || selected?.documentTitle ? undefined : selected?.id;

  function updateSourceViewport() {
    if (!pane.current) return;
    const top = pane.current.scrollTop, bottom = top + pane.current.clientHeight;
    setPageNo(Math.max(1, positions.findIndex(p => p.top + p.height > top + 1) + 1));
    const last = positions.findIndex(p => p.top >= bottom); setPageLast(last < 0 ? positions.length : last);
  }
  function changeScale(value) {
    if (value === scaleValue.current || !browseScales.includes(value)) return;
    clearTimeout(scrollTimer.current);
    if (pane.current) {
      const top = pane.current.scrollTop, y = top + pane.current.clientHeight / 3;
      // A clicked pair nobody has scrolled away from stays the anchor and is aligned again after the change.
      const held = pairHeld.current && target?.top != null && locations.find(x => x.b.id === target.id && x.bottom > top && x.top < top + pane.current.clientHeight);
      const hit = held || locations.find(x => x.top <= y && x.bottom >= y) || locations.find(x => x.top >= y) || locations.at(-1);
      if (hit) scaleAnchor.current = { index: locations.indexOf(hit), id: hit.b.id, offset: hit.top - top, realign: !!held };
    }
    scaleValue.current = value; setBrowseScale(value); setScaleError(false);
    try { localStorage.setItem(SCALE_KEY, String(value)); } catch { setScaleError(true); }
  }
  scaleChange.current = changeScale;
  useLayoutEffect(() => {
    if (!pane.current) return;
    const anchor = scaleAnchor.current, hit = anchor && locations[anchor.index];
    if (hit && hit.b.id === anchor.id) {
      pane.current.scrollTop = Math.max(0, hit.top - anchor.offset); sourceAuto.current = pane.current.scrollTop; scaleAnchor.current = null;
      if (anchor.realign) setTarget(t => t?.id === anchor.id ? sourceTarget(t, t.highlight) : t);
    }
    updateSourceViewport();
  }, [locations, viewport, viewportHeight]);
  function ownScroll(side, event) {
    if (event?.type === "keydown" && (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) || event.ctrlKey || event.altKey || event.metaKey)) return;
    // Ctrl+wheel changes the scale; it is not a scroll.
    if (event?.type === "wheel" && event.ctrlKey) return;
    scrollOwner.current = side;
    pairHeld.current = false;
    sourceAuto.current = null;
    clearTimeout(scrollTimer.current);
  }
  function moveSource(b) {
    if (!pane.current || !b.boxes.length) return;
    pane.current.scrollTop = Math.max(0, sourceScrollTop(b, positions, pane.current.clientHeight));
    // Remember the clamped position, including no-op moves. Only fresh input clears it.
    sourceAuto.current = pane.current.scrollTop;
  }
  // The document pair of a source box comes to the box's visible height. A new request realigns
  // the same block after the document alone was scrolled.
  function sourceTarget(b, highlight = true) {
    const el = pane.current, top = el && sourceVisibleTop(b, positions, el.scrollTop, el.clientHeight);
    pairHeld.current = top != null;
    return top == null ? { ...b, highlight } : { ...b, highlight, top, request: ++alignRequest.current };
  }
  // The source box comes to the clicked document block's visible height. True when it got there,
  // false at a scroll limit or without a reported block position.
  function alignSource(b) {
    const el = pane.current, layout = documentLayout.current;
    if (!el || !b.boxes.length) return false;
    const hit = layout?.revision === revision && layout.blocks.find(x => x.path[0] === b.path?.[0]);
    if (!hit) { moveSource(b); return false; }
    const next = sourceAlignScrollTop(b, positions, hit.top, el.scrollTop, el.scrollHeight - el.clientHeight);
    if (next !== null) el.scrollTop = next;
    sourceAuto.current = el.scrollTop;
    const top = sourceVisibleTop(b, positions, el.scrollTop, el.clientHeight);
    return top != null && Math.abs(top - hit.top) <= 8;
  }
  function sourceScroll() {
    const scrollAt = performance.now();
    clearTimeout(scrollTimer.current);
    if (scrollOwner.current !== "source" || sourceAuto.current !== null || !follow || stale || busy) return;
    scrollTimer.current = setTimeout(() => {
      if (scrollOwner.current !== "source" || !pane.current) return;
      const b = blockAtSource(locations, pane.current.scrollTop + pane.current.clientHeight / 3);
      if (b) {
        setFollowed(b);
        setTarget(old => old?.id === b.id && old.highlight === false ? old : { ...b, highlight: false });
        performance.measure("document-import-follow", { start: scrollAt, detail: { id: b.id, direction: "source" } });
      }
    }, 150);
  }
  function documentVisible(report) {
    if (scrollOwner.current !== "document" || !follow || stale || busy || editing() || report.revision !== revision) return;
    const b = sourceForPath(blocks, report.path, true);
    if (!b) return;
    clearTimeout(scrollTimer.current);
    setFollowed(b);
    // Clear a previous click highlight without navigating back into the user's scroll.
    setTarget(null);
    moveSource(b);
  }
  function selectLinkedBlock(id) {
    if (editing()) return;
    const block = byId.get(id);
    if (block) select(block, scrollOwner.current === "source" ? false : "document");
  }
  function select(b, scroll = false, shift = false) {
    if (stale || busy) return;
    clearTimeout(scrollTimer.current);
    setFollowed(null);
    // A document click keeps the document still and moves the source to it.
    // Once the source has reached it, the pair is held like a source click (the document stays
    // within 8px and does not move); at a source limit the document keeps its place.
    const reached = scroll === "document" && alignSource(b);
    if (scroll === true) moveSource(b);
    if (scroll === "document" && !reached) pairHeld.current = false;
    setTarget(scroll === "document" && !reached ? { ...b, highlight: true } : sourceTarget(b));
    setSelected(b);
    edit?.onSelect?.(b, shift);
  }
  function selectTitle(id) {
    if (stale || busy) return;
    ownScroll("source");
    const b = { id, documentTitle: true };
    setSelected(b); setTarget(null);
    edit?.onSelect?.(b, false);
  }
  // Two checks may share a block; the one moved to stays current while its block is selected.
  const atCheck = checkAt >= 0 && checks[checkAt] && (checks[checkAt].blockId ? checks[checkAt].blockId === selected?.id : !selected);
  const checkIndex = atCheck ? checkAt : selected ? checks.findIndex(c => c.blockId && c.blockId === selected.id) : -1;
  const visibleCheck = checks[checkIndex];
  useEffect(() => { if (visibleCheck) onCheckViewed?.(visibleCheck.flowId); }, [visibleCheck, onCheckViewed]);
  function moveToCheck(index) {
    const c = checks[index];
    if (!c || stale || busy) return;
    setCheckAt(index);
    // The document moves on its own now; its reports do not move the source back.
    scrollOwner.current = null;
    const b = c.blockId && byId.get(c.blockId);
    if (b) { select(b, true); return; }
    if (!c.path) return;
    // A place without a source box: only the document goes to it.
    clearTimeout(scrollTimer.current);
    setFollowed(null); setSelected(null); edit?.onClear?.();
    setTarget({ id: null, path: c.path, highlight: true });
  }
  const checkText = c => c.reason + (c.path && !c.blockId ? " · 원본 위치 없음" : "");

  if (handle) handle.current = {
    selected: () => selected,
    stopFollow: () => clearTimeout(scrollTimer.current),
    pick: b => setSelected(b),
    // After a correction: the given block is selected and its document pair comes to its height.
    show(b, focus = false) {
      clearTimeout(scrollTimer.current);
      setFollowed(null);
      setSelected(b || null);
      setTarget(b ? sourceTarget(b) : null);
      if (focus && b) requestAnimationFrame(() => pane.current?.querySelector('[data-linked-item="' + b.id + '"]')?.focus({ preventScroll: true }));
    },
  };

  const Page = useMemo(() => function Page({ index, scale }) {
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
      })().catch(e => {
        // A failure stays on this page only; it never becomes the screen's error.
        if (renderFailed(e, gone)) setFailed(true);
      });
      return () => { gone = true; cancelRender(canvas); };
    }, [index, scale, attempt]);
    return <>
      <canvas ref={ref} style={{ display: "block", width: "100%" }} />
      {failed && <div data-page-render-failed style={{ position: "absolute", top: "var(--space-4)", left: "var(--space-4)", right: "var(--space-4)", zIndex: 1 }}>
        <ui.Notice tone="error">이 쪽을 그리지 못했습니다. <ui.Button onClick={() => setAttempt(n => n + 1)}>다시 그리기</ui.Button></ui.Notice>
      </div>}
    </>;
  }, [pdf]);

  const viewState = useCallback(s => {
    if (s.state === "stale-target") setSelected(null);
    onViewState?.(s);
  }, [onViewState]);
  const items = useMemo(() => linkedItems(blocks.map(b => b.warning ? { ...b, warning: { reason: "확인할 곳: " + b.warning.reason } } : b),
    positions, width * browseScale, width + 16, LABELS, COLORS), [blocks, positions, width, browseScale]);
  function ownComparisonScroll(event) {
    const side = pane.current?.contains(event.target) ? "source" : "document";
    ownScroll(side, event.type === "keydown" && event.key === "Enter" ? undefined : event);
  }
  const showTip = (page, top, text) => setTip({ page, top, text });
  const lastPage = positions.at(-1);
  const sourcePages = (
    <div ref={measurePageGap} style={{ position: "relative", rowGap: "var(--space-2)", minHeight: "100%", height: lastPage ? lastPage.top + lastPage.height : 0, background: "var(--id-color-canvas)" }}>
      {positions.map((pos, i) => (
        <div data-source-page={i + 1} key={i} style={{ height: pos.height, position: "absolute", top: pos.top, width: width * browseScale, left: Math.max(0, width + 16 - width * browseScale), background: "var(--id-color-paper)", boxShadow: "var(--shadow-paper)" }}>
          {i + 1 >= pageNo - 2 && i + 1 <= pageLast + 2 && (
            <div style={{ position: "relative", outline: excludedPages?.has(i) ? "3px solid var(--id-color-danger)" : undefined, outlineOffset: -3 }}>
              <div style={{ opacity: excludedPages?.has(i) ? 0.4 : 1 }}>
                <Page index={i} scale={pos.scale} />
              </div>
              {excludedPages?.has(i) && (
                <svg aria-label="제외" viewBox="0 0 400 500" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", color: "var(--id-color-danger)", opacity: 0.55 }}>
                  <g transform="translate(200 250) rotate(-35) scale(5)">
                    <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill="currentColor" style={{ color: "var(--id-color-danger)" }} className="type-screen-title">제외</text>
                  </g>
                </svg>
              )}
              <div style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", pointerEvents: "none" }}>
                {blocks.flatMap(b => b.boxes.filter(x => x.page === i).map((x, j) => {
                  const menu = edit?.menu(b);
                  const trigger = <ui.Button
                    className="compare-box"
                    data-selected={selection.includes(b.id) && b.id !== linkedSelection}
                    data-linked-item={b.path ? b.id : undefined}
                    aria-pressed={b.id === linkedSelection}
                    aria-label={boxLabel(b)}
                    onMouseEnter={() => showTip(i, x.bottom * pos.scale, boxLabel(b))}
                    onMouseLeave={() => setTip(null)}
                    onFocus={() => showTip(i, x.bottom * pos.scale, boxLabel(b))}
                    onBlur={() => setTip(null)}
                    onContextMenu={e => {
                      if (!menu) { e.preventDefault(); return; }
                      if (!busy && !stale && !editing() && !selection.includes(b.id)) select(b);
                    }}
                    onClick={e => {
                      ownScroll("source");
                      if (e.shiftKey && edit) { e.stopPropagation(); select(b, false, true); }
                    }}
                    style={{
                      pointerEvents: "auto",
                      left: x.x0 * pos.scale,
                      top: x.top * pos.scale,
                      width: Math.max(1, (x.x1 - x.x0) * pos.scale),
                      height: Math.max(1, (x.bottom - x.top) * pos.scale),
                      "--block-color": "var(--id-color-" + COLORS[b.kind] + ")",
                      "--strip-color": "var(--id-color-" + (b.warning ? "warning" : followed?.id === b.id ? "accent" : COLORS[b.kind]) + ")",
                    }}>
                    <span className="type-helper" style={{ position: "absolute", left: -x.x0 * pos.scale, top: 0, width: Math.max(0, x.x0 * pos.scale - 4), display: "flex", justifyContent: "flex-end", gap: 0, overflow: "hidden", whiteSpace: "nowrap", pointerEvents: "none", background: "var(--id-color-surface)", color: "var(--id-color-text)" }}>
                      {b.level && (["heading", "heading_unnumbered"].includes(b.kind) || (b.kind === "list" && b.level >= 2)) && <span>{browseScale === .4 ? "·" : b.kind === "list" ? b.level : "H" + Math.min(6, b.level)}</span>}
                      {b.warning && <span style={{ color: "var(--id-color-warning)" }}>!</span>}
                      {b.edited && <span>{browseScale === .4 ? "·" : "고침"}</span>}
                    </span>
                  </ui.Button>;
                  return menu ? <ui.ContextMenu key={b.id + "-" + j} disabled={busy || stale} trigger={trigger} actions={menu} /> : <React.Fragment key={b.id + "-" + j}>{trigger}</React.Fragment>;
                }))}
                {edit?.splitLines?.map((l, j) => l.page === i && <ui.Button
                  key={"line" + j} className="compare-box compare-line" data-source-line={j} disabled={j === 0 || busy}
                  aria-label={j === 0 ? "첫째 줄은 나눌 수 없습니다." : (j + 1) + "번째 줄 앞에서 나누기"}
                  onClick={() => edit.onSplit(j)}
                  style={{ pointerEvents: "auto", left: l.box.x0 * pos.scale, top: l.box.top * pos.scale, width: (l.box.x1 - l.box.x0) * pos.scale,
                    height: Math.max(1, (l.box.bottom - l.box.top) * pos.scale), outline: "1px solid var(--id-color-accent)", outlineOffset: 2 }} />)}
                {overlays.titles.map((e, j) => e.page === i && <ui.Button
                  key={"title" + j} className="compare-box" data-selected={selected?.id === "title-" + j}
                  aria-label="문서 제목으로 쓰임" aria-pressed={selected?.id === "title-" + j}
                  onMouseEnter={() => showTip(i, 0, "문서 제목으로 쓰임")} onMouseLeave={() => setTip(null)}
                  onFocus={() => showTip(i, 0, "문서 제목으로 쓰임")} onBlur={() => setTip(null)}
                  onClick={() => selectTitle("title-" + j)}
                  style={{ pointerEvents: "auto", left: e.box.x0 * pos.scale, top: e.box.top * pos.scale, width: Math.max(1, (e.box.x1 - e.box.x0) * pos.scale), height: Math.max(1, (e.box.bottom - e.box.top) * pos.scale), "--block-color": "var(--id-color-accent)" }}>
                  <span className="type-helper" style={{ position: "absolute", left: -e.box.x0 * pos.scale, top: 0, width: Math.max(0, e.box.x0 * pos.scale - 4), display: "flex", justifyContent: "flex-end", overflow: "hidden", whiteSpace: "nowrap", pointerEvents: "none", background: "var(--id-color-surface)", color: "var(--id-color-text)" }}>제목</span>
                </ui.Button>)}
                {overlays.excluded.filter(x => x.page === i).map((e, j) => (
                  <div key={"e" + j} className="compare-excluded" onContextMenu={e => e.preventDefault()} tabIndex={0}
                    aria-label={excludedLabel(e)}
                    onMouseEnter={() => showTip(i, 0, excludedLabel(e))} onMouseLeave={() => setTip(null)}
                    onFocus={() => showTip(i, 0, excludedLabel(e))} onBlur={() => setTip(null)}
                    style={{ position: "absolute", pointerEvents: "auto", left: e.box.x0 * pos.scale - 3, top: e.box.top * pos.scale - 3, width: (e.box.x1 - e.box.x0) * pos.scale + 6, height: (e.box.bottom - e.box.top) * pos.scale + 6 }} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return <>
    <style>{`
@container compare-tools (max-width:940px){[data-comparison-navigation]{flex-basis:100%;justify-content:flex-end}}
.compare-pane-labels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.compare-narrow{display:none}
.compare-box{position:absolute!important;min-height:0!important;padding:0!important;border-radius:0!important;border:0!important;box-shadow:none!important;background:transparent!important;color:inherit!important}
.compare-box::before{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--block-color) 12%,transparent);pointer-events:none}
.compare-box::after{content:"";position:absolute;inset:0 auto 0 -3px;width:2px;background:var(--strip-color,var(--block-color));pointer-events:none}
.compare-box:hover::before,.compare-box:focus-visible::before{background:color-mix(in srgb,var(--block-color) 18%,transparent)}
.compare-box[data-selected=true]::before{background:color-mix(in srgb,var(--block-color) 22%,transparent)}
.compare-box[data-selected=true]{outline:1px solid var(--block-color);outline-offset:4px}
.compare-box:not([data-linked-item]):focus-visible{outline:2px solid var(--id-color-border-focus)!important;outline-offset:6px}
.compare-line::before,.compare-line::after{display:none}
.compare-line{outline:1px solid var(--id-color-accent);outline-offset:2px}
.compare-excluded{position:absolute;--excluded-ink:color-mix(in srgb,var(--id-color-text-muted) 70%,var(--id-color-surface));--excluded-face:repeating-linear-gradient(135deg,color-mix(in srgb,var(--excluded-ink) 80%,transparent) 0 2px,transparent 2px 7px),color-mix(in srgb,var(--excluded-ink) 35%,transparent);background:var(--excluded-face);mix-blend-mode:multiply}
.compare-excluded:focus-visible{outline:2px solid var(--id-color-border-focus);outline-offset:6px}
.compare-key{display:inline-block;width:16px;height:12px;margin-right:var(--space-1);background:color-mix(in srgb,var(--block-color) 12%,transparent);border-left:2px solid var(--block-color)}
.compare-key.compare-excluded{position:static;border:0;background:var(--excluded-face);mix-blend-mode:normal}
@media(max-width:800px){.compare-pane-labels{display:none}.compare-narrow{display:block}}
`}</style>
    {scaleError && <ui.Notice tone="error">배율을 기억하지 못했습니다.</ui.Notice>}
    <div className="compare-narrow">
      <ui.Notice>넓은 창에서 보기</ui.Notice>
    </div>
    <ui.Toolbar><div data-comparison-tools style={{ containerType: "inline-size", containerName: "compare-tools", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)", width: "100%" }}>
      <div data-block-tools style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)", minHeight: 32 }}>
        {edit?.tools || <>
          {legend.map(k => <span key={k} className="type-helper"><span aria-hidden="true" className={"compare-key" + (k === "margin" ? " compare-excluded" : "")} style={{ "--block-color": "var(--id-color-" + COLORS[k] + ")" }} />{LABELS[k]}</span>)}
          {edit && <span className="type-helper">고침</span>}
          <span className="type-helper"><span aria-hidden="true" style={{ color: "var(--id-color-warning)", marginRight: "var(--space-1)" }}>!</span>확인할 곳</span>
        </>}
      </div>
      <div data-comparison-navigation style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)", minHeight: 32, flexShrink: 0 }}>
        {checks.length > 0 && <><span className="type-helper">확인할 곳 {checkIndex < 0 ? 0 : checkIndex + 1} / {checks.length}</span>
          <ui.Button disabled={busy || stale || checkIndex === 0} onClick={() => moveToCheck(Math.max(0, checkIndex - 1))}>이전</ui.Button>
          <ui.Button disabled={busy || stale || checkIndex === checks.length - 1} onClick={() => moveToCheck(checkIndex + 1)}>다음</ui.Button></>}
        <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", position: "relative" }}
          onMouseEnter={() => setTip({ page: -2 })} onMouseLeave={() => setTip(null)}
          onFocus={() => setTip({ page: -2 })} onBlur={() => setTip(null)}
          aria-describedby={tip?.page === -2 ? "compare-follow-help" : undefined}
          title="한쪽을 스크롤하면 다른 쪽이 따라옵니다." tabIndex={0}>
          <input type="checkbox" checked={follow} onChange={e => { clearTimeout(scrollTimer.current); setFollow(e.target.checked); }} />{" "}
          함께 스크롤
          {tip?.page === -2 && <span id="compare-follow-help" role="tooltip" className="type-helper" style={helpStyle}>한쪽을 스크롤하면 다른 쪽이 따라옵니다.</span>}
        </label>
        <ui.Select label="훑어보기 배율" hideLabel value={String(browseScale)} options={browseScales.map(value => ({ value: String(value), label: Math.round(value * 100) + "%" }))} onValueChange={value => changeScale(Number(value))} />
        {edit?.extraTools}
      </div>
    </div></ui.Toolbar>
    <div data-comparison-guide className="type-helper" style={{ height: 24, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: !guide && checkIndex >= 0 ? "right" : undefined }}>
      {guide ? <span role="status">{guide}</span> : checkIndex >= 0 ? <span title={checkText(checks[checkIndex])}>{checkText(checks[checkIndex])}</span> : tip?.page >= 0 && <span role="tooltip">{tip.text}</span>}
    </div>
    <div className="compare-pane-labels">
      <div className="type-item-name">원본 · {pageNo} / {pages.length}쪽</div>
      <div className="type-item-name">변환된 문서</div>
    </div>
    <div style={{ display: "contents" }} ref={comparisonPair}
      onWheelCapture={ownComparisonScroll}
      onPointerDownCapture={ownComparisonScroll}
      onKeyDownCapture={ownComparisonScroll}
      onScrollCapture={event => {
        if (event.target !== pane.current) return;
        updateSourceViewport();
        setTip(null);
        sourceScroll();
      }}>
      <ui.LinkedDocumentView
        document={{
          reloadKey,
          path: document,
          target: target && !stale
            ? { revision, path: target.path, highlight: target.highlight !== false, ...(target.top == null ? {} : { top: target.top, request: target.request }) }
            : undefined,
          height: "fill",
          label: "변환된 문서",
          scale: browseScale,
          onStateChange: viewState,
          onVisibleBlockChange: documentVisible,
          onVisibleBlockLayoutChange: layout => { documentLayout.current = layout; },
        }}
        revision={revision}
        source={sourcePages}
        sourceLabel={sourceLabel}
        sourceRef={sourceRef}
        sourceScale={browseScale}
        items={items}
        selectedId={linkedSelection}
        onSelect={selectLinkedBlock}
      />
    </div>
  </>;
}
