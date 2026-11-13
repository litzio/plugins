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
        if (t.bindingState !== "current" || t.role === "explanation") continue;
        const n = node(t.path),
          actual = inspect(t);
        let expected = source.text;
        if (
          source.label === "caption" &&
          n?.type === "figure" &&
          actual !== expected
        ) {
          const m =
            /^\s*(?:Figure|Fig\.?|그림)\s+((?:[A-Z]\.)?\d+(?:[.-]\d+)*)(?=[:.]?(?:\s|$))[:.]?\s*(.*)$/is.exec(
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
    if (item.cells.length && item.disposition === "mapped") {
      const grid = Array.from({ length: source.data.num_rows }, () =>
        Array(source.data.num_cols).fill(null),
      );
      source.data.table_cells.forEach((c, i) => {
        for (let r = c.start_row_offset_idx; r < c.end_row_offset_idx; r++)
          for (
            let col = c.start_col_offset_idx;
            col < c.end_col_offset_idx;
            col++
          )
            grid[r][col] = i;
      });
      let headerRows = 0;
      for (const row of grid) {
        if (
          row.every(
            (i) => i !== null && source.data.table_cells[i].column_header,
          )
        )
          headerRows++;
        else break;
      }
      if (headerRows === grid.length) headerRows = 1;
      const collapse = Math.max(1, headerRows),
        offset = collapse - 1;
      const header = grid[0].map((_, col) => {
        const indices = [];
        for (let r = 0; r < collapse; r++) {
          const index = grid[r][col];
          if (index !== null && !indices.includes(index)) indices.push(index);
        }
        return indices.map((i) => source.data.table_cells[i].text).join(" – ");
      });
      for (const c of item.cells) {
        const sc = source.data.table_cells[c.cellIndex],
          expectedPositions = new Set();
        for (let r = sc.start_row_offset_idx; r < sc.end_row_offset_idx; r++)
          for (
            let col = sc.start_col_offset_idx;
            col < sc.end_col_offset_idx;
            col++
          )
            expectedPositions.add(`${r < collapse ? 0 : r - offset}:${col}`);
        const actualPositions = new Set();
        for (const t of c.targets) {
          if (t.bindingState !== "current") continue;
          for (
            let r = t.selector.row;
            r < t.selector.row + t.selector.rowSpan;
            r++
          )
            for (
              let col = t.selector.column;
              col < t.selector.column + t.selector.columnSpan;
              col++
            ) {
              actualPositions.add(`${r}:${col}`);
              const expected =
                r === 0 && headerRows > 1 ? header[col] : sc.text;
              const actual = inspect({
                ...t,
                selector: { ...t.selector, row: r, column: col },
              });
              if (actual !== expected)
                mismatches.push({
                  selfRef: item.selfRef,
                  cellIndex: c.cellIndex,
                  kind: "source-cell-text",
                  expected,
                  actual,
                });
            }
        }
        if (!same([...expectedPositions].sort(), [...actualPositions].sort()))
          mismatches.push({
            selfRef: item.selfRef,
            cellIndex: c.cellIndex,
            kind: "source-cell-position",
          });
      }
    }
  }
  return { mismatches };
}
