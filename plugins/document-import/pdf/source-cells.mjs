// Cells of source lines from the text fragments of their PDF page. Pure geometry on PDF points with a
// top-left origin, the coordinates of the mapping's line boxes. The screen reads the fragments with
// pdf.js; the correction handler runs the same rules on what the screen sent.

// A blank vertical strip at least this wide separates two columns. The same gap splits one row of
// words into separate line pieces at extraction.
export const COLUMN_GAP = 14;

// pdf.js text items of one page → fragments {text, x0, x1, top, bottom}. A run of two or more spaces
// inside one item splits it, the width shared out by characters.
export function pageFragments(items, view) {
  const [vx0, vy0, , vy1] = view, H = vy1 - vy0, out = [];
  for (const it of items) {
    if (typeof it.str !== "string" || !it.str.trim() || !it.transform) continue;
    const t = it.transform, size = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
    const base = H - (t[5] - vy0), per = it.str.length ? it.width / it.str.length : 0;
    for (const m of it.str.matchAll(/\S+(?: \S+)*/g)) {
      const x0 = t[4] - vx0 + per * m.index;
      out.push({ text: m[0], x0, x1: x0 + per * m[0].length, top: base - size * 0.8, bottom: base + size * 0.2 });
    }
  }
  return out;
}

// The fragments of one line: their middle inside the line's box, left to right.
export function lineFragments(fragments, box) {
  return (fragments || []).filter(f => {
    const x = (f.x0 + f.x1) / 2, y = (f.top + f.bottom) / 2;
    return x >= box.x0 - 1 && x <= box.x1 + 1 && y >= box.top - 1 && y <= box.bottom + 1;
  }).sort((a, b) => a.x0 - b.x0);
}

// The non-blank characters of a line's words. A footnote call `[^18]` shows as `18` in the PDF;
// `bare` holds what the page shows, `norm` the line's own characters, and for each shown character
// its place in `norm` and in the line text. `inside` marks the later characters of one call.
export function lineChars(text) {
  const bare = [], norm = [], str = [], inside = [];
  for (const m of text.matchAll(/\[\^([^\]\s]+)\]|\S/gu)) {
    const at = norm.length;
    if (m[1]) {
      [...m[0]].forEach((c, i) => { norm.push(c); str.push(m.index + i); });
      [...m[1]].forEach((c, i) => { bare.push({ c, norm: at, str: m.index, inside: i > 0 }); });
    } else { norm.push(m[0]); str.push(m.index); bare.push({ c: m[0], norm: at, str: m.index, inside: false }); }
  }
  return { bare, norm, str, end: text.length };
}

// The columns of the given lines: spans of the x axis that some fragment covers, separated by blank
// strips of at least COLUMN_GAP across every line. lines: [{text, box, page}], fragments by page.
// Returns {rows: [{line, cells: [{col, text, start, x0, x1}]}], columns, reason?}. A cell's start is
// its first character in the line's own characters (lineChars().norm); empty cells are left out.
export function sourceGrid(lines, fragmentsByPage) {
  const parts = [];
  for (const line of lines) {
    const fragments = fragmentsByPage?.[line.page];
    if (!fragments) return { rows: [], columns: 0, reason: "원본 글자 위치를 읽는 중입니다." };
    const own = lineFragments(fragments, line.box);
    const chars = lineChars(line.text || "");
    if (!own.length || own.map(f => f.text).join("").replace(/\s/gu, "") !== chars.bare.map(b => b.c).join(""))
      return { rows: [], columns: 0, reason: "원본 글자와 줄의 글자가 맞지 않아 칸을 나눌 수 없습니다." };
    parts.push({ line, own, chars });
  }
  const spans = [];
  for (const f of parts.flatMap(p => p.own).sort((a, b) => a.x0 - b.x0)) {
    const last = spans.at(-1);
    if (last && f.x0 - last[1] < COLUMN_GAP) last[1] = Math.max(last[1], f.x1);
    else spans.push([f.x0, f.x1]);
  }
  const column = f => { const x = (f.x0 + f.x1) / 2; return spans.findIndex(([a, b]) => x >= a - 0.5 && x <= b + 0.5); };
  const rows = [];
  for (const { line, own, chars } of parts) {
    const cells = [];
    let shown = 0;
    for (const f of own) {
      const col = column(f), first = chars.bare[shown];
      let cell = cells.at(-1);
      if (!cell || cell.col !== col) {
        if (cell && col < cell.col) return { rows: [], columns: 0, reason: "원본 글자의 순서가 열과 맞지 않습니다." };
        if (first.inside) return { rows: [], columns: 0, reason: "미주 호출 가운데에서 칸을 나눌 수 없습니다." };
        cells.push(cell = { col, start: first.norm, strStart: first.str, x0: f.x0, x1: f.x1 });
      }
      cell.x1 = Math.max(cell.x1, f.x1); shown += f.text.replace(/\s/gu, "").length;
    }
    cells.forEach((c, i) => {
      const end = cells[i + 1]?.strStart ?? chars.end;
      c.text = line.text.slice(c.strStart, end).trim();
    });
    rows.push({ line, cells: cells.map(({ col, start, text, x0, x1 }) => ({ col, start, text, x0, x1 })) });
  }
  return { rows, columns: spans.length };
}

// Reading order of a grid's cells for a list. Columns are read top to bottom, left column first,
// like the columns of a page. Only when two or more cells are empty, all in the last row and packed
// at its right end (a grid filled row by row) are rows read left to right.
export function readingOrder(grid) {
  const R = grid.rows.length, C = grid.columns;
  const at = (r, c) => grid.rows[r].cells.find(x => x.col === c);
  const blanks = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!at(r, c)) blanks.push([r, c]);
  const rowFilled = blanks.length >= 2 && blanks.every(([r]) => r === R - 1) &&
    blanks.every(([, c], i) => c === C - blanks.length + i);
  const order = [];
  if (rowFilled) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { if (at(r, c)) order.push([r, c]); }
  else for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) { if (at(r, c)) order.push([r, c]); }
  return { by: rowFilled ? "row" : "column", order };
}
