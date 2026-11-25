export function sourcePagePositions(pages, pageWidth, gap) {
  let top = 0;
  return pages.map(page => {
    const scale = pageWidth / page.width;
    const height = page.height * scale;
    const position = { top, height, scale };
    top += height + gap;
    return position;
  });
}

export function linkedItems(blocks, positions, pageWidth, viewportWidth, labels, colors) {
  const pageLeft = Math.max(0, viewportWidth - pageWidth);
  return blocks.flatMap(block => {
    if (!block.path) return [];
    const boxes = block.boxes.flatMap(box => {
      const position = positions[box.page];
      if (!position) return [];
      const { scale, top } = position;
      return [{
        left: pageLeft + box.x0 * scale,
        top: top + box.top * scale,
        width: Math.max(1, (box.x1 - box.x0) * scale),
        height: Math.max(1, (box.bottom - box.top) * scale),
      }];
    });
    if (!boxes.length) return [];
    return [{
      id: block.id,
      path: block.path,
      label: labels[block.kind] + (block.warning ? " · " + block.warning.reason : ""),
      colorToken: "--id-color-" + colors[block.kind],
      boxes,
    }];
  });
}
