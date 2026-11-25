import test from 'node:test';
import assert from 'node:assert/strict';
import { structureOf, sameStructure, changedRange, editedBlocks, keepHistory } from '../follow.mjs';
import { followOutcome, editStatus, editReason } from '../content-edit.mjs';

const p = (i, text, type = 'paragraph') => ({ path: [i], type, content: [{ kind: 'text', text }] });
const cell = (i, r, c, text) => ({ path: [i, r, c], type: 'cell', content: [{ kind: 'text', text }] });
const doc = texts => texts.map((t, i) => p(i, t));

test('structure: top-level kinds without captions, compared by number and kind', () => {
  const nodes = [p(0, 'a', 'heading'), p(1, 'b'), { path: [2], type: 'table' }, cell(2, 0, 0, 'x'), { path: [2], type: 'caption' }];
  assert.deepEqual(structureOf(nodes), ['heading', 'paragraph', 'table']);
  assert.ok(sameStructure(['heading', 'paragraph'], ['heading', 'paragraph']));
  assert.ok(!sameStructure(['heading', 'paragraph'], ['heading', 'heading']));
  assert.ok(!sameStructure(['heading', 'paragraph'], ['heading']));
  assert.ok(!sameStructure(undefined, ['heading']));
});

test('edited blocks: paragraph text and table cells count as their top-level block', () => {
  const before = [p(0, 'a'), { path: [1], type: 'table' }, cell(1, 0, 0, 'x'), p(2, 'c')];
  const after = [p(0, 'a'), { path: [1], type: 'table' }, cell(1, 0, 0, 'x = 1'), p(2, 'c!')];
  assert.deepEqual(editedBlocks(before, after), [1, 2]);
  assert.deepEqual(editedBlocks(before, before), []);
});

test('changed range of a correction, with one block of margin', () => {
  // Merging blocks 2 and 3 of six: the merged block is 2 of five.
  const r = changedRange(doc(['a', 'b', 'c', 'd', 'e', 'f']), doc(['a', 'b', 'c d', 'e', 'f']));
  assert.deepEqual(r, { from: 1, to: 4, delta: 1 });
  // Splitting the last block.
  assert.deepEqual(changedRange(doc(['a', 'b', 'c d']), doc(['a', 'b', 'c', 'd'])), { from: 1, to: 4, delta: -1 });
  // A correction that changed nothing.
  assert.deepEqual(changedRange(doc(['a', 'b']), doc(['a', 'b'])), { from: 1, to: 2, delta: 0 });
});

test("a correction's range leaves out what follows from block order (section ranges, numbers)", () => {
  const heading = (i, start, end) => ({ path: [i], type: 'heading', level: 1, content: [{ kind: 'text', text: 'H' + start }], section: { start, end }, referenceText: '§ H' });
  const table = (i, n) => ({ path: [i], type: 'table', enumerator: undefined, numbers: [n], captionNumberText: 'Table ' + n, referenceText: 'Table ' + n });
  // Merging two paragraphs shifts every later heading's section and nothing else of theirs.
  const before = [p(0, 'a'), p(1, 'b'), heading(2, 2, 4), table(3, 1), heading(4, 4, 5)];
  const after = [p(0, 'a b'), { ...heading(1, 2, 4), section: { start: 1, end: 3 } }, { ...table(2, 1) }, { ...heading(3, 4, 5), section: { start: 3, end: 4 } }];
  assert.deepEqual(changedRange(before, after), { from: 0, to: 2, delta: 1 });
});

test('undo history after a content save: kept away from the edited blocks, dropped from the first that reaches one', () => {
  // Oldest first. The newest correction made blocks 10–12 of the current document and removed two;
  // the older one made blocks 3–4 of the document before it.
  const stack = [{ id: 'old', range: { from: 3, to: 5, delta: 0 } }, { id: 'new', range: { from: 10, to: 13, delta: 2 } }];
  assert.deepEqual(keepHistory(stack, []).map(x => x.id), ['old', 'new']);
  assert.deepEqual(keepHistory(stack, [0]).map(x => x.id), ['old', 'new']);
  // Block 20 of now was block 22 before the newest correction: away from both.
  assert.deepEqual(keepHistory(stack, [20]).map(x => x.id), ['old', 'new']);
  // Block 11 is one the newest correction made: undoing it would lose the edit, and so would the older one.
  assert.deepEqual(keepHistory(stack, [11]), []);
  // Block 4 lies before the newest correction and inside the older one: only the newest stays.
  assert.deepEqual(keepHistory(stack, [4]).map(x => x.id), ['new']);
  // A correction recorded without its range is not trusted.
  assert.deepEqual(keepHistory([{ id: 'x' }], [0]), []);
});

test('outcome of a check: nothing, stopped, or moved with a reread only when the view is behind', () => {
  assert.deepEqual(followOutcome({ unchanged: true }, 'a'), { kind: 'none' });
  assert.deepEqual(followOutcome({ busy: true }, 'a'), { kind: 'none' });
  assert.deepEqual(followOutcome({ stale: true, message: 'm' }, 'a'), { kind: 'stale', message: 'm' });
  // The view's own save: it already shows the revision.
  assert.deepEqual(followOutcome({ revision: 'b' }, 'b'), { kind: 'moved', revision: 'b', reload: false });
  // Changed elsewhere: the view still shows the earlier revision.
  assert.deepEqual(followOutcome({ revision: 'b' }, 'a'), { kind: 'moved', revision: 'b', reload: true });
});

test('header status and the reason structure corrections wait', () => {
  assert.equal(editStatus('clean', false), null);
  assert.equal(editStatus('unsaved', false), null);
  assert.deepEqual(editStatus('saving', false), { tone: 'progress', label: '저장 중' });
  // Checking the saved file still reads as saving.
  assert.deepEqual(editStatus('clean', true), { tone: 'progress', label: '저장 중' });
  assert.deepEqual(editStatus('failed', true), { tone: 'error', label: '저장 실패' });
  assert.deepEqual(editStatus('conflict', false), { tone: 'warning', label: '저장 충돌' });
  assert.equal(editReason('clean', false), null);
  assert.match(editReason('unsaved', false), /다른 블록을 누르면 저장/);
  assert.match(editReason('clean', true), /저장하는 중/);
  assert.match(editReason('conflict', false), /다시 읽기/);
});
