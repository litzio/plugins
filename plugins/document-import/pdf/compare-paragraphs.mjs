// Development measurement: no reference paths or reference text are bundled.
import { readFile } from "node:fs/promises";
import { extract } from "./extract.mjs";
import { convert } from "./rules.mjs";
import { pathToFileURL } from "node:url";
const norm = (s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
export function compare(result, reference, minPage = 16) {
  const texts =
    reference.texts ||
    reference.elements.map((e) => ({
      text: e.text,
      label: e.role === "paragraph" ? "text" : e.role,
      prov: [{ page_no: e.page }],
    }));
  // Repeated running lines are inferred from the supplied reference, not a document name.
  const occurrences = new Map();
  for (const t of texts) {
    const key = norm(t.text).replace(/\d/g, "#");
    const pages = occurrences.get(key) || new Set();
    pages.add(t.prov?.[0]?.page_no);
    occurrences.set(key, pages);
  }
  const pageCount = Math.max(...texts.map((t) => t.prov?.[0]?.page_no || 0));
  const repeated = texts
    .filter(
      (t) =>
        (occurrences.get(norm(t.text).replace(/\d/g, "#"))?.size || 0) >
        pageCount * 0.3,
    )
    .map((t) => t.text);
  const truth = texts.filter(
    (t) =>
      t.prov?.[0]?.page_no >= minPage &&
      ["text", "list_item"].includes(t.label) &&
      norm(t.text).length >= 25 &&
      !repeated.some((prefix) => t.text.startsWith(prefix)),
  );
  const candidates = result.blocks.filter(
    (b) =>
      ["paragraph", "list"].includes(b.kind) &&
      b.page + 1 >= minPage &&
      norm(b.text).length >= 25,
  );
  const mismatches = [];
  for (const b of candidates) {
    const key = norm(
      b.marker
        ? b.text.slice(b.text.indexOf(b.marker) + b.marker.length).trimStart()
        : b.text,
    );
    const nearby = truth.filter(
      (t) => Math.abs(t.prov[0].page_no - b.page - 1) <= 1,
    );
    const start = nearby.find(
      (t) => norm(t.text).slice(0, 22) === key.slice(0, 22),
    );
    const end = nearby.find((t) => norm(t.text).slice(-22) === key.slice(-22));
    if (
      !nearby.some(
        (t) =>
          norm(t.text).slice(0, 22) === key.slice(0, 22) &&
          norm(t.text).slice(-22) === key.slice(-22),
      )
    )
      mismatches.push({
        id: b.id,
        page: b.page + 1,
        kind: b.kind,
        warning: b.warning?.code || null,
        start: !!start,
        end: !!end,
      });
  }
  return {
    total: candidates.length,
    matched: candidates.length - mismatches.length,
    ratio: (candidates.length - mismatches.length) / candidates.length,
    unwarned: mismatches.filter((b) => !b.warning).length,
    lists: result.blocks.filter((b) => b.kind === "list").length,
    reference: truth.length,
    mismatches,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, reference, minPage] = process.argv.slice(2);
  if (!input || !reference)
    throw Error(
      "Usage: node compare-paragraphs.mjs <PDF or result.json> <reference.json> [first-page]",
    );
  const result = input.endsWith(".json")
    ? JSON.parse(await readFile(input, "utf8"))
    : convert(await extract(input));
  console.log(
    JSON.stringify(
      {
        comparison: compare(
          result,
          JSON.parse(await readFile(reference, "utf8")),
          minPage ? +minPage : 16,
        ),
        stats: result.stats,
      },
      null,
      2,
    ),
  );
}
