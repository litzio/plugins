export function mergeRecentRows(pdf, word) {
  return [
    ...pdf.map(row => ({ ...row, kind: "pdf" })),
    ...word.map(row => ({ ...row, kind: "word" })),
  ].sort((a, b) => b.convertedAt.localeCompare(a.convertedAt));
}
