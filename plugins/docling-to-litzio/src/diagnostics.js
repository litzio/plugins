// Static remediation only: never echo input, paths, document text or raw errors.
const guidance = {
  "legacy-review-read-only": "이 검수 기록은 이전 형식입니다. 기존 완료 묶음은 읽기만 가능합니다. 고정 변환 결과에서 preflight/start로 문서를 새로 생성해 검수를 다시 시작하세요. jobs에서 새 jobId를 얻으세요.",
  "group-not-found": "groupId must be a group ID, not a page number or page:N. Get valid IDs from groups({jobId}); use the returned groups[].id.",
  "invalid-job-id": "jobId must be a job UUID. Get jobs[].jobId from jobs({}) or the ID returned by start.",
  "job-not-ready": "The job is not ready. Read job({jobId}) and wait for ready before review operations.",
  "change-not-found": "undoOf/changeId must identify a recorded correction. Read review-progress({jobId}).changes and use its changeId.",
  "invalid-checkpoint": "scopeId must be an ID from review-progress({jobId}).scopes[].id; state must be one of 미검사, 검사중, 차이없음, 교정후재검사, 판단불가, 실패.",
  "inspection-note-required": "note must describe the targets, evidence and checks actually inspected. Obtain scopeId and current revision from review-progress.",
  "pending-reconcile": "A write is unresolved. Run correction-reconcile({jobId}) then review-progress. Do not resend a correction based only on its visible value.",
  "review-stopped": "Review is stopped. Read review-progress and use review-resume({jobId}) only when continuing the requested review.",
  "review-incomplete": "Completion conditions are unmet. Read review-progress({jobId}).gate, scopes and humanQueue; resolve the reported blockers before review-finalize.",
  "invalid-actor-reason": "actor must be assistant or human and reason must be nonempty. Assistants must declare assistant. Obtain generationId/revision/groupId and evidence from material.",
  "invalid-edit": "decision=correct requires distinct string before/after values; before must equal the current material value. Assistants cannot fill empty values. If PDF token evidence is insufficient, submit uncertain.",
  "invalid-inspection-scope": "evidence.scope must contain {pageNo,bbox:[x0,y0,x1,y1]} with four finite numbers on material.pdf pages. Derive bounds from the selected actual PDF token boxes, not Docling regions.",
  "incomplete-evidence": "evidence.refs must include every check.pdfTokenIds entry for the selected material target. Read that check and actual material.pdf tokens again.",
  "uninspected-evidence": "evidence.scope does not contain every selected PDF token. Use pageNo and the min/max bounding rectangle of the actual material.pdf token boxes that you inspected.",
  "human-note-required": "decision must be confirmed or deferred with a nonempty note. Only a human submits this decision after compare; obtain groupId/revision from that comparison.",
  "loss-note-required": "decision must be meaning-preserved, meaning-changed or deferred with a nonempty note. Only a human submits this after compare; obtain lossId from review-progress.losses.",
  "duplicate-conflict": "changeId was already submitted with different content. Read review-progress.submissions and correction-reconcile before deciding whether a genuinely new correction needs a new unique changeId.",
  "undo-stale": "undoOf must identify the last applicable correction at the current revision. Read review-progress.changes and current material; do not reverse an older edit against a changed document.",
  "input-changed": "The conversion bundle changed after preflight. Run preflight({bundle}) again and use its new fingerprint when starting a new request.",
  "request-id-conflict": "requestId is already bound to another input. Read job({jobId:requestId}); use a new UUID only for a genuinely new generation request.",
  "outside-workspace": "The requested bundle or source file is outside the configured workspace. Choose a bundle and its recorded source PDF inside workspaceDirectory, then run preflight.",
  "human-evidence-required": "Human source-region evidence requires actor=human. Assistants must use PDF token evidence from material or submit decision=uncertain.",
};
export function diagnostic(code) {
  if (guidance[code]) return `${code}: ${guidance[code]}`;
  if (/^stale-|conflict$/.test(code))
    return `${code}: The displayed document or value changed. Read review-progress and material again; use the returned documentRevision and current target value before resubmitting.`;
  if (/^(schema-invalid|invalid-submission|invalid-cell-content)$/.test(code))
    return `${code}: Input does not match the operation schema. Use the installed operation inputSchema; get generationId, documentRevision, group.id, target path/selector and current value from material({jobId,groupId}). For uncertain omit target/before/after/evidence.`;
  if (/^(evidence|scope|target|before|protected|visual|empty|rich|loss)-/.test(code))
    return `${code}: Correction or comparison evidence is invalid. Read material again; use its current target path/selector/value, check.pdfTokenIds and actual pdf token bounding boxes. If evidence cannot establish the value, submit uncertain; human expression decisions require compare.`;
  return `${code}: Check the installed operation inputSchema and current job({jobId}) or review-progress({jobId}). Obtain job IDs from jobs, group IDs from groups, and correction inputs from material; do not guess identifiers or retry unresolved writes.`;
}
