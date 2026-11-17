import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import workerSource from "./worker-source.js";
import { authoring } from "./authoring.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
  new Blob([workerSource], { type: "text/javascript" }),
);
const labels = {
  heading: "제목",
  heading_unnumbered: "제목",
  paragraph: "본문",
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
  caption: "info",
  list: "success",
  table: "border-focus",
  figure: "text",
  footnote: "text-muted",
  margin: "border",
  front: "border",
};
const warningNames = {
  "unnumbered-heading": "번호 없는 제목 후보",
  "paragraph-boundary": "문단 경계가 불확실함",
  "paragraph-end": "끝맺음 없는 문단",
  "paragraph-start": "소문자로 시작하는 문단",
  "heading-number": "제목 번호",
  "footnote-pair": "각주 짝",
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
function Screen({
  React,
  ui,
  invoke,
  pickPath,
  saveDocument,
  openDocument,
  confirm,
}) {
  const { useState, useRef, useEffect, useMemo } = React;
  const recentKey = "pdf-import-recent-folders";
  const [recent, setRecent] = useState([]);
  useEffect(() => {
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
      if (!gone) setError("저장된 문서 목록을 읽지 못했습니다.");
    });
    return () => {
      gone = true;
    };
  }, []);
  const [status, setStatus] = useState("PDF를 골라 주세요."),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState(null),
    [pdf, setPdf] = useState(null),
    [result, setResult] = useState(null),
    [mapping, setMapping] = useState(null),
    [selected, setSelected] = useState(null),
    [stale, setStale] = useState(false),
    [cached, setCached] = useState(false),
    [pageNo, setPageNo] = useState(1),
    [width, setWidth] = useState(600),
    [tip, setTip] = useState(null);
  const [picking, setPicking] = useState(false),
    [excludedPages, setExcludedPages] = useState(new Set()),
    [follow, setFollow] = useState(true),
    [followed, setFollowed] = useState(null),
    [target, setTarget] = useState(null),
    [warningFilter, setWarningFilter] = useState("all");
  const anchor = useRef(null),
    scrollTimer = useRef(null),
    suppressScroll = useRef(false);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  const pane = useRef(null),
    metrics = useRef({});
  useEffect(() => {
    if (!pane.current) return;
    const ro = new ResizeObserver((es) =>
      setWidth(Math.max(1, es[0].contentRect.width - 16)),
    );
    ro.observe(pane.current);
    return () => ro.disconnect();
  }, [pdf]);
  useEffect(
    () => () => {
      pdf?.loadingTask.destroy();
    },
    [pdf],
  );
  const allWarnings = mapping?.blocks.filter((b) => b.warning) || [];
  const warnings = allWarnings.filter(
    (b) => warningFilter === "all" || b.warning.code === warningFilter,
  );
  const warningIndex = warnings.findIndex((b) => b.id === selected?.id);
  const warningOptions = [
    { value: "all", label: "전체(" + allWarnings.length + ")" },
    ...[...new Set(allWarnings.map((b) => b.warning.code))].map((code) => ({
      value: code,
      label:
        (warningNames[code] ||
          allWarnings.find((b) => b.warning.code === code).warning.reason) +
        "(" +
        allWarnings.filter((b) => b.warning.code === code).length +
        ")",
    })),
  ];
  const frontPages = new Set([...excludedPages].map((p) => p - 1));
  const positions = useMemo(() => {
    let top = 0;
    return (mapping?.pages || result?.pages || pdf?.pageSizes || []).map(
      (p, i) => {
        const scale = width / p.width,
          v = {
            top,
            height: p.height * scale + 16,
            scale,
          };
        top += v.height;
        return v;
      },
    );
  }, [mapping, result, pdf, width]);
  async function choose() {
    try {
      const f = await pickPath({ kind: "pdf" });
      if (f) await load(f.path);
    } catch (e) {
      setError("PDF 선택에 실패했습니다.");
    }
  }
  async function load(path, cachedOnly = false) {
    clearTimeout(scrollTimer.current);
    anchor.current = null;
    setPageNo(1);
    setTip(null);
    setExcludedPages(new Set());
    setBusy(true);
    setPicking(false);
    setFollowed(null);
    setTarget(null);
    setWarningFilter("all");
    setError("");
    setMapping(null);
    setResult(null);
    setSelected(null);
    setStale(false);
    setCached(false);
    setStatus("PDF 읽는 중");
    metrics.current = { start: performance.now() };
    try {
      const f = await invoke("load", { path, cachedOnly });
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
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
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
      setPdf(doc);
      metrics.current.readMs = performance.now() - metrics.current.start;
      if (f.cached) {
        setExcludedPages(
          new Set(
            f.cached.excludedPages ||
              Array.from(
                {
                  length: Math.max(
                    0,
                    (f.cached.stats?.body_start_page || 1) - 1,
                  ),
                },
                (_, i) => i + 1,
              ),
          ),
        );
        setMapping(f.cached);
        setStale(f.cached.stale);
        setCached(true);
        setStatus(
          "변환 완료 · 확인할 곳 " +
            f.cached.blocks.filter((b) => b.warning).length,
        );
      } else {
        const suggestion = await invoke("suggest", { id: f.id });
        setExcludedPages(new Set(suggestion.excludedPages));
        setPicking(true);
        setStatus("제외할 쪽을 고른 뒤 변환하세요.");
        performance.measure("pdf-import-page-picker", {
          start: metrics.current.start,
        });
      }
    } catch (e) {
      setError(
        e.code === "pdf_import_failed" ||
          e.code === "block_mismatch" ||
          e.code === "document_changed"
          ? e.message
          : "PDF 변환에 실패했습니다. PDF와 저장 위치를 확인해 주세요.",
      );
      setStatus("실패");
    } finally {
      setBusy(false);
    }
  }
  async function run(f, doc) {
    setStatus("구조 분석 중");
    let at = performance.now();
    const r = await invoke("convert", {
      id: f.id,
      excludedPages: [...excludedPages],
    });
    setResult(r);
    metrics.current.analysisMs = performance.now() - at;
    metrics.current.node = r.timings;
    const images = [],
      objects = r.blocks.filter((b) => ["table", "figure"].includes(b.kind));
    at = performance.now();
    for (let i = 0; i < objects.length; i++) {
      setStatus("그림 만드는 중 " + (i + 1) + " / " + objects.length);
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
      images.push({ key: b.id, mime: "image/png", base64 });
      canvas.width = canvas.height = 0;
      await new Promise(requestAnimationFrame);
    }
    metrics.current.imageMs = performance.now() - at;
    metrics.current.imageCount = images.length;
    metrics.current.imageBytes = images.reduce(
      (n, i) => n + Math.floor((i.base64.length * 3) / 4),
      0,
    );
    const plan = authoring(r);
    setStatus("문서 저장 중");
    at = performance.now();
    const saved = await saveDocument({
      name: f.name.replace(/\.pdf$/i, ".md"),
      folder: f.folder,
      authoring: plan.authoring,
      images,
    });
    metrics.current.saveMs = performance.now() - at;
    at = performance.now();
    const m = await invoke("mapping", {
      id: f.id,
      units: plan.units,
      revision: saved.revision,
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
    setCached(true);
    setStatus(
      "변환 완료 · 확인할 곳 " + m.blocks.filter((b) => b.warning).length,
    );
  }
  function rewrite() {
    clearTimeout(scrollTimer.current);
    anchor.current = null;
    setPicking(true);
    setMapping(null);
    setResult(null);
    setSelected(null);
    setTarget(null);
    setFollowed(null);
    setStatus("제외할 쪽을 고른 뒤 변환하세요.");
  }
  async function convertSelected() {
    try {
      if (
        cached &&
        !(await confirm({
          title: "다시 변환",
          message:
            "기존 문서는 같은 폴더에 이전 사본으로 보관하고 새로 만듭니다.",
          confirmLabel: "변환",
        }))
      )
        return;
      setBusy(true);
      setError("");
      metrics.current = { start: performance.now() };
      if (cached) await invoke("backup", { id: file.id });
      setPicking(false);
      setStale(false);
      await run(file, pdf);
    } catch (e) {
      setError(e.message || "변환에 실패했습니다.");
      setStatus("실패");
    } finally {
      setBusy(false);
    }
  }
  function togglePage(page, shift) {
    if (busy || !picking) return;
    const next = new Set(excludedPages),
      exclude = !next.has(page);
    const from = shift && anchor.current !== null ? anchor.current : page;
    for (let i = Math.min(from, page); i <= Math.max(from, page); i++) {
      if (exclude) next.add(i);
      else next.delete(i);
    }
    anchor.current = page;
    setExcludedPages(next);
  }
  function sourceScroll() {
    const scrollAt = performance.now();
    clearTimeout(scrollTimer.current);
    if (suppressScroll.current) {
      suppressScroll.current = false;
      return;
    }
    if (!follow || stale || !mapping || picking) return;
    scrollTimer.current = setTimeout(() => {
      const y = pane.current.scrollTop + pane.current.clientHeight / 3;
      const candidates = mapping.blocks.flatMap((b) =>
        b.boxes.map((x) => ({
          b,
          top: positions[x.page].top + x.top * positions[x.page].scale,
          bottom: positions[x.page].top + x.bottom * positions[x.page].scale,
        })),
      );
      const hit =
        candidates.find((x) => x.top <= y && x.bottom >= y) ||
        candidates.filter((x) => x.top >= y).sort((a, b) => a.top - b.top)[0];
      if (hit) {
        setFollowed(hit.b);
        setTarget((old) => (old?.id === hit.b.id ? old : hit.b));
        performance.measure("pdf-import-follow", {
          start: scrollAt,
          detail: { id: hit.b.id },
        });
      }
    }, 150);
  }
  async function select(b, scroll = false) {
    if (stale) return;
    try {
      const t = performance.now();
      clearTimeout(scrollTimer.current);
      setFollowed(null);
      setTarget(b);
      setSelected(b);
      metrics.current.lastSelection = {
        id: b.id,
        start: t,
        targetAt: performance.now(),
      };
      if (scroll) {
        suppressScroll.current = true;
        pane.current.scrollTop = positions[b.boxes[0].page].top;
        requestAnimationFrame(() => {
          suppressScroll.current = false;
        });
      }
    } catch (e) {
      setError("문서 대응을 확인하지 못했습니다.");
    }
  }
  const Page = useMemo(
    () =>
      function Page2({ index, scale }) {
        const ref = useRef(null);
        useEffect(() => {
          let gone = false,
            task;
          (async () => {
            const p = await pdf.getPage(index + 1);
            if (gone) return;
            const v = p.getViewport({ scale }),
              c = ref.current;
            c.width = v.width;
            c.height = v.height;
            task = p.render({ canvasContext: c.getContext("2d"), viewport: v });
            await task.promise;
          })().catch((e) => {
            if (!gone) setError("원본 쪽을 그리지 못했습니다.");
          });
          return () => {
            gone = true;
            task?.cancel();
          };
        }, [index, scale]);
        return <canvas ref={ref} style={{ display: "block", width: "100%" }} />;
      },
    [pdf],
  );
  const viewState = React.useCallback(
    (s) => {
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
  return (
    <ui.ScreenLayout
      description={
        file
          ? file.name +
            (pdf ? " · " + pdf.numPages + "쪽" : "") +
            (excludedPages.size ? " · " + exclusionSummary(excludedPages) : "")
          : undefined
      }
      status={
        <ui.Status
          tone={
            error ? "error" : busy ? "progress" : mapping ? "ok" : "neutral"
          }
          label={status}
        />
      }
      actions={
        <>
          <ui.Button
            variant={file ? "outline" : "default"}
            disabled={busy}
            onClick={choose}
          >
            PDF 고르기
          </ui.Button>
          {picking && (
            <>
              <ui.Button
                variant="default"
                disabled={busy}
                onClick={convertSelected}
              >
                변환
              </ui.Button>
              <span>
                {pdf?.numPages}쪽 중 {excludedPages.size}쪽 제외
              </span>
            </>
          )}
          {cached && !picking && (
            <ui.Button variant="destructive" disabled={busy} onClick={rewrite}>
              다시 변환
            </ui.Button>
          )}
          {allWarnings.length > 0 && (
            <ui.Select
              label="경고 종류"
              value={warningFilter}
              onValueChange={(value) => {
                setWarningFilter(value);
                setSelected(null);
              }}
              options={warningOptions}
              disabled={busy}
            />
          )}
          {warnings.length > 0 && (
            <>
              <ui.Button
                disabled={busy || stale || warningIndex === 0}
                onClick={() =>
                  select(warnings[Math.max(0, warningIndex - 1)], true)
                }
              >
                이전
              </ui.Button>
              <span>
                {warningIndex < 0 ? "0" : warningIndex + 1} / {warnings.length}
                {warningIndex >= 0
                  ? " · " + warnings[warningIndex].warning.reason
                  : ""}
              </span>
              <ui.Button
                disabled={busy || stale || warningIndex === warnings.length - 1}
                onClick={() => select(warnings[warningIndex + 1], true)}
              >
                다음
              </ui.Button>
            </>
          )}
          {mapping && (
            <ui.Button
              onClick={async () => {
                try {
                  const r = await openDocument({ path: file.document });
                  if (r.status !== "opened")
                    setError("문서를 열지 못했습니다.");
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
      <style>{`.pdf-import-panes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--space-4)}.pdf-import-narrow{display:none}.pdf-import-box{position:absolute!important;min-height:0!important;padding:0!important;border-radius:0!important;background:transparent!important}.pdf-import-box:focus-visible{outline:2px solid var(--id-color-border-focus);outline-offset:2px}@media(max-width:800px){.pdf-import-panes{grid-template-columns:minmax(0,1fr)}.pdf-import-narrow{display:block}}`}</style>
      {error && <ui.Notice tone="error">{error}</ui.Notice>}
      {stale && (
        <ui.Notice tone="warning">
          문서가 바뀌어 대응을 표시할 수 없음
        </ui.Notice>
      )}
      {!file && recent.length > 0 && (
        <>
          <h2 className="type-section-title">변환한 문서</h2>
          <ui.DataTable
            title="변환한 문서"
            rows={recent.map((r) => ({
              ...r,
              name:
                r.name +
                (recent.filter((x) => x.name === r.name).length > 1
                  ? " (" + r.folder + ")"
                  : ""),
              modified: new Date(r.modified).toLocaleString("ko-KR"),
            }))}
            columns={["name", "pages", "warnings", "modified", "state"]}
            labels={{
              name: "문서 이름",
              pages: "쪽 수",
              warnings: "확인할 곳 수",
              modified: "변환한 때",
              state: "상태",
            }}
            fields={{ pages: { type: "number" }, warnings: { type: "number" } }}
            rowKey="id"
            onSelectRow={(r) => {
              if (busy) return;
              if (r.state)
                setError(
                  r.state === "원본 없음"
                    ? "원본 PDF가 없어 저장된 결과를 열 수 없습니다."
                    : "원본 PDF가 바뀌어 저장된 결과를 열 수 없습니다. PDF를 다시 골라 주세요.",
                );
              else load(r.path, true);
            }}
          />
        </>
      )}
      {pdf && (
        <>
          <div className="pdf-import-narrow">
            <ui.Notice>넓은 창에서 보기</ui.Notice>
          </div>
          <ui.Toolbar>
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
              title="원본을 스크롤하면 문서가 따라옵니다. 문서를 스크롤해도 원본은 움직이지 않습니다."
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
                  원본을 스크롤하면 문서가 따라옵니다. 문서를 스크롤해도 원본은
                  움직이지 않습니다.
                </span>
              )}
            </label>
            {[
              "heading",
              "paragraph",
              "list",
              "table",
              "figure",
              "footnote",
              "margin",
            ].map((k) => (
              <span key={k} className="type-helper">
                <span style={{ color: "var(--id-color-" + colors[k] + ")" }}>
                  ■
                </span>
                {labels[k]}
              </span>
            ))}
          </ui.Toolbar>
          <div className="pdf-import-panes">
            <div style={{ minWidth: 0 }}>
              <div className="type-item-name">
                원본 · {pageNo} / {pdf.numPages}쪽
              </div>
              <div
                data-pdf-pane
                ref={pane}
                style={{
                  height: 760,
                  overflow: "auto",
                  background: "var(--id-color-canvas)",
                  position: "relative",
                }}
                onScroll={(e) => {
                  const n = positions.findIndex(
                    (p) => p.top + p.height > e.currentTarget.scrollTop + 1,
                  );
                  setPageNo(Math.max(1, n + 1));
                  setTip(null);
                  sourceScroll();
                }}
              >
                {positions.map((pos, i) => (
                  <div
                    data-source-page={i + 1}
                    key={i}
                    style={{
                      height: pos.height,
                      position: "relative",
                      width,
                      marginBottom: 0,
                    }}
                  >
                    {Math.abs(i + 1 - pageNo) <= 2 && (
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
                          role={picking ? "button" : undefined}
                          tabIndex={picking ? 0 : undefined}
                          aria-label={
                            picking ? i + 1 + "쪽 제외 선택" : undefined
                          }
                          aria-pressed={picking ? frontPages.has(i) : undefined}
                          onClick={(e) => togglePage(i + 1, e.shiftKey)}
                          onKeyDown={(e) => {
                            if (picking && ["Enter", " "].includes(e.key)) {
                              e.preventDefault();
                              togglePage(i + 1, e.shiftKey);
                            }
                          }}
                          style={{ opacity: frontPages.has(i) ? 0.4 : 1 }}
                        >
                          <Page index={i} scale={pos.scale} />
                        </div>
                        {picking && (
                          <label
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              padding: "var(--space-2)",
                              background: "var(--id-color-surface)",
                            }}
                          >
                            <input
                              type="checkbox"
                              aria-label={i + 1 + "쪽 제외"}
                              checked={frontPages.has(i)}
                              disabled={busy}
                              onClick={(e) => togglePage(i + 1, e.shiftKey)}
                              onChange={() => {}}
                            />{" "}
                            제외
                          </label>
                        )}
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
                        {(mapping?.blocks || result?.blocks || []).flatMap(
                          (b) =>
                            b.boxes
                              .filter((x) => x.page === i)
                              .map((x, j) => (
                                <ui.Button
                                  key={b.id + "-" + j}
                                  className="pdf-import-box"
                                  data-source-id={b.id}
                                  aria-label={
                                    labels[b.kind] +
                                    (b.warning ? " · " + b.warning.reason : "")
                                  }
                                  onMouseEnter={() =>
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
                                  onClick={() => select(b)}
                                  style={{
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
                                    outline:
                                      followed?.id === b.id
                                        ? "1px solid var(--id-color-accent)"
                                        : undefined,
                                    outlineOffset: 2,
                                    border:
                                      (selected?.id === b.id ? "3" : "1") +
                                      "px solid var(--id-color-" +
                                      (b.warning ? "warning" : colors[b.kind]) +
                                      ")",
                                  }}
                                >
                                  {b.level &&
                                    (["heading", "heading_unnumbered"].includes(
                                      b.kind,
                                    ) ||
                                      (b.kind === "list" && b.level >= 2)) && (
                                      <span
                                        className="type-helper"
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          top: 0,
                                          background: "var(--id-color-surface)",
                                        }}
                                      >
                                        {b.kind === "list"
                                          ? b.level
                                          : "H" + Math.min(6, b.level)}
                                      </span>
                                    )}
                                  {b.warning && (
                                    <span
                                      style={{
                                        position: "absolute",
                                        right: 0,
                                        top: 0,
                                        color: "var(--id-color-warning)",
                                        background: "var(--id-color-surface)",
                                      }}
                                    >
                                      !
                                    </span>
                                  )}
                                </ui.Button>
                              )),
                        )}
                        {(mapping?.excluded || result?.excluded || [])
                          .filter((x) => x.page === i)
                          .map((e, j) => (
                            <div
                              key={"e" + j}
                              title="제외"
                              style={{
                                position: "absolute",
                                pointerEvents: "none",
                                left: e.box.x0 * pos.scale,
                                top: e.box.top * pos.scale,
                                width: (e.box.x1 - e.box.x0) * pos.scale,
                                height: (e.box.bottom - e.box.top) * pos.scale,
                                border: "1px solid var(--id-color-border)",
                              }}
                            />
                          ))}
                        {tip?.page === i && (
                          <div
                            id={"pdf-front-page-" + i}
                            role="tooltip"
                            className="type-helper"
                            style={{
                              position: "absolute",
                              left: 0,
                              top: tip.top,
                              maxWidth: "100%",
                              background: "var(--id-color-surface)",
                              color: "var(--id-color-text)",
                              padding: "var(--space-2)",
                              pointerEvents: "none",
                              zIndex: 1,
                            }}
                          >
                            {tip.text}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="type-item-name">변환된 문서</div>
              {picking && <p>제외할 쪽을 고른 뒤 변환하세요.</p>}
              {mapping && (
                <ui.DocumentView
                  path={file.document}
                  target={
                    target && !stale
                      ? { revision: mapping.revision, path: target.path }
                      : void 0
                  }
                  height={760}
                  onStateChange={viewState}
                />
              )}
            </div>
          </div>
        </>
      )}
    </ui.ScreenLayout>
  );
}
export { Screen as default };
