// Dragging a rectangle over the source pages. Coordinates are those of the pages' content box.
// A press becomes a drag only after it moves this far, so a click stays a click.
export const DRAG_START = 5;
export const dragStarted = (dx, dy) => Math.hypot(dx, dy) >= DRAG_START;
// Ids of the blocks with a source box crossing the rectangle {x0, y0, x1, y1}, in block order.
export function blocksInRect(blocks, positions, pageLeft, rect) {
  const left = Math.min(rect.x0, rect.x1), right = Math.max(rect.x0, rect.x1);
  const top = Math.min(rect.y0, rect.y1), bottom = Math.max(rect.y0, rect.y1);
  return blocks.filter(b => b.boxes.some(box => {
    const p = positions[box.page];
    return p && pageLeft + box.x0 * p.scale < right && pageLeft + box.x1 * p.scale > left &&
      p.top + box.top * p.scale < bottom && p.top + box.bottom * p.scale > top;
  })).map(b => b.id);
}
