# 비서 검수 지침 본문 초안 — manifest 미등록

이 문서는 설치되는 SKILL.md가 아니다. 이번 PR에서는 실제 AI나 스킬 전달을 실행하지 않는다. 공개 operation의 정확한 입력은 litzio-plugin.json과 schema/correction-submission.schema.json을 따른다.

1. Host와 jobId를 명시한 작업 파일을 받는다. `litzio operation invoke local.docling-to-litzio.material --input INPUT_JSON --host HOST --json`으로 groupId 하나의 자료를 읽는다. generationId/sourceHash/현재 documentRevision을 확인한다. 다른 generation 자료를 합치지 않는다.
2. current의 공식 CLI 블록·셀, fragments의 원래 Docling 조각/대응, sourceNeighbors/neighbors, pdf의 실제 PDF items/tokens/좌표, checks의 대상별 검사 범위를 함께 읽는다. 원문 변환값과 PDF 증거를 구분한다. 필요한 이미지가 없으면 수식/그림/표 구조 의미를 확정하지 않는다.
3. 교정할 때는 correction-submit 입력에 jobId, 고유 changeId, generationId, revision, groupId, actor, decision=correct, target, before, after, reason, evidence를 쓴다. target은 paragraph/cell/equation과 현재 block path이며 셀은 row/column을 더한다. evidence.refs에는 해당 check의 PDF token 전부, scope에는 실제 확인한 pageNo/bbox를 넣는다. 번호만 보고 제목 추정, 빈 셀 채우기, 원문 오탈자 다듬기, 보이지 않는 그림 삭제를 하지 않는다.
4. 근거가 없으면 decision=uncertain과 구체적인 이유를 제출한다. 이 경우 편집하지 않는다. 현재 첫 구현은 글자 층 token이 없는 영역의 교정 제출을 받지 않는다. 이미지 증거만 있는 영역은 후속 공개 증거 계약 전까지 판단 불가로 남긴다.
5. 공개 쓰기는 CLI `operation invoke local.docling-to-litzio.correction-submit`을 쓴다. manifest의 assistant 노출은 읽기 material뿐이다. 비서 내부 읽기 도구에 쓰기를 숨기지 않는다. 실제 호출을 할 수 없는 환경이면 입력 파일과 필요한 공개 능력을 보고한다. 문서 파일을 직접 쓰거나 Docling을 고쳐 재생성하지 않는다.
6. 응답 상태가 applied여도 해당 revision의 단일 token/readback 검증 결과일 뿐이다. uncertain은 편집이 없었거나 의미/수식 판정이 남았을 수 있으므로 이력과 validation을 읽는다. pending-reconcile이면 다음 교정을 시작하지 않고 correction-reconcile로 관측한다. 같은 changeId를 새로 만들어 자동 재전송하지 않는다. 재조회는 같은 입력/changeId를 사용한다.
7. review-checkpoint에는 현재 revision, 실제 검사한 scopeId, 상태, 확인 내용을 note로 남긴다. 후보 묶음 외 모든 page도 처음에는 미검사다. 해당 쪽을 방문했거나 후보가 없다는 이유만으로 차이없음으로 표시하지 않는다. review-stop은 다음 제출을 막고 review-resume은 pending/현재 revision을 확인한다.
8. 되돌리기는 correction-undo에 undoOf/changeId/actor/근거를 제출한다. 마지막 변경 이후 revision이 달라졌으면 거부된다. 옛 파일 전체를 복원하지 않는다.
9. 결과에는 검사/미검사·판단 불가·실패 범위와 교정 이력/잔여 손실을 남긴다. 이번 조각은 검수 완료나 reviewed 출처를 발급하지 않는다. 숫자 대조와 렌더/check 통과를 AI 품질이나 수식 의미 정확성으로 부르지 않는다.
