# docling-to-litzio — 생성·채점·원문 대응·문제 탐지

고정 Docling 변환 묶음을 공식 작성 입력으로 바꾸고, CLI가 만든 리치오 문서를 재읽어 검사한다. 설치 가능한 Host 진입점과 가져오기·결과·문제 목록 화면이 있다. AI·교정·검수 완료는 없다. 생성 결과는 **검수 전 초안**이다.


## 설치와 화면 (0.6.0)

이 폴더가 설치 단위다. 공개 master의 제작 안내와 CLI `plugins scaffold --template screen`에서 시작했다. React/ui/invoke와 공개 CLI만 사용하며 별도 화면 의존성이나 빌드는 없다. Node 처리 코드와 v1 생성/검수 파일은 기존 CLI 흐름과 같다.

```sh
# BUILT_CLI는 공개 rich authoring을 포함한 소스 빌드 cli.mjs.
# HOST는 명시적으로 시작한 격리 Host의 origin. 설치된 daemon을 자동 탐색하지 않는다.
node BUILT_CLI plugins validate PLUGIN_DIRECTORY --host HOST --json
node BUILT_CLI plugins install PLUGIN_DIRECTORY --host HOST --json
node BUILT_CLI plugins settings local.docling-to-litzio --file SETTINGS_JSON --host HOST --json
```

SETTINGS_JSON은 `{"workspaceDirectory":"WORKSPACE_ABSOLUTE_DIRECTORY","cliEntry":"BUILT_CLI_ABSOLUTE_FILE"}`이다. 두 값은 실제 Host의 절대 경로로 바꾼다. 설정 파일·operation 입력은 artifact 밖에 둔다. 작업 폴더는 기존 폴더여야 하고, 열린 폴더 목록과는 별개다. 리치오 설정의 플러그인 설정에서도 지정할 수 있다. 기존 문서와 사용자 교정은 덮어쓰지 않는다.

화면에서 작업 폴더 안의 상대 묶음 위치(예: `inputs/lsr`)를 입력하고 **입력 확인 → 문서 만들기**를 누른다. source PDF 이름·쪽 수·지원 schema·그림 수와 누락 자산/옵션 진단을 먼저 보여 준다. 완료 뒤 손실 요약·검수 묶음·반복 패턴 접기와 묶음별 쪽/좌표/문서 target/원본 selfRef/근거를 읽는다. 전체 근거는 펼쳐 볼 수 있다. 원문/문서 미리보기·대조·비서 교정·검수 완료를 제공하지 않는다.

긴 처리는 접수 후 Node worker에서 기존 `generate`→`createReview`→reader 검증을 실행한다. 화면은 짧은 `job` 호출로 조회한다. 상태는 작업 폴더의 `.docling-to-litzio/jobs/REQUEST_ID.json`, 새 결과는 `generations/REQUEST_ID/`다. 같은 requestId/입력 재조회는 같은 작업을 돌려주며 새 generation은 새 ID로만 만든다. status가 ready여도 검수 완료가 아니다. 실패/중단 결과는 보존하고 reader가 완성품으로 읽지 않는다. reload 뒤 이전 생성 목록을 읽을 수 있고, 자동 재실행하지 않는다. 종료 시 자기 worker가 끝날 때까지 기다린다. 강제 종료는 다음 실행에서 interrupted로 드러내며 취소·강제 종료 안전성을 보장하는 작업 엔진은 아니다.

공개 작업(version 1, Host scope): `health`, `preflight`, `start`(write, assistant:false), `jobs`, `job`, `summary`, `groups`, `group`(read, assistant:true). 입력/출력 schema는 manifest에 있다. CLI `operation invoke local.docling-to-litzio.OP --input INPUT_JSON --host HOST --json`도 같은 작업을 호출한다. start에는 bundle/fingerprint/preflight 확인과 호출자가 만든 UUID requestId가 필요하다. 응답을 잃었으면 새 ID로 재전송하지 말고 먼저 같은 ID의 job을 조회한다. `summary/groups/group`은 매번 완료 표지·digest/revision·전수 대응·검수 파일을 검증하며 수정된 문서는 거부한다. 화면의 **결과 다시 검증**으로 새로 읽는다.

현재 공개 화면에는 Host 폴더 선택기·기존 문서 열기 callback·saveDocument의 images 입력이 없다. 상대 경로 입력과 명시적인 CLI 설정을 사용하며, **문서 열기 버튼은 비활성**이다. 생성 문서는 리치오 파일 탐색기에서 연다. 독자 미리보기나 숨은 HTTP 호출로 우회하지 않았다. [실제 설치/화면 증거·플랫폼 부족·PR 4 조사](docs/results-installable.md)를 따른다.

