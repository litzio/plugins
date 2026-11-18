import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, cancelRender, renderFailed } from '../page-render.mjs';

class RenderingCancelledException extends Error { name = 'RenderingCancelledException'; }

// A pdf.js-like page whose render tasks settle only when cancelled or finished by the test.
function fakePage(log, tasks = []) {
  return {
    tasks,
    render() {
      let settle;
      const task = {
        promise: new Promise((resolve, reject) => { settle = { resolve, reject }; }),
        cancel() { if (this.cancelled) return; this.cancelled = true; log.push('cancel'); settle.reject(new RenderingCancelledException('Rendering cancelled')); },
        finish() { settle.resolve(); },
      };
      log.push('render');
      tasks.push(task);
      return task;
    },
  };
}
function fakeCanvas(log) {
  return {
    set width(value) { log.push('width ' + value); },
    set height(value) {},
    getContext() { return {}; },
  };
}
const viewport = { width: 100.2, height: 50 };

test('V-03 a cancelled render or a page that left the view is not a failure', () => {
  assert.equal(renderFailed(new RenderingCancelledException('x'), false), false);
  assert.equal(renderFailed(new Error('broken'), true), false);
  assert.equal(renderFailed(new Error('broken'), false), true);
  assert.equal(renderFailed(new TypeError("Cannot set properties of null (setting 'width')"), false), true);
});

test('V-03 a new render waits for the previous render of the same canvas to settle', async () => {
  const log = [], page = fakePage(log), canvas = fakeCanvas(log);
  const first = renderPage(canvas, page, viewport, () => false);
  await Promise.resolve();
  const second = renderPage(canvas, page, viewport, () => false);
  await assert.rejects(first, { name: 'RenderingCancelledException' });
  await new Promise(setImmediate);
  // The canvas is resized only after the first task was cancelled, then drawn once more.
  assert.deepEqual(log, ['width 101', 'render', 'cancel', 'width 101', 'render']);
  page.tasks[1].finish();
  assert.equal(await second, true);
});

test('V-03 a render whose owner went away while waiting does not draw', async () => {
  const log = [], page = fakePage(log), canvas = fakeCanvas(log);
  const first = renderPage(canvas, page, viewport, () => false).catch(() => {});
  let gone = false;
  const second = renderPage(canvas, page, viewport, () => gone);
  gone = true;
  cancelRender(canvas);
  await first;
  assert.equal(await second, false);
  assert.deepEqual(log, ['width 101', 'render', 'cancel']);
});
