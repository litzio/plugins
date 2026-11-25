import generic from "./generic.mjs";

export const requirement = /^\[([A-Z][A-Z0-9]*_\d+_\d+)\]$/i;
const section = /^(\d+(?:[.-]\d+)*)\.?\s+\S/;
export const sheet = {
  ...generic,
  name: "sheet",
  heading(text) {
    const number = text.match(section)?.[1];
    return number
      ? { number, level: number.split(/[.-]/).length, parentHeading: true }
      : null;
  },
  caption: /^(Table|Figure)\s+(\d+(?:[.-]\d+)*)\s*[.:—–]?\s*/i,
  tableNote: /^\*\s+Refer\b/i,
};
export function hasSheetSignals(pages) {
  return (
    pages.filter(
      (p) =>
        p.footerTop != null &&
        p.raw.some(
          (l) =>
            l.bbox[1] < 110 &&
            /^\d+(?:[.-]\d+)*(?:\s|$)/.test(l.spans[0]?.text.trim()),
        ) &&
        /\[[A-Z][A-Z0-9]*_\d+_\d+\]/i.test(
          p.raw.map((l) => l.spans.map((s) => s.text).join("")).join(""),
        ),
    ).length >= 2
  );
}
