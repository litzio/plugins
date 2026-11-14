# 내용에 결합된 검수 v1.3

이 문서는 v1.3.0에만 적용한다. v1.0~v1.2의 의미와 reader 검증은 바꾸지 않는다. 이미 발급된 v1.2 완료는 기존 규칙으로 읽는다. `reviewVersion`이 `1.3.0`이 아닌 진행 원장에 대한 새 검수 쓰기(교정·undo·사람 결정·표현 확인·checkpoint·완료·중단·재개·조정)는 `legacy-review-read-only` 오류다. 고정 변환 결과에서 새 문서를 생성해 다시 시작한다. 이관과 이전 형식 쓰기는 없다.

새 생성 및 교정·완료의 `complete.json.schemaVersion`은 `1.3.0`이다. 생성 증거, 교정 이력의 기존 schema와 투영·receipt·원장 대조 규칙은 그대로다. 교정 없는 v1.3도 허용한다. `reviewState`는 완료 전 `unreviewed`, 명시적 발급 후 `reviewed`다. `human-review.json`의 v1.3 정본은 [schema](../../plugins/docling-to-litzio/schema/human-review-v13.schema.json)다. v1.2와 같은 닫힌 필드를 가지되 아래 기록에 필수 `contentDigest`(소문자 SHA-256 hex 64자)를 추가한다.

- `scopes[].checkpoint`가 객체이면 그 범위의 digest.
- `humanDecisions[]`, `lossConfirmations[]`, `expressionReviews[].confirmation`은 `groupId` 범위의 digest.
- 처리 원장의 `reviewVersion="1.3.0"`은 이 판정 방식을 고른다. 완료 파일의 버전도 일치해야 한다. `revision`, `changeCount`, `actor`, `time`은 실제 제출 당시 값을 보존한다. 다른 범위가 바뀌었다고 현재 revision으로 덮어쓰지 않는다.

## 범위 digest의 bytes

모든 계산은 검증된 한 호출의 read set 안에서 한다. 호출 사이 캐시는 없다. 원본 PDF·Docling·생성 대응·현재 교정 사슬을 먼저 검증한다. 이하 H(x)는 canonical(x)를 ECMAScript JSON.stringify(replacer/space 없음)한 UTF-8 bytes의 SHA-256이다. BOM·끝 개행·Unicode 정규화 없음. canonical은 배열 순서를 유지하고, 객체는 키를 ECMAScript 문자열 sort 순서로 넣되 모든 깊이에서 `revision`, `documentRevision` 키만 제외한다. 숫자 index 키의 JSON 직렬화 순서는 ECMAScript 규칙대로 숫자순이다. 다른 필드는 제외하지 않는다. 정상 입력은 JSON 값이다.

1. 현재 snapshot.nodes를 path[0]별로 모아 원래 순서의 배열을 H한다(전체 표와 그 셀·캡션 포함).
2. 현재 provenance.items의 각 항목 전체를 H한다. targets와 cells[].targets의 path[0] 고유 집합을 숫자순 정렬한다. item.regions[].pageNo마다 sourceId를 연결한다.
3. PDF evidence.pages의 각 page 전체를 H한다. report.checks를 sourceId별 원래 순서 배열로 모아 H한다.
4. 그룹 범위의 sourceId는 해당 group.findingIds가 가리키는 finding.sourceIds의 합집합이다. pageNos는 group.pageNos다. extra는 `{group,members}`이며 members는 findingIds 순서의 finding 전체다. 쪽 범위의 sourceId는 2의 해당 쪽 집합, pageNos는 그 한 쪽, extra는 null이다.
5. sourceId는 고유 문자열 sort, block path[0] 및 pageNo는 고유 숫자순이다. 다음 객체를 H한 것이 범위 digest다. 미존재 check/page/block hash는 null이다. source는 검증된 inventory 안에 있어야 한다.

```json
{"generationId":"생성 ID","sourceHash":"원본 PDF SHA-256","sources":[["sourceId","항목 H","check 배열 H 또는 null"]],"blocks":[[1,"블록 배열 H 또는 null"]],"pages":[[1,"PDF 쪽 H 또는 null"]],"extra":null}
```

같은 표의 다른 셀도 같은 블록이므로 영향을 받는다. 독립 표·쪽은 유지한다. 문서 revision 자체는 범위 digest에 없지만, 기록 revision은 baselineMarker.documentRevision 또는 changes[].afterRevision 중 하나여야 한다. changeCount가 있으면 `[baselineRevision,...afterRevisions][changeCount]`와 기록 revision이 같아야 한다. 동일 bytes로 돌아오는 revision도 해당 위치에서 인정한다. 무효화한 기록은 bytes가 되돌아와도 재사용하지 않는다.

## 완료 조건 C0~C9

기존 [C0~C9](human-review.md)의 이름과 모두 충족해야 한다는 규칙을 유지한다. PR 1에서 바뀌는 것은 C4·C5·C7의 유효 수명이다.

