# 사람의 최종 확정 인계 v1.2

계약의 계산 규칙과 닫힌 필드 정의는 [v1.2 계산·기록 규칙](review-values.md)을 함께 따른다. 기존 v1.2 생산 결과의 의미를 명문화한 것이며 버전은 바꾸지 않는다.

v1.0 생성본과 v1.1 교정본을 바꾸지 않는 minor 확장이다. 기존 소비자는 알 수 없는 1.2.0을 거부해야 한다. 원본 PDF·변환 결과·생성 provenance/snapshot/losses/receipt·탐지 파일은 불변이다. 생성 provenance의 `reviewState`는 계속 `unreviewed`다. 완료를 그 필드만으로 판정하지 않는다.

## 발급과 파일

공개 `review-finalize({jobId,revision})`는 기존 교정 잠금 안에서 현재 공식 inspect, 유효한 인계, 공식 check를 확인한다. 다음 조건을 모두 충족해야 한다. `completionGate`가 조건 증거를 만들고 `completionRequirementsMet`가 C0–C9의 **모든 값이 명시적으로 true**인지 판정한다. 누락된 증거는 통과가 아니다. 발급과 인계 재검증은 같은 함수를 호출한다. 유효한 파일 집합·schema·digest·generation·교정 사슬을 먼저 검증하고, 발급 시 공식 check까지 성공해야 한다. 소비 시에는 같은 revision의 공식 inspect를 다시 대조한다.

| 조건 | 판정 이름 | 반드시 있는 증거 |
| --- | --- | --- |
| C0 | boundEvidence | 검증된 현재 인계와 PDF 증거가 존재하며 generation/source PDF hash/현재 snapshot·대응 revision이 원장과 일치 |
| C1 | noPending | pending 조정 없음 |
| C2 | running | 중단 상태가 아님 |
| C3 | currentRevision | 관측한 문서 revision과 진행 원장 revision이 같음 |
| C4 | coverage | 모든 그룹·모든 물리 쪽에 현재 revision과 실제 검사 note가 있음. 차이없음/명시적 교정후재검사만 수락. 판단불가 그룹은 유효한 사람 confirmed가 필요. 방문/자동 교정 checkpoint는 불충분 |
| C5 | humanDecisions | 수식·병합 표·약한 제목 근거·의미 손실·판단불가의 필수 결정 충족. **일반 묶음을 포함해 현재 revision의 마지막 명시적 결정이 deferred인 그룹은 하나도 없음** |
| C6 | contentLosses | 해소해야 하는 내용 손실 0. 애매한 손실과 보존을 입증하지 못한 주석은 해소 대상 |
| C7 | expressions | 모든 표현 손실 항목에 현재 revision/changeCount의 유효한 마지막 meaning-preserved 확인. missing/deferred/meaning-changed/invalidated는 차단 |
| C8 | failureFree | 실패 범위 0 |
| C9 | protectedValues | available인 PDF 보호 토큰 범위에서 현재 값 재대조 차이 0. 마지막 직접 human-source-region 교정만 별도 표시하며 **undoOf가 있는 되돌리기는 사람 확인 면제가 아니고 원래 token 검사를 다시 받음** |

해당 값 자체의 직접 교정 영수증은 이력으로 보존한다. 검사 범위/사람 결정/표현 확인과 완료 발급은 별도 수명을 갖는다. 수식 의미·unavailable 영역의 의미를 기계 token 검사로 보증하지 않는다. 표현 손실의 명시 allowlist와 항목별 확인 정책은 유지한다. lossId는 sourceId/reasonCode/originalValue의 SHA-256이며 원본 손실을 삭제하지 않는다.

### 사건별 무효화 표

`invalidateReview`가 완료를 지우고 필요한 검수 확인을 invalidatedAt으로 무효화한다. 같은 revision의 명시적 보류는 중단·재개나 새 checkpoint만으로 해제되지 않으며 새 명시적 confirmed 결정이 필요하다. 기록 자체는 삭제하지 않는다. 오래된 human-review 파일은 발급 이력이며, 원장의 현재 completion이 없으면 재개만으로 되살아나지 않는다.

