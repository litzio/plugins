import { sheet, hasSheetSignals } from "./sheet.mjs";
import generic from "./generic.mjs";
import ieee from "./ieee.mjs";

export const profiles = { generic, ieee, sheet };

// An IEEE standard prints its designation ("IEEE Std 1547-2018") as a cover line
// of its own and leads its PDF title with it. A citation inside a sentence is not enough.
const designation = /^IEEE Std\s+\d/;
export function selectProfile({ pages = [], title = "" }) {
  const lines = pages.slice(0, 2).flatMap((p) =>
    (p.raw || []).map((l) => l.spans.map((s) => s.text).join("").trim()),
  );
  return designation.test(title) || lines.some((t) => designation.test(t)) ? "ieee" : hasSheetSignals(pages) ? "sheet" : "generic";
}
