# PR 5 추가 정책·사람 근거 교정 검증

이 문서는 초기 [대조 검증](results-compare.md)의 차단 손실 정책과 LSR 완료 미수락 부분을 갱신한다. 소유자가 돌아와 사용하며 조정할 가정으로 구현했다. 공개 master의 같은 격리 소스 빌드와 공개 CLI/SDK 계약을 사용했다. 새 pickPath/openDocument는 이번에 섞지 않았다.

## 손실 분류와 기록

[29건 분류 표](lsr-loss-classification.md): 형식 투영 24건과 번호 미주 표현 1건, 본문이 보존된 연결 없는 주석 4건이다. 네 주석의 본문은 일반 문단 37/40/100/101에 원문 그대로 있다. 생성 규칙은 이미 본문을 보존하므로 생성 결과 bytes/경로는 바꾸지 않았다. Route A/B의 중복 a 표지는 원문의 결함으로 기록한다. 본문을 보존하지 못하거나 알려지지 않은 손실은 해소 대상으로 둔다.

화면은 선택 source의 각 손실을 원문 셀/범위/값과 함께 보여 준다. 항목별 뜻 보존/뜻이 달라짐/보류만 있으며 전체 면제 버튼은 없다. 확인은 source/group/current path/원문 쪽/revision/changeCount에 결합되고, v1.2 human-review에 원본 손실·현재 대상·확인 범위와 함께 실린다. 연결 없는 주석의 확인은 호출 소유를 확정하는 것이 아니다.

## (가) 결정적 제출로 확인한 완료 발급 경로

- 격리 Host에서 기존 LSR 변환 사본의 주입 오류 두 건을 token 근거로 복원한 생성본을 사용했다. PDF·fixtures는 불변이다.
- 사람 원문 영역 근거로 교정 7건을 공식 apply-batch/inspect/readback까지 확인했다. PDF5쪽의 두 병합 수식 영역은 현재 표 33의 네 칸에 반복한 인라인 math로 넣었다. PDF11쪽 표 94의 두 빈 수식 셀도 채웠고, 식 95는 세제곱근·합 상한 9와 항 지수 3으로 교정했다. 혼입 문장은 별도 문단 96에 이미 온전히 있어 새 문단 생성/삭제는 하지 않았다.
- 공개 help의 update-table-cell --content는 inline math를 지원한다. 독립 작은 문서에서 실제 math 구조의 저장/inspect를 먼저 확인했고, LSR에서도 실제 DocumentView로 확인했다. 새로운 셀 연산이나 내부 writer는 만들지 않았다.
- 재확인은 human-source-region / protectedTokens=false로 표시한다. 기계 token 확인 두 건과 사람 영역 확인 일곱 건을 인계에서 구별한다. 원문 영역 근거 없이 빈 셀 채우기, 비서의 빈 셀 채우기, 비서의 human-source-region 사용은 거부한다.
- 29건의 표현 확인을 항목별 공개 작업에 기록했다. UI에서 주석 다섯 항목과 마지막 표 항목의 확인/보류를 실행했고, 나머지 항목은 같은 공개 loss-decision으로 결정적 제출했다. 모든 비교 자료는 공개 compare/material에서 받았다.
- 현재 묶음·쪽 checkpoint와 필수 사람 결정을 결정적으로 제출한 뒤, 표현 확인 **하나가 없을 때** gate.ready=false / expressionUnconfirmed=1, 완료 발급 뒤 읽기에서도 reviewComplete=false와 completion 부재를 확인했다. 보류로 바꾼 경우도 같았다. Host는 실패한 쓰기 receipt를 uncertain으로 주므로 그 receipt만으로 거부를 단정하지 않고 진행 상태를 다시 읽었다.
- 마지막 표현을 확인하자 모든 gate가 0이 됐다. 실제 화면의 검수 완료 버튼으로 발급한 뒤 공개 reader --require-reviewed가 reviewed/1.2.0으로 수락했다. revision은 [기계 결과](human-policy-results.json)에 기록했다.
- 완료 묶음의 별도 사본에서 마지막 공식 교정을 되돌렸다. applied를 확인했고 표현 확인 29건 전부가 무효가 됐으며 reviewComplete=false, require-reviewed 거부를 확인했다. 원래 완료 수락 표본은 그대로 보존했다. 같은 bytes로 되돌아오는 경우도 changeCount로 과거 확인 재사용을 막는다.

기본 전체 검사: **74개 중 66 통과, 8 skip, 실패 0**(공식 CLI/corpus 환경 미지정). 격리 실제 CLI의 교정/완료 검사 **17개 통과, skip 0**. 이후 최신 빈 셀 거부 단위 검사를 포함한 사람 검수 검사 5개도 통과했다. 새 검사에는 미확인/보류/뜻이 달라짐, revision/편집 횟수 무효화, 알려지지 않은 손실의 보수적 분류, 잘못된 대상/쪽 거부, 사람 근거 inline math 수락·표시·정확한 되돌리기가 있다.

## (나) LSR의 실제 품질 수락

위 결과는 결정적인 수락 시나리오이며, checkpoint note에도 이 검증의 성격을 남겼다. **실제 AI를 호출한 전 범위 검수나 실사용 무오류 수락은 아니다.** 새로 확인한 빈 수식 셀/복합 식과 각주 본문 보존은 처리했지만, 제목 계층 전수 정확성, 표4 머리의 위첨자 107과 값의 구분·주석 적용 범위, 문서 전체 의미·읽는 순서와 사람 부담의 최종 판정은 남아 있다. 생성 report의 후보를 지우거나 이 수락으로 업무 승인을 부여하지 않는다. 추가 실제 품질 검수에서 내용 차이가 확인되면 해당 범위를 보류하고 교정해야 한다.

DocumentView의 표 셀 전체 강조, 수식/미주 초기 스크롤, 폭 변경 뒤 위치 제한은 그대로다. 제품 코드에서 내부 DOM 우회를 하지 않았다. 공개 pickPath/openDocument 전환은 다음 조각이다. requirements-extract는 읽기만 했으며 [v1.2 소비자 변경](../../../contracts/docling-to-litzio/human-review.md)을 따라야 한다.

## 캡처

[사람 교정 뒤 실제 표 수식 대조](assets/compare/inline-math-1440.png), [항목별 표현 보존 기록](assets/compare/expression-confirmation.png), [현재 revision 완료 표시](assets/compare/completion-banner.png).

원본·다른 플러그인·사용자 설치와 daemon·사용자 자료는 변경하지 않았다. 시험 Host 프로세스 트리와 브라우저를 종료하고 시험 포트 listener 0개를 확인했다. 임시 경로와 계정은 기록하지 않는다.
