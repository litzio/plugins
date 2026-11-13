# 출처 어댑터 v1

기준은 contracts/docling-to-litzio/README.md와 지정된 schema다. 생성기를 import하지 않고 파일만 읽는다. 표본 생성 시에만 앞 플러그인 README에 있는 명령을 별도 프로세스로 실행했다. 변환 서버·Docker·실제 AI·설치된 앱·daemon을 사용하지 않았다.

## API와 거부 경계

`loadProvenance(root, {inspect, requireReviewed?})`는 명시한 인계 폴더의 완료 표지를 먼저 읽고 마지막에 같은 bytes인지 다시 확인한다. inspect는 허용된 빌드 CLI를 호출해 현재 document.md의 JSON을 반환해야 한다. 자동 CLI/daemon 탐색은 없다. Node 단위 검사에서는 이 경계를 가짜 inspector로 명시적으로 대체한다.

검사 순서: schemaVersion/status → 중복/상대 경로/일반 파일·디렉터리(링크·junction 거부) → 읽은 bytes SHA-256 → 필수 문서·대응·손실·snapshot·receipt·원본/자산 → generationId/revision → 공식 현재 inspect 대조 → 원본 selfRef/sourceId 전수 inventory → 원문/orig·셀 index/span/text·복합 머리 기여·병합 범위/검수 표시 → 실제 path/selector/literal target/receipt → 쪽 크기와 원래 prov/TOPLEFT 변환/bounds → 블록 전수 대응·손실 전수·그림 embedded 원본 bytes → marker 재확인이다. UTF-8도 엄격히 읽는다. 원본 code/heading/list/formula 문자와 의미 필드도 대조한다. digest는 서명/검수 증명이 아니며 이후 수정 시 다시 읽어야 한다.

`resolveSource(bundle, {sourceKey,elementRef,selector})`는 원본 sourceText 기준 full/text code point 범위 또는 원본 cell:r:c를 현재 target 배열과 PDF 영역으로 잇는다. 출력 경로와 원본 selector를 합쳐 가짜 NodePath를 만들지 않는다. sourceId는 계약대로 Docling bytes digest와 selfRef/cellIndex에서 계산한다. 역할 explanation은 인용 근거로 쓰지 않는다.

반환은 항상 `eligibleConfirmed:false`, state=needs-source-review다. current는 위치 확인일 뿐 검수 완료가 아니다. uncertain은 확인 필요로 전파한다. 없는 원본은 deleted-source 진단이며, reserved deleted/no-source 상태 때문에 현재 출력에 원본 없는 블록이 남으면 인계 자체를 거부한다. 자동 경로 재연결·교정 덮어쓰기·삭제는 없다.

## 요구사항 문서와 ReqIF

기존 출처 5열 표를 유지하면서, trace가 있는 경우에만 마지막 trace 열에 JSON을 저장한다. 공식 셀 작성 입력으로 escape하며 다시 읽어 동일 객체인지 확인한다. trace에는 contract/generationId/documentRevision/sourceId, 원래 element/셀과 현재 targets, bindingState, unreviewed, 물리 쪽/좌표/쪽 크기, 표의 원래 병합 범위·검수 표시, 손실과 한계를 담는다. 임의 reviewed 승격은 거부한다.

ReqIF의 SourceReferences String은 이 전체 sources의 정규 JSON이며 SourcePages는 물리 쪽 번호 목록이다. 앞 단계 v1의 schema는 reviewState=unreviewed만 허용하므로 정식 내보내기와 requireReviewed는 항상 거부한다. 시험 출력은 TEST ONLY로 명시한다. 숫자·표·위치의 기계적 일치는 검수 승인이 아니다.

## 실제 표본 확인

고정 LSR converted 묶음에서 앞 플러그인의 generate 명령으로 새 임시 인계 디렉터리를 만들었다. 새 master 임시 worktree에서 빌드한 공개 CLI를 사용했다. 인계 원본 요소 171개와 전체 셀·블록·그림·영역 검증이 통과했다.

