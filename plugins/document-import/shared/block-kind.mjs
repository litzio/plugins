// Names of source block kinds, as the legend shows them.
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

// One block's kind in words: headings carry their level ("제목 2").
export function kindName(b) {
  if (b.documentTitle) return "문서 제목";
  const label = LABELS[b.kind] ?? "";
  return label === LABELS.heading && b.level ? label + " " + b.level : label;
}

// The kind of the chosen blocks for the toolbar: one name, or "여러 종류" when they differ.
export function selectionKind(blocks) {
  const names = new Set(blocks.map(kindName));
  return names.size === 1 ? [...names][0] : names.size ? "여러 종류" : "";
}