| 조건 | v1.3 판정 |
| --- | --- |
| C0 boundEvidence | 현재 generation/PDF/문서/근거 결합을 모두 검증 |
| C1 noPending | pending=null |
| C2 running | stopped=false |
| C3 currentRevision | 원장 revision=현재 문서 bytes revision. 설명 없는 손 편집은 계속 차단 |
| C4 coverage | 모든 그룹·물리 쪽의 실제 검사 note와 유효 contentDigest. 판단불가는 유효 사람 confirmed 필요 |
| C5 humanDecisions | 필수 사람 결정 충족. 어떤 revision에서든 마지막 명시적 deferred는 새 confirmed 없이 해제되지 않음 |
| C6 contentLosses | 해소 대상 손실 0 |
| C7 expressions | 각 표현 항목의 마지막 meaning-preserved가 현재 내용 digest와 일치하고 무효화되지 않음 |
| C8 failureFree | 실패 범위 0 |
| C9 protectedValues | 현재 값의 PDF 보호 token 대조 차이 0. undo는 직접 사람 근거 면제 아님 |

완료 receipt를 유효성의 기억으로 쓰지 않는다. 발급과 소비 모두 조건을 다시 계산하고, 원장의 현재 completion이 봉인한 human-review와 같아야 한다. stop/resume 후 조건이 충족돼도 명시적 재발급 전에는 완료가 아니다.

## 사건 × 조건

`재계산`은 파일·현재 값에서 해당 조건을 다시 검증한다는 뜻이다. `내용`은 바뀐 내용을 본 기록만 무효화하고 나머지를 보존한다는 뜻이다. 어떤 사건도 C0~C9의 검사를 생략하지 않는다.

| 사건 | C0 | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | 완료 receipt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 교정 접수 | 재계산 | 차단 | 유지 | 재계산 | 진행 범위 | 유지 | 재계산 | 유지 | 재계산 | 재계산 | 무효 |
| 교정 게시·undo·재교정 | 재계산 | 재계산 | 유지 | 재계산 | 내용 | 내용 | 재계산 | 내용 | 재계산 | 재계산 | 무효 |
| 사람 결정 변경·보류 | 재계산 | 재계산 | 유지 | 유지 | 해당 범위 | 해당 그룹 | 재계산 | 해당 그룹 | 재계산 | 재계산 | 무효 |
| 표현 결정 변경·보류 | 재계산 | 재계산 | 유지 | 유지 | 유지 | 유지 | 재계산 | 해당 항목 | 재계산 | 재계산 | 무효 |
| 정상 checkpoint | 재계산 | 재계산 | 유지 | 유지 | 해당 범위 기록 | 유지 | 재계산 | 유지 | 재계산 | 재계산 | 무효 |
| 검사 재개·uncertain | 재계산 | 재계산 | 유지 | 유지 | 해당 범위 | 해당 그룹 | 재계산 | 해당 그룹 | 재계산 | 재계산 | 무효 |
| stop | 재계산 | 재계산 | 차단 | 유지 | 검사중만 미검사 | 유지 | 재계산 | 유지 | 유지 | 재계산 | 무효 |
| resume | 재계산 | 재계산 | 재개 | 재계산 | 끝낸 범위 유지 | 유지 | 재계산 | 유지 | 유지 | 재계산 | 무효 |
| 설명 없는 손 편집 관측 | 재계산 | 재계산 | 유지 | 차단 | 내용 | 내용 | 재계산 | 내용 | 재계산 | 재계산 | 무효 |
| 부속 파일 부분 변경 | 차단 | 재계산 | 재계산 | 재계산 | 재계산 | 재계산 | 재계산 | 재계산 | 재계산 | 재계산 | 수락 불가 |

손 편집 관측은 문서 hash 차이만 허용한 별도 관측 경로에서 나머지 파일·교정 사슬을 모두 검증해 범위 변경만 판단한다. 이 경로는 유효한 인계를 발급하지 않는다. pending 상태는 stale 응답이며 부분 쓰기의 성공을 추정하지 않는다.

## 조회와 오류

review-progress는 원본 이력 외에 처리 코드가 현재 digest로 판정한 `currentHumanDecisions`, `expressionReviews`를 제공한다. 화면은 이 값을 표시하며 revision만으로 다시 유효성을 계산하지 않는다.

공개 작업의 처리 오류는 안정된 `code`와 다음 행동을 설명하는 `message`를 가진다. groupId는 `groups({jobId}).groups[].id`, scopeId는 `review-progress.scopes[].id`, 현재 교정 값·위치·PDF token/좌표는 `material`에서 얻는다. `page:N`은 groupId가 아니다. 입력 schema는 유지한다. 오류 객체를 외부 CLI까지 전달하는 플랫폼 능력의 현재 미지원은 PR 결과의 플랫폼 부족 사항으로 별도 기록한다. actor는 비인증 선언이며 비서는 사람 근거·사람 결정·표현 확인을 제출하지 않는다.
