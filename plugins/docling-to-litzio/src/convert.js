import { formulaHints } from "./formula.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const RULES = Object.freeze(
  Object.fromEntries(
    [
      "validation",
      "order",
      "heading",
      "paragraph",
      "list",
      "table",
      "equation",
      "figure",
      "caption",
      "footnote",
      "code",
      "furniture",
      "fallback",
      "coordinates",
      "formulaHints",
    ].map((k) => [k, "1.0.0"]),
  ),
);
const fail = (code, ref = "") => {
  throw new Error(`${code} ${ref}`.trim());
};
export async function readBundle(folder) {
  const raw = await readFile(resolve(folder, "document.json")),
    recordRaw = await readFile(resolve(folder, "conversion-record.json"));
  const record = JSON.parse(recordRaw),
    pdf = await readFile(resolve(folder, record.source.file));
  if (
    hash(raw) !== record.document.sha256 ||
    hash(pdf) !== record.source.sha256 ||
    pdf.length !== record.source.bytes
  )
    fail("bundle-digest");
  return {
    doc: JSON.parse(raw),
    record,
    source: {
      pdfSha256: hash(pdf),
      doclingSha256: hash(raw),
      recordSha256: hash(recordRaw),
      documentSchemaVersion: "1.10.0",
      bundleRef: ".",
      pdfRelativePath: record.source.file,
      doclingRelativePath: "document.json",
      recordRelativePath: "conversion-record.json",
    },
  };
}
export function validate(doc, record) {
  if (doc.schema_name !== "DoclingDocument" || doc.version !== "1.10.0")
    fail("unsupported-schema");
  if (
    record.document.version !== doc.version ||
    record.document.schema !== doc.schema_name
  )
    fail("record-schema");
  if (
    !Array.isArray(doc.body?.children) ||
    doc.body.self_ref !== "#/body" ||
    !["texts", "tables", "pictures", "groups"].every((k) =>
      Array.isArray(doc[k]),
    )
  )
    fail("document-structure");
  const pages = Object.entries(doc.pages ?? {});
  if (!pages.length || pages.length !== record.document.page_count)
    fail("page-count");
  for (let n = 1; n <= pages.length; n++) if (!doc.pages[n]) fail("page-gap");
  for (const [n, p] of pages)
    if (
      p.page_no !== Number(n) ||
      !Number.isFinite(p.size?.width) ||
      !Number.isFinite(p.size?.height) ||
      p.size.width <= 0 ||
      p.size.height <= 0
    )
      fail("page-size", n);
  const nodes = new Map();
  for (const [key, items] of Object.entries(doc)) {
    const values = Array.isArray(items)
      ? items
      : ["body", "furniture"].includes(key)
        ? [items]
        : [];
    for (const [i, node] of values.entries())
      if (node && typeof node === "object" && node.self_ref) {
        const ref = Array.isArray(items) ? `#/${key}/${i}` : `#/${key}`;
        if (node.self_ref !== ref || nodes.has(ref)) fail("self-ref", ref);
        nodes.set(ref, node);
      }
  }
  const scan = (value) => {
    if (!value || typeof value !== "object") return;
    if ("$ref" in value && !nodes.has(value.$ref))
      fail("broken-reference", value.$ref);
    for (const v of Object.values(value)) scan(v);
  };
  scan(doc);
  const active = new Set(),
    done = new Set();
  function visit(ref) {
    if (active.has(ref)) fail("cycle", ref);
    if (done.has(ref)) return;
    active.add(ref);
    for (const c of nodes.get(ref).children ?? []) {
      if (nodes.get(c.$ref).parent?.$ref !== ref) fail("parent-child", c.$ref);
      visit(c.$ref);
    }
    active.delete(ref);
    done.add(ref);
  }
  for (const [ref, n] of nodes) {
    visit(ref);
    for (const p of n.prov ?? []) regions([p], doc);
  }
  return nodes;
}
export function regions(prov, doc) {
  return prov.map((p) => {
    const page = doc.pages[p.page_no],
      b = p.bbox;
    if (
      !page ||
      !b ||
      !["TOPLEFT", "BOTTOMLEFT"].includes(b.coord_origin) ||
      ![b.l, b.t, b.r, b.b].every(Number.isFinite)
    )
      fail("invalid-region");
    const bbox =
      b.coord_origin === "BOTTOMLEFT"
        ? [b.l, page.size.height - b.t, b.r, page.size.height - b.b]
        : [b.l, b.t, b.r, b.b];
    if (bbox[0] > bbox[2] || bbox[1] > bbox[3]) fail("invalid-bbox");
    return {
      pageNo: p.page_no,
      bbox,
      unit: "pt",
      origin: "TOPLEFT",
      pageSize: page.size,
      rotation: null,
      printedLabel: null,
      original: p,
    };
  });
}
export function makePlan({ doc, record, source, bookmarkEvidence }) {
  const nodes = validate(doc, record),
    items = new Map(),
    inputs = [],
    images = [],
    losses = [],
    diagnostics = [];
  const note = (ref, reasonCode, originalValue, severity = "blocking") => {
    const l = {
      selfRef: ref,
      reasonCode,
      originalValue,
      severity,
      resolution: "unreviewed",
    };
    losses.push(l);
    return l;
  };
  for (const k of [
    "do_formula_enrichment",
    "do_code_enrichment",
    "do_table_structure",
    "include_images",
    "include_page_images",
    "do_pdf_heading_hierarchy",
  ])
    if (record.actual_request?.[k] !== true)
      diagnostics.push({ code: "conversion-option-missing", option: k });
  if (
    record.task?.task_status !== "success" ||
    record.result?.status !== "success" ||
    record.result?.errors?.length
  )
    diagnostics.push({ code: "partial-conversion" });
  for (const [n, p] of Object.entries(doc.pages))
    if (!p.image?.uri?.startsWith("data:"))
      diagnostics.push({ code: "page-image-missing", pageNo: Number(n) });
  for (const [ref, n] of nodes)
    items.set(ref, {
      sourceId: hash(`${source.doclingSha256}:${ref}`),
      selfRef: ref,
      label: n.label,
      sourceText: n.text ?? null,
      originalText: n.orig ?? null,
      regions: regions(n.prov ?? [], doc),
      disposition: "omitted",
      links: [],
      losses: [],
    });
  const emit = (ref, block, contributors = [ref]) => {
    const key = `block-${inputs.length}`;
    inputs.push({ key, blocks: [block] });
    for (const r of contributors) {
      items.get(r).disposition = "mapped";
      items.get(r).links.push({ key });
    }
    return key;
  };
  const furniture = (n) =>
    n.content_layer === "furniture" ||
    ["page_header", "page_footer"].includes(n.label);
  const captionOwner = new Map();
  for (const [ref, n] of nodes)
    for (const c of n.captions ?? []) {
      if (captionOwner.has(c.$ref)) fail("multiple-caption-owners", c.$ref);
      captionOwner.set(c.$ref, ref);
    }
  const numbers = new Map(),
    counts = new Map();
  for (const [ref, n] of nodes)
    if (n.label === "picture" || ref.startsWith("#/tables/")) {
      const kind = n.label === "picture" ? "figure" : "table",
        caption = (n.captions ?? [])
          .map((c) => nodes.get(c.$ref).text ?? "")
          .join(" ");
      const m =
        /^\s*(Figure|Fig\.?|Table|그림|표)\s+([0-9]+(?:[.-][0-9]+)*)(?=[:.]?(?:\s|$))[:.]?\s*(.*)$/is.exec(
          caption,
        );
      if (m && /^(Table|표)$/i.test(m[1]) === (kind === "table")) {
        numbers.set(ref, { enumerator: m[2], caption: m[3] });
        const key = kind + ":" + m[2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  const numbering = (ref, kind) => {
    const v = numbers.get(ref);
    return v && counts.get(kind + ":" + v.enumerator) === 1 ? v : null;
  };
  const seen = new Set();
  function walk(ref, depth = 0, excluded = false) {
    if (seen.has(ref)) return;
    seen.add(ref);
    const n = nodes.get(ref),
      entry = items.get(ref);
    const skip = excluded || furniture(n);
    if (skip) {
      entry.disposition = "furniture";
      for (const c of n.children ?? []) walk(c.$ref, depth, true);
      return;
    }
    if (
      ref === "#/body" ||
      ref === "#/furniture" ||
      ref.startsWith("#/groups/")
    ) {
      entry.disposition = "container";
      if (!["unspecified", "list", "ordered_list", "inline"].includes(n.label))
        note(ref, "group-role", n.label, "advisory");
      for (const c of n.children ?? [])
        walk(c.$ref, depth + (n.label?.includes("list") ? 1 : 0));
      return;
    }
    if (
      captionOwner.has(ref) &&
      nodes.get(captionOwner.get(ref)).label === "picture"
    ) {
      entry.disposition = "container";
      return;
    }
    if (ref.startsWith("#/tables/")) {
      const t = n.data;
      if (
        !Number.isInteger(t?.num_rows) ||
        !Number.isInteger(t?.num_cols) ||
        t.num_rows < 1 ||
        t.num_rows > 100 ||
        t.num_cols < 1 ||
        t.num_cols > 32
      )
        fail("table-limit", ref);
      const rows = Array.from({ length: t.num_rows }, () =>
          Array(t.num_cols).fill(""),
        ),
        occupied = new Set(),
        cells = [];
      for (const [i, c] of t.table_cells.entries()) {
        const r0 = c.start_row_offset_idx,
          r1 = c.end_row_offset_idx,
          c0 = c.start_col_offset_idx,
          c1 = c.end_col_offset_idx;
        if (
          ![r0, r1, c0, c1].every(Number.isInteger) ||
          r0 < 0 ||
          c0 < 0 ||
          r1 > t.num_rows ||
          c1 > t.num_cols ||
          r1 <= r0 ||
          c1 <= c0 ||
          r1 - r0 !== c.row_span ||
          c1 - c0 !== c.col_span
        )
          fail("cell-span", ref);
        const selectors = [];
        for (let r = r0; r < r1; r++)
          for (let col = c0; col < c1; col++) {
            const pos = `${r}:${col}`;
            if (occupied.has(pos)) fail("overlapping-cells", ref);
            occupied.add(pos);
            rows[r][col] = c.text;
            selectors.push({ row: r, column: col });
          }
        cells.push({
          sourceId: hash(`${source.doclingSha256}:${ref}:${i}`),
          cellIndex: i,
          sourceCell: c,
          selectors,
        });
        if (c.row_span > 1 || c.col_span > 1)
          note(ref, "merged-cell-repeated", { cellIndex: i, cell: c });
        if (c.row_header || c.row_section || c.column_header !== (r0 === 0))
          note(ref, "table-header-role", { cellIndex: i, cell: c });
        if (c.text?.includes("\\") || c.text?.includes("$"))
          note(ref, "cell-rich-content-unavailable", {
            cellIndex: i,
            text: c.text,
          });
      }
      entry.cellRegionPrecision = "table regions; cell page not inferred";
      entry.cells = cells;
      const number = numbering(ref, "table");
      emit(ref, {
        kind: "table",
        rows,
        ...(number ? { enumerator: number.enumerator } : { enumerated: false }),
      });
      if ((n.captions ?? []).length)
        note(ref, "table-caption-separate", n.captions);
      if (n.label === "document_index")
        note(ref, "toc-static-table", n.label, "advisory");
    } else if (n.label === "picture") {
      const caps = (n.captions ?? []).filter(
          (c) => !furniture(nodes.get(c.$ref)),
        ),
        caption = caps.map((c) => nodes.get(c.$ref).text ?? "").join(" ");
      const number = numbering(ref, "figure");
      const block = {
        kind: "figure",
        imageAlt: "",
        caption: number?.caption ?? caption,
        ...(number ? { enumerator: number.enumerator } : { enumerated: false }),
      };
      if (n.image?.uri) {
        const m =
          /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
            n.image.uri,
          );
        if (!m || Buffer.from(m[2], "base64").toString("base64") !== m[2])
          fail("invalid-image", ref);
        const bytes = Buffer.from(m[2], "base64");
        if (bytes.length > 10 * 1024 * 1024) fail("image-limit", ref);
        block.imageAsset = `image-${images.length}`;
        images.push({ key: block.imageAsset, mime: m[1], base64: m[2] });
        entry.asset = { sha256: hash(bytes), key: block.imageAsset };
      } else {
        block.imageUrl = "";
        note(ref, "picture-image-missing", null);
      }
      emit(ref, block, [ref, ...caps.map((c) => c.$ref)]);
      if (caption && !number)
        note(ref, "caption-number-literal", caption, "advisory");
    } else if (n.label === "title" || n.label === "section_header") {
      const level = n.label === "title" ? 1 : n.level;
      if (Number.isInteger(level) && level >= 1 && level <= 6)
        emit(ref, { kind: "heading", level, text: n.text });
      else {
        emit(ref, { kind: "paragraph", text: n.text });
        note(ref, "heading-level", level);
      }
    } else if (n.label === "formula") {
      emit(ref, { kind: "equation", latex: n.text });
      note(ref, "equation-number-unbound", n.text, "advisory");
    } else if (n.label === "code")
      emit(ref, {
        kind: "code",
        language: n.code_language === "unknown" ? "" : (n.code_language ?? ""),
        code: n.text,
      });
    else if (n.label === "list_item") {
      const numeric = n.enumerated && /^\d+[.)]?$/.test(n.marker ?? ""),
        previous = inputs.at(-1),
        last = previous?.blocks[0];
      const start = numeric ? Number(n.marker.replace(/\D/g, "")) : undefined;
      const previousSource =
        previous &&
        [...items.values()].find((i) =>
          i.links.some((l) => l.key === previous.key),
        );
      if (
        last?.kind === "list" &&
        last.ordered === !!numeric &&
        last.items.length < 100 &&
        previousSource &&
        nodes.get(previousSource.selfRef).parent?.$ref === n.parent?.$ref &&
        (!numeric || last.start + last.items.length === start)
      ) {
        const selector = { listItem: last.items.length };
        last.items.push(n.text);
        entry.disposition = "mapped";
        entry.links.push({ key: previous.key, selector });
      } else {
        const key = emit(ref, {
          kind: "list",
          ordered: !!numeric,
          ...(numeric ? { start } : {}),
          items: [n.text],
        });
        entry.links[0].selector = { listItem: 0 };
      }
      if (
        depth > 1 ||
        (n.enumerated && !numeric) ||
        (n.marker && !numeric && !["-", "•", "*"].includes(n.marker))
      )
        note(ref, "list-marker-or-depth", {
          marker: n.marker,
          enumerated: n.enumerated,
          depth,
        });
    } else if (typeof n.text === "string") {
      emit(ref, { kind: "paragraph", text: n.text });
      if (n.label === "footnote") note(ref, "footnote-as-paragraph", n.text);
      else if (!["text", "paragraph", "caption"].includes(n.label))
        note(ref, "role-as-paragraph", n.label);
    } else {
      entry.disposition = "unsupported";
      note(ref, "unsupported-element", n.label);
    }
    if (n.formatting || n.hyperlink)
      note(ref, "inline-formatting", n.formatting ?? n.hyperlink);
    for (const c of n.children ?? []) walk(c.$ref, depth);
    for (const c of n.captions ?? []) walk(c.$ref, depth);
  }
  walk("#/body");
  if (nodes.has("#/furniture")) walk("#/furniture", 0, true);
  for (const [ref, e] of items)
    if (!seen.has(ref) && !e.links.length) {
      if (furniture(nodes.get(ref))) e.disposition = "furniture";
      else note(ref, "unreachable", nodes.get(ref).label);
    }
  for (const l of losses) items.get(l.selfRef).losses.push(l);
  const request = { authoring: { inputs }, images };
  validateLimits(request);
  if (bookmarkEvidence && bookmarkEvidence.pdfSha256 !== source.pdfSha256)
    fail("bookmark-evidence-digest");
  const bookmarks = bookmarkEvidence?.status ?? "unknown";
  if (!["present", "absent", "unknown"].includes(bookmarks))
    fail("bookmark-evidence-status");
  const headingReview = {
    bookmarkPresence: bookmarks,
    evidence: bookmarkEvidence ?? null,
    useBookmarksRequested:
      record.actual_request?.pdf_heading_hierarchy_options?.use_bookmarks ===
      true,
    basis: "not exposed per heading by conversion output",
    confidence:
      bookmarks === "present"
        ? "bookmark-enabled; attribution unproven"
        : "low — review required",
    reviewRequired: bookmarks !== "present",
    levelsPreserved: true,
  };
  const formulaReview = [...nodes.values()]
    .filter((n) => n.label === "formula")
    .map((n) => ({
      selfRef: n.self_ref,
      latex: n.text,
      regions: regions(n.prov ?? [], doc),
      reviewRequired: true,
      ...formulaHints(n.text),
    }));
  return {
    headingReview,
    formulaReview,
    generatorVersion: "0.1.0",
    rulesVersion: RULES,
    source,
    request,
    items: [...items.values()],
    losses,
    diagnostics,
    provenanceStatus: "generation-report-only; finalize in PR 2",
  };
}
export function validateLimits(request) {
  const a = request.authoring,
    bs = a.inputs.flatMap((i) => i.blocks);
  if (a.inputs.length > 5000 || bs.length > 5000 || request.images.length > 256)
    fail("authoring-count-limit");
  const strings = (v) => {
    if (typeof v === "string" && v.length > 16384) fail("string-limit");
    if (v && typeof v === "object") Object.values(v).forEach(strings);
  };
  strings(a);
  if (
    Buffer.byteLength(JSON.stringify(a)) > 4194304 ||
    Buffer.byteLength(JSON.stringify(request)) > 33554432
  )
    fail("authoring-byte-limit");
}