## 처리 CLI 실행

Node 24.22.1 이상 25 미만, 외부 Node 의존성 없음. 공개 제작 계약의 ESM `host.js`와 같은 JavaScript 모듈이므로 후속 Host 진입점에서 추가 빌드 없이 import할 수 있다. 다른 플러그인/내부 플랫폼 모듈을 import하지 않는다.

```sh
cd plugins/docling-to-litzio
npm test
# 플랫폼 공개 CONTRIBUTING/README에 따라 별도 checkout에서 의존성 준비와 CLI build:
pnpm --filter @litzio/cli build
# 아래 BUILT_CLI는 그 빌드의 cli.mjs, OUTPUT은 아직 없는 새 폴더
node src/generate.js BUNDLE OUTPUT BUILT_CLI [ORACLE_JSON] [BOOKMARK_EVIDENCE_JSON]
```

명령은 플랫폼 checkout 대신 플러그인 폴더에서 실행한다. BUNDLE은 document.json·conversion-record.json과 record.source.file로 참조하는 PDF다. 문서/image bytes는 create에만 전달한다. 설치된 CLI·daemon을 탐색하거나 시작하지 않는다. CLI 프로세스는 명령마다 종료한다. 결과 폴더를 미리 만들지 않는다. 입력 검증 후 새 폴더를 배타적으로 만들며 기존 폴더/문서를 덮어쓰지 않는다. 실패하면 부분 산출물과 generation.json 진단을 남기며 complete.json이 없으면 인계할 수 없다. 임시 폴더 자동 삭제·자동 재시도 없음.

북마크 증거는 선택 사항이다. 제공하지 않으면 unknown/낮은 신뢰로 검수한다. 선택적인 독립 사전 검사 도구만 Python과 `requirements-audit.txt`의 pypdf를 사용한다(Node 처리 코드 의존성 아님).

```sh
python -m pip install -r requirements-audit.txt
python src/audit_bookmarks.py SOURCE_PDF > bookmark-evidence.json
```

이 증거는 PDF digest로 결합된다. 북마크 존재 + use_bookmarks 설정은 사용 가능 근거이며, 각 제목이 실제 북마크에서 유래했다는 증거는 아니다. Docling 결과는 그 attribution을 공개하지 않는다. absent/unknown은 “신뢰도 낮음 — 검수 대상”. 제목은 추측으로 바꾸지 않는다.

## 변환 규칙

각 규칙 버전은 `src/convert.js`의 RULES에 있다(table/equation/figure/caption/list/paragraph/heading/footnote는 1.2.0, 나머지는 1.0.0). 생성기 0.5.0은 보강된 공식 작성 입력과 모든 위치의 inline JSON 읽기를 요구한다. 소스 빌드 기준과 전후 실측은 [richer authoring 결과](docs/results-richer-authoring.md)에 있다. 숫자·부호·단위·공백을 자체 정규화하지 않으며 Core가 문자열을 바꿨으면 재읽기 불일치로 남긴다.

| 요소 | 옮기는 방식 | 단순화/막힌 표현 |
| --- | --- | --- |
| 순서·문단 | body/group children 순서; 다중 prov 보존 | 별개 문단/표를 페이지 경계에서 합치지 않음 |
| 제목 | title H1, section_header level 그대로 | 1–6 밖은 문단+손실; 자동 계층 추정 없음 |
| 목록 | 명시 list 그룹의 중첩·항목 순서, 숫자/단일 문자 start·style·delimiter | 모호한 Roman/문자 구별·불연속/지원 불가 구조는 손실. 중첩 대응은 최상위 포함 항목 단위 |
| 표 | 모든 셀 범위 검증, 직사각형 격자; 병합 글자 반복 | 병합·복합 header/row role·구조 없는 rich cell은 손실; 첫 행 header 강제; 명시 복합 머리는 합치고 병합 표 아래 설명+검수 |
| 수식 | LaTeX 그대로; 전부 위치가 있는 검수 목록 | 같은 요소의 명시 번호는 fixed로 연결; 의미 정확성 판정 없음 |
| 그림 | data URI → 공식 images; byte digest 보존 | 누락은 pending+손실, 손상은 거부; child 텍스트도 보존 |
| 캡션·번호 | 표·그림의 native caption; 유일한 Arabic/절 번호(예: K.1) fixed | Roman/문자/모호한 번호는 literal+번호 없음 |
| 각주·위첨자 | 원본의 bold/italic/delete·super/sub·hyperlink를 inline 구조로 이관. PDF의 유일한 작은 raised 표시+source 범위로 확인된 각주는 미주 | 호출부 없음/중복은 문단+손실. 표 전용 배치·문자 표지 한계는 미주 이관 뒤에도 남김. 서식 없는 추출 결과에서 서식을 추측하지 않음 |
| 코드 | language와 원문 줄/공백 | unknown language는 빈 값 |
| furniture | layer 또는 page_header/page_footer 명시 분류만 제외 | 제외 항목도 inventory와 위치 유지 |
| 목차·미지원 | 목차 표는 정적 표, text는 문단, group은 자식 유지 | 역할 손실·미도달·무내용은 명시 보고 |

