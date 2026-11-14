# v1.3 기계 대조와 표현 규칙 승인

이 문서는 [내용 결합](review-v13.md)에 덧붙인다. 새 완료의 정본은 `plugins/docling-to-litzio/schema/human-review-v13.schema.json`이다. 기존 v1.0~v1.2 파일의 의미와 검증은 그대로다. 생산자와 소비자는 서로의 코드를 import하지 않는다.

## 쪽 대조 증거

`review/page-coverage.json`과 `review/page-coverage-complete.json`의 닫힌 JSON 모양은 각각 같은 이름의 schema 파일이 정본이다. 생성 검수 때 PDF operator와 글자 층을 조사하고 두 파일과 기존 review 3파일 모두를 complete.json 파일 집합으로 봉인한다. 새 완료는 쪽 증거가 필요하다. 한 호출의 검증된 bytes로만 판정한다.

`method`는 `pdfjs-6.5.438-text-and-optimized-paint-v3`이다. 이 표지가 없는 개발 중 증거는 최종 대조 증거로 수락하지 않는다. 쪽마다 textLayer=available/unavailable, operatorScan=complete/unavailable, rasterObjects/vectorPaints의 정수 개수, notCompared를 기록한다. notCompared는 순서대로 missing-text-layer, operator-scan-unavailable, raster-content, vector-painted-content 중 해당 값을 넣는다. raster는 PDF.js OPS 이름이 `^paint.*Image`에 맞는 호출 수다. vector는 stroke/closeStroke/fill/eoFill/fillStroke/eoFillStroke/closeFillStroke/closeEOFillStroke/shadingFill/rawFillPath 호출 수다. PDF.js 6이 최적화한 constructPath의 argsArray[index][0]에 담긴 같은 paint opcode도 센다. endPath는 칠하지 않는 경로이므로 세지 않고, 모르는 constructPath paint는 operatorScan=unavailable로 남긴다. 개수가 0이 아니면 해당 내용을 글자 대조가 검증했다는 주장을 하지 않는다. 영역 위치를 추정하지 않고 whole-page로 남긴다. semanticLimits는 항상 `["heading-hierarchy","reading-order","meaning"]`다.

기계 전용 인정은 조사할 수 있었던 명령에 한한다. 다음 구조가 있거나 그 조사가 실패하면 operatorScan=unavailable로 기록해 사람이 볼 쪽으로 남긴다. 내부를 재귀 분석해 면제하지 않는다.

| 구조 | 확인하는 신호 | 처리 |
| --- | --- | --- |
| Type3·확인 불가 글꼴 | setFont 또는 setGState.Font의 font ID가 가리키는 메타데이터에서 isType3Font가 true, boolean 확인 불가, 미해결 객체 또는 isInvalidPDFjsFont=true | 글자 프로그램을 읽지 않고 unavailable |
| Form XObject·투명도 그룹 | paintFormXObjectBegin/End, beginGroup/endGroup | 펼쳐진 명령이 있어도 전체 구조는 unavailable |
| 패턴 | setFillColorN/setStrokeColorN | pattern 내부 명령을 조사하지 않으므로 unavailable |
| soft mask | setGState의 SMask 항목 | 내부 명령을 조사하지 않으므로 unavailable |
| 주석 appearance | beginAnnotation/endAnnotation 또는 getAnnotations(intent=any)의 한 건 이상 | 숨김·인쇄 전용·appearance 없는 주석도 unavailable |
| XFA 존재 또는 확인 불가 | 문서 getMetadata().info.IsXFAPresent가 명시적 false가 아님(호출 실패 포함) | 렌더링을 켜지 않아도 채워지는 존재 정보로 판정. XFA 렌더링·내부 분석 없이 문서의 모든 쪽을 unavailable |
| 미해석 paint 구조 | paintXObject/beginInlineImage/beginImageData/endInlineImage, 모르는 constructPath paint, 조사 예외 | unavailable |

rasterObjects/vectorPaints는 조사한 쪽 명령에서 관측한 수다. unavailable일 때 0은 조사하지 못한 내부 paint가 없다는 뜻이 아니다. v3 method만 수락하므로 Type3/XFA를 놓쳤던 개발용 v1/v2 증거는 완료 근거가 되지 않는다.

