// Following a saved document whose content changed in place (the comparison view's own content
// edits, or a document tab or the assistant editing the same file). Independent of the SDK.

// The kinds of the top-level blocks, the part of a document the source correspondence relies on.
export const structureOf = nodes => nodes.filter(n => n.path.length === 1 && n.type !== 'caption').map(n => n.type);
export const sameStructure = (a, b) => !!a && !!b && a.length === b.length && a.every((t, i) => t === b[i]);

// Read-model fields that follow from a block's place, not from what it holds: a heading's section
// range and the numbers and reference words given by order.
const PLACED = ['section', 'numbers', 'captionNumberText', 'referenceText'];
// One string per top-level block with everything inspect exposes under it (cells, captions, notes).
export function blockSignatures(nodes) {
  const groups = [];
  for (const n of nodes) {
    const i = n.path[0], own = { ...n, path: n.path.slice(1) };
    for (const key of PLACED) delete own[key];
    (groups[i] ||= []).push(own);
  }
  return Array.from(groups, g => JSON.stringify(g || []));
}

// The blocks a correction made, as a range of the corrected document: everything between the
// unchanged blocks before and after it. delta is how many more blocks the document had before.
// One block of margin on each side covers equal neighbours, which the comparison cannot tell apart.
export function changedRange(before, after) {
  const b = blockSignatures(before), a = blockSignatures(after);
  let from = 0;
  while (from < a.length && from < b.length && a[from] === b[from]) from++;
  let tail = 0;
  while (tail < a.length - from && tail < b.length - from && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return { from: Math.max(0, from - 1), to: Math.min(a.length, a.length - tail + 1), delta: b.length - a.length };
}

// Top-level blocks whose content differs between two snapshots of the same structure.
export function editedBlocks(before, after) {
  const b = blockSignatures(before), a = blockSignatures(after);
  return a.flatMap((s, i) => s === b[i] ? [] : [i]);
}

// Undo history after a content save. Undoing restores the blocks of its range from the time of the
// correction, so a correction whose range holds an edited block would drop that edit: it goes with
// every older one. Newer corrections stay. stack: oldest first, [{range, ...}]; edited: block
// indexes of the current document; known: whether the content before the save was known.
export function keepHistory(stack, edited, known = true) {
  if (!edited.length) return stack;
  if (!known) return [];
  let at = edited;
  for (let i = stack.length - 1; i >= 0; i--) {
    const r = stack[i].range;
    if (!r || at.some(d => d >= r.from && d < r.to)) return stack.slice(i + 1);
    at = at.map(d => d < r.from ? d : d + r.delta);
  }
  return stack;
}