잘못된 참조/순환/표 셀 겹침/범위는 거부한다. schema 1.10.0만 허용한다. 원본 PDF·JSON digest와 record의 bytes/schema/page_count, 연속 페이지와 bbox를 검사한다. 변환 옵션 누락/비활성, 쪽 이미지 부재, 부분 변환은 diagnostics에 남긴다. 이는 검수 완료가 아니다.

공개 상한: authoring JSON/source 각각 4 MiB, 입력/블록 각각 5,000(중첩 목록 항목도 block 합계에 포함), 문자열 16,384 UTF-16 units, 표 100×32, 목록 100항목, 이미지 256개/각 10 MiB, 전체 요청 32 MiB. 생성기는 요청 상한을 사전 거부하고 최종 source/이미지 container/Unicode/Core 의미는 공식 CLI가 거부한다. 자르지 않는다.

## 보고와 검증

- plan.json: 요청·규칙·원본 inventory·손실·옵션 진단·headingReview·formulaReview.
- receipt.json/snapshot.json/check.json: 공식 생성 targets/revision과 실제 재읽기. inspect의 caption projection은 body 블록 수에서 제외한다.
- integrity.json: 계획과 실제 블록 종류·수·문자열·제목 단계·셀 위치·목록 항목·그림 캡션 대조.
- provenance.json (v1): **확정된 생성 시점 인계 계약**. PDF/JSON/record digest, self_ref, 원문/orig, 다대다 targets, 셀 index/span/selector, 전체 prov와 TOPLEFT pt bbox·쪽 크기. 회전/인쇄 쪽 표기는 입력에 없어 null(추측하지 않음). 셀 bbox 원본은 sourceCell에 보존하며 다중 쪽 표의 셀 페이지는 추측하지 않고 표 전체 regions를 쓴다. 소비 계약은 [인계 계약 v1](../../contracts/docling-to-litzio/README.md). 편집 후 digest 불일치는 거부하며 자동 갱신은 후속.
- generation.json: incomplete → generated-draft/generation-mismatch. 초안 생성 성공은 reviewComplete가 아니다. 진단용이다. 인계 완결성의 권위는 마지막에 배타적으로 게시되는 complete.json이며 loadHandoff가 실제 bytes와 의미를 검증한다.
- score.json: LSR 작성자 기대와 **실제 native snapshot** 비교. match/conversion/representation/generation을 분리한다. 기하 대응은 작은 면적 기준 50% 겹침이며 picture oracle은 picture collection에 제한한다. 한 출력에 여러 기대가 대응할 수 있으므로 mismatch 수를 실제 오류 개수/절대 점수로 읽지 않는다. 순서는 원본 children 순회와 출력 path를 별도로 비교한다. 기대 구조 없는 NIST에는 oracle 점수를 만들지 않는다.

수식의 값싼 점검은 빈/해독 실패·괄호/환경 짝·intertext 안 일반 문장만 검사한다. LSR 세 번째 수식의 문장 혼입을 잡고 첫 두 수식은 의심하지 않는 검사를 고정했다. 통과는 수학적으로 맞다는 뜻이 아니다. 근 지수/합 범위가 그럴듯하게 틀린 경우, 알 수 없는 명령, 반복/영역 대비 길이, 떨어진 번호의 결합은 추측하지 않는다. 같은 요소의 명시 번호는 fixed로 옮긴다. PDF 글자 층 숫자 대조는 새 parser/좌표 대응 범위를 피하려고 PR 3으로 미룬다. 모든 수식은 이유 유무와 관계없이 사람이 검토한다.