봉인의 generationId/baselineRevision/PDF SHA-256은 생성 증거와 같아야 한다. evidenceSha256/coverageSha256은 각 파일의 실제 bytes SHA-256이다. 쪽 개수·순서·번호와 textLayer는 봉인된 PDF evidence와 같아야 한다. notCompared는 위 상태·개수에서 다시 계산한다. 한 파일만의 변경·누락은 실패다.

`human-review.json.pageComparisons`는 각 쪽에 대해 schema에 있는 필드를 빠짐없이 갖는다. pageNo 오름차순이다. contentDigest는 현재 쪽 결합, baselineDigest는 생성 snapshot/provenance와 같은 page-coverage를 사용한 쪽 결합이다. groupIds는 report 순서다. checked는 `["protected-number-unit-sign-identifier-tokens","unmapped-pdf-text-detection"]`이며 checks는 그 쪽 source의 check 수, pdfTokens는 그 check들의 pdfTokenIds 길이 합(중복 포함)이다. 그림 source가 그 쪽에 있으면 docling-picture, 해당 check 중 status!=available이 있으면 unavailable-protected-token-scope를 notCompared 뒤에 추가한다.

상태의 우선순위는 다음과 같다. (1) notCompared가 비어 있지 않으면 requires-human. (2) 후보 그룹이 있거나 현재 digest가 baselineDigest와 다르면 candidates-or-content-change. (3) 나머지만 machine-passed다. machine-passed는 글자 대조만 통과한 것이며 제목·읽는 순서·의미의 검수 완료라는 뜻이 아니다.

C4는 각 묶음의 유효 실제 checkpoint를 요구한다. 각 쪽은 유효 실제 checkpoint, machine-passed, 또는 requires-human 쪽의 유효 사람 confirmed 중 해당 경로로 충족한다. requires-human은 비서 checkpoint로 해소하지 않는다. C5 사람 목록에도 이 쪽을 넣는다. 모든 쪽 대조 기록을 완료 인계에 넣고 reader가 다시 계산해 전수 대조한다. 저장된 machine-passed 문자열만 믿지 않는다.

## 사람 쪽 자료와 digest

`page-compare`는 requires-human 쪽만 열 수 있다. 자료 필드 목록은 아래 표와 정확히 같아야 하며 새 필드에 정책이 없으면 실패다. 묶음과 같은 H 정의를 쓴다.

| 필드 | 내주는 값 | 결합 투영 |
| --- | --- | --- |
| contentDigest | 아래 투영의 H | 자기 자신 제외 |
| documentRevision | 현재 snapshot revision | hash 제외, 제출 때 inspect·원장 revision과 대조 |
| generationId, sourceHash | 생성 ID, PDF SHA-256 | 같은 키 문자열 |
| sources | 해당 쪽 regions가 있는 item을 sourceId 문자열순으로 `{item,checks}`. checks는 그 source의 report 순서 배열, 없으면 null | sources=`[sourceId,H(item),checks===null?null:H(checks)]` 배열 |
| blocks | source targets/cells.targets의 path[0] 중복 제거·숫자순 `{path,nodes}`. nodes는 원래 snapshot 순서 전체 | blocks=`[path,nodes.length?H(nodes):null]` 배열 |
| pages | 해당 PDF page 전체 하나 | pages=`[pageNo,H(page)]` 배열 |
| extra | 해당 page-coverage 기록을 `{comparisonCoverage:page}`로 감쌈, 없으면 null | 같은 값 |

이 투영은 기존 내부 쪽 결합과 같다. 쪽 자료에 국소/전체 교정 이력은 없다. 사람 결정의 groupId는 이 경우 `page:N`이며 revision과 contentDigest 모두 현재 쪽 자료와 같아야 한다.

## 기계 검증하는 규칙

규칙 version은 1.0.0이다. 규칙이 없거나 검증할 수 없는 항목은 개별 확인에 남긴다. 공개 원본의 주석 연결과 원문 결함은 규칙 승인으로 면제하지 않는다.

| ruleId | title | method | 검증 |
| --- | --- | --- | --- |
| merged-cell-repeated | 병합 범위의 값을 출력 칸마다 반영 | source-span-to-all-output-cells-with-ordered-header-composition | 원본 병합 범위의 모든 출력 좌표가 원본 값과 정확히 같은가. 합쳐진 머리 좌표는 아래 순서 합성 값과 대조 |
| compound-header-flattened | 복합 머리를 순서대로 합침 | ordered-unique-source-header-cells-joined-by-space-en-dash-space | 모든 출력 머리 칸이 원본 위→아래의 서로 다른 셀 내용을 ` – `로 잇는 값과 정확히 같은가 |
| table-header-role | 머리 역할을 평문 셀로 표현 | source-cell-value-and-output-coordinate-preservation | 원본 대상 셀의 모든 출력 좌표가 원본 값(머리는 위 합성 값)과 정확히 같은가 |

