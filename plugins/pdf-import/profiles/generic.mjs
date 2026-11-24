import ieee from "./ieee.mjs";

// The conservative default when the document family is unknown.
// NOTE paragraphs, note boxes and table notes are off. Headings with annexes, captions,
// figure/table reference text and the clause-1 body start are still IEEE conventions,
// kept on because the public sample depends on them (to be reviewed).
export default {
  name: "generic",
  heading: ieee.heading,
  sectionNumber: ieee.sectionNumber,
  linkedNumber: ieee.linkedNumber,
  caption: ieee.caption,
  captionKind: ieee.captionKind,
  reference: ieee.reference,
  foreignReference: ieee.foreignReference,
  note: null,
  noteBody: null,
  tableNote: null,
  bodyStart: ieee.bodyStart,
};
