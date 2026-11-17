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
    return p ? [{b, right:box.x1*p.scale, top:p.top + box.top*p.scale, bottom:p.top + box.bottom*p.scale}] : [];
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