좌표는 원본 row/column span으로 독립적으로 재구성한다. 겹치거나 범위를 벗어나면 unverifiable다. 첫 연속 column_header 행들을 합치되 표 전체가 머리면 1행으로 취급한다. 출력 r=원본 r<headerRows이면 0, 그 밖에는 r-(max(1,headerRows)-1)이다. 원본/출력 text는 정규화 없이 정확히 비교한다. 현재 content와 생성 당시 content도 H가 같아야 하므로 같은 평문으로 바꾼 수식·mark 변화를 통과시키지 않는다. 검증 대상이 없거나 값이 다르면 failed다. 실패 항목은 개별 확인으로 남긴다.

각 검증 항목의 contentDigest=H({lossId,source,checks}). source는 원본 해당 cell 전체, 복합 머리는 열별 `{indices,text}` 배열이다. checks는 출력 row/column 순서 중복 좌표 제거 후 `[row,column,expectedText,actualText,richPreserved,currentCellNode]`다. richPreserved는 현재와 생성 content(없으면 null)의 H 일치다. 없는 actualText는 null이다. status/reason/checkedCells/complexity는 완료 schema의 닫힌 필드를 따른다. 병합·역할 complexity는 row_span*col_span, 복합 머리는 headerRows*num_cols다.

기계 검증이 통과했어도 해당 source의 원문 쪽을 여는 comparisons가 하나도 없으면 status=unverifiable, reason=source-comparison-unavailable로 내려 개별 확인에 남긴다. 이 항목은 승인으로 면제하지 않는다. 대표는 해당 규칙의 verified 항목 중 complexity 내림차순, lossId 문자열 오름차순으로 최대 3개다. 1~2개뿐이면 모두다. 실패 항목을 대표로 골라 전체를 승인하지 않는다. policyDigest=H({ruleId,version,title,method})다.

## 규칙 자료·열람·결정 기록

규칙 자료는 ruleId/version/title/method/policyDigest/members/representatives/generationId/documentRevision/contentDigest의 닫힌 객체다. members는 loss catalog 순서의 같은 ruleId 검증 항목 전부(실패 포함)다. representative에는 lossId/contentDigest/sourceId/targetPaths/comparisons가 있다. targetPaths는 loss.targets 순서다. comparisons는 해당 source를 포함하는 report 그룹들의 pageNos 합집합 숫자순이며 쪽마다 report에서 먼저 나온 해당 그룹의 `{groupId,pageNo,contentDigest}`다. 이 contentDigest는 이웃·국소 이력을 포함한 실제 묶음 자료 digest다. 자료 contentDigest=H(자기 contentDigest와 documentRevision을 뺀 객체)다. 따라서 대표뿐 아니라 **모든 적용 항목**과 대표가 보는 문맥이 결합된다.

사람은 대표의 모든 comparisons에 대해 대조 화면에서 PDF와 현재 문서가 열린 뒤 rule-open을 제출한다. ruleContentDigest는 본 규칙 자료의 값, contentDigest는 본 묶음 자료의 값이다. 처리 코드는 잠금 안에서 현재 revision·두 digest·대표 membership을 검증한다. openId는 caller가 만든 고유 ID다. ruleOpens의 필드는 완료 schema에 정확히 정의한다. actor=human은 선언이며 인증이 아니다. 비서는 열람·사람 결정·승인을 제출하지 않는다.

rule-decision은 approved/deferred/rejected와 비지 않은 note, 본 규칙의 contentDigest, 실제 열람 영수증 openIds를 받는다. approved는 대표가 하나 이상이고 **각 대표에 비교가 하나 이상** 있어야 하며, 당시 대표의 모든 comparison에 서로 다른 유효 영수증 하나씩이 있어야 한다. 없으면 거부한다. deferred/rejected는 항목별 확인으로 남긴다. 결정은 policyDigest/memberIds/contentDigest/revision/changeCount/actor/time을 보존한다. 같은 규칙의 이전 결정은 invalidatedAt을 찍고 최신 결정만 선택한다. 이전 승인 자동 복구는 없다.

