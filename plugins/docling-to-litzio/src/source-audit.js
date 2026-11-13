// Independent fixed-generation audit: source JSON and actual CLI read-model only.
// It intentionally does not read authoring inputs or compare the planner with itself.
export function auditSourceNative(doc, provenance, snapshot) {
  const mismatches = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const node = (path) => snapshot.nodes.find((n) => same(n.path, path));
  const inspect = (t) => {
    const n = node(t.path);
    if (t.selector.kind === "cell")
      return snapshot.nodes.find((n) =>
        same(n.path, [...t.path, t.selector.row, t.selector.column]),
      )?.text;
    if (t.selector.kind === "list-item")
      return n?.items?.[t.selector.index]?.content
        .map((c) => c.text ?? "")
        .join("");
    return (
      n?.text ??
      n?.latex ??
      n?.code ??
      (n?.type === "figure"
        ? (snapshot.nodes.find(
            (c) => c.type === "caption" && c.path[0] === t.path[0],
          )?.text ?? "")
        : undefined)
    );
  };
  for (const item of provenance.items) {
    const source = item.selfRef
      .slice(2)
      .split("/")
      .reduce((o, k) => o[k], doc);
    if (item.disposition === "mapped" && typeof source.text === "string")
      for (const t of item.targets) {
        if (t.bindingState !== "current") continue;
        const n = node(t.path),
          actual = inspect(t);
        let expected = source.text;
        if (
          source.label === "caption" &&
          n?.type === "figure" &&
          actual !== expected
        ) {
          const m =
            /^\s*(?:Figure|Fig\.?|그림)\s+(\d+(?:[.-]\d+)*)(?=[:.]?(?:\s|$))[:.]?\s*(.*)$/is.exec(
              expected,
            );
          const number = snapshot.numbering?.targets?.find(
            (v) => v.kind === "figure" && same(v.path, t.path),
          )?.number;
          if (m && String(number) === m[1]) expected = m[2];
        }
        if (actual !== expected)
          mismatches.push({
            selfRef: item.selfRef,
            kind: "source-text",
            expected,
            actual,
          });
        if (
          source.label === "section_header" &&
          source.level >= 1 &&
          source.level <= 6 &&
          n?.level !== source.level
        )
          mismatches.push({
            selfRef: item.selfRef,
            kind: "source-heading-level",
          });
        if (
          source.label === "list_item" &&
          source.enumerated &&
          /^\d+[.)]?$/.test(source.marker ?? "") &&
          Number(source.marker.replace(/\D/g, "")) !==
            (n?.start ?? 1) + (t.selector.index ?? 0)
        )
          mismatches.push({ selfRef: item.selfRef, kind: "source-list-start" });
        if (
          source.label === "code" &&
          (n?.language ?? "") !==
            (source.code_language === "unknown"
              ? ""
              : (source.code_language ?? ""))
        )
          mismatches.push({
            selfRef: item.selfRef,
            kind: "source-code-language",
          });
      }
    for (const c of item.cells)
      for (const t of c.targets)
        if (
          t.bindingState === "current" &&
          inspect(t) !== source.data.table_cells[c.cellIndex].text
        )
          mismatches.push({
            selfRef: item.selfRef,
            cellIndex: c.cellIndex,
            kind: "source-cell-text",
          });
  }
  return { mismatches };
}