손으로 고른 후보는 정상 대역 경계(#/tables/4의 cell:2:0), 유지 시간(같은 표 cell:2:2), 병합이 있었던 표의 범위 값(#/tables/2 cell:2:3), 합성 식(#/texts/74)이다. 한 요구사항에 계속 표 #/tables/5의 cell:2:0도 붙여 물리 6·7쪽의 복수 출처를 확인하고, 첫 출처를 다른 요구사항에도 사용해 다대다를 확인했다. 숫자 요구사항으로 자동 채택한 것이 아닌 공개 합성 검사 후보다.

후보 4개·출처 발생 6개·고유 출처 5개의 native trace JSON 왕복을 확인했다. 수식 후보는 PNG가 없어 시험 출력에서도 차단되므로 sources.md/보고서에 남기고 ReqIF 시험 파일에서만 제외한 이유와 ID를 명시했다. 나머지 3개 후보의 표시된 시험 ReqIF는 공식 XSD, ID 54개 유일성/참조, 독립 reqif parser 왕복을 통과했다. 이것은 정식 전체 내보내기 성공이 아니다.

PyMuPDF 1.27.2.3의 글자 층을 선언된 표 영역으로 잘라, 공백만 접은 비교에서 표 인용 4개를 찾았다. 물리 4/6/7/8쪽 렌더도 확인했다. 셀별 페이지 귀속은 계약에 없으므로 표 전체 영역 정밀도만 주장한다. 식(1)의 원문 위치/표현은 보았지만 LaTeX 문자열과 typeset 수학 표현의 기계적 의미 동등성은 미확인이다. PDF 증거는 검수 상태를 바꾸지 않는다.

고정 검증 요약은 test/fixtures/provenance-lsr-evidence.json이며 완료 표지가 있는 인계 묶음이 아니다. 단위 검사 84개 중 출처 관련 25개는 최소 합성 파일 묶음과 가짜 inspector를 사용한다. 실제 생성/CLI/PDF 검사는 별도로 실행했다. 임시 폴더·산출물은 보존했고 시작한 지속 프로세스는 없다.

## 계약의 보류 정보

검수 완료·교정 이력·회전/인쇄 쪽·셀별 정밀 페이지가 없다는 이유로 계약을 바꾸라고 요구하지 않는다. 생성 revision에서 동작하며, unreviewed/미확인/표 전체 정밀도로 표시한다. 실제 검수본 채택과 편집 후 대응 갱신은 현재 v1로 구현하지 않는다. rich 목록 target의 literal 문자열 검증, 알려지지 않은 캡션 번호 표기·새 schema/projection은 추측 없이 진단한다. 다중 파일의 원자 snapshot·서명·악의적 재서명 방지는 보장하지 않는다.

## 실행

루트에서 앞 플러그인 README의 명령을 사용한다. BUNDLE은 고정 converted 폴더이고 HANDOFF는 아직 없는 새 폴더다. 이후 SCRATCH는 별도로 만든 빈 임시 폴더다. 요구사항 문서의 상대 참조가 유효하도록 검증된 필수 인계 파일만 SCRATCH/handoff에 복사하고 재검증한다.

```sh
node plugins/docling-to-litzio/src/generate.js BUNDLE HANDOFF BUILT_CLI
node plugins/requirements-extract/validation/provenance.mjs BUILT_CLI HANDOFF SCRATCH
python plugins/requirements-extract/validation/standard.py verify SCHEMA_CACHE SCRATCH/provenance-test.reqif
python plugins/requirements-extract/validation/pdf_trace.py SCRATCH/source-report.json SCRATCH/handoff/source/source.pdf
```

Node 의존성은 기존 XML builder와 Ajv 고정 버전/lock 및 전이 고지를 포함한다. PDF 글자 층 검사는 별도 선택 도구이며 requirements-pdf.txt에 버전을 기록했다. PyMuPDF는 제품에 묶지 않는다.

공개 CLI가 기존 text를 유지하며 추가한 노드 content 필드만은 이전 v1 checkpoint와 호환한다. 기존 필드를 모두 대조한 뒤 같은 revision의 새 공식 projection을 사용하며, 임의의 새 필드나 의미 변화는 허용하지 않는다. 이 호환 경계도 단위 검사로 고정했다.

PR #10의 문서별 XHTML scope/실제 그림 캡션 수정 위로 출처 브랜치를 재배치했다. 겹친 exporter는 SourcePages와 scope context를 모두 유지한다. 전체 단위 84개와 실제 출처/native 왕복·시험 ReqIF XSD/독립 parser를 재실행해 통과했다.
