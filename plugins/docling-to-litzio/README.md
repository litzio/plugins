# docling-to-litzio — 생성·채점·원문 대응 인계 (PR 1–2)

고정 Docling 변환 묶음을 공식 작성 입력으로 바꾸고, CLI가 만든 리치오 문서를 재읽어 검사한다. 플러그인 진입점·설치·화면·AI·교정은 없다. 생성 결과는 **검수 전 초안**이다.

## 실행

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

각 규칙 버전은 `src/convert.js`의 RULES에 있다(현재 모두 1.0.0). 숫자·부호·단위·공백을 자체 정규화하지 않으며 Core가 문자열을 바꿨으면 재읽기 불일치로 남긴다.

| 요소 | 옮기는 방식 | 단순화/막힌 표현 |
| --- | --- | --- |
| 순서·문단 | body/group children 순서; 다중 prov 보존 | 별개 문단/표를 페이지 경계에서 합치지 않음 |
| 제목 | title H1, section_header level 그대로 | 1–6 밖은 문단+손실; 자동 계층 추정 없음 |
| 목록 | 연속 같은 부모/종류를 최대 100항목으로 묶음; 숫자 start | 중첩 평탄화, 문자 marker 손실 |
| 표 | 모든 셀 범위 검증, 직사각형 격자; 병합 글자 반복 | 병합·복합 header/row role·rich cell은 손실; 첫 행 header 강제; 명시 복합 머리는 합치고 병합 표 아래 설명+검수 |
| 수식 | LaTeX 그대로; 전부 위치가 있는 검수 목록 | 같은 요소의 명시 번호는 fixed로 연결; 의미 정확성 판정 없음 |
| 그림 | data URI → 공식 images; byte digest 보존 | 누락은 pending+손실, 손상은 거부; child 텍스트도 보존 |
| 캡션·번호 | 그림 caption, 표 caption 별도 문단; 유일한 Arabic 번호만 fixed | Roman/문자/모호한 번호는 literal+번호 없음; table caption 입력 필요 |
| 각주·위첨자 | footnote 문단; 원문 글자 보존 | call site 추정 없음; inline 서식/링크는 손실 |
| 코드 | language와 원문 줄/공백 | unknown language는 빈 값 |
| furniture | layer 또는 page_header/page_footer 명시 분류만 제외 | 제외 항목도 inventory와 위치 유지 |
| 목차·미지원 | 목차 표는 정적 표, text는 문단, group은 자식 유지 | 역할 손실·미도달·무내용은 명시 보고 |

잘못된 참조/순환/표 셀 겹침/범위는 거부한다. schema 1.10.0만 허용한다. 원본 PDF·JSON digest와 record의 bytes/schema/page_count, 연속 페이지와 bbox를 검사한다. 변환 옵션 누락/비활성, 쪽 이미지 부재, 부분 변환은 diagnostics에 남긴다. 이는 검수 완료가 아니다.

공개 상한: authoring JSON/source 각각 4 MiB, 입력/블록 각각 5,000, 문자열 16,384 UTF-16 units, 표 100×32, 목록 100항목, 이미지 256개/각 10 MiB, 전체 요청 32 MiB. 생성기는 요청 상한을 사전 거부하고 최종 source/이미지 container/Unicode/Core 의미는 공식 CLI가 거부한다. 자르지 않는다.

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
