# 사람의 최종 확정 인계 v1.2

v1.0 생성본과 v1.1 교정본을 바꾸지 않는 minor 확장이다. 기존 소비자는 알 수 없는 1.2.0을 거부해야 한다. 원본 PDF·변환 결과·생성 provenance/snapshot/losses/receipt·탐지 파일은 불변이다. 생성 provenance의 `reviewState`는 계속 `unreviewed`다. 완료를 그 필드만으로 판정하지 않는다.

## 발급과 파일

공개 `review-finalize({jobId,revision})`는 기존 교정 잠금 안에서 현재 공식 inspect, 유효한 인계, 공식 check를 확인한다. 다음 조건을 모두 충족해야 한다.

- 모든 탐지 묶음과 모든 PDF 쪽의 현재 revision checkpoint가 있어야 한다. `차이없음`, 실제 재검사 note가 있는 `교정후재검사`를 수락한다. 자동으로 찍힌 교정 checkpoint나 쪽 방문만으로 범위를 채우지 않는다.
- 판단 불가 묶음은 같은 revision의 사람 `confirmed` 결정이 있어야 한다. 쪽 단위 판단 불가·실패·미검사는 차단한다.
- 수식 전부, 병합 표, 북마크 근거가 약한 제목 계층, 의미 손실과 비서 판단 불가 묶음은 사람이 확인한다. 마지막 결정이 `deferred`면 차단한다.
- `severity=blocking` 손실은 0이어야 한다. 사람 확인은 원래 손실을 삭제하거나 의미 손실을 면제하지 않는다. 현재는 구조 손실의 해소 작업이 없어 이런 생성본은 완료할 수 없다.
- available인 PDF 보호 토큰 검사 범위에서 현재 대응 값의 숫자·단위·부호를 다시 비교해 차이가 0이어야 한다. 수식 의미는 이 검사로 보증하지 않는다. unavailable 범위는 검사 note와 사람 판단을 통해 남는 한계를 드러낸다.
- pending·중단·오래된 revision·유효하지 않은 대응이면 발급하지 않는다.

`human-review.json`을 추가한다. [정본 schema](../../plugins/docling-to-litzio/schema/human-review.schema.json)는 schemaVersion=1.2.0, generationId, documentRevision, time, scopes, humanDecisions, conditions를 갖는다. conditions는 ready=true와 uncovered/human/blocking/failures/tokenDifferences=0이다. 사람 결정은 groupId, revision, decision(confirmed/deferred), note, actor=human, time을 기록한다. 교정은 기존 correction-submit(actor=human)만 쓴다.

마지막으로 complete.json을 schemaVersion=1.2.0, reviewState=reviewed로 게시한다. 기존 files에 human-review.json과 review/pdf-evidence.json, review/review-targets.json의 digest를 추가한다. 교정 이력이 있으면 v1.1의 사슬·원장 검증을 모두 유지한다. 이력이 없는 1.2도 가능하며 생성 snapshot을 현재 snapshot으로 검증한다. correction-ledger.json은 가변 처리 기록으로 계속 함께 전달한다.

## 소비자가 바꿀 것

1. complete의 1.2.0을 명시적으로 지원하고 위 추가 파일 경로·bytes digest와 generation/revision을 검증한다. v1.0/v1.1의 검증을 느슨하게 하지 않는다.
2. correction-history.json이 있으면 v1.1의 모든 사슬·원장·현재 snapshot 검증을 먼저 한다. 없으면 생성본의 보존 검사를 한다. 실제 소비 시 같은 revision의 공식 inspect와 대조한다.
3. human-review schema와 원장의 generation/sourceHash/revision을 대조한다. 원장의 completion이 human-review 전체와 같아야 한다. scopes/humanDecisions도 각각 같아야 한다. 쪽 inventory와 모든 그룹의 범위, 사람 필수 목록, 차단 손실·실패·중단·pending, 현재 토큰 차이를 다시 계산한다. 저장된 conditions의 true만 신뢰하지 않는다.
4. 처음/마지막 complete 및 원장 bytes가 한 번의 읽기 중 변하지 않아야 한다. 유효한 완료가 있을 때만 reviewed/확정 출처 적격을 허용한다. 기존 unreviewed 소비 흐름은 유지한다.

complete.reviewState=reviewed는 **그 revision에서 발급한 이력**이다. 현재 유효성은 위 재검증 결과다. 교정·손 편집 후에는 무효이며, checkpoint 재개/사람 결정 변경/중단도 현재 완료를 무효화한다. 오래된 human-review 파일이 남아도 완료로 수락하지 않는다. 생산 reader의 `reviewComplete`와 `--require-reviewed`가 이 유효성을 표시한다. 손 편집은 문서 digest/사슬이 맞지 않아 미완료 인계 자체도 거부된다. 수동 재대응·서명·변조 방지는 추가하지 않는다.

requirements-extract는 이번 PR에서 수정하지 않는다. 현재 reader/model의 허용 버전과 unreviewed/eligibleConfirmed=false 규칙을 위 의미에 맞춰 확장해야 정식 내보내기에 쓸 수 있다. 그 전에는 1.2를 거부하는 것이 맞다.
