// IEEE standards: the text conventions of the document family, not page geometry.
export const clause = /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/;
export const annexClause = /^([A-Z](?:\.\d+)+)\s+(\S.*)$/;
export const annexTitle = /^Annex\s+([A-Z])\b\s*(.*)$/;
// "Table 3—", "Figure B.2—"; other separators are accepted as well.
export const caption = /^(Table|Figure)\s+([A-Z]\.\d+|\d+)\s*[—–.:-]/;
// A caption block's text names its object.
export const captionKind = (text) =>
  /^Table\b/.test(text) ? "table" : /^Figure\b/.test(text) ? "figure" : null;
// "NOTE 1—" starts its own paragraph.
export const note = /^NOTE(?:\s|[—–-])/;
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
  caption,
  captionKind,
  note,
  tableNote,
  bodyStart,
};
