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
export default function Screen({ React, ui, invoke }) {
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
        bundle,
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
  const visible = (list?.groups ?? []).filter((g) => !hidden.has(g.id));
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
            <label>
              변환 결과 묶음 위치
              <ui.Input
                value={bundle}
                placeholder="예: inputs/lsr"
                onChange={(e) => {
                  setBundle(e.target.value);
                  setCheck(null);
                  request.current = null;
                }}
                disabled={busy || ["queued", "running"].includes(job?.state)}
              />
            </label>
            <ui.Button
              onClick={inspect}
              disabled={
                !bundle || busy || ["queued", "running"].includes(job?.state)
              }
            >
              입력 확인
            </ui.Button>
          </ui.Toolbar>
          <p>
            설정된 작업 폴더 안의 상대 경로를 입력하세요. 현재 공개 화면에는
            Host 폴더 선택기가 없습니다.
          </p>
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
            검수 전 초안입니다. 손실 0이나 검사 통과는 원문과 의미가 같다는 뜻이
            아닙니다.
          </ui.Notice>
          <ui.Toolbar>
            <ui.Button
              disabled
              title="현재 공개 화면 API에는 기존 문서 열기가 없습니다"
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
            파일 탐색기에서 <strong>{result.document}</strong>를 선택해 여세요.
            현재 공개 화면 API로 기존 문서를 여는 기능은 제공되지 않습니다.
          </p>
          <p>
            생성 시점의 손실과 검수 대상입니다. 교정 후 진행은 아래에서 다시
            읽으세요. 최종 검수 완료는 아직 발급하지 않습니다.
          </p>
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
                  disabled={
                    busy ||
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
