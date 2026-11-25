import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import PdfScreen from "./pdf/screen.jsx";
import WordScreen from "./word/screen.jsx";
import workerSource from "./shared/worker-source.js";
import { readFolders, saveFolders } from "./shared/recent-folders.mjs";
import { recentDate } from "./shared/time.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));

const reviewTones = { "검토 중": "warning", "초안": "neutral", "검토 완료": "ok" };
const listError = "변환한 문서 목록을 읽지 못했습니다.";

export default function Screen(props) {
  const { React, ui, invoke, pickPath } = props;
  const [request, setRequest] = React.useState(null);
  const [recent, setRecent] = React.useState(null);
  const [error, setError] = React.useState("");
  const [choosing, setChoosing] = React.useState(false);
  const content = React.useRef(null);
  const focusHome = React.useRef(false);

  React.useEffect(() => {
    if (request) return;
    let gone = false;
    invoke("recent", { folders: readFolders() }).then(found => {
      if (gone) return;
      setRecent(found.rows);
      if (found.incomplete) setError(current => current || listError);
      try { saveFolders(found.folders); } catch {}
    }, () => {
      if (gone) return;
      setRecent([]);
      setError(current => current || listError);
    });
    return () => { gone = true; };
  }, [request]);

  React.useLayoutEffect(() => {
    if (request || recent === null || !focusHome.current) return;
    content.current?.querySelector("button")?.focus();
    focusHome.current = false;
  }, [request, recent]);

  function home(message = "") {
    focusHome.current = true;
    setRecent(null);
    setError(message);
    setRequest(null);
  }

  async function choose() {
    setChoosing(true);
    setError("");
    try {
      const picked = await pickPath({ kind: "file" });
      if (!picked) return;
      const kind = /\.pdf$/i.test(picked.path) ? "pdf" : /\.docx$/i.test(picked.path) ? "word" : null;
      if (kind) setRequest({ kind, path: picked.path });
      else setError("PDF 또는 워드 문서(.docx)를 골라 주세요.");
    } catch (e) {
      if (e?.name !== "AbortError") setError("문서를 고를 수 없습니다. 왼쪽 탐색기에서 문서가 든 폴더를 열었는지 확인해 주세요.");
    } finally {
      setChoosing(false);
    }
  }

  function open(row) {
    if (row.kind === "pdf" && row.state) {
      setError(row.state === "원본 없음"
        ? "원본 PDF가 없어 저장된 결과를 열 수 없습니다."
        : "원본 PDF가 바뀌어 저장된 결과를 열 수 없습니다. PDF를 다시 골라 주세요.");
      return;
    }
    setRequest({ kind: row.kind, path: row.path, cachedOnly: true });
  }

  if (request) {
    const ImportScreen = request.kind === "pdf" ? PdfScreen : WordScreen;
    return <ImportScreen {...props} request={request} onHome={home}
      invoke={(operation, input) => invoke(request.kind + "-" + operation, input)} />;
  }

  const rows = recent ?? [];
  const names = new Map();
  for (const row of rows) names.set(row.name, (names.get(row.name) ?? 0) + 1);
  const now = Date.now();
  const items = rows.map(row => {
    const pdf = row.kind === "pdf";
    const review = row.reviewStatus || "상태 미지정";
    return {
      id: row.id,
      label: names.get(row.name) > 1 ? `${row.name} (${row.folder})` : row.name,
      status: pdf ? { tone: reviewTones[review] ?? "neutral", label: review } : undefined,
      details: [
        pdf ? "PDF" : "워드",
        recentDate(row.convertedAt, now),
        pdf ? `${row.pages}쪽` : null,
        pdf ? (review !== "검토 완료" && row.warnings > 0 ? `확인할 곳 ${row.warnings}` : null) : `확인할 곳 ${row.warnings}`,
        row.state || null,
      ],
    };
  });
  const chooseButton = <ui.Button variant="default" disabled={choosing} onClick={choose}>문서 고르기</ui.Button>;
  return (
    <ui.ScreenLayout width="narrow"
      status={recent === null ? <ui.Status tone="progress" label="변환한 문서 목록 읽는 중" /> : undefined}
      actions={items.length > 0 ? chooseButton : undefined}>
      {error && <ui.Notice tone="error">{error}</ui.Notice>}
      {recent !== null && (
        <section ref={content} aria-label="변환한 문서">
          {items.length > 0 ? (
            <>
              <h2 className="type-section-title">변환한 문서</h2>
              <ui.ItemList items={items} onOpen={item => open(rows.find(row => row.id === item.id))} />
            </>
          ) : (
            <ui.EmptyState title="변환한 문서가 없습니다"
              description="PDF 또는 워드 문서(.docx)를 고르면 변환된 문서와 원본을 나란히 확인할 수 있습니다."
              action={chooseButton} />
          )}
        </section>
      )}
    </ui.ScreenLayout>
  );
}
