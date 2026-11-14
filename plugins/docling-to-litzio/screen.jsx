import * as pdfjs from "./vendor/pdfjs/build/pdf.mjs";
const labels = {
  "meaning-loss": "의미에 영향이 있는 손실",
  "formula-review-required": "수식 검수",
  "formula-suspicion": "수식 의심",
  "formula-prose-suspect": "수식에 본문 혼입",
  "picture-prose-suspect": "그림에 본문 혼입",
  "merged-table-review": "병합 표",
  "repeated-merged-values": "반복된 병합 값",
  "source-cell-unavailable": "원본 셀 기록 부재",
  "protected-token-difference": "숫자·부호·단위 차이",
  "text-layer-unavailable": "글자 층 대조 불가",
  "heading-basis-low": "제목 계층 낮은 신뢰",
  "empty-table-header": "빈 표 머리",
  "table-row-width": "표 열 수 차이",
  "unmapped-table-tokens": "미대응 표 영역",
  "unmapped-pdf-text": "미대응 원문 영역",
  "source-native-change": "생성 내용 차이",
  "furniture-in-body": "머리글 잔재",
  "reading-order-caption": "캡션 읽는 순서",
  "reading-order-backtrack": "읽는 순서 의심",
  "geometry-unavailable": "좌표 대조 불가",
};
const priority = { high: "높음", medium: "보통", low: "낮음" };
const targetText = (t) =>
  `블록 ${t.path.join(".")}${t.selector.kind === "cell" ? ` · 셀 ${t.selector.row + 1}/${t.selector.column + 1}` : t.selector.kind === "list-item" ? ` · 목록 ${t.selector.index + 1}` : ""} (${t.bindingState})`;
