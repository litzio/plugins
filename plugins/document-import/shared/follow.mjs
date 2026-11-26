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

// A save of the comparison view tells the top-level blocks it changed, as the Host accepted them:
// [{path:[i], nodes}] with nodes in the inspect shape (DocumentView onSave, SDK 0.17.0). The index i
// of such a block when it is one of the top-level indexes `tops`, or -1.
function savedBlockAt(block, tops) {
  const i = Array.isArray(block?.path) && block.path.length === 1 ? block.path[0] : -1;
  if (!tops.includes(i) || !Array.isArray(block.nodes)) return -1;
  if (!block.nodes.some(n => n?.path?.length === 1 && n.type !== 'caption')) return -1;
  return block.nodes.every(n => Array.isArray(n?.path) && n.path[0] === i) ? i : -1;
}

// The nodes after such a save: the saved blocks' nodes take the place of their blocks' nodes.
// null when a saved block is not one top-level block of nodes.
export function savedNodes(nodes, blocks) {
  const groups = new Map();
  for (const n of nodes) {
    if (!groups.has(n.path[0])) groups.set(n.path[0], []);
    groups.get(n.path[0]).push(n);
  }
  const tops = [...groups.keys()];
  for (const b of blocks || []) {
    const i = savedBlockAt(b, tops);
    if (i < 0) return null;
    groups.set(i, b.nodes);
  }
  return [...groups.values()].flat();
}

// The top-level kinds (structureOf) after such a save, or null. tops: the top-level index of each kind.
export function savedStructure(structure, tops, blocks) {
  if (!Array.isArray(tops) || tops.length !== structure.length) return null;
  const next = [...structure];
  for (const b of blocks || []) {
    const i = savedBlockAt(b, tops);
    if (i < 0) return null;
    next[tops.indexOf(i)] = b.nodes.find(n => n.path.length === 1 && n.type !== 'caption').type;
  }
  return next;
}
// The top-level index of each kind of structureOf.
export const topsOf = nodes => nodes.filter(n => n.path.length === 1 && n.type !== 'caption').map(n => n.path[0]);
