# 완료 인계 v1.2 소비

complete/history의 1.2.0을 명시적으로 지원한다. 1.0/1.1은 기존 schema와 결과를 유지한다. 모르는 버전은 거부한다. 생산자 모듈을 import하지 않고 파일 계약과 공개 CLI inspect를 사용한다.

봉인(digest·버전·generation), 생성 revision부터 현재 문서까지의 사슬·원장·단일 receipt·역연산, 소비하는 값의 자기 일관성, **현재 완료 조건 C0–C9**를 검증한다. 생산자의 생성 의미 검증 전체는 복제하지 않는다. 모든 부속 파일과 봉인을 일관되게 다시 쓴 의도적 위조는 대상이 아니다. 기존 추가 검사는 유지한다.

## 현재 완료 판정

완료 파일은 발급 이력이다. 가변 원장의 completion/scopes/humanDecisions/lossConfirmations와 발급 파일 전체를 대조하고, 현재 targets로 표현 손실 목록과 마지막 유효 확인을 다시 만든다. 공식 inspect와 생성 증거의 revision을 혼동하지 않는다. 완료 표지와 원장 bytes를 마지막에 다시 읽는다.

| 계약 조건 | 소비자 검사 |
| --- | --- |
| C0 boundEvidence | provenance/snapshot/receipt의 생성 결합과 현재 공식 inspect, PDF·검수 파일의 schema/digest/generation, 물리 쪽 inventory, 원장 generation/sourceHash/revision |
| C1 noPending | pending 교정은 인계 자체를 거부 |
| C2 running | stopped가 명시적으로 false |
| C3 currentRevision | 원장 revision = 현재 snapshot = 공식 inspect |
| C4 coverage | 모든 그룹·물리 쪽의 현재 revision checkpoint와 공백 아닌 검사 note. 자동 교정 checkpoint에는 note가 없어 통과하지 않음. 차이없음/교정후재검사 또는 유효 confirmed가 있는 판단불가 |
| C5 humanDecisions | 수식·병합 표·약한 제목 근거·의미 손실·판단불가·uncertain의 마지막 유효 결정. 필수 목록 밖도 마지막 명시적 deferred는 차단하며 invalidatedAt만으로 그 보류를 지우지 않음 |
| C6 contentLosses | 닫힌 표현 손실 정책 밖과 보존을 입증하지 못한 주석은 repair-required |
| C7 expressions | lossId/sourceId/reason/현재 target/쪽/의미를 대조. 현재 revision/changeCount에서 마지막 유효 meaning-preserved만 인정. 재계산한 expressionReviews 전체가 발급 파일과 일치 |
| C8 failureFree | 실패 범위 0 |
| C9 protectedValues | available check의 원문 토큰을 현재 문서 값과 다중집합으로 재대조. 원문 주석 표지·번호·복합 머리의 명시된 투영을 사용. 마지막 직접 human-source-region 교정만 별도 면제. undoOf는 면제 아님 |

완료가 지워졌거나 발급 파일·원장·현재 조건이 달라지면 unreviewed/eligibleConfirmed=false다. 이를 requireReviewed와 정식 내보내기는 거부한다. 설명 없는 문서 편집·부분 파일 변경·사슬 단절·pending은 인계 자체를 거부한다. v1.2 재검증 결과도 요구사항 작업의 입력 해시에 포함하므로 원장만 변경된 뒤 옛 판단·상세·확정이 살아남지 않는다.

## 출처와 화면·ReqIF

human-source-region은 actor=human, refs=[], 원문 그룹의 대응 대상/빈 셀 gap과 PDF 영역, content 전후·역연산·readback을 검증한다. protectedTokens=false를 그대로 유지하며 verified-protected-tokens/not-applicable/undo-restoration과 구별한다. 되돌림도 전체 이력에 남고 현재 교정 표시는 첫 before와 마지막 after의 값이 다를 때만 붙는다.

trace에 현재 완료 재검증 증거·발급 digest/revision, 관련 사람 결정·교정 이력·표현 항목/확인을 싣는다. actor는 **비인증 자기 선언**이며 ‘사람으로 기록된 확인’이다. 인증된 사람 승인으로 표시하지 않는다. 표현의 뜻 보존은 호출 소유 관계, 업무 승인, 기계 검증을 뜻하지 않는다. 병합 표의 유효한 표현 확인을 출처 측 확인으로 인정하는 가정은 설계 12절에 남겼다. 요구사항 본문·관계에 대한 별도 confirm과 해시 재검사는 유지한다.

