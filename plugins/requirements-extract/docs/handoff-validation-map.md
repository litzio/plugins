# 계약 규칙과 소비자 검사 대조

정본은 contracts/docling-to-litzio의 README.md, review-targets.md, corrections.md다. 아래는 규칙별 실행 위치다. schema는 설치 단위 안 사본으로 검사하며 생산자의 코드를 import하지 않는다. 생산자 reader/validateReview를 읽어 대조한 추가 구체화는 마지막 표에 구분했다. 비인증 bytes 무결성 검증이며 서명·원자 snapshot·의미 검수 완료는 주장하지 않는다.

| 계약의 규칙 | 소비자 검사 | 검증 책임 |
| --- | --- | --- |
| README 읽기 1: 명시 버전/status, 잘린 JSON·부재 거부 | provenance.mjs readHandoff/schema/parse | 소비자가 검증함(기존 검사 유지) |
| 읽기 2: 상대 경로, 일반 파일/상위 디렉터리, 중복 경로, 필수 bytes digest | bundleFile/files/json, root realpath | 소비자가 검증함(기존 검사 유지) |
| 읽기 3: generation/revision·생성 receipt/snapshot/losses, 문서 bytes 및 원본 3개 결합 | readHandoff generation-mismatch/revision-mismatch/source-digest/source-record/source-schema | 소비자가 검증함(기존 검사 유지) |
| 읽기 4: selfRef/sourceId·전수 항목/셀·span/text/영역/page bounds·실제 selector·receipt 위치 | inventory/pages/source-identity/source-text/source-cell/regions/target-*·broken-selector | 소비자가 검증함(기존 검사 유지) |
| 원본 parent/children/formatting/hyperlink/meta/captions/footnotes/references/codeLanguage 보존 | source-structure 및 raw sourceCell 전수 비교 | 소비자가 검증함(기존 검사 유지) |
| 읽기 5: 문자·제목·언어·목록 번호 및 손실 전수 | source-native-text/heading-level/code-language/code-text/formula-text/list-start/loss-inventory | 소비자가 검증함(기존 검사 유지) |
| 그림 embedded 원본 bytes·snapshot 및 자산 inventory | asset-original/asset-digest/asset-inventory | 소비자가 검증함(기존 검사 유지) |
| 미주 분리와 noteBinding/noteReferences, native atom에서 원문 표지 재구성 | note-projection.mjs verifyNotes/noteSourceText: 원문 위치·reciprocal·witness·definition·atom label·문자 위치/전체 원문 비교 | 소비자가 검증함(기존 검사 유지) |
| 읽기 6: 처음/마지막 complete 비교 | marker-changed | 소비자가 검증함(기존 검사 유지) |
| 읽기 7: unreviewed/current는 검수 완료 아님, 불확실/삭제/없는 출처 유지 | requireReviewed 거부 및 resolveSource의 경고/eligibleConfirmed=false | 소비자가 검증함(기존 검사 유지) |
| review 파일 schema·원본/생성 revision·PDF digest | provenance.mjs schema, corrections.mjs review-binding | 소비자가 검증함(기존 검사 유지) |
| review provenance/snapshot bytes, evidenceFile, review marker의 report/evidence hash·generation/revision·마지막 표지 | review-digest, review-marker-binding/review-marker-changed | 소비자가 검증함(기존 검사 유지) |
| mapped 수식 전부와 blocking 손실별 근거 포함 | review-integrity.mjs review-formula-coverage/review-loss-coverage | 소비자가 검증함(기존 검사 유지) |
| finding ID 유일, source/selfRef/token 참조·revision/path | review-duplicate-finding/review-source-ref/review-target-revision/review-target-path/review-check | 소비자가 검증함(기존 검사 유지) |
| finding별 필수 evidence 키 | review-evidence-fields; 아래 전체 kind 표 | 소비자가 검증함(기존 검사 유지) |
| PDF 영역의 존재하는 쪽·유한 좌표·정방향 bbox | review-region | 소비자가 검증함(기존 검사 유지) |
| group 1–3쪽 창, 유효 finding과 대표, 모든 finding/page의 포함 | review-group/review-group-coverage/review-page-coverage | 소비자가 검증함(기존 검사 유지) |
| group kinds와 가장 높은 위험 우선순위 | review-group-kinds/review-group-priority | 소비자가 검증함(기존 검사 유지) |
| series의 구성원·대표·pattern·원래 그룹 유지 | review-series/review-series-pattern, folded set | 소비자가 검증함(기존 검사 유지) |
| 통계 전부 재계산 | review-statistics: byKind/pages/findings/groups/groupsPerPage/foldedRows/unavailableChecks | 소비자가 검증함(기존 검사 유지) |
| corrections 1: 1.0/1.1 명시 분기와 필수 파일 | provenance.mjs corrected 분기, schema/json | 소비자가 검증함(기존 검사 유지) |
| corrections 2: 생성 증거의 revision으로 source-native 검사 유지 | baselineRevision·생성 snapshot 선검사, 실제 현재 inspect는 별도 비교 | 소비자가 검증함(기존 검사 유지) |
| corrections 3: chain/revision/changeId/before/단일 receipt/inverse | corrections.mjs history-binding/history-duplicate/history-chain/history-before/history-inverse 및 history schema | 소비자가 검증함(기존 검사 유지) |
| corrections 4: paragraph/cell/equation만, rich/구조/순서 변경 거부, 전체 snapshot 투영·현재 bytes/공식 inspect 일치 | history-target/history-rich-target/history-current, revision-mismatch | 소비자가 검증함(기존 검사 유지) |
| corrections 5: PDF hash·실제 group 대상·check token 전체·scope·보호 토큰 독립 재계산·정확한 undo | history-inverse/history-group/history-findings/history-evidence/history-scope/history-validation/history-protected-tokens/history-undo | 소비자가 검증함(기존 검사 유지) |
| corrections 6: 원본 quote/cell/PDF 유지, 현재 값 별도, 세 evidenceRecheck 의미 유지 | resolveSource 및 SourceReferences; 대상별 첫 before/마지막 after 비교 후 유효 교정만 notice/report.reviewFirst에 표시 | 소비자가 검증함(기존 검사 유지) |
| 원장 필수·pending 거부·changes 순서 전체 비교·submission 상태/후 revision·generation/PDF/scope | history-ledger/history-submission, ledger-changed | 소비자가 검증함(기존 검사 유지) |
| 설명되지 않은 손 편집·누락 receipt·부분 파일 변경은 성공 아님 | digest/chain/current와 원장 교차 검사, 실패 시 반환/완료 게시 거부 | 소비자가 검증함(기존 검사 유지) |