| 사건 | 완료 | 범위와 관련 확인 |
| --- | --- | --- |
| 교정 접수·게시 / 되돌리기 | 무효 | 모든 범위 재검사, 모든 사람/표현 확인 무효. 되돌린 값은 새로운 사람 근거가 아님 |
| 관측된 외부 문서 revision 변화 | 무효 | 모든 범위·사람/표현 확인 무효. 설명 없는 편집은 인계도 거부 |
| 일반/필수 사람 결정의 새 제출 | 무효 | 마지막 유효 결정 사용. 보류 또는 결정 변경이면 해당 그룹의 기존 사람/표현 확인도 무효화 |
| 표현 결정의 새 제출·보류·뜻이 달라짐 | 무효 | 해당 항목의 마지막 결정으로 대체. 다른 독립 항목의 증거는 유지 |
| 그룹·쪽 검사 재개(미검사/검사중/판단불가/실패) | 무효 | 그 그룹 또는 그 쪽에 걸친 그룹의 사람/표현 확인 무효; 재개한 범위는 완료로 세지 않음 |
| 현재 범위의 새 정상 checkpoint | 무효 | 재발급 필요. 기존 독립 확인은 유지 |
| 비서 uncertain 제출 | 무효 | 해당 그룹의 기존 사람/표현 확인 무효, 판단불가로 둠 |
| stop / resume / stop→resume | 무효 | 모든 범위 재검사와 모든 사람/표현 확인 무효. 새 검수 증거와 명시적 재발급 필요 |

`human-review.json`을 추가한다. [정본 schema](../../plugins/docling-to-litzio/schema/human-review.schema.json)는 schemaVersion=1.2.0, generationId, documentRevision, time, scopes, humanDecisions, conditions를 갖는다. conditions는 ready=true와 uncovered/human/blocking/expressionUnconfirmed/failures/tokenDifferences=0이다. blocking은 해소 대상, expressionUnconfirmed는 표현 확인 전 건수다.

lossConfirmations는 판단 이력을 보존한다. expressionReviews는 현재 유효한 표현 항목별 lossId/sourceId/reasonCode/originalValue/current targets/classification/basis/representation/sourceDefect와 현재 confirmation을 함께 싣는다. representation=unlinked-annotation은 **호출부 연결 없이 주석 문단으로 둠**, numbered-endnote는 번호 미주 표현, native-expression은 나머지 형식 투영이다. sourceDefect=duplicate-local-note-marker는 원문 중복 표지의 소유 불확실성이 남았음을 뜻한다. 표현의 뜻 보존 확인은 호출 소유 관계의 정확성, 요구사항의 업무 승인 또는 기계 검증을 뜻하지 않는다. 소비자는 출처 대상(특히 병합 표)에 이 확인의 범위를 명시적으로 연결해야 한다. 사람 결정은 groupId, revision, decision(confirmed/deferred), note, actor=human, time을 기록한다. 교정은 기존 correction-submit(actor=human)만 쓴다.

마지막으로 complete.json을 schemaVersion=1.2.0, reviewState=reviewed로 게시한다. 기존 files에 human-review.json과 review/pdf-evidence.json, review/review-targets.json의 digest를 추가한다. 교정 이력이 있으면 v1.1의 사슬·원장 검증을 모두 유지한다. 이력이 없는 1.2도 가능하며 생성 snapshot을 현재 snapshot으로 검증한다. correction-ledger.json은 가변 처리 기록으로 계속 함께 전달한다.

## 소비자가 바꿀 것

1. complete의 1.2.0을 명시적으로 지원하고 위 추가 파일 경로·bytes digest와 generation/revision을 검증한다. v1.0/v1.1의 검증을 느슨하게 하지 않는다.
2. correction-history.json이 있으면 v1.1의 모든 사슬·원장·현재 snapshot 검증을 먼저 한다. 없으면 생성본의 보존 검사를 한다. 실제 소비 시 같은 revision의 공식 inspect와 대조한다.
3. human-review schema와 원장의 generation/sourceHash/revision을 대조한다. 원장의 completion이 human-review 전체와 같아야 한다. scopes/humanDecisions/lossConfirmations도 각각 같아야 한다. expressionReviews를 현재 대응으로 재계산해 전체와 대조해야 한다. 쪽 inventory와 모든 그룹의 범위, 사람 필수 목록, 차단 손실·실패·중단·pending, 현재 토큰 차이를 다시 계산한다. 저장된 conditions의 true만 신뢰하지 않는다.
4. 처음/마지막 complete 및 원장 bytes가 한 번의 읽기 중 변하지 않아야 한다. 유효한 완료가 있을 때만 reviewed/확정 출처 적격을 허용한다. 기존 unreviewed 소비 흐름은 유지한다.

