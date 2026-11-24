// IEEE standards: the text conventions of the document family, not page geometry.
export const clause = /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/;
export const annexClause = /^([A-Z](?:\.\d+)+)\s+(\S.*)$/;
export const annexTitle = /^Annex\s+([A-Z])\b\s*(.*)$/;
// "Table 3—", "Figure B.2—"; other separators are accepted as well.
export const caption = /^(Table|Figure)\s+([A-Z]\.\d+|\d+)\s*[—–.:-]/;
// A caption block's text names its object.
export const captionKind = (text) =>
  /^Table\b/.test(text) ? "table" : /^Figure\b/.test(text) ? "figure" : null;
// A figure or table reference in running text: "Figure 3", "Table B.2".
// A longer number ("Table 3.1") or a following letter is not this reference.
// Used with matchAll only.
export const reference = /\b(Figure|Table)\s+([A-Z]\.\d+|\d+)(?![\w.-]?\d|\w)/g;
// Without links, a number that belongs to another standard is not ours ("ANSI C84.1 Table 1").
export const foreignReference = /\b(?:IEEE|ANSI|IEC|ISO|UL|NFPA|NEMA)(?:\s+Std)?(?:\s+[\w.:™-]+)?[\s,]*$/;
// "NOTE 1—" starts its own paragraph.
export const note = /^NOTE(?:\s|[—–―-])/;
// A NOTE paragraph becomes a Litzio note box. The box body keeps the original words,
// label, number, separator and spaces included: "NOTE 2—text" stays "NOTE 2—text".
const notePrefix = /^NOTE(?:\s+\d+)?\s*[—–―-]/;
export const noteBody = (text) => (notePrefix.test(text) ? text : null);
// Small-print NOTE lines under a table belong to the table crop.
export const tableNote = /^NOTE/;
// The front matter ends at the first clause-1 heading.
export const bodyStart = /^1\.?\s/;
const clauseHeading = (text) => {
  const m = text.match(clause);
  return m ? { number: m[1], level: m[1].split(".").length, parentHeading: true } : null;
};

export default {
  name: "ieee",
  // Numbered heading text: { number, level, parentHeading } or null.
  // "Annex B" has no number of its own; "B.1" does not require a "B" heading.
  heading(text) {
    if (annexTitle.test(text)) return { number: null, level: 1, parentHeading: true };
    const m = text.match(annexClause);
    if (!m) return clauseHeading(text);
    return { number: m[1], level: m[1].split(".").length, parentHeading: !/^[A-Z]\.\d+$/.test(m[1]) };
  },
  sectionNumber(text) {
    return text.match(annexTitle)?.[1] ?? text.match(annexClause)?.[1] ?? text.match(clause)?.[1];
  },
  linkedNumber(text) {
    const match = /\bAnnex\s+([A-Z](?:\.\d+)*)\b|\b([A-Z]\.\d+(?:\.\d+)*|\d+(?:\.\d+)*)\b|^([A-Z])$/i.exec(text);
    return match?.slice(1).find(Boolean)?.toUpperCase();
  },
  caption,
  captionKind,
  reference,
  foreignReference,
  note,
  noteBody,
  tableNote,
  bodyStart,
};