review-evidence-fields의 전체 목록:

| kind | 필수 키 | 검증 책임 |
| --- | --- | --- |
| formula-review-required | reason | 소비자가 검증함(기존 검사 유지) |
| meaning-loss | reasonCode/category/originalValue | 소비자가 검증함(기존 검사 유지) |
| protected-token-difference | selectorKey/pdfValues/nativeValues/missing/extra/confidence | 소비자가 검증함(기존 검사 유지) |
| text-layer-unavailable | selectorKey/reason | 소비자가 검증함(기존 검사 유지) |
| formula-suspicion | reasons/latex | 소비자가 검증함(기존 검사 유지) |
| formula-prose-suspect | reason | 소비자가 검증함(기존 검사 유지) |
| picture-prose-suspect | reason/text | 소비자가 검증함(기존 검사 유지) |
| merged-table-review | mergedRanges/headerRows/reason | 소비자가 검증함(기존 검사 유지) |
| repeated-merged-values | ranges/reason | 소비자가 검증함(기존 검사 유지) |
| empty-table-header | columns | 소비자가 검증함(기존 검사 유지) |
| table-row-width | rowWidths/expected | 소비자가 검증함(기존 검사 유지) |
| source-cell-unavailable | gaps/reason | 소비자가 검증함(기존 검사 유지) |
| unmapped-table-tokens | pdfValues/pdfTokenIds/reason | 소비자가 검증함(기존 검사 유지) |
| source-native-change | selfRef/kind/reason | 소비자가 검증함(기존 검사 유지) |
| furniture-in-body | matchedSourceRefs/text/reason | 소비자가 검증함(기존 검사 유지) |
| reading-order-backtrack | previousSelfRef/reason | 소비자가 검증함(기존 검사 유지) |
| reading-order-caption | captionRef/reason | 소비자가 검증함(기존 검사 유지) |
| unmapped-pdf-text | text/pdfItemId/reason | 소비자가 검증함(기존 검사 유지) |
| heading-basis-low | bookmarkPresence/reason | 소비자가 검증함(기존 검사 유지) |
| geometry-unavailable | reason | 소비자가 검증함(기존 검사 유지) |

## 계약에서 모호한 것: 생산자 코드가 구체화한 규칙

