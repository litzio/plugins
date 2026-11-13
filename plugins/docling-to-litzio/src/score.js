import { inlineText, inlineSignature } from "./rich-content.js";
// Independent readback checks. No Core, native parser or sibling plugin imports.
export function verifyNative(plan, receipt, snapshot) {
  const mismatches = [],
    nodes = snapshot.nodes,
    bindings = new Map(receipt.inputs.map((i) => [i.key, i.targets]));
  const get = (path) =>
    nodes.find((n) => JSON.stringify(n.path) === JSON.stringify(path));
  const check = (key, field, expected, actual) => {
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      mismatches.push({ key, field, expected, actual });
  };
  check("document", "revision", receipt.revision, snapshot.revision);
  check(
    "document",
    "block-count",
    plan.request.authoring.inputs.length,
    nodes.filter((n) => n.path.length === 1 && n.type !== "caption").length,
  );
  for (const input of plan.request.authoring.inputs) {
    const b = input.blocks[0],
      targets = bindings.get(input.key) ?? [];
    check(input.key, "target-count", 1, targets.length);
    const n = targets[0] && get(targets[0].path);
    if (!n) {
      mismatches.push({ key: input.key, field: "missing-target" });
      continue;
    }
    check(input.key, "kind", b.kind, n.type);
    if ("enumerator" in b)
      check(input.key, "enumerator", b.enumerator, n.enumerator);
    if (b.enumerated === false)
      check(input.key, "not-enumerated", undefined, n.numbers?.[b.kind]);
    if (b.kind === "code")
      check(input.key, "code-language", b.language, n.language ?? "");
    if (b.kind === "list" && b.ordered)
      check(input.key, "list-start", b.start ?? 1, n.start ?? 1);
    if ("text" in b)
      check(input.key, "literal", b.text, inlineText(n.content ?? n.text));
    if ("content" in b)
      check(
        input.key,
        "inline",
        inlineSignature(b.content),
        inlineSignature(n.content),
      );
    if (b.label) check(input.key, "label", b.label, n.label);
    if (b.kind === "heading") check(input.key, "level", b.level, n.level);
    if (b.kind === "equation") check(input.key, "latex", b.latex, n.latex);
    if (b.kind === "code") check(input.key, "code", b.code, n.code ?? n.text);
    if (b.kind === "table") {
      const cells = nodes.filter(
        (c) => c.type === "cell" && c.path[0] === n.path[0],
      );
      check(
        input.key,
        "cell-count",
        b.rows.length * b.rows[0].length,
        cells.length,
      );
      if (b.caption !== undefined)
        check(
          input.key,
          "table-caption",
          inlineSignature(b.caption),
          inlineSignature(n.caption),
        );
      b.rows.forEach((row, r) =>
        row.forEach((text, c) =>
          check(
            input.key,
            `cell:${r}:${c}`,
            inlineSignature(text),
            inlineSignature(
              get([...n.path, r, c])?.content ?? get([...n.path, r, c])?.text,
            ),
          ),
        ),
      );
    }
    if (b.kind === "list") {
      const project = (l) => ({
        ordered: l.ordered,
        ...(l.ordered
          ? {
              start: l.start ?? 1,
              style: l.style ?? "decimal",
              delimiter: l.delimiter ?? ".",
            }
          : {}),
        items: l.items.map((i) => ({
          content: inlineSignature(typeof i === "string" ? i : i.content),
          ...(i.list ? { list: project(i.list) } : {}),
        })),
      });
      check(input.key, "list-structure", project(b), project(n));
    }
    if (b.kind === "figure")
      check(
        input.key,
        "caption",
        inlineSignature(b.caption),
        inlineSignature(
          nodes.find((c) => c.type === "caption" && c.path[0] === n.path[0])
            ?.content ?? "",
        ),
      );
  }
  return {
    mismatches,
    verified:
      "CLI inspect against authoring plan; exact strings, kinds, levels, cells and list items",
  };
}
const clean = (s) => (s ?? "").replace(/\s+/g, "");
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function overlap(a, b) {
  const area = (x) => Math.max(0, x[2] - x[0]) * Math.max(0, x[3] - x[1]);
  return (
    (Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
      Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))) /
    Math.max(1, Math.min(area(a), area(b)))
  );
}
export function scoreOracle(gt, doc, plan, receipt, snapshot) {
  const sourceOrder = [];
  const visit = (ref) => {
    sourceOrder.push(ref);
    for (const c of resolveRef(doc, ref).children ?? []) visit(c.$ref);
  };
  visit("#/body");
  const markers = Object.fromEntries(
    plan.items
      .filter((i) => i.structure.noteBinding)
      .map((i) => [
        i.structure.noteBinding.label,
        i.structure.noteBinding.marker,
      ]),
  );
  const metrics = {},
    details = [],
    observations = [],
    matches = new Map(),
    bindings = new Map(receipt.inputs.map((i) => [i.key, i.targets])),
    inventory = new Map(plan.items.map((i) => [i.selfRef, i]));
  const measure = (category, id, sourceOK, nativeOK, unsupported = false) => {
    const attribution = nativeOK
      ? "match"
      : !sourceOK
        ? "conversion"
        : unsupported
          ? "representation"
          : "generation";
    const m = (metrics[category] ??= {
      match: 0,
      conversion: 0,
      representation: 0,
      generation: 0,
      total: 0,
    });
    observations.push({ category, id, attribution });
    m[attribution]++;
    m.total++;
    if (attribution !== "match") details.push({ category, id, attribution });
  };
  for (const e of gt.elements) {
    let best = null,
      score = 0.499999;
    const page = doc.pages[e.page],
      expectedPage = gt.pages.find((p) => p.page === e.page);
    for (const i of plan.items)
      for (const region of i.regions) {
        if (region.pageNo !== e.page) continue;
        if (
          e.docling_label === "picture" &&
          !i.selfRef.startsWith("#/pictures/")
        )
          continue;
        const b = region.bbox.map(
            (v, k) =>
              v *
              (k % 2
                ? expectedPage.height / page.size.height
                : expectedPage.width / page.size.width),
          ),
          o = overlap(e.bbox, b);
        if (o > score) {
          best = i;
          score = o;
        }
      }
    if (!best) continue;
    matches.set(e.id, best);
  }
  const native = (i) =>
    (i?.links ?? [])
      .flatMap((l) =>
        (bindings.get(l.key) ?? []).map((t) =>
          snapshot.nodes.find((n) => equal(n.path, t.path)),
        ),
      )
      .filter(Boolean);
  for (const e of gt.elements) {
    const i = matches.get(e.id),
      s = i && resolveRef(doc, i.selfRef),
      out = native(i),
      n = out[0],
      label = e.docling_label,
      id = e.id;
    if (e.layer === "furniture") {
      measure(
        "furniture",
        id,
        s?.content_layer === "furniture",
        i?.disposition === "furniture",
      );
      continue;
    }
    if (["title", "section_header"].includes(label)) {
      measure("heading", id, s?.label === label, n?.type === "heading");
      if ("heading_level" in e)
        measure(
          "heading_level",
          id,
          s?.level === e.heading_level,
          n?.level === e.heading_level,
        );
    }
    const listText =
      n?.type === "list"
        ? n.items?.[i.links[0].selector?.listItem ?? 0]?.content
            .map((c) => inlineText([c]))
            .join("")
        : undefined;
    if (["text", "paragraph"].includes(label))
      measure(
        "prose_role",
        id,
        ["text", "paragraph"].includes(s?.label),
        n?.type === "paragraph",
      );
    let literal =
      listText ??
      (n?.type === "table" && s?.label === "caption"
        ? inlineText(n.caption)
        : undefined) ??
      (n?.content ? inlineText(n.content, markers) : undefined) ??
      n?.text ??
      n?.latex ??
      snapshot.nodes.find(
        (c) => c.type === "caption" && c.path[0] === n?.path[0],
      )?.text ??
      "";
    if (
      s?.label === "caption" &&
      ["figure", "table"].includes(n?.type) &&
      n.enumerator
    ) {
      const m =
        /^\s*(?:Figure|Fig\.?|그림|Table|표)\s+((?:[A-Z]\.)?\d+(?:[.-]\d+)*)(?=[:.]?(?:\s|$))[:.]?\s*(.*)$/is.exec(
          s.text,
        );
      if (m && n.enumerator === m[1])
        literal = s.text.slice(0, s.text.length - m[2].length) + literal;
    }
    if (i?.structure.noteBinding)
      literal = i.structure.noteBinding.marker + " " + literal;
    if (e.text && e.text_scoring === "strict")
      measure(
        "literal",
        id,
        clean(e.text) === clean(s?.text),
        clean(e.text) === clean(literal),
      );
    if (e.text && /[0-9≤≥±%]/.test(e.text) && label !== "formula")
      measure(
        "numeric_units_literal",
        id,
        clean(e.text) === clean(s?.text),
        clean(e.text) === clean(literal),
      );
    if (label === "formula") {
      measure(
        "formula",
        id,
        s?.label === "formula" && clean(e.text) === clean(s?.text),
        n?.type === "equation" && clean(e.text) === clean(n.latex),
      );
    }
    if (label === "footnote")
      measure(
        "footnote",
        id,
        s?.label === "footnote",
        n?.type === "footnote",
        true,
      );
    if (label === "picture")
      measure("figure", id, s?.label === "picture", n?.type === "figure");
    if (e.table) {
      const t = e.table,
        d = s?.data;
      const headerRows = i?.structure.tableModel?.headerRows ?? 0,
        offset = Math.max(0, headerRows - 1);
      const cells = snapshot.nodes.filter(
        (v) => v.type === "cell" && v.path[0] === n?.path[0],
      );
      measure(
        "table_dimensions",
        id,
        t.num_rows === d?.num_rows && t.num_cols === d?.num_cols,
        cells.length === t.num_rows * t.num_cols &&
          Math.max(-1, ...cells.map((v) => v.path[1])) + 1 === t.num_rows &&
          Math.max(-1, ...cells.map((v) => v.path[2])) + 1 === t.num_cols,
        headerRows > 1,
      );
      for (const c of t.cells) {
        const sc = d?.table_cells.find(
            (v) =>
              v.start_row_offset_idx === c.r0 &&
              v.start_col_offset_idx === c.c0,
          ),
          nc = cells.find(
            (v) =>
              v.path[1] ===
                (c.r0 < Math.max(1, headerRows) ? 0 : c.r0 - offset) &&
              v.path[2] === c.c0,
          );
        measure(
          "cell_span",
          id,
          equal([c.r1 - c.r0, c.c1 - c.c0], [sc?.row_span, sc?.col_span]),
          !!nc && c.r1 - c.r0 === 1 && c.c1 - c.c0 === 1,
          true,
        );
        measure(
          "cell_text",
          id,
          clean(c.text) === clean(sc?.text),
          clean(c.text) ===
            clean(nc?.content ? inlineText(nc.content, markers) : nc?.text),
          headerRows > 1 && c.r0 < headerRows,
        );
        if (/[0-9≤≥±%]/.test(c.text))
          measure(
            "numeric_cell",
            id,
            clean(c.text) === clean(sc?.text),
            clean(c.text) ===
              clean(nc?.content ? inlineText(nc.content, markers) : nc?.text),
            headerRows > 1 && c.r0 < headerRows,
          );
      }
    }
  }
  for (const rel of gt.relations) {
    if (rel.type === "caption_of") {
      const a = matches.get(rel.from),
        b = matches.get(rel.to),
        s = b && resolveRef(doc, b.selfRef),
        sourceOK = s?.captions?.some((c) => c.$ref === a?.selfRef);
      measure(
        "caption_link",
        rel.from,
        !!sourceOK,
        native(b).some(
          (n) =>
            ["figure", "table"].includes(n.type) &&
            native(a).some((c) => equal(c.path, n.path)),
        ),
        true,
      );
    }
  }
  const order = gt.elements
    .filter((e) => e.order !== undefined && matches.has(e.id))
    .sort((a, b) => a.page - b.page || a.order - b.order);
  for (let j = 1; j < order.length; j++) {
    const a = order[j - 1],
      b = order[j];
    if (a.page !== b.page) continue;
    const ai = matches.get(a.id),
      bi = matches.get(b.id),
      an = native(ai)[0],
      bn = native(bi)[0];
    if (an && bn)
      measure(
        "adjacent_order",
        b.id,
        sourceOrder.indexOf(ai.selfRef) <= sourceOrder.indexOf(bi.selfRef),
        an.path[0] <= bn.path[0],
        an.type === "footnote" || bn.type === "footnote",
      );
  }
  return {
    oracle: gt.schema,
    cases: gt.cases.map((c) => ({
      ...c,
      observations: observations.filter((o) => c.element_ids.includes(o.id)),
      unmeasuredRelations: gt.relations.filter(
        (r) =>
          r.type !== "caption_of" &&
          (c.element_ids.includes(r.from) || c.element_ids.includes(r.to)),
      ),
    })),
    diagnosticOnly: true,
    matching:
      "page and smaller-area bbox overlap >= 0.5; whitespace-only comparison; ambiguous geometry can misattribute",
    metrics,
    details,
    unmatched: gt.elements.filter((e) => !matches.has(e.id)).map((e) => e.id),
    unmeasured: [
      "semantic equation equivalence",
      "superscript/call site scope",
      "continuation semantics",
      "visual layout",
    ],
    generationIntegrity: verifyNative(plan, receipt, snapshot),
  };
}
function resolveRef(doc, ref) {
  return ref
    .slice(2)
    .split("/")
    .reduce((v, k) => v[k], doc);
}
