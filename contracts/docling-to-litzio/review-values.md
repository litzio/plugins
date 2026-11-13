# v1.2 계산·기록 규칙

기존 v1.2 산출물을 그대로 해석하는 규칙이다. [human-review](human-review.md)의 C0–C9와 무효화 규칙도 모두 적용한다. 분류는 승인 자체가 아니다.

## lossId bytes

`losses.items` 중 `severity === "blocking"`인 항목마다 `SHA-256(UTF-8(JSON.stringify([sourceId, reasonCode, originalValue])))`를 계산한다. 소문자 64자리 hex이며 접두어·BOM·끝 개행은 없다. 세 값은 손실 항목의 값을 그대로, 위 배열 순서대로 넣는다. `originalValue`는 현재 문서가 아니라 원래 손실 값이다.

직렬화는 ECMAScript `JSON.stringify`(replacer·space 없음)다. JSON을 파싱한 뒤 객체의 정수 인덱스 키는 오름차순, 그 밖의 문자열 키는 입력 삽입 순서다. 중첩 객체에도 같은 규칙을 적용한다. 키를 사전순 정렬하거나 Unicode 정규화, 공백 제거, 줄바꿈 변환을 하지 않는다. 배열 순서는 유지한다. null은 `null`, 배열 슬롯의 undefined도 `null`로 직렬화된다(정상 산출물은 JSON 값이다). 다른 언어의 소비자도 이 bytes 규칙을 구현해야 한다. [기계 예시](examples/review-values.json)는 Unicode·이스케이프·키 순서·null의 입력과 예상 bytes/hash를 고정한다.

## 닫힌 분류 정책

targets는 현재 provenance에서 같은 sourceId 항목의 `role === "content"`인 targets다. 해당 항목 자체가 없을 때만 손실의 targets(없으면 빈 배열)를 쓴다. `category`만으로 expression을 수락하지 않는다.

다음 세 조건 중 하나가 참일 때만 `classification="expression"`이고, 나머지는 `repair-required`다.

1. reasonCode가 `merged-cell-repeated`, `compound-header-flattened`, `table-header-role`, `cell-block-structure` 중 하나이고 targets가 비어 있지 않음. 각각 병합 값 반복, 복합 머리 평탄화, 머리 역할의 형식 한계, 셀 안 블록 구조의 형식 한계를 뜻한다.
2. reasonCode가 `dedicated-table-note` 또는 `footnote-as-paragraph`, originalValue.text가 문자열이고, 같은 text의 target이 현재 snapshot의 같은 path인 paragraph를 가리킴(`noteParagraph`). 호출 연결 없는 주석 문단으로 본문을 보존한 경우다.
3. reasonCode가 `dedicated-table-note`, originalValue.reason이 정확히 `Original table note placement/letter marker becomes a numbered endnote`이고, targets 중 text가 `originalValue.text.replace(/^\S+\s+/, "")`와 같은 것이 있음(`numberedNote`). 정규식은 ECMAScript 의미이며 첫 표지와 뒤 공백만 제거한다.

| 필드 | 닫힌 값과 선택 순서 |
| --- | --- |
| classification | expression / repair-required |
| representation | noteParagraph이면 unlinked-annotation, 아니고 numberedNote이면 numbered-endnote, 나머지는 native-expression |
| sourceDefect | originalValue.reason이 정확히 `Repeated local marker within extracted table scope`이면 duplicate-local-note-marker, 나머지는 none |
| basis | noteParagraph이면 `Note body retained as an unlinked annotation paragraph`; 아니고 numberedNote이면 `Note body retained as a numbered endnote`; 나머지 expression이면 `Declared native representation limit; source values retained`; repair-required이면 `Content preservation or ownership not established` |

sourceDefect는 분류와 독립이다. 중복 표지의 호출 소유가 확정됐다는 뜻이 아니다. native-expression도 그 자체로 뜻 보존 확인이 아니다. expressionReviews에는 expression만 들어가며, 모든 항목의 유효한 meaning-preserved 확인이 필요하다.

## scopes와 humanDecisions

정본은 [human-review.schema.json](../../plugins/docling-to-litzio/schema/human-review.schema.json)이다. 두 배열 내부 객체는 아래 필드만 허용한다.

- scopes 항목은 필수 `id`, `state`, `checkpoint`다. id는 원래 group id 또는 `page:<물리 1-based 쪽 번호>`다. state는 `미검사`, `검사중`, `차이없음`, `교정후재검사`, `판단불가`, `실패` 중 하나다. checkpoint는 null 또는 객체다. 객체는 필수 문자열 revision/time/rulesVersion, 선택 문자열 note/changeId만 허용하며 rulesVersion은 `1.0.0`이다. 자동 교정 checkpoint에는 changeId가 있고 note가 없을 수 있다. 실제 검사 checkpoint에는 note가 있다. 완료 수락에는 현재 revision·공백 아닌 note가 반드시 필요하므로 자동 교정 checkpoint만으로는 완료할 수 없다.
- humanDecisions 항목은 필수 문자열 groupId/revision/note/time, decision=`confirmed` 또는 `deferred`, actor=`human`, 선택 문자열 invalidatedAt만 허용한다. note는 공백 아닌 검사 근거이며 time/invalidatedAt은 생산자가 발급한 UTC ISO 시각이다. invalidatedAt은 과거 기록의 무효화를 뜻한다. actor는 비인증 선언이다.

배열 순서는 이력 순서다. scopes는 모든 그룹·물리 쪽을 중복 없이 포함한다. 결정은 group/revision별 마지막 유효 기록으로 읽되, 현재 revision의 마지막 명시적 deferred는 완료를 막는다. 이전 revision과 무효화된 결정도 이력으로 보존한다. schema의 필드 검사와 별개로 소비자는 위 결합·완료 의미를 재검증한다.
