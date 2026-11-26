// A correction shown in the document view before its write (DocumentView `apply`, SDK 0.18.0).
// The view answers through onApplyStateChange: pending (shown, waiting for the write), then saved or
// failed; refused when it showed nothing. A view that never answers (a Host before 0.18.0) counts as
// unanswered after SHOWN_WAIT_MS, and the screen reads the saved file again as before; after that
// the tracker is no longer usable and later corrections do not wait for it.
export const SHOWN_WAIT_MS = 5000;
export const SETTLED_WAIT_MS = 15000;

const within = (promise, ms, fallback) => {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })])
    .finally(() => clearTimeout(timer));
};

// set(update): the screen's state setter for the view's `apply` prop.
export function applyTracker(set) {
  let count = 0, step = null, answers = null;
  return {
    usable: () => answers !== false,
    // The change goes to the view; → the step that hears the view's answers for it.
    show(change, revision) {
      let shown, settled;
      const current = { request: ++count, done: false,
        shown: new Promise(resolve => { shown = resolve; }), settled: new Promise(resolve => { settled = resolve; }) };
      current.answer = s => {
        answers = true;
        if (s.state === 'pending') current.shownAt = performance.now();
        shown(s.state);
        if (s.state !== 'pending') { current.done = true; settled(s); }
      };
      step = current;
      set({ request: current.request, revision, change });
      return current;
    },
    onState(s) { if (step && s.request === step.request) step.answer(s); },
    // → "pending" when the view shows the change and waits for the write, else what it said.
    // A view that does not answer in time no longer holds its reports.
    shown: current => within(current.shown, SHOWN_WAIT_MS, 'timeout').then(state => {
      if (state === 'timeout') { current.done = true; answers ??= false; }
      return state;
    }),
    // → the view's last answer once it took over the written file or went back.
    settled: current => within(current.settled, SETTLED_WAIT_MS, { state: 'timeout' }).then(s => {
      current.done = true;
      return s;
    }),
    // The write's outcome for the view: {saved: revision} or {failed: reason}.
    finish(current, outcome) {
      set(a => a && a.request === current.request ? { ...a, ...outcome } : a);
    },
    // A change is on its way through the view; its reports still carry the revision before it.
    holding: () => !!step && !step.done,
  };
}
