// Content editing in the comparison view and following the saved file. The view saves its own
// edits; the handler then checks the saved file and moves the correspondence to its revision.
// The same check runs when the file changes elsewhere (a document tab, the assistant).

export const POLL_MS = 2000;
// Why structure corrections wait while the view holds edits.
export const EDIT_REASONS = {
  unsaved: '고친 내용을 아직 저장하지 않았습니다. 다른 블록을 누르면 저장됩니다.',
  saving: '고친 내용을 저장하는 중입니다.',
  failed: '고친 내용을 저장하지 못했습니다. 문서 보기에서 Ctrl+S를 눌러 다시 저장하세요.',
  conflict: '밖에서 문서가 바뀌어 고친 내용을 저장하지 못했습니다. 문서 보기의 다시 읽기를 누르세요.',
};
const STATUS = {
  saving: { tone: 'progress', label: '저장 중' },
  failed: { tone: 'error', label: '저장 실패' },
  conflict: { tone: 'warning', label: '저장 충돌' },
};
// The header status of the view's saving, or null when there is nothing to show.
export const editStatus = (state, confirming) => STATUS[confirming && state !== 'failed' && state !== 'conflict' ? 'saving' : state] || null;
export const editReason = (state, confirming) => EDIT_REASONS[confirming && state === 'clean' ? 'saving' : state] || null;

// What a result of the handler's follow means for the screen.
// → "none" | "stale" | "moved"; reload when the view does not show the new revision yet.
export function followOutcome(result, viewRevision) {
  if (!result || result.unchanged || result.busy) return { kind: 'none' };
  if (result.stale) return { kind: 'stale', message: result.message };
  return { kind: 'moved', revision: result.revision, reload: result.revision !== viewRevision };
}

// follow(revision, trigger, saved) → the handler's answer for the mapping at `revision`. saved: for a
// save of the view, {revision, blocks} with the blocks the Host accepted (SDK 0.17.0), when it gave them.
// apply(outcome, result, trigger) shows a stop, a move or an error. enabled: the correspondence is valid.
// paused(): a correction is running; checks wait for it.
export function useContentEdit(React, { follow, apply, revision, enabled, paused = () => false }) {
  const { useState, useRef, useCallback, useEffect } = React;
  const [state, setState] = useState('clean'), [confirming, setConfirming] = useState(0);
  const stateRef = useRef('clean'), revisionRef = useRef(revision), viewRevision = useRef(null);
  const queue = useRef(Promise.resolve()), queued = useRef(0);
  // Saves told before the view turned to conflict may not be on disk: their blocks are not used.
  const conflicts = useRef(0);
  const live = useRef({ follow, apply, enabled, paused });
  live.current = { follow, apply, enabled, paused };
  // An action that would close the view waits until its edits are saved and checked.
  const waiting = useRef(null);
  if (revision !== undefined && queued.current === 0) revisionRef.current = revision;
  // One check at a time, in order; each one sees the revision the previous one moved to.
  // A save gives the revision it started from; an earlier check may already have reached it.
  const run = (trigger, save) => {
    queued.current++;
    if (trigger === 'save') setConfirming(n => n + 1);
    queue.current = queue.current.then(async () => {
      if (save && save.revision === revisionRef.current) return;
      const started = performance.now();
      let result;
      const saved = save?.blocks && save.conflicts === conflicts.current ? { revision: save.revision, blocks: save.blocks } : undefined;
      try { result = await live.current.follow(save ? save.previousRevision : revisionRef.current, trigger, saved); }
      catch (e) { result = { error: e }; }
      const outcome = result?.error ? { kind: 'error', message: result.error.message } : followOutcome(result, viewRevision.current);
      if (outcome.kind === 'moved') revisionRef.current = outcome.revision;
      if (outcome.kind === 'none') {
        performance.clearMeasures('document-import-poll');
        performance.measure('document-import-poll', { start: started, detail: result?.timings });
        return;
      }
      performance.measure('document-import-follow', { start: started, detail: { trigger, kind: outcome.kind, ...(result?.timings || {}) } });
      live.current.apply(outcome, result, trigger);
    }).catch(() => {}).finally(() => {
      queued.current--;
      if (trigger === 'save') setConfirming(n => n - 1);
    });
    return queue.current;
  };
  const onEditStateChange = useCallback(s => {
    if (s.state === 'conflict') conflicts.current++;
    stateRef.current = s.state; viewRevision.current = s.revision;
    setState(s.state);
  }, []);
  // The view's own save: the mapping moves from the revision the save started from.
  const onSave = useCallback(s => {
    viewRevision.current = s.revision;
    if (s.revision === revisionRef.current) return;
    run('save', { ...s, conflicts: conflicts.current });
  }, []);
  // The view read the file: a revision other than the mapping's is checked at once.
  // → true when the revision is checked (or is being checked) instead of stopping at once.
  const onRead = useCallback(s => {
    if (!s.revision) return false;
    viewRevision.current = s.revision;
    if (s.revision === revisionRef.current || queued.current) return true;
    if (stateRef.current !== 'clean' || !live.current.enabled || live.current.paused()) return false;
    run('read');
    return true;
  }, []);
  // The periodic check: only while the view holds nothing unsaved and nothing else is checking.
  const poll = useCallback(() => {
    if (!live.current.enabled || live.current.paused() || stateRef.current !== 'clean' || queued.current) return;
    run('poll');
  }, []);
  const pending = () => stateRef.current !== 'clean' || queued.current > 0;
  useEffect(() => {
    if (!waiting.current) return;
    if (state === 'failed' || state === 'conflict') { waiting.current = null; return; }
    if (state !== 'clean' || confirming) return;
    const go = waiting.current; waiting.current = null;
    queue.current.then(go);
  }, [state, confirming]);
  return {
    state, confirming: confirming > 0,
    held: state !== 'clean' || confirming > 0,
    reason: editReason(state, confirming > 0),
    status: editStatus(state, confirming > 0),
    // Corrections wait for checks in flight and then read the mapping they left.
    settled: () => queue.current,
    pending,
    // Leaving the view (going back, choosing another file) waits for its edits: focus leaving the
    // view starts their save. A failed save or a conflict keeps the screen.
    afterSave: go => { if (pending()) waiting.current = go; else go(); },
    documentProps: { editContent: !!enabled, onEditStateChange, onSave },
    onRead, poll,
  };
}