const lossLabel = {
  "merged-cell-repeated": "병합 값 반복",
  "compound-header-flattened": "복합 머리 합침",
  "table-header-role": "표 머리 역할 변경",
  "cell-block-structure": "셀 블록 한 줄 표현",
  "dedicated-table-note": "주석 위치·연결 표현",
  "footnote-as-paragraph": "연결 없는 주석 문단",
};
const lossText = (loss) => {
  const v = loss.originalValue;
  if (v.cell)
    return `원본 셀 ${v.cellIndex + 1} · 행 ${v.cell.start_row_offset_idx + 1}–${v.cell.end_row_offset_idx} / 열 ${v.cell.start_col_offset_idx + 1}–${v.cell.end_col_offset_idx} · ${v.cell.text}`;
  if (v.contributions)
    return v.contributions
      .map((c) => `열 ${c.column + 1}: ${c.text}`)
      .join("; ");
  return v.text ?? JSON.stringify(v);
};
export default function Screen({ React, ui, invoke, openDocument, pickPath }) {
  const [bundle, setBundle] = React.useState(""),
    [check, setCheck] = React.useState(null),
    [job, setJob] = React.useState(null),
    [history, setHistory] = React.useState([]),
    [result, setResult] = React.useState(null),
    [review, setReview] = React.useState(null),
    [list, setList] = React.useState(null),
    [detail, setDetail] = React.useState(null),
    [expanded, setExpanded] = React.useState(false),
    [error, setError] = React.useState(""),
    [busy, setBusy] = React.useState(false);
  const [comparison, setComparison] = React.useState(null),
    [compareKey, setCompareKey] = React.useState(0),
    [pageNo, setPageNo] = React.useState(1),
    [zoom, setZoom] = React.useState(1),
    [targetIndex, setTargetIndex] = React.useState(0),
    [readState, setReadState] = React.useState(null),
    [note, setNote] = React.useState(""),
    [after, setAfter] = React.useState("");
  const [humanVisual, setHumanVisual] = React.useState(false),
    [cellMath, setCellMath] = React.useState(false);
  const canvas = React.useRef(null),
    compareRequest = React.useRef(0);
  const compare = async (selection) => {
    const ticket = ++compareRequest.current;
    setComparison(null);
    setReadState(null);
    setAfter("");
    setHumanVisual(false);
    setCellMath(false);
    try {
      const c = await invoke("compare", { jobId: job.jobId, ...selection });
      if (ticket !== compareRequest.current) return;
      setNote("");
      setComparison(c);
      setCompareKey((k) => k + 1);
      setTargetIndex(0);
      setPageNo(
        c.targets[0]?.regions?.[0]?.pageNo ?? c.regions[0]?.pageNo ?? 1,
      );
      setZoom(1);
    } catch (e) {
      if (ticket === compareRequest.current) message(e);
    }
  };
  React.useEffect(() => {
    if (!comparison) return;
    let disposed = false,
      task,
      render,
      workerURL;
    const draw = async () => {
      workerURL = URL.createObjectURL(
        new Blob([comparison.worker], { type: "text/javascript" }),
      );
      pdfjs.GlobalWorkerOptions.workerSrc = workerURL;
      task = pdfjs.getDocument({
        data: Uint8Array.from(atob(comparison.pdf), (c) => c.charCodeAt(0)),
        useSystemFonts: true,
      });
      const pdf = await task.promise,
        page = await pdf.getPage(pageNo);
      if (disposed) return;
      const viewport = page.getViewport({ scale: zoom }),
        el = canvas.current;
      if (!el) return;
      el.width = viewport.width;
      el.height = viewport.height;
      const ctx = el.getContext("2d");
      render = page.render({ canvasContext: ctx, viewport });
      await render.promise;
      if (disposed) return;
      ctx.strokeStyle =
        getComputedStyle(el).getPropertyValue("--id-color-accent").trim() ||
        "Highlight";
      ctx.lineWidth = 3;
      for (const r of (
        comparison.targets[targetIndex]?.regions ?? comparison.regions
      ).filter((r) => r.pageNo === pageNo)) {
        // Evidence boxes use unrotated top-left PDF points. Rotated source alignment is unproven.
        if (page.rotate !== 0) continue;
        const [x, y, right, bottom] = r.bbox;
        ctx.strokeRect(
          x * zoom,
          y * zoom,
          (right - x) * zoom,
          (bottom - y) * zoom,
        );
      }
      el.dataset.renderedSource =
        comparison.targets[targetIndex]?.sourceId ?? "";
    };
    draw().catch((e) => {
      if (!disposed) message(e);
    });
    return () => {
      disposed = true;
      render?.cancel();
      task?.destroy();
      if (workerURL) URL.revokeObjectURL(workerURL);
    };
  }, [comparison, pageNo, zoom, targetIndex]);
  React.useEffect(() => {
    if (readState?.state !== "stale-target") return;
    setComparison(null);
    setError(
      "문서 revision이 바뀌었습니다. 대조를 다시 선택하세요. 손 편집 문서는 인계할 수 없습니다.",
    );
  }, [readState]);
  React.useEffect(() => {
    if (!comparison) return;
    let alive = true,
      polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const state = await invoke("revision", { jobId: job.jobId });
        if (!alive) return;
        if (state.revision !== comparison.revision) {
          setComparison(null);
          setReadState(null);
          await compare(comparison.selection);
        }
      } catch (e) {
        if (alive) {
          setComparison(null);
          message(e);
        }
      } finally {
        polling = false;
      }
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [comparison, job?.jobId]);
  const humanDecision = async (decision) => {
    setBusy(true);
    try {
      await invoke("human-decision", {
        jobId: job.jobId,
        groupId: comparison.material.group.id,
        revision: comparison.revision,
        contentDigest: comparison.material.contentDigest,
        decision,
        note,
      });
      await loadReview(job.jobId);
      setNote("");
    } catch (e) {
      message(e);
    } finally {
      setBusy(false);
    }
  };
  const recordLoss = async (loss, decision) => {
    setBusy(true);
    try {
      const target = comparison.targets[targetIndex];
      await invoke("loss-decision", {
        jobId: job.jobId,
        lossId: loss.lossId,
        groupId: comparison.material.group.id,
        revision: comparison.revision,
        contentDigest: comparison.material.contentDigest,
        targetPath: [target.path[0]],
        pageNo,
        decision,
        note,
      });
      await loadReview(job.jobId);
    } catch (e) {
      message(e);
    } finally {
      setBusy(false);
    }
  };
  const request = React.useRef(null);
  const loadReview = async (jobId) =>
    setReview(await invoke("review-progress", { jobId }));
  const undo = async (change) => {
    setBusy(true);
    setError("");
    try {
      const reply = await invoke("correction-undo", {
        jobId: job.jobId,
        changeId: crypto.randomUUID(),
        undoOf: change.changeId,
        actor: "human",
        reason: "화면에서 선택한 교정 되돌리기",
        evidence: change.evidence,
        contentDigest: comparison?.material?.contentDigest,
      });
      await loadReview(job.jobId);
      if (reply.status === "pending-reconcile")
        setError("되돌리기 결과를 조정해야 합니다. 새 교정을 시작하지 마세요.");
    } catch (e) {
      message(e);
    } finally {
      setBusy(false);
    }
  };
  const message = (e) => setError(String(e?.message ?? e));
  const reloadHistory = () =>
    invoke("jobs", {})
      .then((r) =>
        setHistory(
          r.jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        ),
      )
      .catch(message);
  React.useEffect(() => {
    reloadHistory();
  }, []);
  React.useEffect(() => {
    if (!job || !["queued", "running"].includes(job.state)) return;
    let alive = true;
    const poll = async () => {
      try {
        const next = await invoke("job", { jobId: job.jobId });
        if (alive) setJob(next);
      } catch (e) {
        if (alive) message(e);
      }
    };
    const timer = setInterval(poll, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job?.jobId, job?.state]);
  React.useEffect(() => {
    if (job?.state !== "ready") return;
    let alive = true;
    ++compareRequest.current;
    setComparison(null);
    setResult(null);
    setReview(null);
    setList(null);
    Promise.all([
      invoke("summary", { jobId: job.jobId }),
      invoke("groups", { jobId: job.jobId }),
      invoke("review-progress", { jobId: job.jobId }),
    ])
      .then(([r, g, progress]) => {
        if (alive) {
          setResult(r);
          setReview(progress);
          setList(g);
          setDetail(null);
        }
      })
      .catch((e) => {
        if (alive) message(e);
      });
    return () => {
      alive = false;
    };
  }, [job?.jobId, job?.state]);
  const inspect = async () => {
    setBusy(true);
    setError("");
    try {
      setCheck(await invoke("preflight", { bundle }));
      request.current = null;
    } catch (e) {
      setCheck(null);
      message(e);
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    setError("");
    request.current ??= crypto.randomUUID();
    try {
      const j = await invoke("start", {
        bundle: check.bundle,
        fingerprint: check.fingerprint,
        requestId: request.current,
      });
      setJob(j);
      reloadHistory();
    } catch (e) {
      message(e);
    } finally {
      setBusy(false);
    }
  };
  const choose = async (id) => {
    setError("");
    setDetail(null);
    try {
      setDetail(await invoke("group", { jobId: job.jobId, groupId: id }));
      await compare({ groupId: id });
    } catch (e) {
      message(e);
    }
  };
  const hidden = new Set(
    expanded
      ? []
      : (list?.series ?? []).flatMap((s) =>
          s.groupIds.filter((id) => id !== s.representativeGroupId),
        ),
  );
  const humanIds = new Set((review?.humanQueue ?? []).map((g) => g.id));
  const visible = (list?.groups ?? [])
    .filter((g) => !hidden.has(g.id) || humanIds.has(g.id))
    .sort((a, b) => Number(humanIds.has(b.id)) - Number(humanIds.has(a.id)));
  const groupRows = visible.map((g, index) => ({
    number: index + 1,
    priority: priority[g.priority],
    pages: g.pageNos.join(", ") || "위치 없음",
    kind: g.kinds.map((k) => labels[k] ?? k).join(", "),
    count: g.findingIds.length,
    repeat:
      (list.series.find((s) => s.representativeGroupId === g.id)?.groupIds
        .length ?? 1) + "묶음",
  }));
  const groupScopes = (review?.scopes ?? []).filter(
    (s) => !s.id.startsWith("page:"),
  );
  const uninspected = groupScopes.filter((s) => s.state === "미검사").length;
  const uncertain = groupScopes.filter((s) => s.state === "판단불가").length;
  return (
    <ui.ScreenLayout description="변환 결과에서 문서를 만들고 검수할 곳을 확인합니다. 생성 결과는 검수 전 초안입니다.">
      {error && <ui.Notice tone="error">{error}</ui.Notice>}
      {!result ? (
        <>
          <ui.Toolbar>
            <ui.Button
              disabled={busy || ["queued", "running"].includes(job?.state)}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const selected = await pickPath({ kind: "folder" });
                  if (!selected) return;
                  setBundle(selected.path);
                  setCheck(null);
                  request.current = null;
                } catch (e) {
                  message(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              변환 결과 묶음 고르기
            </ui.Button>
            <span>{check?.bundle ?? (bundle ? "묶음 선택됨" : "선택된 묶음 없음")}</span>
            <ui.Button
              onClick={inspect}
              disabled={
                !bundle || busy || ["queued", "running"].includes(job?.state)
              }
            >
              입력 확인
            </ui.Button>
          </ui.Toolbar>
          {check && (
            <>
              <ui.Toolbar>
                <ui.SummaryCard label="원본" value={check.sourceName} />
                <ui.SummaryCard label="쪽 수" value={check.pages} />
                <ui.SummaryCard
                  label="지원 schema"
                  value={check.schemaVersion}
                />
                <ui.SummaryCard label="그림" value={check.pictures} />
              </ui.Toolbar>
              <ui.Notice>
                {check.diagnostics.length
                  ? `확인할 입력 진단 ${check.diagnostics.length}건이 있습니다.`
                  : "입력 검증을 통과했습니다. 기존 결과를 덮어쓰지 않고 새 generation을 만듭니다."}
              </ui.Notice>
              {!!check.diagnostics.length && (
                <ui.DataTable
                  title="입력 진단"
                  rows={check.diagnostics.map((d) => ({
                    kind: d.code,
                    location: d.selfRef ?? d.pageNo ?? d.option ?? "",
                  }))}
                  columns={["kind", "location"]}
                  labels={{ kind: "진단", location: "위치·옵션" }}
                />
              )}
              <ui.Toolbar>
                <ui.Button
                  onClick={start}
                  disabled={busy || ["queued", "running"].includes(job?.state)}
                >
                  문서 만들기
                </ui.Button>
                {request.current && (
                  <ui.Button
                    variant="outline"
                    onClick={() =>
                      invoke("job", { jobId: request.current })
                        .then(setJob)
                        .catch(message)
                    }
                  >
                    접수 상태 조회
                  </ui.Button>
                )}
              </ui.Toolbar>
            </>
          )}
          {job && (
            <ui.Notice>
              {job.message}
              {job.errorCode ? ` (${job.errorCode})` : ""}
              {["queued", "running"].includes(job.state)
                ? " · 이 화면을 닫아도 다음에 상태를 다시 조회할 수 있습니다."
                : ""}
            </ui.Notice>
          )}
          <ui.Toolbar>
            <ui.Button variant="outline" onClick={reloadHistory}>
              이전 생성 새로 읽기
            </ui.Button>
            {history.length > 0 && (
              <label>
                이전 생성
                <select
                  aria-label="이전 생성"
                  defaultValue=""
                  onChange={(e) =>
                    invoke("job", { jobId: e.target.value })
                      .then(setJob)
                      .catch(message)
                  }
                >
                  <option value="" disabled>
                    선택하세요
                  </option>
                  {history.map((j) => (
                    <option key={j.jobId} value={j.jobId}>
                      {j.bundle} · {j.state} · {j.createdAt}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </ui.Toolbar>
        </>
      ) : (
        <>
          <ui.Toolbar>
            <ui.SummaryCard label="문서 블록" value={result.blocks} />
            <ui.SummaryCard label="그림" value={result.assets} />
            <ui.SummaryCard label="손실" value={result.losses} />
            <ui.SummaryCard
              label="검수 묶음"
              value={result.statistics.groups}
            />
            <ui.SummaryCard label="생성 시점 검사" value="통과" />
          </ui.Toolbar>
          <ui.Notice>
            {review?.reviewComplete
              ? "현재 revision 검수 완료"
              : "미완료 인계 · 검수 전 초안"}
          </ui.Notice>
          <ui.Toolbar>
            <ui.Button
              onClick={async () => {
                try {
                  const opened = await openDocument({ path: result.document });
                  if (opened.status !== "opened")
                    setError(opened.message || "문서를 열 수 없습니다.");
                } catch (e) {
                  message(e);
                }
              }}
            >
              문서 열기
            </ui.Button>
            <ui.Button
              variant="outline"
              onClick={async () => {
                setResult(null);
                setList(null);
                setError("");
                try {
                  const [r, g] = await Promise.all([
                    invoke("summary", { jobId: job.jobId }),
                    invoke("groups", { jobId: job.jobId }),
                  ]);
                  await loadReview(job.jobId);
                  setResult(r);
                  setList(g);
                } catch (e) {
                  message(e);
                }
              }}
            >
              결과 다시 검증
            </ui.Button>
            <ui.Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setList(null);
                setJob(null);
                setCheck(null);
                request.current = null;
                reloadHistory();
              }}
            >
              다른 묶음 가져오기
            </ui.Button>
          </ui.Toolbar>
          <p>
            일반 문서 탭에서 손으로 편집하면 교정 이력이 없어 인계가 막힙니다.
          </p>
          <ui.Toolbar>
            <ui.Button
              disabled={busy || !review?.gate?.ready || review?.reviewComplete}
              onClick={async () => {
                setBusy(true);
                try {
                  await invoke("review-finalize", {
                    jobId: job.jobId,
                    revision: review.currentRevision,
                  });
                  await loadReview(job.jobId);
                } catch (e) {
                  message(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              검수 완료
            </ui.Button>
            <span>
              미검사 {review?.gate?.uncovered ?? "—"} · 사람 확인{" "}
              {review?.gate?.human ?? "—"} · 차단 손실{" "}
              {review?.gate?.blocking ?? "—"} · 표현 확인 전{" "}
              {review?.gate?.expressionUnconfirmed ?? "—"} · 실패{" "}
              {review?.gate?.failures ?? "—"} · 숫자 차이{" "}
              {review?.gate?.tokenDifferences ?? "—"}
            </span>
          </ui.Toolbar>
          {comparison && (
            <section
              aria-label="원문과 문서 대조"
              data-group-id={comparison.material.group.id}
            >
              <ui.Toolbar>
                <strong>
                  {comparison.material.group.kinds
                    .map((k) => labels[k] ?? k)
                    .join(", ")}
                </strong>
                <ui.Button
                  variant="outline"
                  onClick={() => compare(comparison.selection)}
                >
                  대조 다시 읽기
                </ui.Button>
                <label>
                  쪽{" "}
                  <select
                    aria-label="원문 쪽"
                    disabled={busy}
                    value={pageNo}
                    onChange={(e) => setPageNo(Number(e.target.value))}
                  >
                    {Array.from({ length: comparison.pageCount }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  확대{" "}
                  <select
                    aria-label="원문 확대"
                    disabled={busy}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  >
                    {[0.75, 1, 1.5, 2].map((v) => (
                      <option key={v} value={v}>
                        {v * 100}%
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  문서 위치{" "}
                  <select
                    aria-label="문서 위치"
                    disabled={busy}
                    value={targetIndex}
                    onChange={(e) => {
                      const index = Number(e.target.value);
                      setTargetIndex(index);
                      setPageNo(
                        comparison.targets[index]?.regions?.[0]?.pageNo ??
                          pageNo,
                      );
                      setAfter("");
                    }}
                  >
                    {comparison.targets.map((t, i) => (
                      <option key={i} value={i}>
                        {t.path.join(".")}
                      </option>
                    ))}
                  </select>
                </label>
              </ui.Toolbar>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(min(100%, 28rem),1fr))",
                  gap: "var(--space-3)",
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p>원문 PDF · {pageNo}쪽</p>
                  <div style={{ height: 480, overflow: "auto" }}>
                    <canvas ref={canvas} aria-label="원문 PDF와 근거 영역" />
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p>
                    현재 문서 · {comparison.revision.slice(0, 8)}
                  </p>
                  <ui.DocumentView
                    path={comparison.document}
                    target={comparison.targets[targetIndex]}
                    reloadKey={compareKey}
                    height={480}
                    onStateChange={setReadState}
                  />
                </div>
              </div>
              {!comparison.targets.length && (
                <ui.Notice>
                  현재 대응 위치 없음 · 위치를 추측하지 않습니다.
                </ui.Notice>
              )}
              {readState?.state !== "ready" && (
                <ui.Notice>{readState?.state ?? "loading"}</ui.Notice>
              )}
              {(review?.currentHumanDecisions ?? [])
                .filter(
                  (d) =>
                    d.groupId === comparison.material.group.id,
                )
                .slice(-1)
                .map((d, i) => (
                  <ui.Notice key={i}>
                    판단 기록:{" "}
                    {d.decision === "confirmed" ? "문제 없음 확인" : "보류"} ·{" "}
                    {d.note}
                  </ui.Notice>
                ))}
              <ui.Toolbar>
                <label>
                  판단 근거{" "}
                  <ui.Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <ui.Button
                  disabled={
                    busy || !note.trim() || readState?.state !== "ready"
                  }
                  onClick={() => humanDecision("confirmed")}
                >
                  문제 없음 확인
                </ui.Button>
                <ui.Button
                  disabled={busy || !note.trim()}
                  variant="outline"
                  onClick={() => humanDecision("deferred")}
                >
                  보류
                </ui.Button>
              </ui.Toolbar>
              <h3>선택 위치의 표현 손실</h3>
              <p>
                원문과 현재 문서를 나란히 대조한 뒤 항목별로 결정하세요. 주석은
                연결 없이 일반 문단으로 둔 표현인지 확인합니다.
              </p>
              {(review?.losses ?? [])
                .filter(
                  (l) =>
                    l.sourceId === comparison.targets[targetIndex]?.sourceId,
                )
                .map((loss) => {
                  const record = review?.expressionReviews?.find((item) => item.lossId === loss.lossId)?.confirmation;
                  return (
                    <div key={loss.lossId} data-loss-id={loss.lossId}>
                      <p>
                        <strong>
                          {lossLabel[loss.reasonCode] ?? loss.reasonCode}
                        </strong>
                        {loss.representation === "unlinked-annotation" &&
                          " · 호출부 연결 없이 주석 문단으로 둠"}{" "}
                        ·{" "}
                        {loss.classification === "expression"
                          ? "표현 손실"
                          : "해소 필요"}{" "}
                        ·{" "}
                        {{
                          "meaning-preserved": "뜻 보존 확인됨",
                          "meaning-changed": "뜻이 달라짐",
                          deferred: "보류",
                        }[record?.decision] ?? "미확인"}
                      </p>
                      <p style={{ overflowWrap: "anywhere" }}>
                        {lossText(loss)}
                      </p>
                      <details>
                        <summary>원본 구조 근거</summary>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {JSON.stringify(loss.originalValue, null, 2)}
                        </pre>
                      </details>
                      {loss.classification === "expression" && (
                        <ui.Toolbar>
                          <ui.Button
                            disabled={
                              busy ||
                              !note.trim() ||
                              readState?.state !== "ready"
                            }
                            onClick={() =>
                              recordLoss(loss, "meaning-preserved")
                            }
                          >
                            이 표현으로 뜻이 보존됨
                          </ui.Button>
                          <ui.Button
                            variant="outline"
                            disabled={busy || !note.trim()}
                            onClick={() => recordLoss(loss, "meaning-changed")}
                          >
                            뜻이 달라짐
                          </ui.Button>
                          <ui.Button
                            variant="outline"
                            disabled={busy || !note.trim()}
                            onClick={() => recordLoss(loss, "deferred")}
                          >
                            이 표현 보류
                          </ui.Button>
                        </ui.Toolbar>
                      )}
                    </div>
                  );
                })}
              <details>
                <summary>교정 제출</summary>
                <p>
                  선택 위치의 문단·셀·수식만 교정합니다. 빈 셀과 글자 층 대조가
                  불가능한 값은 사람이 원문 영역을 확인한 근거가 필요합니다.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={humanVisual}
                    onChange={(e) => setHumanVisual(e.target.checked)}
                  />
                  원문 영역을 직접 보고 확인함 (사람 근거)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={cellMath}
                    onChange={(e) => setCellMath(e.target.checked)}
                    disabled={!humanVisual}
                  />
                  셀에 인라인 수식으로 입력
                </label>
                <label>
                  교정 후 값
                  <textarea
                    aria-label="교정 후 값"
                    style={{ width: "100%", minHeight: 100 }}
                    value={after}
                    onChange={(e) => setAfter(e.target.value)}
                  />
                </label>
                <ui.Button
                  disabled={
                    busy ||
                    !after.trim() ||
                    !note.trim() ||
                    readState?.state !== "ready"
                  }
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const path = comparison.targets[targetIndex]?.path;
                      const node = comparison.material.current.find(
                        (n) => JSON.stringify(n.path) === JSON.stringify(path),
                      );
                      if (
                        !node ||
                        !["paragraph", "cell", "equation"].includes(node.type)
                      )
                        throw new Error(
                          "이 위치는 교정 제출을 지원하지 않습니다. 문단·셀·수식을 선택하세요.",
                        );
                      const target =
                        node.type === "cell"
                          ? {
                              kind: "cell",
                              path: [path[0]],
                              row: path[1],
                              column: path[2],
                            }
                          : { kind: node.type, path };
                      const checks = comparison.material.fragments.flatMap(
                        (f) => {
                          if (node.type === "cell")
                            return f.mapping.cells
                              .filter((c) =>
                                c.targets.some(
                                  (t) =>
                                    t.path[0] === path[0] &&
                                    t.selector.row === path[1] &&
                                    t.selector.column === path[2],
                                ),
                              )
                              .flatMap((c) =>
                                comparison.material.checks.filter(
                                  (k) =>
                                    k.sourceId === f.sourceId &&
                                    k.selectorKey === "cell:" + c.cellIndex,
                                ),
                              );
                          return f.mapping.targets.some(
                            (t) => t.path[0] === path[0],
                          )
                            ? comparison.material.checks.filter(
                                (k) => k.sourceId === f.sourceId,
                              )
                            : [];
                        },
                      );
                      const refs = [
                        ...new Set(checks.flatMap((c) => c.pdfTokenIds)),
                      ];
                      const scope = comparison.material.pdf.flatMap((p) => {
                        const tokens = p.tokens.filter((t) =>
                          refs.includes(t.id),
                        );
                        return tokens.length
                          ? [
                              {
                                pageNo: p.pageNo,
                                bbox: [
                                  Math.min(...tokens.map((t) => t.bbox[0])),
                                  Math.min(...tokens.map((t) => t.bbox[1])),
                                  Math.max(...tokens.map((t) => t.bbox[2])),
                                  Math.max(...tokens.map((t) => t.bbox[3])),
                                ],
                              },
                            ]
                          : [];
                      });
                      if (
                        !humanVisual &&
                        scope.some((r) => r.pageNo !== pageNo)
                      )
                        throw new Error(
                          "여러 쪽의 근거는 비서 교정 절차로 제출하세요.",
                        );
                      const reply = await invoke("correction-submit", {
                        jobId: job.jobId,
                        changeId: crypto.randomUUID(),
                        actor: "human",
                        generationId: comparison.material.generationId,
                        revision: comparison.revision,
                        contentDigest: comparison.material.contentDigest,
                        groupId: comparison.material.group.id,
                        decision: "correct",
                        target,
                        before:
                          node.type === "equation" ? node.latex : node.text,
                        after,
                        reason: note,
                        ...(cellMath
                          ? { afterContent: [{ kind: "math", value: after }] }
                          : {}),
                        evidence: humanVisual
                          ? {
                              kind: "human-source-region",
                              refs: [],
                              scope: (
                                comparison.targets[targetIndex]?.regions ??
                                comparison.regions
                              )
                                .filter((r) => r.pageNo === pageNo)
                                .map((r) => ({
                                  pageNo: r.pageNo,
                                  bbox: r.bbox,
                                })),
                            }
                          : { refs, scope },
                      });
                      await loadReview(job.jobId);
                      if (reply.status === "pending-reconcile")
                        throw new Error("교정 조정이 필요합니다");
                      await compare(comparison.selection);
                    } catch (e) {
                      message(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  교정 제출
                </ui.Button>
              </details>
              <details>
                <summary>기계 점검 결과</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(comparison.material.checks, null, 2)}
                </pre>
              </details>
            </section>
          )}
          <ui.Toolbar>
            <ui.Button
              variant="outline"
              disabled={busy}
              onClick={() => loadReview(job.jobId).catch(message)}
            >
              교정·진행 새로 읽기
            </ui.Button>
            <ui.SummaryCard label="미검사 묶음" value={uninspected} />
            <ui.SummaryCard
              label="교정 기록"
              value={(review?.changes ?? []).filter((c) => !c.undoOf).length}
            />
            <ui.SummaryCard label="판단 불가 묶음" value={uncertain} />
            <ui.SummaryCard
              label="미검사 쪽"
              value={
                (review?.scopes ?? []).filter(
                  (s) => s.id.startsWith("page:") && s.state === "미검사",
                ).length
              }
            />
          </ui.Toolbar>
          {review?.pending && (
            <ui.Notice tone="error">
              문서와 기록의 조정이 필요합니다. 새 교정과 완료 인계를 멈춥니다.
            </ui.Notice>
          )}
          <p>
            교정 뒤 다른 범위는 재검사가 필요합니다. 숫자 재대조 통과는 전체
            검수 완료가 아닙니다.
          </p>
          <h2>적용된 교정</h2>
          <ui.DataTable
            title="적용된 교정"
            rows={(review?.changes ?? []).map((c) => ({
              id: c.changeId,
              kind: c.undoOf ? "되돌림" : "교정",
              before: c.before,
              after: c.after,
              pages: [...new Set(c.evidence.scope.map((r) => r.pageNo))].join(
                ", ",
              ),
              reason: c.reason,
              verification: {
                "verified-protected-tokens": "숫자·단위 재대조",
                "not-applicable": "토큰 대조 대상 아님",
                "undo-restoration": "과거 값 복원",
                "human-source-region": "사람이 원문 영역을 보고 확인함",
              }[c.validation.evidenceRecheck],
            }))}
            columns={[
              "kind",
              "before",
              "after",
              "pages",
              "reason",
              "verification",
            ]}
            labels={{
              kind: "종류",
              before: "교정 전",
              after: "교정 후",
              pages: "근거 쪽",
              reason: "근거",
              verification: "재확인 범위",
            }}
          />
          {(review?.changes ?? [])
            .filter((c) => !c.undoOf)
            .map((c) => (
              <ui.Toolbar key={c.changeId}>
                <span>
                  {c.before} → {c.after}
                </span>
                <ui.Button
                  variant="outline"
                  onClick={() => compare({ changeId: c.changeId })}
                >
                  원문 대조
                </ui.Button>
                <ui.Button
                  variant="outline"
                  disabled={
                    busy ||
                    comparison?.material?.group?.id !== c.groupId ||
                    readState?.state !== "ready" ||
                    !!review.pending ||
                    review.currentRevision !== c.afterRevision ||
                    review.changes.some((r) => r.undoOf === c.changeId)
                  }
                  onClick={() => undo(c)}
                >
                  이 교정 되돌리기
                </ui.Button>
              </ui.Toolbar>
            ))}
          <ui.DataTable
            title="손실 요약"
            rows={Object.entries(result.lossKinds).map(([kind, count]) => ({
              kind,
              count,
              category: [
                "merged-cell-repeated",
                "table-header-role",
                "compound-header-flattened",
                "dedicated-table-note",
                "toc-static-table",
                "cell-block-structure",
              ].includes(kind)
                ? "형식 유지 한계"
                : "원본 근거 부족·미구현",
            }))}
            columns={["kind", "count", "category"]}
            labels={{ kind: "종류", count: "건수", category: "분류" }}
            fields={{ count: { type: "number" } }}
          />
          <ui.Toolbar>
            <ui.Button variant="outline" onClick={() => setExpanded(!expanded)}>
              {expanded
                ? "반복 묶음 접기"
                : `반복 묶음 펼치기 (${hidden.size}개)`}
            </ui.Button>
            <ui.SummaryCard label="표시 목록" value={visible.length} />
            <ui.SummaryCard
              label="원시 후보"
              value={result.statistics.findings}
            />
          </ui.Toolbar>
          <p>
            반복 패턴을 접어도 모든 후보와 위치는 보존됩니다. 대표 하나를 보는
            것으로 나머지를 검수한 것이 아닙니다.
          </p>
          <ui.DataTable
            title="검수 대상 묶음"
            rows={groupRows}
            columns={["number", "priority", "pages", "kind", "count", "repeat"]}
            labels={{
              number: "순번",
              priority: "우선순위",
              pages: "쪽",
              kind: "종류",
              count: "후보",
              repeat: "반복",
            }}
          />
          <label>
            검수 묶음 선택
            <select
              aria-label="검수 묶음 선택"
              disabled={busy}
              value={detail?.group.id ?? ""}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="" disabled>
                묶음을 선택하세요
              </option>
              {visible.map((g, index) => (
                <option key={g.id} value={g.id}>
                  {index + 1}. {priority[g.priority]} · {g.pageNos.join(", ")}쪽
                  · {g.kinds.map((k) => labels[k] ?? k).join(", ")}
                </option>
              ))}
            </select>
          </label>
          {detail && (
            <>
              <ui.DataTable
                title="선택한 묶음의 위치와 근거"
                rows={detail.findings.map((f) => ({
                  kind: labels[f.kind] ?? f.kind,
                  pages: f.regions.map((r) => r.pageNo).join(", "),
                  source: f.selfRefs.join(", "),
                  target: f.targets.map(targetText).join("; "),
                  region: f.regions
                    .map(
                      (r) =>
                        `${r.pageNo}쪽 [${r.bbox.map((v) => v.toFixed(1)).join(", ")}] pt`,
                    )
                    .join("; "),
                  reason:
                    f.evidence.reason ??
                    f.evidence.reasonCode ??
                    f.evidence.reasons?.join(", ") ??
                    "원문 근거 확인",
                }))}
                columns={[
                  "kind",
                  "pages",
                  "target",
                  "source",
                  "region",
                  "reason",
                ]}
                labels={{
                  kind: "종류",
                  pages: "쪽",
                  target: "문서 대상",
                  source: "원본 요소",
                  region: "원문 좌표",
                  reason: "근거",
                }}
              />
              <details>
                <summary>선택 묶음의 전체 근거 읽기</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(
                    detail.findings.map((f) => ({
                      kind: f.kind,
                      evidence: f.evidence,
                    })),
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          )}
        </>
      )}
    </ui.ScreenLayout>
  );
}
