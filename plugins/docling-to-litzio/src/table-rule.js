/** Project explicit source spans into the one supported native table form.
 * Coordinates remain source 0-based in model; selectors refer to output cells. */
export function projectTable(data) {
  const fail = (code) => {
    throw new Error(code);
  };
  if (
    !Number.isInteger(data?.num_rows) ||
    !Number.isInteger(data?.num_cols) ||
    data.num_rows < 1 ||
    data.num_rows > 100 ||
    data.num_cols < 1 ||
    data.num_cols > 32
  )
    fail("table-limit");
  const grid = Array.from({ length: data.num_rows }, () =>
    Array(data.num_cols).fill(null),
  );
  for (const [index, c] of data.table_cells.entries()) {
    const r0 = c.start_row_offset_idx,
      r1 = c.end_row_offset_idx,
      c0 = c.start_col_offset_idx,
      c1 = c.end_col_offset_idx;
    if (
      ![r0, r1, c0, c1].every(Number.isInteger) ||
      r0 < 0 ||
      c0 < 0 ||
      r1 > data.num_rows ||
      c1 > data.num_cols ||
      r1 <= r0 ||
      c1 <= c0 ||
      r1 - r0 !== c.row_span ||
      c1 - c0 !== c.col_span
    )
      fail("cell-span");
    for (let r = r0; r < r1; r++)
      for (let col = c0; col < c1; col++) {
        if (grid[r][col] !== null) fail("overlapping-cells");
        grid[r][col] = index;
      }
  }
  let headerRows = 0;
  for (const row of grid) {
    if (
      row.every((i) => i !== null && data.table_cells[i].column_header === true)
    )
      headerRows++;
    else break;
  }
  // Never erase an all-header table's only content. Single header is already native.
  if (headerRows === data.num_rows) headerRows = 1;
  const collapsed = Math.max(1, headerRows),
    offset = collapsed - 1;
  const headers = grid[0].map((_, col) => {
    const indices = [];
    for (let r = 0; r < collapsed; r++) {
      const index = grid[r][col];
      if (index !== null && !indices.includes(index)) indices.push(index);
    }
    return {
      column: col,
      sourceCellIndices: indices,
      text: indices.map((i) => data.table_cells[i].text).join(" – "),
    };
  });
  const rows = grid
    .slice(offset)
    .map((row, r) =>
      row.map((i, col) =>
        r === 0 && headerRows > 1
          ? headers[col].text
          : i === null
            ? ""
            : data.table_cells[i].text,
      ),
    );
  const cells = data.table_cells.map((c, cellIndex) => {
    const selectors = [];
    for (let r = c.start_row_offset_idx; r < c.end_row_offset_idx; r++)
      for (
        let col = c.start_col_offset_idx;
        col < c.end_col_offset_idx;
        col++
      ) {
        const row = r < collapsed ? 0 : r - offset;
        if (!selectors.some((s) => s.row === row && s.column === col))
          selectors.push({ row, column: col });
      }
    return { cellIndex, sourceCell: c, selectors };
  });
  const mergedRanges = data.table_cells.flatMap((c, cellIndex) =>
    c.row_span > 1 || c.col_span > 1
      ? [
          {
            cellIndex,
            row: c.start_row_offset_idx,
            column: c.start_col_offset_idx,
            rowSpan: c.row_span,
            columnSpan: c.col_span,
            role: c.column_header
              ? "column-group"
              : c.row_header
                ? "row-group"
                : "body",
            risks: [
              ...(c.column_header ? ["column-group-becomes-flat"] : []),
              ...(c.row_span > 1 ? ["shared-across-rows"] : []),
              ...(c.col_span > 1 && !c.column_header
                ? ["shared-across-columns"]
                : []),
              ...(/\b(?:total|sum|range|common|all)\b|합계|범위|공통|전체/i.test(
                c.text,
              )
                ? ["possible-total-range-common-condition"]
                : []),
            ],
          },
        ]
      : [],
  );
  const range = (m) =>
    `R${m.row + 1}${m.rowSpan > 1 ? "–" + (m.row + m.rowSpan) : ""}/C${m.column + 1}${m.columnSpan > 1 ? "–" + (m.column + m.columnSpan) : ""}`;
  const rowHeaderRoles = data.table_cells.flatMap((c, index) =>
    c.row_header || c.row_section ? [index] : [],
  );
  const note =
    mergedRanges.length || headerRows > 1 || rowHeaderRoles.length
      ? `원문 표 구조 안내: ${mergedRanges.length ? `원문 ${mergedRanges.map(range).join(", ")} 칸은 병합돼 있었습니다. ` : ""}${headerRows > 1 ? `원문의 머리 ${headerRows}행은 ‘상위 머리 – 하위 머리’로 합쳤습니다. ` : ""}${rowHeaderRoles.length ? "원문의 머리 열/행 묶음 역할은 평문으로 남겼습니다. " : ""}좌표는 원문 기준입니다. 반복된 값은 행별 독립 값이 아니라 공통 조건·범위·합계일 수 있으므로 원문 구조를 검수해야 합니다.`
      : null;
  return {
    rows,
    cells,
    model: {
      headerRows,
      headerContributions: headers,
      rowHeaderRoles,
      mergedRanges,
      reviewRequired:
        mergedRanges.length > 0 || headerRows > 1 || rowHeaderRoles.length > 0,
      note,
    },
  };
}
export function lossCategory(reason) {
  if (
    [
      "merged-cell-repeated",
      "table-header-role",
      "compound-header-flattened",
      "toc-static-table",
      "cell-block-structure",
      "dedicated-table-note",
    ].includes(reason)
  )
    return "native-format";
  if (["table-caption-separate"].includes(reason)) return "authoring-input";
  return "plugin-pending";
}
export function sourceStructure(n) {
  return {
    parent: n.parent ?? null,
    children: n.children ?? [],
    contentLayer: n.content_layer ?? null,
    formatting: n.formatting ?? null,
    hyperlink: n.hyperlink ?? null,
    meta: n.meta ?? null,
    captions: n.captions ?? [],
    footnotes: n.footnotes ?? [],
    references: n.references ?? [],
    codeLanguage: n.code_language ?? null,
    marker: n.marker ?? null,
    enumerated: n.enumerated ?? null,
    level: n.level ?? null,
  };
}
