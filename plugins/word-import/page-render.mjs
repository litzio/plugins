// Each canvas keeps its latest pdf.js render task so a new render never overlaps the previous one.
const tasks = new WeakMap();

// A cancelled render, or one for a page that is no longer shown, is not a failure.
export function renderFailed(error, gone) {
  return !gone && error?.name !== 'RenderingCancelledException';
}

export function cancelRender(canvas) {
  if (canvas) tasks.get(canvas)?.cancel();
}

// Cancels the canvas's previous render and waits for it to settle before sizing and drawing.
// Returns false without drawing when the caller went away meanwhile.
export async function renderPage(canvas, page, viewport, gone) {
  const previous = tasks.get(canvas);
  if (previous) {
    previous.cancel();
    await previous.promise.catch(() => {});
  }
  if (gone()) return false;
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
  tasks.set(canvas, task);
  try {
    await task.promise;
  } finally {
    if (tasks.get(canvas) === task) tasks.delete(canvas);
  }
  return true;
}
