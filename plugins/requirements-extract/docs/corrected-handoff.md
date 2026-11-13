# 교정본 인계 소비

complete의 1.0.0은 기존 생성 검사를 그대로 사용한다. 1.1.0은 생성 snapshot/receipt/provenance/losses를 생성 revision으로 검사한 뒤 history를 현재 snapshot까지 투영한다. 원본 문자·셀·PDF 위치 검사를 생략하지 않는다. 현재 공식 inspect 전체와 투영 전체가 일치해야 한다. 미지 버전·pending·설명되지 않은 편집은 거부한다.

교정 원장은 history와 순서대로 전체 비교하고 제출 상태·revision·scope·PDF hash를 확인한다. 읽기 전후 원장 bytes와 완료 표지를 비교한다. 생성 review schema와 bytes digest, generation/revision, PDF hash를 검사한다. 각 change의 대상·before·inverse·단일 receipt·근거 check의 token 전체·실제 검사 좌표·validation을 독립적으로 검사한다. 원장은 서명이나 인증 수단이 아니다.

현재 후보 본문은 currentSnapshot에서 읽는다. 출처 quote/sourceCell은 원본 그대로이며 현재 targets와 구별한다. trace.corrections는 target/before/after/evidence/validation과 나머지 change 기록을 보존한다. `원본 변환값과 다르게 교정됨(근거 있음)`을 trace와 report.reviewFirst에 표시한다. ReqIF SourceReferences의 정규 JSON에도 같은 정보가 포함된다. 세 evidenceRecheck 값은 의미를 바꾸지 않고 전달한다. 토큰 일치는 의미 정확성이나 검수 완료가 아니다. 생성 인계는 계속 unreviewed이며 정식 내보내기를 차단한다.

## 검증

- 고정 합성 v1.0의 bundle/source 직렬화 bytes는 변경 전 consumer와 비교하여 golden SHA-256으로 고정했다.
- 합성 교정 표본에서 현재 값/원문 인용/우선 검토/시험 ReqIF 출처 보존을 확인한다. 문서만/history만/원장만 변경, 재봉인된 잘못된 사슬·대상·receipt·근거·validation·pending·제출 누락·설명되지 않은 전체 snapshot 차이를 거부한다.
- 공개 Litzio master `877850887ca61bfe8c23c29e6d652aa51bae0e9a`를 별도 임시 checkout에서 빌드했다. 생산자의 공개 PDF 표본 기반 결정적 교정 시험을 실제 CLI로 실행했다. 전체 LSR은 아래 미주 표현 문제로 소비 거부됨을 확인했다.
- 생산자 시험의 작은 한 셀 원본(공개 PDF의 `0.12 s` 위치에 변환값 `999`를 둔 처리 표본)을 공식 생성/검수/교정 경로로 실행했다. 공식 receipt와 현재 inspect를 가진 v1.1 묶음을 소비하여 `verified-protected-tokens`와 원본 인용 `999`, 현재 값 `0.12 s`를 확인했다. 원본 변환 서버는 실행하지 않았다. 시험 ReqIF를 표준 검증 대상으로 사용했다.
- 실제 묶음 재검증: `node validation/corrected.mjs BUILT_CLI HANDOFF NEW_REQIF`. CLI 실행 환경의 LITZIO_DATA_DIR, LITZIO_ASSISTANT_CWD, LITZIO_ASSISTANT_SETTINGS_FILE은 모두 격리된 임시 작업 영역으로 지정한다.

실제 생성물은 PDF/전체 검수 파일까지 포함하므로 fixtures에 중복 보관하지 않았다. 단위 검사는 독립 합성 파일을 매번 만든다. 설치·화면·AI 품질·ALM은 검증하지 않았다. Host나 daemon을 시작하지 않았으며 사용자 설치와 자료는 변경하지 않았다.

## 계약에서 모호한 것

전체 LSR 생성 묶음의 한 셀에서 원본 `≥ 0.932 u a`가 native의 `≥ 0.932 u `와 별도 미주로 표현된다. 기존 소비자의 source-native 문자열 검사는 이를 거부한다. v1.1이라고 예외를 추가하거나 전체 source-native 검사를 끄지 않았다. 원본 미주 문자의 대응과 재구성 규칙을 계약에 명시하기 전 이 표본은 소비 불가다. 이는 교정 이력 사슬의 수락과 별개의 생성 표현 문제다.

교정 원장은 JSON Schema 정본이 없으므로 corrections.md의 필수 의미 검사로 대조한다. scope 처리 상태는 검수 완료 권위로 사용하지 않는다.
