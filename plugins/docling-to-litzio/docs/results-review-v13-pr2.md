# 검수 절차 PR 2 — 검증 기록

## 공개 오류 전달

공개 리치오 master `098bd53d9f75d7de4f81067e9db27a700ef93296`의 제작 안내를 읽고 frozen install과 production CLI·Editor 빌드를 수행했다. 처리 코드의 안정된 code/message를 공개 SDK `PluginPublicError`로 내보낸다. 알려지지 않은 예외는 기존 가림 경로를 유지한다. 화면은 code·message·inputIssues를 HTML이 아닌 텍스트로 표시하고 스킬은 message의 다음 행동과 schema 필드 진단을 읽도록 안내한다.

다섯 Host override를 모두 자기 임시 하위 폴더에 지정한 새 격리 Host에 설치했다. 공개 CLI를 통해 다음 네 경로를 확인했다. [기계 결과](pr2-public-errors.json)에 반환 필드와 receipt outcome을 보존했다.

| 입력·사건 | 실제 반환 |
| --- | --- |
| 묶음 ID에 page:2 | code=group-not-found, 목록에서 실제 group ID를 얻으라는 message |
| checkpoint에 contentDigest 누락 | inputIssues의 path=/contentDigest, reason=Required field is missing, outcome=refused |
| 자료 조회→교정→undo로 동일 bytes/revision 복귀→옛 digest 제출 | code=stale-material, 다시 자료를 읽고 검사하라는 message, outcome=uncertain |
| 유효한 v1.2 미완료 인계와 이전 원장에 checkpoint 쓰기 | code=legacy-review-read-only, 새 생성으로 다시 시작하라는 message, 원장 bytes 변경 없음 |

변환 결과는 고정 표본을 복사했고 시험 교정·되돌림은 공식 CLI만 사용했다. 보호 숫자를 바꾸지 않는 결정적 시험 교정이며 실제 AI나 문서 품질 수락이 아니다. v1.2 시험 사본은 reader가 v1.2 미완료로 수락함을 먼저 확인했다. 쓰기 실패의 uncertain을 자동 재실행하지 않았다. 직접 시작한 Host 트리를 종료하고 listener 0개를 확인했다. 사용자 설치·daemon·자료·fixtures는 변경하지 않았다.

## 쪽 대조와 남는 사람 범위

글자 층과 PDF paint를 함께 조사해 봉인한다. 모든 묶음은 실제 범위 검사가 필요하고, 후보가 없고 대조하지 못한 범위도 없는 쪽만 C4의 기계 경로를 얻는다. 제목 계층·읽는 순서·의미는 보지 않는다는 한계를 인계와 화면에 표시한다. reader가 현재 자료와 대조 범위를 다시 계산한다. 그림·스캔·도형·보호 token 대조 불가가 있으면 사람이 보는 쪽에 남긴다. 표 테두리도 면제하지 않는 보수적 정책이다.

사전 리뷰에서 PDF.js의 constructPath 안에 paint opcode가 들어가는데 독립 fill/stroke만 세던 누락을 찾았다. optimized paint와 rawFillPath도 세고, 모르는 path paint는 조사 불가로 남겼다. 실제 text+vector PDF 반례와 합성 operator 회귀를 추가했다. 최종 method 표지가 없는 개발 중 증거는 최종 증거로 수락하지 않는다.

수정한 artifact를 격리 Host에 설치하고 고정 LSR을 새로 생성해 [계수](pr2-lsr-review-counts.json)를 확인했다. 기계 대조만 통과한 쪽은 **2·12·13쪽**, 사람 쪽은 **4~11의 8쪽**이다. 앞 개발 보고의 ‘7쪽 기계 통과’는 paint 누락 때문에 잘못된 값이어서 철회했다. 8쪽은 이전 필수 사람 7쪽보다 줄지 않는다. 수백 쪽에서 사람이 보는 양이 줄었다고 주장하지 않는다. 도형 분류표·테두리 면제 조각은 소유자 지시로 진행하지 않았다.

## 표현 29항목과 규칙 승인

| 종류 | 항목 | 기계 검증 통과 | 사람 결정 단위 |
| --- | ---: | ---: | --- |
| 병합 값 반복 | 10 | 10 | 규칙 1개, 대표 3개 |
| 복합 머리 합침 | 2 | 2 | 규칙 1개, 대표 2개 |
| 머리 역할 평문 표현 | 12 | 12 | 규칙 1개, 대표 3개 |
| 주석 연결·원문 결함 등 검증 불가 | 5 | 0 | 개별 5개 |
| 합계 | 29 | 24 | 규칙 3개+개별 예외 5개 |

표현 결정은 29개에서 8단위로 줄고 대표 열람은 총 8개다. 수식·제목 등 다른 판단은 면제하지 않는다. 승인 시 전체 적용 항목과 대표 비교 자료의 digest·revision을 잠금 안에서 대조한다. 비서는 사람 열람·규칙 승인을 제출하지 않는다. actor는 선언이며 인증되지 않는다는 한계는 그대로다.

