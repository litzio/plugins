// Public authoring/inspect InlineContent only; no native parser or SDK internals.
export function inlineText(content, markers = {}) {
  if (typeof content === "string") return content;
  return (content ?? [])
    .map((c) => {
      if (c.kind === "footnote") return markers[c.label] ?? "";
      if (c.kind === "break") return "\n";
      return c.text ?? c.value ?? inlineText(c.children, markers);
    })
    .join("");
}
export function listText(list, markers = {}) {
  return (list?.items ?? [])
    .map((i) =>
      typeof i === "string"
        ? i
        : inlineText(i.content, markers) +
          (i.list ? "\n" + listText(i.list, markers) : ""),
    )
    .join("\n");
}
export function formatInline(n, text = n.text ?? "") {
  let content = [{ kind: "text", text }];
  const f = n.formatting ?? {};
  for (const [field, kind] of [
    ["bold", "strong"],
    ["italic", "emphasis"],
    ["strikethrough", "delete"],
  ])
    if (f[field]) content = [{ kind, children: content }];
  if (["super", "sub"].includes(f.script))
    content = [
      {
        kind: f.script === "super" ? "superscript" : "subscript",
        children: content,
      },
    ];
  if (n.hyperlink)
    content = [{ kind: "link", url: n.hyperlink, children: content }];
  return content;
}
export function hasInline(n) {
  return !!(
    n.hyperlink ||
    Object.entries(n.formatting ?? {}).some(
      ([k, v]) =>
        v &&
        (["bold", "italic", "strikethrough"].includes(k) ||
          (k === "script" && ["super", "sub"].includes(v))),
    )
  );
}
export function unsupportedFormat(n) {
  return Object.fromEntries(
    Object.entries(n.formatting ?? {}).filter(
      ([k, v]) =>
        v &&
        !["bold", "italic", "strikethrough"].includes(k) &&
        !(k === "script" && v === "baseline") &&
        !(k === "script" && ["super", "sub"].includes(v)),
    ),
  );
}
// A marker must be independently visible as a small raised PDF text item, inside
// the source region, with an adjacent baseline item. A matching number alone is
// insufficient. Table-local a/b notes retain their original layout as a loss.
export function bindNotes(doc, evidence) {
  const definitions = new Map(),
    edits = new Map(),
    unresolved = new Map();
  const owners = new Map();
  for (const t of doc.tables)
    for (const r of t.footnotes ?? []) {
      if (!owners.has(r.$ref)) owners.set(r.$ref, []);
      owners.get(r.$ref).push(t);
    }
  const notes = doc.texts.filter((n) => n.label === "footnote");
  const prefix = (n) => /^(\d+|[a-z])\s+(\S[\s\S]*)$/.exec(n.text ?? "");
  for (const note of notes) {
    const m = prefix(note),
      own = owners.get(note.self_ref) ?? [];
    const reject = (reason) => unresolved.set(note.self_ref, reason);
    if (!m || !evidence) {
      reject("No independent call-site evidence");
      continue;
    }
    if (own.length > 1) {
      reject("Multiple table owners");
      continue;
    }
    const owner =
      own[0] ?? doc.tables.find((t) => t.self_ref === note.parent?.$ref);
    if (
      owner &&
      notes.filter(
        (n) =>
          (owners.get(n.self_ref)?.includes(owner) ||
            n.parent?.$ref === owner.self_ref) &&
          prefix(n)?.[1] === m[1],
      ).length !== 1
    ) {
      reject("Repeated local marker within extracted table scope");
      continue;
    }
    const scope = owner
      ? owner.data.table_cells.map((c, cellIndex) => ({
          node: owner,
          cellIndex,
          text: c.text,
        }))
      : doc.texts
          .filter(
            (n) =>
              ["text", "paragraph", "list_item"].includes(n.label) &&
              n.content_layer !== "furniture",
          )
          .map((node) => ({ node, text: node.text }));
    const candidates = [];
    for (const candidate of scope) {
      const { node, text } = candidate;
      const occurrences = [
        ...(text ?? "").matchAll(
          new RegExp(`(?<![\\p{L}\\p{N}])${m[1]}(?![\\p{L}\\p{N}])`, "gu"),
        ),
      ];
      if (occurrences.length !== 1) continue;
      const witnesses = [];
      for (const r of node.prov ?? []) {
        const p = evidence.pages.find((p) => p.pageNo === r.page_no);
        if (
          !p ||
          p.rotation !== 0 ||
          !note.prov?.some(
            (n) => n.page_no >= r.page_no && n.page_no <= r.page_no + 1,
          )
        )
          continue;
        const size = doc.pages[r.page_no].size,
          b =
            candidate.cellIndex === undefined
              ? r.bbox
              : owner.data.table_cells[candidate.cellIndex].bbox;
        if (!b) continue;
        const box =
          b.coord_origin === "BOTTOMLEFT"
            ? [b.l, size.height - b.t, b.r, size.height - b.b]
            : [b.l, b.t, b.r, b.b];
        const scaled = box.map(
          (v, k) => v * (k % 2 ? p.height / size.height : p.width / size.width),
        );
        for (const glyph of p.items.filter((i) => i.text === m[1])) {
          const [l, t, rr, bb] = glyph.bbox,
            h = bb - t,
            cx = (l + rr) / 2,
            cy = (t + bb) / 2;
          if (
            cx < scaled[0] - 1 ||
            cx > scaled[2] + 1 ||
            cy < scaled[1] - 3 ||
            cy > scaled[3] + 1
          )
            continue;
          if (
            p.items.some(
              (i) =>
                i.id !== glyph.id &&
                i.bbox[3] - i.bbox[1] >= h * 1.15 &&
                i.bbox[3] > bb + 1 &&
                i.bbox[3] - bb < h &&
                Math.min(Math.abs(i.bbox[2] - l), Math.abs(i.bbox[0] - rr)) <
                  h * 1.5,
            )
          )
            witnesses.push({
              pdfItemId: glyph.id,
              pageNo: p.pageNo,
              bbox: glyph.bbox,
            });
        }
      }
      if (witnesses.length === 1)
        candidates.push({
          ...candidate,
          start: occurrences[0].index,
          marker: m[1],
          witness: witnesses[0],
        });
    }
    if (candidates.length !== 1) {
      reject("Missing or ambiguous raised call site");
      continue;
    }
    const c = candidates[0],
      label = "docling-note-" + note.self_ref.split("/").at(-1);
    const binding = {
      label,
      marker: m[1],
      sourceRef: c.node.self_ref,
      cellIndex: c.cellIndex ?? null,
      start: c.start,
      witness: c.witness,
    };
    definitions.set(note.self_ref, {
      binding,
      text: m[2],
      tableOwned: !!owner,
    });
    const key = c.node.self_ref + ":" + (c.cellIndex ?? "text");
    if (!edits.has(key)) edits.set(key, []);
    edits.get(key).push(binding);
  }
  return { definitions, edits, unresolved };
}
export function noteContent(n, bindings = [], text = n.text ?? "") {
  if (!bindings.length) return formatInline(n, text);
  const content = [];
  let cursor = 0;
  for (const b of [...bindings].sort((a, b) => a.start - b.start)) {
    if (
      b.start < cursor ||
      text.slice(b.start, b.start + b.marker.length) !== b.marker
    )
      throw new Error("note-binding-overlap");
    if (b.start > cursor)
      content.push(...formatInline(n, text.slice(cursor, b.start)));
    content.push({ kind: "footnote", label: b.label });
    cursor = b.start + b.marker.length;
  }
  if (cursor < text.length)
    content.push(...formatInline(n, text.slice(cursor)));
  return content;
}
export function sourceInlineText(content, provenance) {
  const markers = Object.fromEntries(
    provenance.items
      .filter((i) => i.structure.noteBinding)
      .map((i) => [
        i.structure.noteBinding.label,
        i.structure.noteBinding.marker,
      ]),
  );
  return inlineText(content, markers);
}
export function sourceItemText(snapshot, target, item, provenance) {
  let n = snapshot.nodes.find(
    (n) => JSON.stringify(n.path) === JSON.stringify(target.path),
  );
  if (target.selector?.kind === "cell")
    n = snapshot.nodes.find(
      (n) =>
        JSON.stringify(n.path) ===
        JSON.stringify([
          ...target.path,
          target.selector.row,
          target.selector.column,
        ]),
    );
  if (!n) return null;
  if (item.structure.listProjection) {
    let list = n,
      entry;
    for (const index of item.structure.listProjection.indexPath) {
      entry = list?.items?.[index];
      list = entry?.list;
    }
    return entry ? sourceInlineText(entry.content, provenance) : null;
  }
  if (target.selector?.kind === "list-item")
    return sourceInlineText(
      n.items?.[target.selector.index]?.content,
      provenance,
    );
  if (n.content) return sourceInlineText(n.content, provenance);
  if (n.type === "table" && item.label === "caption")
    return sourceInlineText(n.caption, provenance);
  if (n.type === "figure") {
    const caption = snapshot.nodes.find(
      (c) => c.type === "caption" && c.path[0] === n.path[0],
    );
    return caption?.content
      ? sourceInlineText(caption.content, provenance)
      : (caption?.text ?? "");
  }
  return n.text ?? n.latex ?? n.code ?? null;
}
// Compare marks/atoms without depending on canonical wrapper order or adjacent
// text-run merging. Distinct glyphs, mark sets, URLs and atom labels stay exact.
export function inlineSignature(content) {
  if (typeof content === "string") content = [{ kind: "text", text: content }];
  const result = [];
  function visit(nodes, marks = []) {
    for (const n of nodes ?? []) {
      if (n.kind === "text" && !n.text) continue;
      if (n.children) {
        visit(
          n.children,
          [
            ...marks,
            JSON.stringify({
              kind: n.kind,
              ...(n.url ? { url: n.url } : {}),
              ...(n.title !== undefined ? { title: n.title } : {}),
            }),
          ].sort(),
        );
        continue;
      }
      const value = { ...n, marks };
      const last = result.at(-1);
      if (
        n.kind === "text" &&
        last?.kind === "text" &&
        JSON.stringify(last.marks) === JSON.stringify(marks)
      )
        last.text += n.text;
      else result.push(value);
    }
  }
  visit(content);
  return result;
}
