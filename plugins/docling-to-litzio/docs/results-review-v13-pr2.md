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

## 기계 대조 증거 준비

PDF 글자 층과 별도로 raster 이미지·vector paint의 존재 및 operator scan 실패를 기록한다. 글자 층이 없거나 구분하지 못한 그래픽 영역이 있으면 기계 통과로 올리지 않는 보수적 정책이다. vector paint에는 표 테두리도 포함될 수 있으므로 사람에게 남는 실제 양을 별도로 보고해야 한다. 제목 계층·읽는 순서·의미는 기계 대조의 범위가 아니라는 한계를 기록한다.

새 page-coverage와 그 봉인을 생성 원본/PDF 증거에 결합한다. 정식 review 폴더에서는 PDF 증거·탐지·검수 표지와 함께 complete 파일 집합에도 포함한다. 부분 변경·누락은 거부한다. 쪽·source·check 색인은 호출 안에서 만들며 호출 사이 판정 캐시는 두지 않는다.

현재 이 증거 수집과 규칙 검증기의 단위 검증을 진행했다. 기계 통과의 완료 조건 연결, 규칙 승인 기록·대조 화면·최종 인계와 규모 측정은 아직 완성·수락했다고 표시하지 않는다. 부하를 통제한 130쪽 측정은 준비 후 오케스트레이터의 측정 시작 답을 받은 뒤 실행한다.


## 완료 조건 연결 중간 검증

쪽 기계 대조의 C4 대체 경로, 대조 불가 쪽의 사람 결정, 규칙 대표 열람·승인과 C5/C7을 처리 코드와 reader에 연결했다. 규칙 승인 당시 자료는 검증된 교정 사슬의 해당 changeCount에서 다시 계산한다. 승인 뒤 항목이 바뀌면 현재 기계 검증이 통과한 항목에만 승인을 이어 적용한다. 개별 보류/의미 변경은 규칙 승인으로 덮지 않는다.

관련 회귀 90건이 통과했다. 규칙 대표 미열람 거부, assistant 승인 거부, digest 누락·변경 거부, 승인→교정 실패→undo 재검증→중단·재개→승인 철회, 완료 reader의 독립 재계산을 포함한다. 일반 전체 검사에서 새 사람 쪽 기록을 전역 무효화해야 한다고 가정하던 세 사건 검사를 발견해, 실제로 바뀐 묶음 확인만 무효이며 독립 쪽 확인은 보존된다는 요구로 고쳤다. 앞 전체 실행 결과 217건 중 206 통과·3 실패·8 생략이며, 수정한 세 건을 포함한 위 90건 재실행은 모두 통과했다. 최종 전체 검사는 뒤에 다시 기록한다. 화면·공개 작업 배선·실제 Host 승인 흐름과 통제된 규모 측정은 아직 진행 중이다.