사전 리뷰의 두 번째 P1은 비교 쪽이 없는 대표가 다른 대표의 영수증만으로 승인되는 경로였다. 원문 비교를 열 수 없는 항목은 source-comparison-unavailable 개별 예외로 내리고 대표에서 제외한다. 승인은 대표가 하나 이상이며 각 대표의 비교가 하나 이상인 경우에만 가능하다. 유효한 대표를 모두 본 승인도 이 예외를 면제하지 않는 회귀를 넣었다.

현재 항목을 기계로 다시 검증해 통과한 항목만 같은 규칙 승인을 이어 적용한다. 실패·검증 불가·거부/보류 항목은 개별 확인에 남는다. 현재 개별 의미 변경/보류를 규칙 승인으로 덮지 않는다. 과거 승인 증거는 교정 사슬의 해당 changeCount에서 다시 구성한다. replay는 snapshot을 한 번만 복제하고 경로 색인을 써 고리별 전체 복제·find를 없앴다. 130개 편집을 넣은 결정적 검사에서 복제 1회와 기존 rich 투영 결과의 전수 일치를 확인했다. 이것은 130쪽 성능 측정이 아니다.

## 실제 Host·화면과 검사 범위

- 일반 전체 검사(최종 XFA 보완 포함): **238건, 230 통과·8 조건부 생략·0 실패**.
- 소스 빌드 CLI 전체 실행: 223건 중 215 통과·5 corpus 조건부 생략·3 기대값 실패. 새 vector 정책으로 해당 쪽 사람 확인도 바뀌므로 ‘묶음 외 모든 확인 보존’이라는 세 검사 기대를 ‘바뀐 묶음·해당 쪽 무효, 독립 쪽 보존’으로 고쳤다. 같은 세 사건 재실행은 **3/3 통과**. 처리 코드를 이 실패 때문에 바꾸지는 않았다.
- 초기 별도 공식 생성·공개 wrapper·쓰기 경계 검사 22건 통과. 전체 검사는 생성/reader/교정/undo/중단·재개/대표 승인·철회와 P1 회귀를 포함한다. 외부 corpus 조건 검사는 생략했으며 실제 AI는 부르지 않았다.

격리 Host 화면에서 대표 미열람·일부 열람 상태의 승인 비활성, PDF와 DocumentView 준비 뒤 열람 기록 제출, 두 대표를 연 복합 머리 규칙 승인과 ‘규칙 승인으로 확인됨’을 확인했다. 9쪽의 별도 사람 confirmed도 본 쪽 digest로 기록됐다. 근거에는 결정적 동작 시험이며 실제 품질 승인이 아니라고 적었다. 승인 UI 캡처는 이 동작 시험의 기록이며 실제 내용 수락이 아니다.

1440 폭의 [규칙](review-pr2-captures/rules-1440.png)·[쪽 대조](review-pr2-captures/pages-1440.png)·[나란한 원문](review-pr2-captures/compare-1440.png), [640 폭 세로 배치](review-pr2-captures/compare-640.png)를 확인했다. 640 viewport에서 documentWidth=640이었다. 쪽 캡처는 P1 수정 후 새 생성으로 갱신했다. 기존 부품·토큰만 사용하며 승인 가능 여부는 처리 코드가 계산한다. artifact 재설치 중 이전 화면 poll의 HTTP 400 한 번 뒤 새 화면 재선택으로 복구됐고, 승인·확인 동작 중 runtime 예외는 관측되지 않았다. 열린 폴더 밖 DocumentView 오류에서는 열람 기록 버튼이 비활성이었다.

다섯 Host override는 모두 자기 시험 하위 폴더였다. 수정본 설치 뒤 스킬 파일 배치와 실제 공개 CLI 호출을 확인했다. 모든 시험 브라우저와 직접 시작한 Host를 종료하고 trial listener 0개를 확인했다. fixtures·설치된 앱·사용자 daemon·사용자 자료는 변경하지 않았다.

## 멈춘 지점

소유자 지시로 PR 2는 사전 리뷰 P1 두 건과 replay 비용 수정까지만 마무리한다. 추가 사건 변형 검사 확장·통제된 130쪽 시간/계수 측정·도형 분류표·실제 비서 전 범위 재시험은 하지 않았다. 준비용 13/130쪽 합성 생성은 있었지만 수정 전 개발 증거여서 성능·완료 수락 근거로 쓰지 않는다. PR 1 계수보다 좋아졌거나 나빠졌다는 비교도 하지 않는다.

소비자는 현재 v1.0~v1.2만 읽으므로 새 완료 인계는 거부된다. PR 2 병합 뒤 독립 v1.3 reader의 완료 재계산, 출처 모델·입력 해시, 승인/기계 전용 출처 보존·내보내기·회귀만 마지막 조각으로 잇고 멈춘다. [처음 쓰는 안내](../../../docs/owner-first-use.md)도 그때 요구사항 인계까지 갱신한다. 새 소비 화면·기능·성능 작업은 하지 않는다.


