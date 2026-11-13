# PR 19 독립 리뷰: 완료 판정과 무효화

## 변경

완료 조건을 [계약의 C0–C9](../../../contracts/docling-to-litzio/human-review.md)에 일대일로 적었다. 발급과 인계 재검증이 동일한 completionGate → completionRequirementsMet를 쓴다. 인계/PDF/명시적 상태 증거가 없으면 통과시키지 않는다. 공식 check 실패도 발급을 거부한다.

- 마지막 교정이 undoOf이면 human-source-region 면제가 아니다. 999를 사람이 0.12 s로 고쳤다가 되돌리면 999는 다시 원래 PDF token 검사를 받는다. checkpoint/사람/표현 확인을 모두 다시 제출해도 tokenDifferences가 남아 완료 발급과 require-reviewed가 거부된다.
- 필수 목록 밖 일반 그룹도 현재 revision의 마지막 명시적 deferred가 있으면 막는다. stop/resume와 새 checkpoint는 보류의 명시적 해제 대신이 아니다.
- stop과 resume는 모두 완료와 검수 확인을 무효화하고 전 범위를 재검사로 둔다. resume만으로 과거 완료가 되살아나지 않는다. 새 범위·확인 뒤 명시적으로 재발급해야 한다.
- 교정/되돌리기/외부 revision 관측/사람 결정/표현 결정/그룹·쪽 검사 재개/uncertain/stop/resume를 사건 표로 점검했다. 관련 확인은 invalidatedAt으로 무효화하며 이력을 삭제하지 않는다. 독립 확인을 보존하는 경우도 표에 명시했다.
- actor는 인증되지 않은 선언이다. assistant라고 선언한 경로의 제한은 검사하지만 실제 비서가 human을 선언하는 것을 구조적으로 막지 않는다. 스킬이 이 우회를 금지하며 소비자는 인증된 사람 승인으로 표시하면 안 된다.
- 테스트 입력 fixture와 저장소 소유 스크립트를 테스트 모듈 위치에서 해석한다. 외부 CLI/사용자 입력 경로의 상대 경로 의미는 유지한다.

## 변형·회귀 검사 58건

| 종류 | 건수 | 확인한 것 |
| --- | --- | --- |
| C0–C9 증거를 false/누락으로 하나씩 변형 | 20 | 명시적으로 모두 true인 경우만 통과 |
| 완료 상태에서 사건 하나씩 실행 | 16 | 교정·undo·사람/표현 결정·stop/resume·checkpoint·uncertain·외부 변경 뒤 완료와 인계 무효 |
| 진행 원장의 조건 하나씩 위반 | 14 | 발급과 require-reviewed가 모두 거부 |
| 봉인 문서/PDF 증거 손상 | 2 | 발급과 인계가 모두 거부 |
| 추가 회귀·재발급 | 6 | undo 뒤 재검수도 오답 차단, 일반 보류, 누락 인계/PDF/상태 증거, 공식 check 실패, stop/resume 후 명시적 재발급, 중단 뒤 일반 보류 보존 |

교정·완료는 공개 PDF에서 추출한 고정 증거와 단위 검사 편집기를 사용한 합성 상태 전이 검사다. 실제 AI 검수나 문서 전체 품질 인증이 아니다. 기존 완료 LSR 표본은 강화된 reader의 require-reviewed에서도 계속 수락됨을 별도로 확인했다.

저장소 루트 전체 검사: **132개 중 124 통과, 8 환경 skip, 실패 0**. 플러그인 폴더 npm test도 실행했고, 최종 격리 source-built CLI 지정 실행은 **132개 중 127 통과, 5 corpus 환경 skip, 실패 0**이다. 변형·회귀 58건은 모두 통과했다. 별도 Host/브라우저/변환 서버/실제 AI 호출은 시작하지 않았고 fixtures·다른 플러그인·진행 기록은 변경하지 않았다.
