import { koreanTime } from "./time.mjs";

const groups = ["검토 중", "초안", "검토 완료", "상태 미지정"];

export function readListVariant() {
  // The spike has two alternatives. A clean session opens the item list.
  try { return sessionStorage.getItem("pdf-import-list-variant") === "table" ? "table" : "list"; }
  catch { return "list"; }
}

function listDate(value, now) {
  const today = koreanTime(now, true);
  const date = value.slice(0, 10);
  if (date === today) return `오늘 ${value.slice(11, 16)}`;
  if (date === koreanTime(now - 86_400_000, true)) return "어제";
  const [year, month, day] = date.split("-").map(Number);
  const prefix = date.slice(0, 4) === today.slice(0, 4) ? "" : `${year}년 `;
  return `${prefix}${month}월 ${day}일`;
}

export function ConvertedDocuments({ ui, recent, variant, onOpen }) {
  const seen = new Set(), duplicates = new Set();
  for (const {name} of recent) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  const rows = recent.map(row => ({
    ...row,
    displayName: duplicates.has(row.name) ? `${row.name} (${row.folder})` : row.name,
    reviewStatus: row.reviewStatus || "상태 미지정",
  }));
  const grouped = groups.map(status => [status, rows.filter(row => row.reviewStatus === status)])
    .filter(([, members]) => members.length > 0);
  const now = Date.now();

  return <section aria-labelledby="pdf-converted-documents">
    <h2 id="pdf-converted-documents" className="type-section-title">변환한 문서</h2>
    {variant === "table" ? <ui.DataTable
      title="변환한 문서"
      rows={rows.map(row => ({ ...row, modified: row.modified.slice(0, 16) }))}
      columns={["displayName", "reviewStatus", "pages", "warnings", "modified", ...(rows.some(row => row.state) ? ["state"] : [])]}
      labels={{ displayName: "문서 이름", reviewStatus: "검토 상태", pages: "쪽", warnings: "확인할 곳", modified: "변환한 때", state: "원본 상태" }}
      fields={{ pages: {type: "number"}, warnings: {type: "number"} }}
      rowKey="id"
      onSelectRow={onOpen}
    /> : <div className="pdf-recent-list">
      <style>{`
        .pdf-recent-list ul{margin:0;padding:0;list-style:none;border-block-start:1px solid var(--id-color-border-subtle)}
        .pdf-recent-group + .pdf-recent-group{margin-block-start:var(--space-4)}
        .pdf-recent-group h3{margin:0 0 var(--space-2);color:var(--id-color-text-muted)}
        .pdf-recent-row{width:100%;border:0;border-block-end:1px solid var(--id-color-border-subtle);background:none;color:var(--id-color-text);font:inherit;cursor:pointer;text-align:start;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,22em);align-items:center;gap:var(--space-4);padding:var(--space-2)}
        .pdf-recent-row:hover{background:var(--id-color-surface-subtle)}
        .pdf-recent-row:focus-visible{outline:2px solid var(--id-color-border-focus);outline-offset:-2px}
        .pdf-recent-identity{min-width:0;display:flex;align-items:center;gap:var(--space-3)}
        .pdf-recent-title{min-width:0;overflow-wrap:anywhere}
        .pdf-recent-state{display:inline-flex;align-items:center;gap:var(--space-2);white-space:nowrap}
        .pdf-recent-dot{border-radius:50%;inline-size:var(--space-2);block-size:var(--space-2);background:var(--id-color-text-muted)}
        [data-pdf-review="검토 중"] .pdf-recent-dot{background:var(--id-color-accent)}
        [data-pdf-review="검토 완료"] .pdf-recent-dot{background:var(--id-color-success)}
        .pdf-recent-meta{color:var(--id-color-text-muted);display:grid;grid-template-columns:1fr 2fr 2fr;align-items:center;gap:var(--space-3);text-align:end;font-variant-numeric:tabular-nums}
        .pdf-recent-original{display:block;color:var(--id-color-warning)}
        @media(max-width:760px){
          .pdf-recent-row{grid-template-columns:minmax(0,1fr);row-gap:var(--space-1)}
          .pdf-recent-meta{grid-column:1/-1;display:flex;flex-wrap:wrap;text-align:start}
        }
      `}</style>
      {grouped.map(([status, members]) => <div className="pdf-recent-group" key={status}>
        {grouped.length > 1 && <h3 className="type-item-name">{status}</h3>}
        <ul role="list">
          {members.map(row => <li key={row.id}>
            <button type="button" className="pdf-recent-row" onClick={() => onOpen(row)}>
              <span className="pdf-recent-identity">
                <span className="pdf-recent-title"><span className="type-item-name">{row.displayName}</span>
                  {row.state && <span className="pdf-recent-original type-helper">{row.state}</span>}
                </span>
                <span className="pdf-recent-state type-helper" data-pdf-review={row.reviewStatus}>
                  <span className="pdf-recent-dot" aria-hidden="true" />{row.reviewStatus}
                </span>
              </span>
              <span className="pdf-recent-meta type-helper">
                <span>{row.pages}쪽</span>
                <span>확인할 곳 {row.warnings}개</span>
                <time dateTime={`${row.modified.replace(" ", "T")}+09:00`} title={`변환한 때 ${row.modified.slice(0, 16)} (한국 시간)`}>{listDate(row.modified, now)}</time>
              </span>
            </button>
          </li>)}
        </ul>
      </div>)}
    </div>}
  </section>;
}