## 검사 구분

```powershell
# 리치오 없이: 단위 검사, integration은 skip
node --test test/*.test.js
# 별도 빌드 CLI + 선택적 pypdf 사전 검사를 쓰는 격리 통합 검사
$env:DOCLING_TEST_CLI = 'BUILT_CLI'
# 저장소 루트에서 실행(고정 표본 상대 경로)
node --test plugins/docling-to-litzio/test/*.test.js
```

통합 검사는 새 임시 폴더에 세 표본 생성/check/inspect/자산 읽기·원본 digest·기존 출력 충돌·실패 표지 보존을 확인하고 위치를 콘솔에 남긴다. 변환 서버·Docker·AI 호출 없음. 화면과 사람이 열어 본 모양은 미확인. 실측은 [results.md](docs/results.md), 후속 계획은 [plan.md](docs/plan.md).

## v1 인계 읽기 (PR 2, 설치/화면 제외)

출력에는 원본 bytes의 source/ 사본, provenance.json, losses.json, complete.json도 들어간다. 규칙/상한과 그림 처리 경로는 PR 1과 같다. [확정 계약](../../contracts/docling-to-litzio/README.md)에 schema 링크·거부 규칙·requirements-extract 요구 대조표·발췌 예시가 있다. schema는 설치 단위 안 schema/에 포함된다. Node 런타임 의존성은 추가하지 않았다.

```sh
node src/read-handoff.js OUTPUT
# 현재 생성 결과는 미검수이므로 아래 명령은 의도적으로 거부한다.
node src/read-handoff.js OUTPUT --require-reviewed
```

loadHandoff는 marker→파일 bytes/digest→schema→원본/문서 revision→전수 inventory/블록/셀/영역→원본↔snapshot 보존→그림 원본 digest→marker 재확인을 한다. bindingState=current는 위치 유효성이지 검수 완료가 아니다. uncertain은 확정 위치로 사용하지 않는다. reader가 반환한 정보는 읽은 bytes에만 결합되며, 사용 직전 수정이 있었다면 다시 검사한다. 편집 후 대응 자동 갱신과 검수 완료 인계는 미구현이며 요구를 낮춰 우회하지 않는다.

검사에는 schema/버전·digest/revision·누락/잘린 표지·미도달 target·좌표 bounds·셀 범위·불확실 대응·새 출력 강제·교정 보존·source가 이미 oracle과 다른 상태의 추가 손상을 포함한다. 검증기/검사는 플러그인 안에 있고 다른 플러그인은 파일 계약을 독립 구현한다. PR 2 실측은 [results-pr2.md](docs/results-pr2.md).


2026-11-13 추가 조사: 병합/복합 머리·머리 열은 플랫폼 형식 유지 한계이며, 이 플러그인이 반복·머리 합치기·원문 범위·표 아래 설명·전수 검수 표시로 처리한다. 손실 category는 native-format/authoring-input/plugin-pending. 원본 inline/관계는 items.structure, rich cell은 sourceCell에 보존한다. [표본 전후](docs/table-examples.md)에 실제 생성 전후와 선택 이유가 있다. 이미 지원되는 수식/그림 fixed 번호를 사용해, LSR의 식 번호 3개와 K.1/K.2 미이관 손실은 제거했다. LaTeX는 그대로다.


PR #7 리뷰 정정: v1 유지 범위는 기존 block/list-item/cell selector와 raw source 구조·다대다 target으로 표현 가능한 생성 대응에 한한다. caption/inline 부분 범위의 정밀 selector, 셀별 page precision, reviewed 상태는 현재 v1에 없다. regionPrecision=table, reviewState=unreviewed는 그대로이며 정밀 위치/검수 완료를 같은 v1에서 지원한다고 약속하지 않는다. 새 공개 snapshot을 실제 확보하면 계약 예시와 소비 검사를 추가하고 버전 변경 필요를 판단한다.

## PR 3 문제 탐지와 독립 PDF 증거

생성 v1의 원본 PDF·Docling·실제 native snapshot/provenance를 읽고 **검수 전 후보**만 만든다. 설치/AI/교정은 없다. 후보 없음은 정답 판정이 아니다. PDF.js 6.5.438 legacy ESM과 worker/CMaps/라이선스를 vendor에 고정했으며 Node에서 npm install 없이 실행한다. 내장 core-js는 MIT, CMaps는 Adobe BSD-style, PDF.js는 Apache-2.0이다. 상세는 [vendor 고지](vendor/pdfjs/NOTICE.md).

