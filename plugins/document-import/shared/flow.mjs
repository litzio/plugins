// Coordinates are node centres. Both screens use the same routes, including their direction.
export const nodes = {
  pick: [66, 82, "문서 고르기", "가져올 PDF나 워드 파일을 고릅니다.", true],
  pages: [213, 56, "PDF · 쪽 고르기", "PDF에서 옮길 쪽과 뺄 쪽을 고릅니다.", true],
  analysis: [359, 56, "구조 분석", "글자와 배치를 읽고 문서 양식을 판별합니다."],
  generic: [504, 20, "일반", "일반 문서 규칙으로 본문과 그림을 구분합니다."],
  ieee: [504, 56, "표준 문서", "표준 문서의 조항과 표제 규칙을 적용합니다."],
  sheet: [504, 92, "도면 용지", "도면 용지에서 도면과 표제란을 구분합니다."],
  structure: [213, 130, "워드 · 구조 읽기", "워드의 문단, 표, 그림 구조를 읽습니다."],
  images: [655, 82, "그림 만들기", "문서에 넣을 그림을 준비합니다."],
  save: [805, 82, "문서 저장", "변환한 내용을 리치오 문서로 저장합니다."],
  link: [655, 168, "PDF · 원본 연결", "저장한 블록과 PDF 원본 위치를 연결합니다."],
  source: [655, 215, "워드 · 원본 쪽 준비", "Word로 PDF를 내보내 원본 쪽을 준비합니다."],
  locate: [505, 215, "위치 잇기", "워드의 문서 블록과 원본 쪽의 위치를 잇습니다."],
  compare: [359, 168, "원본과 대조", "원본 쪽과 변환한 문서를 나란히 살펴봅니다.", true],
  checks: [213, 168, "확인할 곳 보기", "이번에 연 화면에서 아직 보지 않은 확인할 곳을 살펴봅니다.", true],
  approved: [66, 168, "검토 완료", "PDF의 검토를 마치면 문서 상태를 검토 완료로 바꿉니다.", true],
  assistant: [213, 215, "비서 검수 · 예정", "비서가 확인할 곳을 먼저 검수하는 기능은 예정입니다."],
};
export const edges = [
  ["pick","pages"], ["pick","structure"], ["pages","analysis"],
  ...["generic","ieee","sheet"].flatMap(id => [["analysis",id],[id,"images"]]),
  ["structure","images","M273 130 H578 V102 H655 V98"],
  ["images","save"], ["save","link","M805 98 V168 H717"],
  ["save","source","M805 98 V215 H717"], ["source","locate"],
  ["locate","compare","M445 215 H359 V184"], ["link","compare"],
  ["compare","approved","M359 184 V193 H66 V184"], ["compare","checks"], ["checks","approved"], ["checks","assistant","M213 184 V199"],
];
const phases = {"구조 분석":"analysis","이전 문서 정리":"analysis","그림 만들기":"images","문서 저장":"save","원본 연결":"link","구조 읽기":"structure"};
export function flowState({kind, profile, phase, failed, source, remaining = 0, viewed = false, approved, documentOnly} = {}) {
  if (!kind) return {path: [], current: null};
  const pdf = kind === "pdf";
  const family = ["generic","ieee","sheet"].includes(profile) ? profile : null;
  const path = ["pick", ...(pdf ? ["pages","analysis",family] : ["structure"]), "images","save"].filter(Boolean);
  if (pdf) path.push("link");
  else if (source) {
    path.push("source");
    if (source === "ready") path.push("locate");
  }
  const canCompare = pdf || source === "ready";
  if (canCompare) path.push("compare");
  const current = phase ? phases[phase] : pdf && approved ? "approved" : source === "preparing" ? "source"
    : remaining ? "checks" : canCompare && !documentOnly ? "compare" : "save";
  if (viewed || current === "checks") path.push("checks");
  if (current === "approved") path.push(current);
  const at = path.indexOf(current);
  const label = phase || nodes[current][2] + (current === "checks" ? " " + remaining : "");
  return {path: phase ? path.slice(0, at + 1) : path, current, label, remaining,
    failure: failed ? current : source === "failed" ? "source" : null};
}