## 최종 리뷰 보완 — Type3와 쪽 명령 밖 paint

최종 리뷰에서 Type3 glyph program의 constructPath(fill)이 쪽 최상위 목록 밖에 있어 기계 전용 완료가 가능한 P1을 확인했다. 가장 단순한 보수적 경로로, 사용한 글꼴이 Type3이거나 메타데이터를 확인할 수 없으면 operatorScan=unavailable로 남긴다. glyph program 내부는 분석하지 않는다. 최종 method는 뒤의 XFA 보완을 포함한 optimized-paint-v3이며 이전 개발 증거는 거부한다.

| 점검한 같은 종류 | 현재 처리와 재현 |
| --- | --- |
| Type3 /A의 사각형 fill | 최상위 vectorPaints=0이어도 사람 쪽. [원본 합성 PDF](../test/type3-paint.pdf)와 결정적 생성/완료/reader 회귀 보존 |
| Form XObject | PDF.js가 펼친 paint도 관측되지만 Form 신호가 있으면 조사 불가. 합성 Form PDF 확인 |
| 패턴 | setFillColorN/setStrokeColorN 신호는 내부를 조사하지 않고 사람 쪽. 합성 tiling pattern 확인 |
| 주석 appearance | display 목록에 없는 인쇄 전용까지 getAnnotations(intent=any)로 확인해 사람 쪽. 합성 인쇄 전용 appearance 확인 |
| 투명도 그룹 / soft mask | group/SMask 신호가 있으면 사람 쪽. 합성 soft-mask 확인 |
| 미해석 paint·미해결 글꼴 메타데이터 | 예외는 조사 불가 경로. 미확인/미해결 API 메타데이터는 단위 검사이며 실제 PDF 표본으로 재현했다고 주장하지 않음 |

Type3 재현은 후보 그룹 0개인 1쪽에서 machine-passed가 아닌 requires-human, gate.ready=false, finalize 거부, requireReviewed 거부를 확인한다. 본 자료 digest의 사람 confirmed를 새로 제출한 뒤에만 완료 발급과 reader가 통과한다. 글꼴이 일반 Type1인 대조군은 조사 완료를 유지한다. 이 검사는 리치오 없는 결정적 처리·reader 검사이며 실제 사람 품질 승인·AI·Host 재시험이 아니다. LSR의 쪽 대조 플래그는 수정 뒤에도 같아 기계 전용 2·12·13 / 사람 4~11은 바뀌지 않았다. 새 회귀 7건을 포함한 전체 재실행은 **230건 중 222 통과·8 조건부 생략·0 실패**다. 이번 보완에서 실제 CLI·Host·AI·130쪽 측정은 추가 실행하지 않았다.


## XFA 재리뷰 보완

이전 isPureXfa guard는 XFA 렌더링을 켜지 않은 상태에서 false여서 작동하지 않았다. getMetadata().info.IsXFAPresent를 사용해 XFA 존재를 확인하며, 명시적 false일 때만 XFA 없음으로 인정한다. 확인 실패도 문서의 모든 쪽을 operatorScan=unavailable로 보낸다. XFA 렌더링이나 프로그램 분석은 하지 않는다. method는 v3만 수락한다.

[보존한 합성 XFA PDF](../test/xfa-paint.pdf)는 기본 페이지에 A, AcroForm의 XFA stream에 Different XFA content를 담는다. 렌더링을 끈 실제 PDF.js에서 isPureXfa=false지만 IsXFAPresent=true임을 직접 확인하는 회귀를 넣었다. stream/packet-array 두 표현 모두 실제 PDF에서 unavailable로 내려온다. 후보 0개인 XFA 쪽도 완료 발급과 requireReviewed가 거부되고, 본 쪽 digest의 새 사람 confirmed 뒤에만 통과한다. 미완료 생성물의 기존 읽기도 이 과정에서 유지됨을 확인한다.

다른 visual 구조도 실제 PDF 회귀로 점검했다: Type3(setFont 및 graphics-state Font), Form, 투명도 그룹, fill/stroke 패턴, 인쇄 전용 appearance와 appearance 없는 주석, soft mask. 각 PDF는 텍스트 A가 남은 채 unavailable이 되는 것을 검사한다. 일반 Type1 대조군은 complete를 유지한다. 오류/미해결 메타데이터의 방어 분기는 별도 단위 검사이며 실제 PDF로 유발했다고 적지 않는다. 관련 15건 통과. 실제 Host·AI·130쪽 측정은 추가하지 않았다.

소유자 결정에 따라 **이 PR 이전의 v1.3 완료 묶음은 읽지 않는다. 다시 검수 완료해야 한다.** 계약과 첫 사용 안내에 같은 경계를 명시했고 호환 쓰기·이관은 추가하지 않았다. v1.2 및 미완료 생성물의 읽기 경로를 바꾸지 않는다. 전체 재실행은 **238건 중 230 통과·8 조건부 생략·0 실패**다. 이번 변경분은 CLI·Host·AI·130쪽 측정을 추가 실행하지 않았다.
