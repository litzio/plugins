# 내용에 결합된 검수 v1.3

이 문서는 v1.3.0에만 적용한다. v1.0~v1.2의 의미와 reader 검증은 바꾸지 않는다. 이미 발급된 v1.2 완료는 기존 규칙으로 읽는다. `reviewVersion`이 `1.3.0`이 아닌 진행 원장에 대한 새 검수 쓰기(교정·undo·사람 결정·표현 확인·checkpoint·완료·중단·재개·조정)는 `legacy-review-read-only` 오류다. 고정 변환 결과에서 새 문서를 생성해 다시 시작한다. 이관과 이전 형식 쓰기는 없다.

새 생성 및 교정·완료의 `complete.json.schemaVersion`은 `1.3.0`이다. 생성 증거, 교정 이력의 기존 schema와 투영·receipt·원장 대조 규칙은 그대로다. 교정 없는 v1.3도 허용한다. `reviewState`는 완료 전 `unreviewed`, 명시적 발급 후 `reviewed`다. `human-review.json`의 v1.3 정본은 [schema](../../plugins/docling-to-litzio/schema/human-review-v13.schema.json)다. v1.2와 같은 닫힌 필드를 가지되 아래 기록에 필수 `contentDigest`(소문자 SHA-256 hex 64자)를 추가한다.

- `scopes[].checkpoint`가 객체이면 그 범위의 digest.
- `humanDecisions[]`, `lossConfirmations[]`, `expressionReviews[].confirmation`은 `groupId` 범위의 digest.
- 처리 원장의 `reviewVersion="1.3.0"`은 이 판정 방식을 고른다. 완료 파일의 버전도 일치해야 한다. `revision`, `changeCount`, `actor`, `time`은 실제 제출 당시 값을 보존한다. 다른 범위가 바뀌었다고 현재 revision으로 덮어쓰지 않는다.

## 범위 digest의 bytes

모든 계산은 검증된 한 호출의 read set 안에서 한다. 호출 사이 캐시는 없다. 원본 PDF·Docling·생성 대응·현재 교정 사슬을 먼저 검증한다. 이하 H(x)는 canonical(x)를 ECMAScript JSON.stringify(replacer/space 없음)한 UTF-8 bytes의 SHA-256이다. BOM·끝 개행·Unicode 정규화 없음. canonical은 배열 순서를 유지하고, 객체는 키를 ECMAScript 문자열 sort 순서로 넣되 모든 깊이에서 `revision`, `documentRevision` 키만 제외한다. 숫자 index 키의 JSON 직렬화 순서는 ECMAScript 규칙대로 숫자순이다. 다른 필드는 제외하지 않는다. 정상 입력은 JSON 값이다.

### 묶음: 공개 material과 같은 투영

묶음 digest는 별도로 추측한 대상 목록이 아니라 **material 작업이 실제로 반환하는 자료 객체**에서 만든다. 두 경로는 같은 `createMaterialReader`를 쓴다. 아래 13개 필드와 `MATERIAL_FIELDS`의 키 집합이 정확히 같아야 한다. 누락·추가 필드가 있으면 `unbound-material-field`로 실패한다. 필드를 새로 내주면서 결합을 잊는 것은 허용하지 않는다.

| 자료 필드 | 실제 제공 범위 | 결합 |
| --- | --- | --- |
| generationId | 현재 생성 ID | 문자열 그대로 |
| documentRevision | 조회한 전체 문서의 현재 revision | 내용 hash에서 제외. 제출 revision·inspect·원장·이력의 C0/C3에서 검증. 독립 교정 후에도 내용이 같으면 기록을 유지하는 결정 1의 명시적 예외 |
| baselineRevision | 탐지 report의 생성 revision | 문자열 그대로 |
| sourceHash | 원본 PDF bytes SHA-256 | 문자열 그대로 |
| group | 선택 그룹의 모든 필드 | H(group) |
| findings | 해당 findingIds의 원래 report 순서. source IDs, 위치, 근거, 대상 전부 | 원소별 H의 순서 배열 |
| fragments | 해당 sourceIds의 원래 provenance inventory 순서. sourceId/selfRef/raw 원본 전체/mapping 전체. 표 셀·머리·캡션·미주·구조 정보 포함 | 원소별 H의 순서 배열 |
| sourceNeighbors | inventory에서 선택 source의 바로 앞·뒤 항목. selfRef/raw 전체. 인접 원본 표·문단·주석 전체를 생략하지 않음 | 원소별 H의 순서 배열 |
| checks | 선택 sourceIds의 원래 check 순서. token ID/상태/영역 전부 | 원소별 H의 순서 배열 |
| current | finding.targets의 path[0]에 속하는 snapshot node 전부, 원래 snapshot 순서. 전체 표와 셀·caption·inline 내용·미주 참조 등 node의 모든 속성 | 원소별 H의 순서 배열 |
| neighbors | 위 path[0] 각각의 ±1에 해당하는 snapshot node 전부, 원래 순서. 인접 표도 표의 모든 셀·caption을 포함 | 원소별 H의 순서 배열 |
| pdf | group.pageNos의 PDF 쪽 전체, evidence 원래 순서. 글자 item·token·좌표·상태·크기·회전 전부 | 원소별 H의 순서 배열 |
| history | **이 자료에 연결된 교정만**. current/neighbors의 path[0], fragments와 sourceNeighbors에 해당하는 원본 항목의 targets/cells.targets의 path[0] 중 하나와 change.target.path[0]이 같은 교정. 원래 교정 순서와 각 기록의 전후 값·근거·receipt·actor·역연산 전부 | 원소별 H의 순서 배열 |

`history`는 검사의 근거로 내주는 국소 자료다. 문서 전체 “적용된 교정” 목록은 별도 참고용 조회이며, 그 목록 전체가 묶음 검사 근거로 제공되는 것은 아니다. 참고용 목록에 독립 교정이 추가됐다는 이유만으로 모든 묶음 검사를 무효화하지 않는다.

위 표의 변환 결과를 원래 필드 이름의 객체로 만든 뒤 H한다. 예를 들어 `findings`가 `[f1,f2]`이면 결합 객체의 findings는 `[H(f1),H(f2)]`다. group은 H(group), scalar 세 필드는 원래 문자열이며 documentRevision 키는 결합 객체에 넣지 않는다. 원소 H는 호출 안의 같은 객체에 한해 재사용할 수 있고, 호출 사이에는 재사용하지 않는다. H의 revision/documentRevision 제외는 모든 중첩 객체에도 적용한다. 이 revision metadata의 의미·일치는 hash 면제가 아니라 별도의 인계·교정 사슬 검증 대상이다.

### 물리 쪽

물리 쪽은 다음 고정 투영을 쓴다. 현재 snapshot.nodes를 path[0]별 원래 순서 배열로 모아 H하고, 각 현재 provenance item 전체와 sourceId별 report.checks 배열을 각각 H한다. item.regions[].pageNo로 해당 쪽의 sourceId 집합을 얻고, 그 항목의 targets/cells.targets가 가리키는 path[0] 집합을 얻는다. sourceId는 고유 문자열 sort, 블록 path[0]와 pageNo는 고유 숫자순이다. 해당 PDF page 전체를 H한다. 다음 객체를 H한 것이 쪽 digest다(없는 check hash는 null).

```json
{"generationId":"생성 ID","sourceHash":"원본 PDF SHA-256","sources":[["sourceId","항목 H","check 배열 H 또는 null"]],"blocks":[[1,"블록 배열 H"]],"pages":[[1,"PDF 쪽 H"]],"extra":null}
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