complete.reviewState=reviewed는 **그 revision에서 발급한 이력**이다. 현재 유효성은 위 재검증 결과다. 교정·손 편집 후에는 무효이며, checkpoint 재개/사람 결정 변경/중단도 현재 완료를 무효화한다. 오래된 human-review 파일이 남아도 완료로 수락하지 않는다. 생산 reader의 `reviewComplete`와 `--require-reviewed`가 이 유효성을 표시한다. 손 편집은 문서 digest/사슬이 맞지 않아 미완료 인계 자체도 거부된다. 수동 재대응·서명·변조 방지는 추가하지 않는다.

requirements-extract는 이번 PR에서 수정하지 않는다. 현재 reader/model의 허용 버전과 unreviewed/eligibleConfirmed=false 규칙을 위 의미에 맞춰 확장해야 정식 내보내기에 쓸 수 있다. 그 전에는 1.2를 거부하는 것이 맞다.


## 사람이 원문 영역을 보고 한 교정 — 같은 v1.2

correction-submit의 evidence.kind=human-source-region, refs=[], scope=[{pageNo,bbox}]는 **사람이 실제 원문 영역을 보고 확인함**이다. actor=human만 허용한다. 그룹에 대응한 대상과 해당 source/gap의 PDF 영역 안인지, 물리 쪽과 양의 bbox가 PDF 쪽 범위 안인지 검사한다. actor=assistant라고 선언한 제출의 빈 칸 채우기·사람 영역 근거 사용은 거부한다. **actor는 제출자의 선언이며 인증되지 않는다.** 도구가 실제 사람/비서의 신원을 구조적으로 구분하지 못하므로 비서도 human을 선언할 수 있다. 스킬은 비서에게 assistant를 선언하고 사람 근거 경로를 쓰지 말라고 지시하며, 기록에는 선언된 actor가 남는다. 이는 현재 단계에서 받아들이는 신뢰 경계다. 생략한 kind 또는 pdf-tokens는 기존 규칙을 그대로 따른다.

이 근거는 빈 셀 채우기와 수식/벡터 글자처럼 토큰 대조 불가 값에 사용할 수 있다. 기존 update-table-cell / update-equation-latex 연산을 쓴다. 셀 afterContent는 공개 InlineContent의 text/math 배열이며 after는 그 평문 투영이다. beforeContent/afterContent와 역연산 content를 이력에 기록하여 전체 snapshot의 정확한 투영·readback·되돌리기를 검증한다. 새 source cell을 만들어 내지 않고, 생성 report의 gap target과 source table 영역에 교정 근거를 연결한다.

이 교정을 포함하면 correction-history.schemaVersion=1.2.0, complete.schemaVersion=1.2.0이다. 미완료 complete.reviewState=unreviewed도 허용하며 이 경우 human-review.json은 아직 없다. 완료 때만 reviewed와 완료 파일을 게시한다. 기존 v1.1 이력은 변경하지 않는다.

validation.evidenceRecheck=human-source-region, protectedTokens=false로 표시한다. applied는 공식 편집과 정확한 readback을 뜻하며, 기계 보호 토큰 재검증 통과를 뜻하지 않는다. 기존 not-applicable과도 다르다. 소비자는 사람이 확인한 값과 verified-protected-tokens를 구별해야 한다. undoOf가 있으면 과거 값 복원이며 새 의미 검수 성공으로 표시하지 않는다. 원장/사슬/receipt/역연산/현재 inspect 대조는 동일하다.

소비자 추가 변경: correction-history 1.2, human evidence actor/scope/gap binding, 빈 before의 제한, content 전후 투영과 역연산, human-source-region 표시와 applied 상태 검증을 지원한다. 사람 근거 교정 대상의 자동 token gate를 다시 기계 확인으로 승격하지 않는다. 표현 확인과 값 교정 확인은 서로 다른 기록이다.

정책은 소유자가 돌아와 사용하며 조정할 가정이다. [LSR 29건 분류](../../plugins/docling-to-litzio/docs/lsr-loss-classification.md)를 함께 읽는다.


소비자 추가 주의: actor는 비인증 자기 선언이다. human-source-region, 사람 결정과 표현 확인을 인증된 인간 승인으로 표시하지 않는다. C0–C9와 사건별 무효화 규칙을 그대로 재검증한다. undoOf를 직접 사람 근거 면제로 세지 않고, 필수 목록 밖의 명시적 보류도 차단하며, stop/resume 전의 완료·확인을 재사용하지 않는다.