reader는 승인 당시 changeCount까지 검증된 교정 사슬을 재투영해 그때의 규칙·대표·자료 digest를 다시 계산하고 영수증을 대조한다. 현재도 policyDigest와 memberIds의 순서 배열이 같아야 한다. 현재 각 항목을 다시 기계 검증해 verified인 항목만 ruleConfirmation을 받는다. 항목 내용이 바뀌어도 재검증을 통과하면 같은 승인이 이어지고, 실패하면 그 항목만 개별 확인으로 내려온다. 대표 문맥의 사후 변화만으로 이미 승인한 규칙 자체를 새 규칙으로 보지 않는다. 새 제출은 언제나 현재의 전체 자료 digest와 같아야 한다.

C7은 유효 meaning-preserved 개별 확인 또는 현재 검증에 성공한 규칙 승인으로 충족한다. 현재 개별 meaning-changed/deferred가 있으면 규칙 승인으로 덮지 않는다. C5의 meaning-loss/merged-table-review는 관련 모든 손실이 규칙 승인으로 덮인 경우만 그 표현 위험을 해소하며 formula/heading/판단불가/명시적 사람 deferred를 면제하지 않는다. C0~C3/C6/C8/C9는 여전히 모두 필요하다.

완료는 pageComparisons/ruleOpens/ruleDecisions/ruleReviews와 expressionReviews[].ruleConfirmation을 추가로 봉인한다. ruleReviews.rules는 규칙 자료+현재 유효 decision(없으면 null), items는 각 검증 항목+ruleConfirmation(없으면 null)이다. 개별 confirmation은 규칙만으로 확인됐으면 null이다. reader는 원장 원본 배열과 완료 배열의 정확한 일치, 현재 재계산된 모든 파생 기록의 일치, C0~C9를 함께 요구한다. 성공의 증거가 없으면 false다.


## 독립 소비에 필요한 파생 항목의 닫힌 값

검증 결과의 reason은 다음 우선순위로 정한다. 규칙이 없거나 source item이 없으면 `unverifiable/rule-not-established`, 원본 표·출력 path·겹침 없는 좌표망을 구성하지 못하면 `unverifiable/table-source-unavailable`, 복합 머리인데 headerRows<=1이면 `failed/compound-header-missing`다. 이 세 경우 checkedCells=0, complexity=0, contentDigest=H(loss catalog 항목 전체)다. 그 밖에는 위 checks 배열이 비어 있지 않고 모든 expectedText=actualText 및 richPreserved=true일 때 `verified/rule-matches-current-cells`, 아니면 `failed/rule-output-mismatch`다. 마지막으로 비교 쪽이 없는 verified 항목만 `unverifiable/source-comparison-unavailable`로 내리며 나머지 필드는 유지한다. 없는 currentCellNode는 checks 배열의 JSON 직렬화에서 null이다. 규칙 순서는 위 정의 표의 순서, 규칙 없는 항목도 ruleReviews.items에는 catalog 순서로 남긴다.

ruleConfirmation은 `{ruleId,decisionId,actor:"human",time,revision,contentDigest,policyDigest,meaning:"rule-approved-representation"}`다. time/revision/contentDigest/policyDigest는 승인 결정의 값을 그대로 쓰고 현재 항목의 재검증 digest로 덮지 않는다. 현재 항목의 digest는 별도 ruleReviews.items[].contentDigest다. expressionReviews는 catalog의 expression 순서이며 confirmation과 ruleConfirmation을 모두 가지되 해당하지 않는 값은 null이다.

소비자는 v1.3을 독립 검증하고 `docling-to-litzio/1.3.0` trace에 해당 source의 pageComparisons, machineOnlyPages(번호 배열), ruleApprovals(관련 승인 결정), ruleOpenReceipts(그 승인 openIds의 영수증), ruleVerifications(현재 항목 검증), expressionReviews의 두 확인 경로를 보존한다. inputDigest는 재계산한 완료 증거 전체를 포함한다. 요구사항 문서의 출처 JSON과 ReqIF SourceReferences는 이 값을 그대로 보존한다. 기계 전용 쪽을 사람 확인이라고 부르지 않는다. 기존 v1.0~v1.2 소비 경로는 그대로다.
