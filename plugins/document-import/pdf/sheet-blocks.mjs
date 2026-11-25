import { buildGrid, flattenGrid } from "./table-grid.mjs";
import { requirement, sheet } from "./profiles/sheet.mjs";

const groups = (items, key) => [...Map.groupBy(items, key).values()];
const japanese = (text) =>
  (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || [])
    .length /
    Math.max(1, text.replace(/\s/g, "").length) >
  0.15;
const order = (a, b) =>
  Math.round(a.y0 / 3) - Math.round(b.y0 / 3) || a.x0 - b.x0;
function bounds(lines, page) {
  return {
    page,
    x0: Math.min(...lines.map((l) => l.x0)),
    top: Math.min(...lines.map((l) => l.y0)),
    x1: Math.max(...lines.map((l) => l.x1)),
    bottom: Math.max(...lines.map((l) => l.y1)),
  };
}
function textOf(lines) {
  let result = "",
    last;
  for (const l of lines) {
    const gap =
      last && (Math.abs(l.y0 - last.y0) > 3 || l.x0 - last.x1 > l.size * 0.12);
    result += (gap && !result.endsWith("-") ? " " : "") + l.plain;
    last = l;
  }
  return result.trim();
}
function block(kind, ls) {
  const page = ls[0].page;
  return {
    kind,
    page,
    text: textOf(ls),
    boxes: [bounds(ls, page)],
    lines: ls.map((l) => ({
      page,
      box: bounds([l], page),
      text: l.plain,
      tokens: l.tokens,
    })),
  };
}
function tableBlock(rows, lines) {
  const texts = rows.map((row) => row.map(textOf));
  const cols = Math.max(...texts.map((row) => row.length));
  const uneven = texts.some((row) => row.length !== cols);
  for (const row of texts) while (row.length < cols) row.push("");
  return {
    ...block("table", lines),
    table: {
      rows: texts,
      tokenRows: texts.map((row) =>
        row.map((text) => [{ text, tokens: [{ text }] }]),
      ),
    },
    ...(uneven
      ? {
          warning: {
            code: "table-merge",
            reason: "병합 칸의 위치를 확인하세요.",
          },
        }
      : {}),
  };
}
// Layout grids can enclose both a chart and a separate tagged data table.
function layoutDiagrams(page, layouts, dataTables, lines) {
  const crops = [];
  for (const q of layouts) {
    const outer = page.rulings
      .filter(
        (r) =>
          r.axis === "h" &&
          r.a <= q.x0 + 4 &&
          r.b >= q.x1 - 4 &&
          r.pos <= q.top + 2,
      )
      .sort((a, b) => b.pos - a.pos)[0];
    if (!outer) continue;
    const side = page.rulings.find(
      (r) =>
        r.axis === "v" &&
        Math.abs(r.pos - outer.a) < 3 &&
        Math.abs(r.a - outer.pos) < 4,
    );
    if (!side) continue;
    const ys = [
      ...new Set(
        page.rulings
          .filter(
            (r) =>
              r.axis === "h" &&
              r.pos >= outer.pos - 1 &&
              r.pos <= side.b + 1 &&
              Math.abs(r.b - outer.b) < 3 &&
              r.b - r.a > (outer.b - outer.a) * 0.65,
          )
          .map((r) => Math.round(r.pos)),
      ),
    ].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      const top = ys[i - 1] + 2,
        bottom = ys[i] - 2;
      if (bottom - top < 40) continue;
      const labels = lines.filter(
        (l) =>
          !l.tag?.cell &&
          l.y0 >= top &&
          l.y1 <= bottom &&
          l.x0 >= outer.a &&
          l.x1 <= outer.b,
      );
      if (labels.length < 3) continue;
      const first = Math.min(...labels.map((l) => l.x0));
      const left =
        Math.max(
          outer.a,
          ...page.rulings
            .filter(
              (r) =>
                r.axis === "v" &&
                r.pos <= first &&
                r.pos >= outer.a &&
                r.a <= top + 2 &&
                r.b >= bottom - 2,
            )
            .map((r) => r.pos),
        ) + 2;
      const right =
        Math.min(
          outer.b,
          ...dataTables
            .filter((b) => b.top >= top && b.bottom <= bottom && b.x0 > first)
            .map((b) => b.x0 - 10),
        ) - 2;
      if (right - left > 40) crops.push([left, top, right, bottom]);
    }
  }
  return crops;
}
export function assembleSheet(p, ls) {
  const blocks = [];
  const body = ls.filter((l) => l.kind !== "margin");
  const tables = groups(
    body.filter((l) => l.tag?.cell && p.tagRows?.[l.tag.table]?.length),
    (l) => l.tag.table,
  );
  const tableBounds = [],
    layouts = [];
  const consumed = new Set();
  let layoutCount = 0;
  for (const table of tables) {
    const cells = Map.groupBy(table, (l) => l.tag.cell);
    const rows = p.tagRows[table[0].tag.table].map((row) =>
      row.map((id) => cells.get(id) || []),
    );
    const nested = tables.some(
      (other) => other !== table && within(bounds(other, 0), bounds(table, 0)),
    );
    const layout =
      nested ||
      table.some((l) => requirement.test(l.plain)) ||
      (rows.every((row) => row.length === 1) &&
        rows.some(
          (row) => new Set(row[0].map((l) => l.tag.paragraph)).size >= 4,
        ));
    tableBounds.push(bounds(table, 0));
    if (layout) {
      layoutCount++;
      layouts.push(bounds(table, 0));
      continue;
    }
    const made = tableBlock(rows, table);
    const q = made.boxes[0];
    const rect = p.tables.find(
      ([x0, top, x1, bottom]) =>
        within(q, { x0, top, x1, bottom }) &&
        q.top - top < 16 &&
        bottom - q.bottom < 20,
    );
    if (rect) {
      const grid = buildGrid(rect, p.rulings, p.words, p.graphics);
      if (
        !grid.reason &&
        grid.rows === rows.length &&
        grid.cols === made.table.rows[0].length
      ) {
        const flat = flattenGrid(grid);
        if (!flat.notes.length && !grid.cells.some((c) => c.graphic)) {
          made.grid = grid;
          made.table = flat;
          made.boxes = [
            {
              page: q.page,
              x0: rect[0],
              top: rect[1],
              x1: rect[2],
              bottom: rect[3],
            },
          ];
          if (flat.record.repeated || flat.headerRows > 1)
            made.warning = {
              code: "table-unmerged",
              reason: "병합 칸을 풀어 적었습니다.",
            };
        }
      }
    }
    if (made.table.rows.length > 100 || made.table.rows[0].length > 32) {
      delete made.grid;
      delete made.table;
      made.warning = {
        code: "table-as-image",
        reason: "100행 또는 32열 한도를 넘습니다.",
      };
    }
    if (
      !made.warning &&
      rows.some((row) =>
        row.some((cell) => new Set(cell.map((l) => l.tag.paragraph)).size >= 4),
      )
    ) {
      made.warning = {
        code: "layout-uncertain",
        reason: "여러 문단이 있는 표입니다. 칸의 읽기 순서를 확인하세요.",
      };
    }
    blocks.push(made);
    for (const l of table) {
      consumed.add(l);
      l.kind = "table";
    }
  }
  const innerParts = layoutDiagrams(
    p,
    layouts,
    tableBounds.filter(
      (q) => !layouts.some((l) => l.top === q.top && l.x0 === q.x0),
    ),
    body,
  );
  for (const region of [...p.tables, ...p.figures, ...innerParts]) {
    const [l, t, r, b] = region;
    const crop = { x0: l, top: t, x1: r, bottom: b };
    if (
      !innerParts.includes(region) &&
      tableBounds.some((q) => within(q, crop) || within(crop, q))
    )
      continue;
    const labels = body.filter(
      (x) =>
        !consumed.has(x) &&
        !x.tag?.cell &&
        (innerParts.includes(region)
          ? within(bounds([x], 0), crop)
          : x.x0 < r + 30 && x.x1 > l - 65 && x.y0 < b + 12 && x.y1 > t - 18),
    );
    const box = labels.length
      ? bounds(labels, ls[0].page)
      : { page: ls[0].page, ...crop };
    Object.assign(box, {
      x0: Math.min(l, box.x0),
      top: Math.min(t, box.top),
      x1: Math.max(r, box.x1),
      bottom: Math.max(b, box.bottom),
    });
    blocks.push({
      kind: "figure",
      page: box.page,
      text: textOf(labels),
      boxes: [box],
    });
    for (const x of labels) {
      consumed.add(x);
      x.kind = "figure";
    }
  }
  for (const q of layouts) {
    if (
      !innerParts.length &&
      p.tables.some(([x0, top, x1, bottom]) =>
        within(q, { x0, top, x1, bottom }),
      ) &&
      tables.length > 1
    ) {
      const first = body.find((l) => within(bounds([l], 0), q));
      if (first) first.diagramWarning = true;
    }
  }
  let standards = false;
  const standardRows = [];
  function flush() {
    if (standardRows.length)
      blocks.push(tableBlock(standardRows, standardRows.flat(2)));
    standardRows.length = 0;
  }
  for (const para of groups(
    body.filter((l) => !consumed.has(l)),
    (l) => l.tag?.paragraph ?? l.tag?.cell ?? l,
  )) {
    const lines = para.sort(order);
    const text = textOf(lines);
    if (standards) {
      const split = lines.findIndex(
        (l, i) =>
          i &&
          l.x0 - lines[i - 1].x1 > 12 &&
          Math.abs(l.y0 - lines[i - 1].y0) < 4,
      );
      if (split > 0) {
        standardRows.push([lines.slice(0, split), lines.slice(split)]);
        for (const l of lines) l.kind = "table";
        continue;
      }
      flush();
      if (!requirement.test(text) && !text.startsWith("[")) {
        blocks.push({
          ...block("para", lines),
          warning: {
            code: "standards-columns",
            reason: "준거 규격의 두 열을 확인하세요.",
          },
        });
        standards = false;
        continue;
      }
    }
    standards = /^Compliance standards/i.test(text);
    const runs = [];
    for (const row of groups(lines, (l) => Math.round(l.y0 / 3))) {
      const last = runs.at(-1),
        value = textOf(row);
      if (
        last &&
        japanese(textOf(last)) === japanese(value) &&
        !requirement.test(textOf(last)) &&
        !requirement.test(value)
      )
        last.push(...row);
      else runs.push(row);
    }
    for (const run of runs) {
      const item = block("para", run);
      if (run.some((l) => l.diagramWarning))
        item.warning = {
          code: "diagram-region",
          reason: "배치용 표 안의 도식 영역을 확인하세요.",
        };
      const heading =
        item.boxes[0].top < 110 &&
        run[0].size >= 14 &&
        sheet.heading(item.text);
      if (heading) {
        item.kind = "heading";
        item.level = heading.level;
        item.number = heading.number;
        item.text = item.text.replace(/\s*\(\d+\s+of\s+\d+\)\s*$/i, "").trim();
      } else if (requirement.test(item.text)) {
        item.kind = "heading";
        item.requirement = item.text.slice(1, -1);
        item.text = item.requirement;
      } else if (/^\[[^\]]+\]$/.test(item.text)) item.bold = true;
      else if (sheet.tableNote.test(item.text)) item.tableNote = true;
      else if (sheet.caption.test(item.text)) item.kind = "caption";
      for (const l of run) l.kind = item.kind === "para" ? "body" : item.kind;
      blocks.push(item);
    }
  }
  flush();
  blocks.sort(
    (a, b) => a.boxes[0].top - b.boxes[0].top || a.boxes[0].x0 - b.boxes[0].x0,
  );
  return { blocks, layoutCount };
}
function within(inner, outer) {
  return (
    inner.x0 >= outer.x0 - 10 &&
    inner.top >= outer.top - 10 &&
    inner.x1 <= outer.x1 + 10 &&
    inner.bottom <= outer.bottom + 10
  );
}
export function joinSheetHeadings(blocks) {
  let section,
    level = 1;
  return blocks.filter((b) => {
    if (b.number) {
      level = b.level;
      if (section?.number === b.number && section.boxes.at(-1).page + 1 === b.page) {
        if (section.text === b.text) {
          section.boxes.push(...b.boxes);
          section.lines.push(...b.lines);
          return false;
        }
        b.warning = {
          code: "section-title",
          reason: "같은 번호의 제목 글자가 다릅니다.",
        };
      }
      section = b;
    }
    if (b.requirement) b.level = Math.min(6, level + 1);
    return true;
  });
}
export function linkRequirements(blocks) {
  const headings = Map.groupBy(
    blocks.filter((b) => b.requirement),
    (b) => b.requirement,
  );
  let count = 0;
  for (const b of blocks.filter((b) => b.kind === "paragraph")) {
    for (const m of b.text.matchAll(/\[([A-Z][A-Z0-9]*_\d+_\d+)\]/gi)) {
      const matches = headings.get(m[1]);
      if (matches?.length !== 1) continue;
      const label = "req-" + m[1].replaceAll("_", "-").toLowerCase();
      matches[0].sectionLabel = label;
      (b.refs ||= []).push({
        at: m.index,
        length: m[0].length,
        text: m[0],
        section: true,
        label,
      });
      count++;
    }
  }
  return count;
}