```sh
node src/review.js GENERATION NEW_REVIEW_DIRECTORY
node src/review.js --read GENERATION REVIEW_DIRECTORY
```

review-targets.json, pdf-evidence.json, 마지막 review-complete.json을 만든다. [검수 대상 계약](../../contracts/docling-to-litzio/review-targets.md)에 schema/읽는 순서/거부 조건과 kind별 근거가 있다. 고정 revision만 읽고 변경된 문서는 stale로 거부한다. 처리 핵심의 시험용 changed snapshot은 uncertain이며 identity 재연결 증거가 아니다.

표본 측정과 테스트는 **저장소 루트**에서 실행한다. built CLI는 이전과 같은 격리 소스 빌드다.

```powershell
$env:DOCLING_TEST_CLI = 'BUILT_CLI'
node plugins/docling-to-litzio/test/measure-corpus.js
# 위 명령이 출력한 보존 corpus 경로
$env:DOCLING_DETECTION_CORPUS = 'CORPUS_DIRECTORY'
node plugins/docling-to-litzio/test/evaluate-detection.js $env:DOCLING_DETECTION_CORPUS
node --test plugins/docling-to-litzio/test/*.test.js
```

corpus/CLI 환경 변수가 없으면 해당 통합·corpus 검사를 skip한다. vendored PDF reader·라이선스 hash·임시 독립 복사 실행은 별도로 검사한다. 라이브러리의 선택적 canvas/DOMMatrix/Path2D 경고는 stderr로 보내며 렌더링 성공을 주장하지 않는다. worker는 작업 후 종료된다. [실측과 놓치는 것](docs/results-pr3.md), [기계 측정](docs/detection-results.json).

## 보강된 작성 입력으로 손실 줄이기

생성 시 vendored PDF reader가 원본의 작은 위첨자 호출 표시를 독립적으로 읽는다. 문자가 같다는 이유만으로 미주를 붙이지 않는다. LSR 각주 5개 중 1개, NIST 7개를 연결했다. LSR의 호출부 없는 `19`, 표시 없는 표 주석 `a`, 같은 추출 표 안의 중복 `a` 두 개는 보류한다. 표 아래 전용 주석 배치/문자 표지 손실은 연결 뒤에도 유지한다.

[전후 수치·검증·미확인](docs/results-richer-authoring.md). provenance와 검수 파일의 schema는 그대로다. 표 캡션은 표 block target(스칼라 text=null), 미주는 재배치 receipt의 footnote block, 중첩 항목은 최상위 포함 list-item target에 대응한다. 정밀 부분 selector와 편집 후 자동 연결을 제공하지 않는다.


## 원문 대조와 사람 결정

0.9.0은 묶음/적용된 교정 선택 → 한 쪽 PDF.js 렌더링과 근거 상자 → 현재 revision의 공개 DocumentView 강조를 제공한다. 위치를 바꾸면 해당 원본 쪽도 바뀐다. 좁은 화면에서는 두 영역을 세로로 쌓는다. 전체 쪽 이미지를 만들거나 문서를 HTML로 흉내 내지 않는다.

사람 확인/보류는 근거 note와 revision을 기록하며 교정 제출은 기존 공개 쓰기 작업을 사용한다. Host의 context.cli를 우선 사용하고 수동 CLI 설정은 Host가 제공하지 않을 때만 쓴다. 일반 문서 탭에서 손 편집하면 현재 인계 계약에서는 차단된다. 사용자가 저장하지 않은 탭 내용은 파일 CLI/DocumentView가 알지 못한다.

완료 버튼은 범위·사람 확인·차단 손실·토큰 차이·실패 조건을 만족할 때만 켜진다. [완료 인계 v1.2](../../contracts/docling-to-litzio/human-review.md), [실행 결과와 제한](docs/results-compare.md)을 읽는다. LSR은 차단 손실 때문에 이번에 완료 발급하지 않았다.


PR 5 추가: [손실 분류](docs/lsr-loss-classification.md)와 항목별 표현 보존 확인, 사람만 사용하는 원문 영역 근거 교정을 v1.2에 추가했다. 앞의 “LSR 차단 손실 때문에 완료하지 못함”은 초기 정책에서의 결과다. 현재 규칙과 추가 수락 결과는 [추가 검증](docs/results-human-policy.md)을 따른다. picker/open 전환은 이번 범위에 넣지 않았다.
