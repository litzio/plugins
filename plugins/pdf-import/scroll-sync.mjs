// DocumentView reports top-level paths. Several source list items may share one.
export function sourceForPath(blocks, path, preceding = false) {
  const index = path?.[0];
  if (!Number.isInteger(index)) return null;
  let previous = null;
  for (const b of blocks) {
    if (!b.boxes.length || !Number.isInteger(b.path?.[0])) continue;
    if (b.path[0] === index) return b;
    if (preceding && b.path[0] < index && (!previous || b.path[0] > previous.path[0])) previous = b;
  }
  return previous;
}

export function sourceLocations(blocks, positions) {
  return blocks.flatMap(b => b.boxes.flatMap(box => {
    const p = positions[box.page];
    return p ? [{b, top:p.top + box.top*p.scale, bottom:p.top + box.bottom*p.scale}] : [];
  })).sort((a,b) => a.top-b.top);
}

export function blockAtSource(locations, y) {
  return (locations.find(x => x.top <= y && x.bottom >= y) ||
    locations.find(x => x.top >= y) || locations.at(-1))?.b || null;
}

export function sourceScrollTop(block, positions, height) {
  const box = block.boxes[0], p = positions[box.page];
  return p.top + box.top*p.scale - height/3;
}

// Visible top (px below the source viewport's top edge) of the block's first box that is still on
// screen, or null when no box intersects the viewport. A box that starts above the edge gives a
// negative top so the document pair lands at the same, partly hidden, height.
export function sourceVisibleTop(block, positions, scrollTop, height) {
  for (const box of block.boxes) {
    const p = positions[box.page];
    if (!p) continue;
    const top = p.top + box.top*p.scale - scrollTop, bottom = p.top + box.bottom*p.scale - scrollTop;
    if (bottom > 0 && top < height) return top;
  }
  return null;
}

// Source scrollTop that puts the block's first box `top` px below the viewport edge, clamped to the
// scroll range. Null when the clamped move is 8px (--space-2) or less, the same rule as target.top.
export function sourceAlignScrollTop(block, positions, top, scrollTop, maxScroll) {
  const box = block.boxes[0], p = box && positions[box.page];
  if (!p || !Number.isFinite(top)) return null;
  const next = Math.min(Math.max(0, maxScroll), Math.max(0, p.top + box.top*p.scale - top));
  return Math.abs(next - scrollTop) <= 8 ? null : next;
}