사람 우선 보고는 같은 문서의 검수 상태와 같은 표의 표현 확인을 묶으며 대상 sourceKeys와 근거를 보존한다. 전체 trace를 후보마다 요약에 복제하지 않는다. 화면은 backend의 그룹·행·페이지를 그대로 그린다. 상세는 전체 출처, 교정 검증 종류, 표현 보존 확인과 actor 한계를 표시한다. 현재 저장과 ReqIF는 [요약·근거 참조](source-traces.md)를 사용한다. 전체 trace는 플러그인 자료에 남고 별도 boolean만으로 정식 출처로 승격하지 않는다.

## 계약에서 모호한 것

- lossId의 해시 입력 직렬화와 표현 분류의 basis 문자열·주석 판별 문자열은 계약 본문만으로 bytes를 결정할 수 없다. 공개 생산자 검사를 읽어 `JSON.stringify([sourceId,reasonCode,originalValue])`와 닫힌 이유/표현 규칙을 독립 구현했다. 계약 파일은 바꾸지 않았다.
- human-review schema는 scopes/humanDecisions의 내부를 열린 object로 둔다. 소비에 쓰는 id/state/checkpoint/revision/note/actor/decision/time과 중복 범위, 표현 확인의 대상/쪽/의미는 이 소비자에서 추가 검증한다. 생성 의미 전수 검증과 소비 책임의 구분은 기존 대조표의 경계대로 적용한다.

실행 결과·미확인은 PR 본문과 후속 실행 기록에 구분한다. 결정적 테스트의 human 선언은 실제 사람 검수나 업무 품질 인증의 증거가 아니다.
빈 생성 셀의 사람 영역 교정은 생성 report의 gap target과 원래 표 영역에 연결한다. sourceCell을 새로 만들지 않고 quote=''와 그 digest, gapTarget의 originalConversionValue=''·원래 target·교정 전체 이력을 함께 보존한다. 빈 인용은 이 검증된 v1.2 경로에서만 허용하며 일반 인용 누락은 계속 거부한다. 표 셀의 정식 출처 적격은 그 표의 유효한 표현 확인도 필요하다.
v1.2 교정 이력이 있는 출처의 후보 키에는 현재 본문도 포함한다. 같은 원본 병합 셀에서 여러 위치로 투영된 값 중 하나만 교정됐을 때 다른 현재 값들이 한 후보로 합쳐지지 않게 한다. 구버전 후보 키는 그대로다. v1.2 구획은 최종 검사와 같은 문맥·중복 출현 예산으로 나누며, 상한을 넘는 단위는 여전히 차단한다.

저장한 제안·상위 문서를 sourceCli.read로 읽을 때도 등록된 v1.2 provenance 묶음을 공식 inspect로 다시 읽는다. 현재 trace/인용/digest가 저장된 것과 다르면 stale-source-evidence 오류로 차단한다. 인계가 완료에서 미완료로 바뀐 뒤 옛 제안·상위 문서의 reviewed 문자열만으로 내보낼 수 없다. 모델 전용 exportReqif는 호출자가 이미 읽은 snapshot을 검증하는 함수이며 파일 재검증을 수행하는 공개 작업·sourceCli.read와 구분한다.

변경한 커밋과 원본 소비자의 비교 및 실제 실행 결과는 [실행 기록](reviewed-validation.md)에 있다.


## v1.3 독립 reader

v1.3은 이전 판정 함수와 분리된 reader로 review-v13/review-rules-v13 계약을 재계산한다. scope inventory, 내용에 결합된 실제 검사·사람 확인, method v3의 봉인된 쪽 대조 범위·미조사 쪽 사람 confirmed, 현재 표현 규칙 검증, 승인 당시 교정 prefix의 대표·모든 비교 영수증, C0~C9와 발급 배열의 정확한 일치를 모두 요구한다. 교정의 입력 digest도 해당 쓰기 직전 국소 자료에서 다시 계산한다. 현재 원장·발급 파일 문자열을 성공 근거로 대신하지 않는다. v1.2 판정과 golden은 유지한다.

출처의 pageComparisons/machineOnlyPages/ruleApprovals/ruleOpenReceipts/ruleVerifications/expressionReviews는 입력 해시·사람 우선 보고·전체 근거 파일에 남는다. 저장 문서·ReqIF SourceReferences에는 사람이 읽는 요약과 그 파일의 참조·digest를 남긴다. 규칙 승인으로 병합 표의 출처 확인을 인정하는 것은 [설계 12절](design.md)의 가정이며 요구사항 확정은 별도다. 기계 전용 쪽은 글자 대조만 통과한 것이며 제목·읽는 순서·의미 확인으로 표시하지 않는다.

[실제 Host 실행과 한계](v13-first-use.md)를 따른다. 새 화면·기능·성능 작업은 포함하지 않는다. 초기 v1.3 완료 묶음은 최종 쪽 증거가 없어 거부하며 다시 완료 발급해야 한다. 미완료 자료는 근거가 유효하면 초안으로 계속 읽는다.