| 문서의 표현 | 생산자의 추가 구체화와 이 소비자의 처리 | 검증 책임 |
| --- | --- | --- |
| 같은 kind/reasonCode 또는 비교 범위 패턴 | pattern은 `kind:(reasonCode ?? selectorKey의 콜론 앞부분 ?? kind)`의 유일한 정렬 집합을 `+`로 결합한다. 같은 방식으로 검사했다. 문자열 포맷은 계약 본문에 없음 | 소비자가 검증함(기존 검사 유지) |
| series 대표·포함/통계 재계산 | groupIds 2개 이상, 다른 series와 중복 소속 금지. foldedRows는 접히지 않은 group 수+series 수, groupsPerPage는 group 수/PDF 쪽 수다. 같은 방식으로 검사했다. 산식은 계약에 명시되지 않음 | 소비자가 검증함(기존 검사 유지) |
| noteBinding/noteReferences 부가 근거 | 생성 label은 `docling-note-`+selfRef 마지막 segment이며 문자/숫자 prefix와 공백을 뗀 정의를 요구한다. reciprocal/witness와 함께 검사했다. 이 label 산식은 계약에 명시되지 않음 | 소비자가 검증함(기존 검사 유지) |

전체 LSR의 미주 분리는 계약이 이미 허용한다. 이전 문서의 “계약 모호점” 판정을 철회하고 소비자의 대응 한계였음을 수정했다. 실제 전체 LSR 교정/undo 묶음을 공식 inspect와 함께 수락했고 복원 상태가 ReqIF에서도 교정 표시로 오인되지 않음을 확인했다. `validation/review-parity.mjs`는 실제 정상 묶음과 재봉인 변형들을 생산자 공개 reader CLI/이 소비자 양쪽에 입력해 거부 차이를 검사한다.

## 소비 경계와 봉인의 신뢰

소비자의 필수 책임은 봉인(완료 표지에 결합된 파일 bytes/digest·지원 버전·generation), 생성 revision에서 공식 현재 문서까지의 사슬과 원장/pending, 실제 읽어 요구사항에 싣는 값의 자기 일관성이다. 생산자의 생성 의미 검증 전체를 복제하지 않는다. 유효한 봉인을 다시 맞춘 의도적 위조는 검증 대상이 아니다. 기존에 구현한 추가 검사는 유지하지만 그것을 모든 생산자 검증의 동등성 보장으로 확대하지 않는다. 앞 표의 “소비자가 검증함”은 열거한 검사의 실제 범위를 뜻한다.

| 규칙/같은 사실의 표현 | 검증 책임 | 범위와 이유 |
| --- | --- | --- |
| native text와 content(미교정 셀·미주 정의·문단·제목·캡션 포함) | 소비자가 검증함 | projection-consistency.mjs가 실제로 소비하는 전체 snapshot/현재 inspect를 순회해 인라인의 평문 투영과 text를 대조. marks가 없는 요약에 marks를 추측하지 않음 |
| targets.text/document.blocks.text와 snapshot의 값 | 소비자가 검증함 | 기존 target-text/block-inventory 검사 유지. quote/sourceCell은 생성값이며 현재 교정값과는 사슬로 구별 |
| 손실 목록 내부의 sourceId·targets가 정확한 원본 소유자를 가리키는지 전체 검증 | 생산자의 봉인을 신뢰함 | 생산 시 의미 검증의 책임. 기존 schema/loss-inventory 및 소비 시 경고 전달은 유지 |
| 원본 구조 formatting의 실제 native 인라인 서식 생성이 전부 올바른지 | 생산자의 봉인을 신뢰함 | 원본→생성 서식의 의미 검증 전체는 재구현하지 않음. 기존 source-structure 비교와 text/content 자기 일관성 검사는 유지 |
| tableModel.headerRows와 원본으로 표 전체를 다시 생성해 비교 | 생산자의 봉인을 신뢰함 | 생성 표 모델의 검증은 생산자가 봉인 전에 수행. 기존 머리 기여·병합 범위·셀 span/문자/위치 검사는 유지 |
| 모든 셀 target이 생산자의 표 투영 규칙에 따른 유일한 정확한 소유자인지 | 생산자의 봉인을 신뢰함 | 표 변환 알고리즘 전체를 소비자에 복제하지 않음. 실제 읽는 target의 위치·문자·인라인 일관성 및 기존 원본 셀 검사는 유지 |
| 대상의 전체 교정 이력(되돌림 포함)과 현재 유효 교정 표시 | 소비자가 검증함 | trace.corrections는 대상의 전체 changes. correctionState/Notice는 대상별 첫 before와 마지막 after 비교로 별도 판정 |

계약에서 모호한 것: 현재 contracts/에는 위 봉인/사슬/소비값 자기 일관성과 생산 시 생성 의미 검증의 책임 구분이 명시돼 있지 않다. 소유자가 이번 리뷰에서 정한 경계를 적용했으며 계약 파일은 수정하지 않았다. review-parity 검사는 특정 변형군의 관측 결과이며 모든 생성 의미 변형에 대한 생산자/소비자 동등성 선언이 아니다.
