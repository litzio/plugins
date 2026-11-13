import {
  formatInline,
  hasInline,
  unsupportedFormat,
  bindNotes,
  noteContent,
} from "./rich-content.js";
import { projectList, markerFormat } from "./list-rule.js";
import { projectTable, lossCategory, sourceStructure } from "./table-rule.js";
import { formulaHints } from "./formula.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
    ].map((k) => [
      k,
      [
        "table",
        "equation",
        "figure",
        "caption",
        "list",
        "paragraph",
        "heading",
        "footnote",
      ].includes(k)
        ? "1.2.0"
        : "1.0.0",
    ]),
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
export function makePlan({
  doc,
  record,
  source,
  bookmarkEvidence,
  pdfEvidence,
}) {
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
      category: lossCategory(reasonCode),
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
      structure: sourceStructure(n),
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
        /^\s*(Figure|Fig\.?|Table|그림|표)\s+((?:[A-Z]\.)?[0-9]+(?:[.-][0-9]+)*)(?=[:.]?(?:\s|$))[:.]?\s*(.*)$/is.exec(
          caption,
        );
      if (
        m &&
        n.captions.length === 1 &&
        /^(Table|표)$/i.test(m[1]) === (kind === "table")
      ) {
        numbers.set(ref, { enumerator: m[2], caption: m[3] });
        const key = kind + ":" + m[2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  for (const [ref, n] of nodes)
    if (n.label === "formula") {
      const m = /^\s*\(((?:[A-Z]\.)?[0-9]+(?:[.-][0-9]+)*)\)\s+/.exec(
        n.orig ?? "",
      );
      if (
        m &&
        n.text?.includes("=") &&
        !n.text.trimStart().startsWith(m[0].trim()) &&
        !/\\(?:tag|label)\s*\{/.test(n.text)
      ) {
        numbers.set(ref, {
          enumerator: m[1],
          evidence: {
            field: "orig",
            marker: m[0],
            rule: "same-element-parenthesized-prefix",
          },
        });
        const key = "equation:" + m[1];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  const numbering = (ref, kind) => {
    const v = numbers.get(ref);
    return v && counts.get(kind + ":" + v.enumerator) === 1 ? v : null;
  };
  if (pdfEvidence && pdfEvidence.pdfSha256 !== source.pdfSha256)
    fail("pdf-evidence-digest");
  const notes = bindNotes(doc, pdfEvidence);
  for (const [ref, definition] of notes.definitions)
    items.get(ref).structure.noteBinding = definition.binding;
  for (const [key, bindings] of notes.edits) {
    const ref = key.slice(0, key.lastIndexOf(":"));
    (items.get(ref).structure.noteReferences ??= []).push(...bindings);
  }
  const content = (n, text = n.text ?? "") =>
    noteContent(n, notes.edits.get(n.self_ref + ":text"), text);
  const prose = (n) =>
    hasInline(n) || notes.edits.has(n.self_ref + ":text")
      ? { content: content(n) }
      : { text: n.text };
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
      if (n.label?.includes("list")) {
        let projection;
        try {
          projection = projectList(ref, nodes, content);
        } catch (e) {
          if (
            !/^list-(unrepresentable-structure|ambiguous-marker)$/.test(
              e.message,
            )
          )
            throw e;
          note(ref, "list-marker-or-depth", { reason: e.message });
        }
        if (projection) {
          const key = emit(ref, { kind: "list", ...projection.list });
          for (const r of projection.containers) {
            seen.add(r);
            items.get(r).disposition = "container";
          }
          // v1 cannot locate a nested item precisely. Map to its containing root
          // item; original self_ref/regions and raw hierarchy remain available.
          for (const m of projection.mappings) {
            seen.add(m.ref);
            const i = items.get(m.ref);
            i.disposition = "mapped";
            i.structure.listProjection = {
              rootSelfRef: ref,
              indexPath: m.indexPath,
            };
            i.links.push({ key, selector: { listItem: m.indexPath[0] } });
            const unknown = unsupportedFormat(nodes.get(m.ref));
            if (Object.keys(unknown).length)
              note(m.ref, "inline-formatting", unknown);
          }
          if (projection.mappings.some((m) => m.indexPath.length > 1))
            diagnostics.push({
              code: "nested-list-provenance-coarse",
              selfRef: ref,
            });
          return;
        }
      }
      for (const c of n.children ?? [])
        walk(c.$ref, depth + (n.label?.includes("list") ? 1 : 0));
      return;
    }
    if (captionOwner.has(ref)) {
      const unknown = unsupportedFormat(n);
      if (Object.keys(unknown).length) note(ref, "inline-formatting", unknown);
      entry.disposition = "container";
      return;
    }
    if (ref.startsWith("#/tables/")) {
      const t = n.data,
        projection = projectTable(t);
      entry.structure.tableModel = projection.model;
      entry.cellRegionPrecision = "table regions; cell page not inferred";
      entry.cells = projection.cells.map((c) => ({
        ...c,
        sourceId: hash(`${source.doclingSha256}:${ref}:${c.cellIndex}`),
      }));
      for (const [i, c] of t.table_cells.entries()) {
        if (c.row_span > 1 || c.col_span > 1)
          note(ref, "merged-cell-repeated", {
            cellIndex: i,
            cell: c,
            risks: projection.model.mergedRanges.find((m) => m.cellIndex === i)
              .risks,
          });
        if (
          c.row_header ||
          c.row_section ||
          c.column_header !==
            c.start_row_offset_idx < Math.max(1, projection.model.headerRows)
        )
          note(ref, "table-header-role", { cellIndex: i, cell: c });
        if (c.text?.includes("\\") || c.text?.includes("$"))
          note(ref, "cell-rich-content-unavailable", {
            cellIndex: i,
            text: c.text,
          });
        if (/[\r\n]/.test(c.text ?? ""))
          note(ref, "cell-block-structure", { cellIndex: i, text: c.text });
      }
      if (projection.model.headerRows > 1)
        note(ref, "compound-header-flattened", {
          headerRows: projection.model.headerRows,
          contributions: projection.model.headerContributions,
        });
      const number = numbering(ref, "table");
      const caps = (n.captions ?? []).filter(
        (c) => !furniture(nodes.get(c.$ref)),
      );
      const caption = caps.flatMap((c, index) => [
        ...(index ? [{ kind: "text", text: " " }] : []),
        ...content(
          nodes.get(c.$ref),
          number?.caption ?? nodes.get(c.$ref).text,
        ),
      ]);
      const rows = projection.rows.map((row, r) =>
        row.map((text, col) => {
          const originals = entry.cells.filter((c) =>
            c.selectors.some((s) => s.row === r && s.column === col),
          );
          // Compound headers keep their established exact joined text. A cell's
          // inline note is transferred only for a one-source projection.
          const edits =
            originals.length === 1
              ? notes.edits.get(ref + ":" + originals[0].cellIndex)
              : undefined;
          return edits?.length ? noteContent({}, edits, text) : text;
        }),
      );
      emit(
        ref,
        {
          kind: "table",
          rows,
          ...(caps.length ? { caption } : {}),
          ...(number
            ? { enumerator: number.enumerator }
            : { enumerated: false }),
        },
        [ref, ...caps.map((c) => c.$ref)],
      );
      if (projection.model.note) {
        const key = emit(ref, {
          kind: "paragraph",
          text: projection.model.note,
        });
        entry.links.find((l) => l.key === key).role = "explanation";
      }
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
        caption:
          caps.length === 1
            ? content(nodes.get(caps[0].$ref), number?.caption ?? caption)
            : caption,
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
        emit(ref, { kind: "heading", level, ...prose(n) });
      else {
        emit(ref, { kind: "paragraph", ...prose(n) });
        note(ref, "heading-level", level);
      }
    } else if (n.label === "formula") {
      const number = numbering(ref, "equation");
      entry.structure.numberEvidence = number?.evidence ?? null;
      emit(ref, {
        kind: "equation",
        latex: n.text,
        ...(number ? { enumerator: number.enumerator } : {}),
      });
      if (!number) note(ref, "equation-number-unbound", n.text, "advisory");
    } else if (n.label === "code")
      emit(ref, {
        kind: "code",
        language: n.code_language === "unknown" ? "" : (n.code_language ?? ""),
        code: n.text,
      });
    else if (n.label === "list_item") {
      const format = markerFormat(n);
      const key = emit(ref, {
        kind: "list",
        ...(format ?? { ordered: false }),
        items: [{ content: content(n) }],
      });
      entry.links[0].selector = { listItem: 0 };
      entry.structure.listProjection = { rootSelfRef: ref, indexPath: [0] };
      if (!format || depth > 1 || n.children?.length)
        note(ref, "list-marker-or-depth", {
          marker: n.marker,
          enumerated: n.enumerated,
          depth,
        });
    } else if (typeof n.text === "string") {
      const definition = notes.definitions.get(ref);
      emit(
        ref,
        definition
          ? {
              kind: "footnote",
              label: definition.binding.label,
              content: formatInline(n, definition.text),
            }
          : { kind: "paragraph", ...prose(n) },
      );
      if (n.label === "footnote") {
        const tableOwned =
          n.parent?.$ref?.startsWith("#/tables/") ||
          [...nodes.values()].some(
            (t) =>
              t.self_ref?.startsWith("#/tables/") &&
              t.footnotes?.some((r) => r.$ref === ref),
          );
        if (tableOwned || !definition)
          note(
            ref,
            tableOwned ? "dedicated-table-note" : "footnote-as-paragraph",
            {
              text: n.text,
              reason:
                notes.unresolved.get(ref) ??
                "Original table note placement/letter marker becomes a numbered endnote",
            },
          );
      } else if (!["text", "paragraph", "caption"].includes(n.label))
        note(ref, "role-as-paragraph", n.label);
    } else {
      entry.disposition = "unsupported";
      note(ref, "unsupported-element", n.label);
    }
    const unknownFormat = ["formula", "code"].includes(n.label)
      ? {
          ...(n.formatting ?? {}),
          ...(n.hyperlink ? { hyperlink: n.hyperlink } : {}),
        }
      : unsupportedFormat(n);
    if (Object.keys(unknownFormat).length)
      note(ref, "inline-formatting", unknownFormat);
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
    generatorVersion: "0.5.0",
    rulesVersion: RULES,
    source,
    request,
    items: [...items.values()],
    losses,
    diagnostics,
    provenanceStatus: "v1; unreviewed generation",
  };
}
export function validateLimits(request) {
  const a = request.authoring,
    bs = a.inputs.flatMap((i) => i.blocks);
  const listItems = (v) =>
    v && typeof v === "object"
      ? (v.kind === "list" || ("ordered" in v && Array.isArray(v.items))
          ? v.items.length
          : 0) + Object.values(v).reduce((s, x) => s + listItems(x), 0)
      : 0;
  if (
    a.inputs.length > 5000 ||
    bs.length + listItems(bs) > 5000 ||
    request.images.length > 256
  )
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
