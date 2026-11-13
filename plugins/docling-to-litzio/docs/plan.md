# docling-to-litzio 범위와 구현 계획

상태: PR 1과 PR 2의 설치/화면 제외 범위 구현·CLI 검증 완료. PR 3 처리 코드/독립 PDF 증거/검수 후보 계약도 검증했다. 설치/화면·비서/교정과 PR 4 이후는 계획이다. 수치는 별도 표시가 없으면 제안 합격선이며, 실측은 results-pr2.md를 따른다.

## 1. 목표와 경계

`docling-convert`가 만든 파일을 읽어, 원문으로 역추적할 수 있고 사람과 비서가 편집할 수 있는 리치오 문서를 만든다. 비서가 의심 구간을 먼저 검수·교정하고, 사람은 판단 불가와 중요한 결과를 확인한다. 최종 교정 대상과 정본은 리치오 문서다. PDF와 DoclingDocument는 불변 증거다. 다음 `requirements-extract`는 코드 의존 없이 문서와 대응 파일을 읽는다.

이 플러그인은 검수에 리치오 비서를 필요로 한다. 자체 모델 호출·에이전트 런타임·PDF 변환 서버·범용 변환 프레임워크·새 문서 편집기를 만들지 않는다. 스캔본은 글자 층 대조 불가를 표시하고 이미지 증거로 넘긴다. 다른 변환기 지원, 두 플러그인 합치기, 공개 배포 체계는 저장소 AGENTS.md의 보류를 유지한다.

### 끝난 기준

| 구분 | 합격 기준 | 확인 방법 |
| --- | --- | --- |
| 고정 표본: 생성 안전성 | 지원 입력에서 공식 생성·`litzio check`·저장/재열기가 성공하고 원본 hash 변화 0, 기존 출력 덮어쓰기 0 | LSR 1.1·NIST 고정 JSON, 충돌·실패 주입 |
| 고정 표본: 보존 | 모든 원본 항목이 출력 대응/컨테이너/명시적 제외/손실 중 하나로 집계. 숨은 누락 0. 생성 단계가 추가한 숫자·부호·단위 변조 0 | 원본 항목 전수 inventory와 생성 전후 의미 비교 |
| 고정 표본: 표현 | 아래 규칙으로 지원한다고 선언한 항목은 100% 규칙 일치. 표현 손실은 전부 근거·위치와 함께 기록 | 기대 구조의 S01–S21을 기능별로 판정. 미지원은 별도 실패/보류로 집계 |
| 고정 표본: 검수 | 오류 주입의 숫자/단위 변조·문단 누락·표 셀 누락·순서 교환은 각 유형 100% 후보 생성. 비서 교정으로 새로 생긴 중요 오류 0 | 후보 탐지와 비서 교정을 따로 평가, 실제 AI 측정은 후속 |
| 고정 표본: 완료 | 미검사·판단 불가·미해결 중요 오류가 있으면 완료 불가. 완료 revision의 모든 요구사항 후보에 유효한 출처 또는 사람이 인정한 출처 없음 사유가 있음 | 완료/무효화·출처 역추적·되돌리기 검사 |
| 실제 수백 쪽: 사용성 | 200쪽 이상 문서 1건에서 원본→생성→비서 검수→사람 확인→재열기→다음 단계 인계를 끝까지 수행. 사람의 필수 전수 페이지 대조를 요구하지 않음 | 소유자 허가 후 별도 실측. 자료는 커밋하지 않음 |
| 실제 수백 쪽: 부담 | 사람에게 남은 묶음이 페이지 수의 10% 이하, 직접 검토 시간 100쪽당 30분 이하를 잠정 목표로 삼음 | 실제 묶음 수·소요 시간·그림/표 밀도·미검사량 함께 보고. 초과하면 사용 가능 판정 보류 |
| 실제 수백 쪽: 안전/성능 | 중단·재개 후 중복 교정 0, 누락된 진행 기록 0. 메모리/입력 상한 안에서 완료, 초과 시 무손상 거부 | 처리 시간·최대 메모리·첫 화면 지연 측정. 현재 성능 보장은 없음 |

처음부터 끝까지 사용할 수 있다는 판정은 생성 성공만으로 내리지 않는다. 중요 오류는 숫자·부호·단위·표 셀 귀속·주석 적용 범위·수식 의미·본문 누락을 바꾸는 오류다. 이 합격선은 무오류 보증이 아니며 검수 범위와 잔여 위험을 인계한다.

## 2. 읽은 근거와 현재 능력

리치오 master는 확인 시점 `4e7db394855dfbb5af806d9425f746a32c87d0c6`이다(원격 master SHA와 일치). 삭제 작업 중이므로 구현 PR 시작 때 공개 계약을 다시 확인한다. 공개 목적과 계약만 현재 능력의 근거로 삼는다. 보관 앱 소스는 과거 화면이 하던 일을 파악하는 데만 읽었고 재사용 가능한 API로 보지 않는다.

| 근거 | 이 계획에 사용한 판단 |
| --- | --- |
| [목적](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/purpose.md), [AGENTS](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/AGENTS.md) | 문서 중심, 증거 연결, 되돌리기, Core 의미/공식 쓰기 경계. 목적은 기능 제공 증거가 아님 |
| [ADR-0022](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/adr/0022-plugin-screen-code.md), [화면 계약](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/design/plugin-screens-v1.md) | React·ui·invoke·새 문서 saveDocument, 외부 라이브러리 제작 시 번들. 화면 저장은 기존 문서 수정 API가 아님 |
| [ADR-0006](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/adr/0006-native-document-boundary.md), [문서 형식](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/design/document-support-v1.md), [공개 작성 입력](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/design/plugin-stage1-v1.md), [README CLI](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/README.md#cli개발-실행http) | valid native 문서, 작성 입력과 최종 targets, create/check/inspect 및 revision 보호 |
| [#1462와 댓글](https://github.com/litzio/litzio/issues/1462), [#1450와 댓글](https://github.com/litzio/litzio/issues/1450), [Discussion #766](https://github.com/litzio/litzio/discussions/766) | 국소 검수·LSR 기대 구조·불변 원본의 역사. 11-12 결정은 이전의 Docling patch/replay와 사람 사전 승인 방식을 대체 |
| [LSR README](../../../fixtures/lsr-1.1/README.md), [NIST README](../../../fixtures/nist-sp1108r4/README.md) | 기존 JSON만 재사용. 기대 구조는 변환 출력 정답이나 대표 정확도 표본이 아님. 현재 계약 v2에는 NIST 그림/쪽 data URI도 포함 |

이하 `보관:` 경로는 모두 공개 저장소 태그 [`archive/2026-11-13-plugins-declarative`](https://github.com/litzio/litzio/tree/archive/2026-11-13-plugins-declarative), 대상 commit `f2c07204b2927f1e0c31a7aaa604a4aa9c2157d1` 기준이다.

- `community-plugins/docling/{document.js,lenses.js,review.js,workspace.js,README.md,CHANGELOG.md,ROADMAP.md,skills/review/SKILL.md}`: 변환·자료 선별·대응·교정의 실제 경계. CHANGELOG 0.0.11의 native 직접 교정이 초기 README/ROADMAP의 재생성 설명보다 나중 결정이다.
- `docs/design/docling-review-stage3.md`: 11-11 경로 갱신 방식 A, 11-12 즉시 교정·직접 편집·대응 불확실 처리·부분 실측. LSR 13쪽 전체 의미 검수는 완료되지 않았다.
- `docs/spikes/2026-10-30-docling-compare.md`, `2026-10-31-docling-plugin-runtime.md`, `2026-10-31-docling-plugin-ui.md`: 과거 대조와 runtime 실험. 구현을 현재 계약으로 옮기지 않는다.
- `docs/spikes/2026-11-11-1462-block-identity.md`: 경로 갱신 방식 A의 제한된 실험 성공과 영속 ID 방식의 실패. `2026-11-11-1462-evidence-match.md`: 오류 주입 탐지는 통과했지만 정상 경보가 LSR 4.62건/쪽, NIST 5.00건/쪽. 보조 후보로만 채택한다.
- `docs/spikes/2026-11-12-1462-review-panel.md`의 선택 미정 기록은 #1462 댓글의 **A(문제 목록 중심) 선택**으로 보완한다.
- `apps/editor/src/review/`의 `ContinuousSource`, `ReviewRenderer`, `WorkspaceComparison`, `WorkspaceReviewPanel` 등: 쪽 이미지 지연 로드·bbox·양방향 선택·동기 스크롤·확대/폭 조절·문서 편집·문제 목록/근거/되돌리기·마지막 위치·완료 범위를 제공했던 화면. 앱 내부 import/API를 새 플러그인이 쓰지 않는다.

현재 문서에는 과거 선언형 review/jobs도 함께 남아 있다. 이것이 앞으로 유지된다는 가정은 하지 않는다. 특히 옛 `.docling` workspace·`review-asset:`·전용 비서 도구를 새 구현의 필수 공개 경로로 삼지 않는다.

## 3. 입력·출력과 원문 대응

### 입력

변환 결과 묶음 1건: DoclingDocument JSON, 원본 PDF 또는 hash로 식별되는 원본 참조, 변환 기록, 포함된 그림·쪽 이미지. 계약 v2에 따라 document.json(schema 1.10.0), conversion-record.json, record.source.file의 PDF를 받는다. 이미지는 JSON 안 embedded data URI이며 task/result 실패·부분 성공은 record와 페이지 목록으로 진단한다. 현재는 두 fixtures의 `converted/document.json`·`conversion-record.json`과 별도 PDF를 읽는 개발 입력을 기준으로 한다. 두 기존 JSON의 `schema_name=DoclingDocument`, `version=1.10.0`을 확인했다. 라이브 서버 상태로 해석하지 않는다.

보관 형식은 STORE ZIP `.docling`에 manifest/document/source PDF와 내장 ImageRef, 나중 버전에는 검수와 내부 문서까지 담았다. 새 입력은 변환 산출물만 읽는다. 이전 workspace의 교정·캐시를 가져오거나 그 ZIP 형식을 새 계약으로 고정하지 않는다. importer는 계약 확정 후 그 파일 모양 하나만 지원한다.

읽을 때 schema와 참조 그래프·중복/순환·표 좌표·이미지 실제 bytes·hash·페이지 좌표를 검사한다. JSON 큰 정수 토큰을 반올림해 원본으로 다시 쓰지 않는다. 원본은 bytes로 보존하고 필요한 필드만 읽는다. 외부 URI 자동 다운로드는 하지 않으며 누락 자산을 가짜 이미지로 대체하지 않는다. 기록된 실패 쪽·이미지 부재·provenance 부재를 빈 성공으로 취급하지 않는다.

### 출력과 저장 경로

출력 디렉터리의 논리 구성(PR 2에서 생성·인계 v1로 확정, 검수 이력은 후속):

| 파일 | 책임과 내용 |
| --- | --- |
| `document.md` | 공식 입력으로 만든 valid native 문서. 여기만 교정 정본. 검수 상태·Docling 표식을 본문에 끼우지 않음 |
| `assets/…` | 공식 이미지 저장 경로가 게시한 그림 bytes. 원본 hash와 최종 상대 URI 연결 |
| `provenance.json` | 버전 있는 원본↔문서 다대다 대응, 원본/생성기/문서 hash, 항목별 제외·표현 손실, 자산 대응 |
| `losses.json` | version 1.0.0 손실 전부, generation/revision으로 대응 파일과 결합 |
| `complete.json` | 마지막 wx 게시, 원본/문서/그림/대응/손실/snapshot/receipt digest. 생성 완결이며 검수 완료 아님 |
| `review.json` | 검사 범위·문제 묶음·교정 전후/근거/되돌리기 참조·사람 판단·완료 revision. DoclingDocument 확장 아님 |
| `generation.json` | 생성기 버전·규칙 버전·입력 hash·공식 저장 receipt와 완료/부분 실패 진단. 인계 권위는 별도 complete.json |

초기 저장은 Host 처리 코드가 공개 작성 입력을 만들고 `litzio create document.md --input request.json --format json`의 공식 경로로 게시한다. 입력은 `{authoring:{title?,inputs:[{key,blocks:[]}]},images:[{key,mime,base64}]}`다. 파일은 artifact 밖에 준비한다. literal text를 Markdown처럼 다시 해석하지 않는다. 공개 SDK `authorDocument`는 사전 검증용이고 실제 저장 receipt가 아니다. 최종 대응은 create receipt의 `inputs[].targets`와 `revision`에 결합한다. `litzio check document.md --format json`으로 재검사한다. 임의 `.md` 조립·내부 Core import·직접 overwrite를 하지 않는다.

화면 `saveDocument({name,authoring,folder?,open?})`는 새 문서만 배타적으로 저장하며 현재 props에는 images 입력이 없다. **그림이 있는 문서를 화면 saveDocument만으로 완성할 수 있다고 가정하지 않는다.** 1단계는 CLI 생성으로 그림까지 검증한다. 화면 저장에 images가 필요하면 범용 확장 필요로 분리한다. 응답 유실은 같은 이름 재생성으로 해결하지 않고 파일/receipt를 확인한다.

부속 JSON은 플러그인 소유 파일이다. `.md`와 다중 파일 원자 저장을 현재 플랫폼이 보장한다고 주장하지 않는다. 새 출력 디렉터리에서 문서/자산 저장→check→최종 receipt 대응 결합→부속 파일 검증→`complete.json` 완료 표지 순으로 게시한다. 중간 실패는 `incomplete`로 남기고 문서를 삭제하거나 원본에서 재생성하지 않는다. 소비자는 마지막 complete.json과 각 hash가 모두 일치해야 생성 완결 묶음으로 읽는다. 이것은 검수 완료가 아니며 현 v1의 unreviewed 문서는 검수 완료 입력으로 채택할 수 없다. 검수 단계의 여러 파일 갱신은 아래 플랫폼 능력으로 안전하게 묶어야 한다.

### 대응 저장 방식의 결정

| 대안 | 판단 |
| --- | --- |
| 본문에 Docling ID/좌표·임의 frontmatter·HTML 주석 삽입 | 폐기. native 허용 metadata 밖이며 가독성·편집/저장 보존을 보장하지 못함 |
| 모든 블록에 MyST label/영속 ID | 보류. 모든 종류에 쓸 수 있는 공개 identity가 없고 label은 출처 ID와 목적이 다름. 보관 spike도 Core 단독 방식 실패 |
| 문서 옆 버전 있는 JSON + revision별 공식 target | **채택**. 문서 자체 유효성과 독립 사용 유지, 다대다·셀·제외·편집 불확실성 표현 가능 |
| Docling JSON에 검수/수정 확장 또는 내부 문서 ZIP 정본 | 폐기. 불변 원본과 native 교정 정본을 다시 혼동하고 인계에 전용 reader를 강제 |

`provenance.json` v1의 최소 필드 설계(생성 v1은 PR 2에서 확정; 편집 후 갱신은 후속. PR 1 초안을 대체):

```text
schemaVersion, generationId, generatorVersion, rulesVersion
source: {pdfSha256, doclingSha256, documentSchemaVersion, bundleRef}
document: {relativePath, revision}
items[]: {sourceId, selfRef?, cellIndex?, regions[], disposition,
          targets[], losses[]}
regions[]: {pageNo, printedLabel?, bbox:[left,top,right,bottom], unit:"pt", origin:"TOPLEFT"}
targets[]: {path, documentRevision, selector?, bindingState}
selector: {listItem?} 또는 {row,column} (블록 경로에 임의 숫자를 이어 붙이지 않음)
```

`sourceId`는 입력 JSON hash + 원본 self_ref(+cell index)로 만든다. self_ref 단독은 다른 변환 실행과 같은 항목이라는 증거가 아니다. sourceId와 문서 path를 영속 블록 identity로 사용하지 않는다. 원본 `prov`의 모든 페이지/charspan/원래 좌표도 감사용으로 보존하고, 화면용 TOPLEFT pt 변환 시 페이지 높이·회전을 확인한다. 물리 PDF 1-based 쪽과 인쇄 쪽 번호를 별도 필드로 둔다. 셀 병합은 한 원본 셀→여러 출력 칸, 캡션은 여러 원본→소속 표/그림 block으로 연결한다. 미주는 생성 receipt의 재배치된 정의 block으로 연결한다. 중첩 목록은 최상위 포함 항목 target으로 대응하며 정밀 부분 selector를 새로 만들지 않는다.

`bindingState`는 `current | uncertain | deleted | no-source`. 출력이 없는 원본은 disposition으로 `furniture | omitted | unsupported | container`를 구분한다. 새 문단 삽입은 실제 원문 영역을 붙이거나 `no-source`로 두며 이웃 문단 출처를 빌리지 않는다. 삭제해도 과거 원본 항목과 손실은 남긴다.

### 수동 편집·교정·재생성

1. 정상 생성 이후 문서가 정본이다. 비서/사람 교정은 일반 리치오 문서 편집 경로로만 한다. Docling patch/replay로 결과를 다시 만들지 않는다.
2. 공식 편집 receipt가 변경 대상·경로 이동을 증명하는 경우에만 대응을 갱신한다. split/merge는 다대다, 삭제는 tombstone으로 남긴다. split에서 원래 영역 전체를 두 문단에 공유하는 것은 추정이다. 정확한 부분 영역이 확인되기 전에는 그 관계를 uncertain으로 두고 원래 영역과 분할 근거를 남긴다. 일반 사람이 쓴 글자 교정도 원문 사실을 바꿨다면 재검사 대상이다.
3. 관찰하지 못한 외부 편집·전체 source 교체는 문서는 보존하고 대응을 `uncertain`으로 둔다. 개수·내용이 같다는 이유로 identity를 추정하지 않는다(삭제+삽입/재배열 반례). 원본 쪽 정보와 이전 대응은 역사로 유지한다. 후보 재연결은 제시할 수 있으나 확인 전 현재 출처로 인계하지 않는다.
4. 현재 공개 계약의 path는 revision 내부에서만 유효하다. 안전한 편집 후 대응 갱신 능력이 나오기 전에는 changed revision의 자동 교정·검수 완료 인계를 막는다. 이것이 수동 편집을 금지하는 것은 아니다. 편집 사실을 잃지 않고 재대조 필요를 보여 준다.
5. 다시 변환/다시 생성은 **새 generation/새 출력**으로만 한다. 기존 문서·교정 이력을 자동 이식하거나 덮어쓰지 않는다. 필요하면 native 문서 비교 후 사람이 변경을 채택하고 새 근거를 확인한다. 자동 3-way merge는 현재 범위 밖이다. 캐시 손상도 원본 재생성으로 덮어 복구하지 않는다.

`requirements-extract`는 문서 revision과 대응 파일을 함께 읽어 결과에 generationId·documentRevision·target selector·원본 PDF hash/쪽/bbox를 복사한다. uncertain이면 출처 확인 필요로 남기고 확정 출처로 표기하지 않는다. 부속 파일 없이 문서만 전달해도 읽을 수 있지만 검증된 출처 인계는 성립하지 않는다. 이 제안은 구현 시 해당 소유자들과 `contracts/`에 함께 확정해야 한다. 이번 PR은 그 폴더를 고치지 않는다.

## 4. 문서 만들기 규칙

**추출 오류를 추측해서 고치지 않는다**를 유지한다. 생성기는 Docling이 명시한 구조를 native에 옮기고 표현 손실을 드러낸다. PDF와 문맥으로 추출 자체를 고치는 일은 증거 있는 검수로 분리한다. 원문 오탈자는 그대로 두며 숫자·부호·단위는 정규화하지 않는다.

native 형식의 표현 능력과 공개 작성 입력의 표현 능력을 구분한다. 2026-11-13 PR 1 구현: JavaScript ESM 처리 모듈(런타임 Node 의존성 없음), 선택적 Python/pypdf 북마크 사전 검사만 별도 제공한다. 실제 실행과 세부 규칙은 ../README.md, 측정은 results.md를 따른다.

2026-11-13 공개 master의 공식 작성 입력이 inline content·표 caption/label·미주·중첩/문자 목록·label/reference를 받는다. CLI의 모든 위치 content를 보존 검증에 사용한다. 내부 AST나 Markdown을 조립하지 않는다. 근거가 없는 호출부·상호 참조·추출되지 않은 서식은 만들지 않는다.

| 요소 | 보관 document.js가 한 일 / 한계 | 새 결정과 검수 기준 |
| --- | --- | --- |
| 순서·다단 | body.children 참조 순회, 배열 순서 사용 안 함. group 자식 유지 | 유지. 다단을 좌표로 임의 정렬하지 않음. 겹침/열 사이 점프는 의심 후보. furniture 트리·미도달도 inventory |
| 제목 | title→H1, section_header level 1–6. 잘못된 level은 문단+손실 | 유지. 원문 번호를 literal로 보존하고 자동 제목 번호 끔. 번호만 보고 단계 추정 금지. frontmatter title은 명시 입력만 사용, 첫 H1과 혼동하지 않음 |
| 문단 | text→literal 문단 | 유지. 원래 orig와 text 차이 보존. 한 항목의 여러 prov는 하나의 문단일 수 있음 |
| 목록·중첩 | 연속 번호/종류 묶음, 100항목씩, 중첩 평탄화·비숫자 marker 손실 | 명시 group/children의 중첩과 숫자·단일 문자 style/delimiter/start를 작성 입력으로 옮긴다. 모호한 Roman/문자, 불연속·지원 불가 구조는 손실로 남긴다. 중첩 item의 native 대응은 최상위 포함 항목으로 한정 |
| 표·병합 | num_rows×num_cols, 첫 행 header, 병합 글자 반복, 다단 header/row role 손실, 잘못된 span/중복 점유 전체 실패 | 첫 생성은 반복 표현 유지하되 원본 셀 index/span과 모든 출력 위치 연결. 빈 칸은 빈 칸, 미점유는 누락 확정 아님. 병합/복합 머리 표는 전부 검수 대상. 명시된 연속 머리 행을 ‘상위 머리 – 하위 머리’로 한 행에 합치고 원본 셀별 source span→출력 selector를 남긴다. 표 바로 아래에 원문 병합 좌표와 공통 조건/합계/범위일 수 있다는 설명 문단을 둔다. 병합 셀·복합 머리 역할은 형식을 바꾸지 않는 유지 한계이며 이 플러그인이 처리한다 |
| 셀 수식·여러 줄 | 셀 text만 전달, inline 수식/서식 추출 안 함 | 수식을 plain text로 보존해도 의미 보존 성공으로 채점하지 않음. 줄바꿈/Core 거부는 진단하고 전체 생성 거부, 임의 공백 치환 금지. 작성 입력은 inline cell을 받지만 현재 sourceCell에는 구조가 없으므로 추측 파싱하지 않는다. 셀 블록은 native 유지 한계 |
| 수식·번호 | formula.text→Equation, 수식 번호 연결 안 함 | LaTeX 원문 유지. 같은 formula.orig의 명시적 괄호 접두 번호(예: (1))가 유일하고 LaTeX에 중복 tag/label이 없으면 fixed enumerator로 옮긴다. 번호 증거는 structure.numberEvidence에 보존한다. LaTeX는 그대로이며, 떨어진 번호는 추측 연결하지 않고 검수한다. 깨진/반복 formula·본문 오분류 후보. 렌더 성공은 의미 정확성 아님 |
| 그림·캡션 | embedded PNG/JPEG/WebP→공식 images. 확실한 Arabic/대문자 절 번호(예: K.1) fixed, 그 외 원문 caption+번호 없음/손실 | 유지. bytes hash 보존. missing ImageRef는 pending+차단 손실. 현재 NIST의 embedded 자산도 검증한다. 잘못된 bytes는 거부하며 missing으로 낮추지 않음. 그래프를 수치 표로 추측 복원하지 않음 |
| 표 캡션 | 번호는 표, 글자는 뒤 문단(작성 입력에 caption 없음) | 공식 native table.caption으로 이관하고 소속 table block에 다대다 대응. 종류 불일치/중복/모호한 번호는 원문 보존+번호 없음 |
| 주석·각주·위첨자 | footnote를 문단으로 유지, call site 추정 안 함. inline formatting/link 손실 | 추출된 formatting/hyperlink를 inline 구조로 보존한다. 미주는 source의 단일 marker occurrence와 PDF의 작은 raised item/인접 baseline·표 소유 범위를 함께 확인할 때만 연결한다. 호출부 없음/중복은 손실. 표 전용 주석 구역/원래 문자 표지는 연결 뒤에도 유지 한계. 중요한 지수/주석 소실은 차단 손실 |
| 코드 | code_language와 text→Code | 유지. 줄/공백 의미 보존, unknown language는 빈 값. 수식으로 추측 변환하지 않음 |
| 페이지 경계 | 서로 다른 문단/표를 자동 병합하지 않음 | 유지. 인접 양쪽을 검수 묶음으로 읽음. 같은 항목의 다중 prov는 그대로 유지. 별개 항목 병합은 원문 증거·읽기 순서·표 열 일치 확인 뒤 native 교정, 반복 header 제거도 기록 |
| 머리글·바닥글·쪽 번호 | furniture layer 또는 page_header/page_footer 제외 | 명시 분류만 자동 제외. 반복/숫자/가장자리 휴리스틱만으로 본문 삭제 금지. 제외한 항목도 원문 대조 가능. 계약 v2 고정본의 furniture/page_header/page_footer만 제외; NIST 측면 출처 포함 |
| 목차 | document_index 등 미지원 역할은 문단/자식 유지+손실 | 목차를 본문 제목으로 올리지 않음. 텍스트·페이지 번호 보존, native 자동 목차로 치환하지 않음. 구조가 표이면 표 규칙 적용 |
| 미지원·미도달 | text는 문단, group은 자식 유지, 미도달/빈 내용 손실 | 유지. 잘못된 참조/순환/겹친 셀은 실패. 알려지지 않은 역할과 원문 없는 출력은 숨기지 않고 별도 집계 |

그림/표는 확실한 `Figure/Fig./그림`, `Table/표` + Arabic 숫자와 대문자 절 번호(`2-1`, `2.1`, `K.1` 포함)를 접두어에서 fixed 번호로 옮긴다. 독립 Roman·알파벳 표지·접미사·중복·여러 caption 등 모호함은 원문 그대로와 `enumerated:false`. Equation에는 번호 없음 옵션이 없으므로 같은 옵션을 넣지 않는다.

표현 손실은 `sourceId, reasonCode, originalValue/structure, outputTargets, severity, resolution`으로 기록한다. 단순 강조 소실처럼 의미 영향이 낮은 손실과 주석/수식/표 의미를 바꾸는 차단 손실을 나눈다. 원본 PDF와 기록을 보관했다는 이유로 읽기 좋은 native 표현을 달성했다고 판정하지 않는다. 첫 단계는 손실 있는 초안으로 가치가 있고, 전체 완료 판정은 후속 복원/검수까지 기다린다.


### 2026-11-13 소유자 답과 PR 1 구현 결정

- 제목: 북마크가 있는 문서는 정확한 계층이 중요하고, 없는 문서의 한계는 감수한다. level은 그대로 보존한다. 선택적 pypdf outline 검사 결과를 PDF hash로 묶고 생성 보고에 present/absent/unknown을 기록한다. use_bookmarks=true만으로 실제 북마크 존재나 개별 제목의 근거를 단정하지 않는다. absent/unknown은 신뢰도 낮음·검수 대상으로 남긴다. 두 LSR 판은 각각 16/17, 3/17이며 합산하지 않는다.
- **2026-11-13 소유자 답: 수식은 사람이 검토하되 기계적 오류 점검은 한다.** 모든 수식에 원문 쪽·bbox와 검수 필요를 붙인다. LaTeX는 변경하지 않는다. 빈/해독 실패·괄호/환경 짝·intertext 문장 혼입 점검을 PR 3에서 앞당겼다. LSR 세 번째 실패의 문장 혼입을 검출하고 첫 두 수식에는 의심 표시가 없다. 이는 내용의 정확성 보증이 아니다. PDF 글자 층 숫자 대조는 parser/좌표 대응 범위를 줄이기 위해 PR 3에 둔다. 묶음·화면·비서 연동도 PR 3 이후다.
- 그림/표 번호는 유일하고 명시된 Arabic/절 번호(예: K.1)만 fixed로 쓰며, 그림에서는 해당 prefix를 caption에서 옮긴다. 표 caption은 원문 전체 별도 문단으로 보존한다. 새로 자동 번호를 붙이지 않는다. 식 번호는 연결을 추측하지 않는다.
- 원문 bbox는 Docling 쪽 좌표를 보존하며 TOPLEFT pt를 함께 낸다. 회전/인쇄 label은 명시 자료가 없으면 null이다. 셀 페이지를 추측하지 않고 원본 cell bbox와 표 전체 영역을 유지한다.
- 초안 대응/표지는 PR 1 생성 증거일 뿐, PR 2의 소비자용 인계/수정 후 갱신 규칙을 확정하지 않는다. rich 작성 입력 부족은 숨기지 않고 후속 플랫폼 요구로 남긴다.

## 5. 문제 탐지와 묶음

보관 `lenses.js`는 **문제 탐지기라기보다 7종 자료 선별기**다. 자료 추출됨·AI 검사됨·문제 없음은 서로 다르다. `review.js`는 원문 bbox/출력 대응·진행·evidence 범위 분류를 만들고, 묶음/판단 저장은 공용 ledger에 의존했다. 옛 공용 ledger를 플러그인에 복사하지 않는다.

| 옛 자료/규칙 | 판정 | 새 사용 |
| --- | --- | --- |
| headings(title/section_header/document_index, level·순서) | 유지·확장 | 단계 점프, 목차-본문 혼동, 제목 같은 본문 후보. 자동 수준 교정은 안 함 |
| headers-footers 공식 분류 + 상하 12%·220자 이하·숫자 정규화 후 2쪽 이상 반복 | 수정 | 제외 inventory와 본문 잔재 후보 구분. 반복되는 진짜 본문/짧은 표 아래 본문 반례 포함, 임계값은 튜닝값으로 기록 |
| captions 소유 관계·고아 캡션·앞뒤 문맥 | 유지 | 번호 중복·종류·연결 부재 탐지, 원문 없는 연결 자동 생성 금지 |
| footnotes 소유 관계 + 아래 35%의 숫자/문자 prefix | 수정 | 낮은 확신 후보. 서로 다른 표에 같은 문자, 다음 쪽 정의를 함께 읽고 적용 범위 확인 |
| lists 그룹·marker·순서 | 유지·확장 | 중첩 손실/번호 불연속/본문 오분류 후보 |
| page-boundaries 쪽의 마지막/다음 첫 항목 | 유지 | 문단/표 이어짐 후보와 누락 경계. 경계 항목 없음도 evidence, 무조건 병합 금지 |
| formulas-tables 원본 수식·셀 span·겹침/미점유 | 유지·확장 | 겹침/범위 오류는 생성 거부. 미점유·빈 formula·중복 formula·긴 자연어 formula·본문 picture 오분류는 후보 |
| 모든 표/그림을 사람 필수 확인으로 지정 | 폐기 | inventory는 전부 유지, 비서가 먼저 확인. 사람에게는 판단 불가/중요 잔여/표현 손실과 최종 요약만 |
| source-evidence가 optional이며 묶음도 만들지 않음 | 수정 | 디지털 PDF의 숫자·부호·단위 대조는 검수 필수. 후보에서 묶음으로 이어 가되 범위 밖/추출 실패를 별도 표시 |
| checkedPages/lastPage 및 coverage | 수정 | 페이지 방문=검사 완료 금지. 현재 revision·검사 종류·대상별 실제 검사 범위와 재개 위치 기록 |

### PDF 글자 층을 독립 증거로 읽는다

**플러그인이 직접 할 수 있다**고 판단한다. 보관 review-evidence는 PDF.js legacy Node build로 추출했다. 새 플러그인은 PDF.js와 필요한 worker/font 자산·라이선스를 제작 시 묶고 Host 처리 코드에서 PDF bytes만 읽는다. 내부 review-evidence API를 쓰지 않는다. 버전/Node 호환·한글 font·회전·ligature·좌표의 실제 bundled 실행은 미확인이며 3단계 진입 검사다. 별도 Python 설치·PDF 서비스·Docker는 필요하지 않다.

본문은 쪽/영역으로 나눈 제한된 순서 비교, 표/캡션/각주는 별도 그룹과 셀 geometry를 사용한다. 숫자 문자열·소수·지수·+/−·< / ≤·단위 대소문자 차이를 보존한다. 띄어쓰기·줄 분리 정규화는 비교용으로만 하고 원문 token과 이유를 함께 남긴다. 양방향 비교로 원문에만 있는 글자와 문서에만 있는 글자를 모두 후보화한다. 표 token multiset만 같아도 칸 교환을 놓칠 수 있으므로 셀 위치 관계를 따로 검사한다. 수식 영역은 단순 token 일치로 통과시키지 않고 이미지 대조한다.

furniture/그림/수식 영역 제외는 옛 구현의 한계다. 새 설계는 제외 영역 목록과 면적/페이지를 노출하고, 본문이 수식·그림으로 잘못 분류되면 이미지·글자 층 유무를 대조하는 별도 후보를 만든다. 빈 글자 층, bbox 없는 영역, PDF에만 있는 텍스트/큰 미포함 영역은 `unavailable/uncertain`이며 정상 판정이 아니다. 스캔 영역 누락을 글자 층 비교로 찾았다고 주장하지 않는다. 페이지 이미지와 inventory의 대조는 비서의 별도 검사다.

### 묶는 기준과 사람 분량

문제 묶음은 `reasonCode + 근거 패턴 + 조치 종류`로 만든다. 같은 머리글 반복처럼 같은 판단이 가능한 항목만 묶고 대표 1건·대상 전체 수·예외를 보여 준다. 같은 쪽의 숫자 불일치와 주석 범위 문제는 별개다. 대표만 고쳤는데 전체가 해결됐다고 처리하지 않는다. 같은 규칙 적용도 대상별 before/근거 재검증, 한 대상 실패 시 그 변경 묶음은 무쓰기다. 이질적인 대상은 분리한다.

비서 처리 기본 단위는 **의미상 독립된 문제 묶음 1개, 기본 1–3쪽**이다. 페이지 경계는 양쪽을 포함한다. 큰 표는 표 전체와 캡션/주석을 하나로 읽으며 3쪽을 넘으면 하위 검사를 나누되 최종 관계 검사는 유지한다. 문서 전체 입력·전수 페이지 이미지 첨부를 기본으로 하지 않는다.

초기 추정은 원시 후보 수 C, 중복 제거 묶음 수 G, 비서 해결 수 A, 판단 불가 U, 표현 차단 B, 중요 오류 미해결 H를 별도로 센다. 사람 목록은 U/B/H의 중복 없는 합집합과 최종 요약이다. 표본에서 원인별 건수/쪽과 묶음당 검토 시간 중앙값·상위 90%를 재고, 긴 문서의 장별 밀도에 곱해 예상 시간과 범위를 낸다. 과거 4.62건/쪽을 300쪽에 단순 곱하면 약 1,386 후보라서 원시 후보 직접 전달은 수락 불가다. 이 계산은 작업량 경고 예시이며 새 탐지기의 실측이 아니다.

## 6. 비서 검수와 기록

플러그인의 스킬에는 다음 순서를 담는다. 보관 스킬을 현재 도구 이름으로 복사하지 않고 새 공개 작업/파일에 맞춰 쓴다.

1. generation 표지·원본 hash·현재 문서 revision·검사 범위·기존 판단을 읽는다. 다른 generation 자료를 섞지 않는다.
2. 숫자·단위 후보를 우선하고 7종 자료/실패 영역·본문 coverage를 순회한다. 해당 묶음의 현재 native 블록/셀, 원본 JSON 조각, PDF 글자 층 token/좌표, 앞뒤 항목, 필요한 쪽/영역 이미지를 읽는다. Docling 원문 텍스트 재렌더를 PDF 증거로 쓰지 않는다.
3. 원문 근거가 있는 차이만 일반 리치오 의미 편집으로 교정한다. 별도 Docling 수정 명령은 없다. 번호만 보고 제목 추정, 빈 셀 채우기, 오탈자 교정, 이미지 미표시를 근거로 삭제를 금지한다. 불충분하면 `uncertain`과 필요한 증거/사람이 결정할 항목을 남긴다.
4. 쓰기 전 현재 revision/before를 재검사한다. 숫자·단위·부호 교정은 쓰기 후 독립 PDF token과 다시 대조한다. 수식·그림·표 구조는 쪽 이미지도 대조한다. create/check 통과는 교정 사실성의 검증을 대체하지 않는다.
5. 실제 읽은 대상·검사 종류·쪽·revision·결과만 기록하고 다음 묶음으로 진행한다. 후보 0건을 전체 문서 일치로 해석하지 않는다. 검사되지 않은 페이지/영역은 그대로 남긴다.

작업 표면은 플러그인 공개 read 작업(예: 목록, 묶음 material, PDF evidence, 진행 읽기)과 플러그인 소유 JSON 기록 쓰기, **리치오 일반 문서 편집**으로 나눈다. 이름과 schema는 구현 전 공개 plugin 안내에 맞춰 확정한다. 스킬은 CLI 호출·입력 파일 schema·출력 파일 위치를 안내한다. 화면은 generationId/문서 revision/선택 묶음/범위가 담긴 작업 파일을 만들고 “비서에게 검수 맡기기”로 연결한다. 자동 맥락 전달이 없으면 사용자가 그 파일을 대화에 첨부해 시작할 수 있다. 화면 state를 비서가 이미 안다고 가정하지 않는다.

교정 기록의 최소 필드: changeId, groupId, actor(assistant/human), 모델/스킬 버전(알 수 있을 때), UTC 시각, source hash, before/after 문서 revision, 대상 selector와 값, evidence ref/hash/실제 검사 범위, 일반 편집 receipt, 되돌리기 자료, 검증 결과. 원본 변경 없이 기록한다. 교정은 사전 사람 승인을 기본으로 하지 않는다(#1462의 11-12 결정). 사람은 적용된 전후·이유를 보고 되돌리거나 직접 고친다. 근거 없는 판단을 높은 확신 점수로 대신하지 않는다.

되돌리기는 현재 대상이 교정 후 값과 같은지 확인하고 일반 편집의 역연산으로 처리한다. 구조 교정의 안전한 역연산이 없으면 교정 직전 snapshot으로 복원하되 이후 문서 변경이 없을 때만 허용한다. 이후 수정을 덮어쓰는 whole-file 복원은 거부한다. 문서와 대응/이력의 결합이 깨지면 `pending-reconcile`로 남겨 완료를 막는다. 이 쓰기/되돌리기의 안전한 receipt·연결 능력은 플랫폼 선행 조건이며 임의 파일 patch로 대신하지 않는다.

진행은 문서 전체 job 하나의 성공/실패가 아니라 `미검사/검사중/차이없음/교정후재검사/판단불가/실패`를 범위별로 저장한다. 묶음 성공마다 checkpoint, source hash·document revision·규칙/스킬 버전을 기록한다. 중단은 다음 묶음을 시작하지 않고 진행 중 쓰기 결과를 확정한 뒤 멈춘다. 재개는 현재 revision과 마지막 확정 checkpoint를 읽는다. 응답 유실 시 요청 상태/파일을 관측하고 자동 재전송하지 않는다. 예산/시간이 끝나면 미검사량을 남기며 성공으로 닫지 않는다.

완료는 비서 검사 전 범위 충족, 판단 불가와 중요 차단 손실 0, 실패 영역 0, 중요 token 재대조, 유효 대응을 확인한 뒤 사람이 최종 확정한다. 사람은 전 페이지·모든 표를 별도로 체크할 의무가 없다. 전체 쪽 제외처럼 대량 삭제는 사람이 범위를 확인한다. 수정 뒤 완료는 해당 revision에서 무효화하고 영향 범위를 증명하지 못하면 전체 재검사 필요로 둔다. 생성된 문서 열기는 미완료 상태에서도 가능하다.

## 7. 사람이 하는 일과 최소 화면

화면은 **가져오기/결과 요약**과 **문제 목록 중심 검수**의 두 상태로 시작한다. 파일 탐색기/일반 문서 탭/비서 대화는 리치오 기존 화면을 쓴다. 별도 PDF 뷰어 앱이나 새 편집 화면을 플러그인에 만들지 않는다.

1. 플러그인에서 변환 결과 묶음을 고르고 입력 원본·쪽 수·누락 자산·지원 버전을 확인한다. “문서 만들기”를 누르면 새 출력만 만든다.
2. 결과에서 “문서 열기”와 생성 손실/검수 미완료 요약을 본다. 여기까지는 원문과 문서의 나란한 대조가 없어도 가치가 있다. 첫 PR의 CLI 흐름도 같은 결과를 만든다.
3. “비서에게 검수 맡기기”로 현재 묶음 작업을 전달한다. 진행/중단/재개, 미검사·교정·판단 불가 수를 본다. 사람이 옆에서 페이지를 넘길 필요는 없다.
4. 남은 문제를 고르면 대표 항목·전체 대상·원문 쪽/상자와 **현재 native 문서 위치**가 나란히 열린다. 원본 확대와 문서 강조/이동, 필요한 이웃 쪽을 제공한다. 표 셀 귀속·수식·주석 범위·누락/삭제·비서 판단 불가를 사람이 결정할 때 이 대조가 필수다.
5. “적용된 교정”에서 전후/근거를 확인하고 “되돌리기”, 추가 교정 지시 또는 일반 문서 직접 편집을 한다. 재검사 뒤 최종 요약과 잔여 위험을 보고 “검수 완료”를 누른다.
6. 문서·assets·대응·검수 기록이 일치하는 완료 generation을 다음 플러그인에 넘긴다. 중간 결과 전달은 명시적으로 미완료 표시한다.

보관 화면의 연결선·동기 스크롤은 편의 기능이고 첫 대조 수락의 필수는 **정확한 양방향 위치 연결·현재 revision 표시·이미지 원본성·미저장 편집 보호**다. 쪽 썸네일은 접을 수 있게 하고 전체 PNG 동시 로드는 피한다. 독자 구현으로 native 문서를 HTML처럼 흉내 낸 미리보기는 대조 화면으로 수락하지 않는다.

## 8. 플랫폼에 필요한 범용 능력

아래는 요구 능력이며 새 API가 이미 있다는 뜻이 아니다. 현재 계약의 과도기 기능을 삭제 뒤에도 사용할 수 있는지는 구현 직전 확인한다. 부족한 점은 이 문서에 모으며 이번 요청의 충돌 방지 규칙에 따라 `docs/progress.md`는 수정하지 않는다.

| 능력 / 실제 막히는 일 | 시점 | 범용성 | 플러그인 대안·결정 |
| --- | --- | --- | --- |
| 공식 native 작성·이미지 게시·최종 targets·check | 첫 단계부터 필요(현재 CLI 경로 있음) | 모든 가져오기/보고서 작성 | create 입력과 receipt 사용. 내부 writer/asset 저장 구현 안 함 |
| 새 화면 저장의 images 입력 | 없어도 됨(첫 단계 CLI), 화면 생성 완성 시 필요 | 보고서/HTML·Word 가져오기 | 현재 saveDocument만으로 그림 게시 불가. CLI 경로 유지 가능, 필요할 때 범용 images 확장 요청 |
| rich inline/위·아래첨자·미주/중첩·문자 목록/rich cell/표 캡션·label/reference 작성 입력 | 공개 master에서 충족. 실제 이관은 원본 근거가 있는 범위 | 기술 문서 가져오기·번역 | CLI 소스 빌드와 content roundtrip으로 확인. source에 없는 구조/참조는 복원하지 않으며, 더 이상 플랫폼 보강 대기로 분류하지 않음 |
| CLI 읽기 출력의 완전한 inline 구조 | 공식 rich 작성 입력 소비 시 필요 | 모든 문서 처리 | 현재 일부 구조 생략. 보강 전 구조를 추측하지 않고 원본 중간 표현에 보존 |
| 문서 표시·특정 target 이동/강조·선택 알림 | 검수 단계에서 필요 | 번역 검토·문서 비교 | 일반 문서 탭 열기는 1단계 대안. native renderer 복제는 대안 아님 |
| 원본 영역과 native target을 연결하는 대조 틀 | 검수 단계에서 필요(사람 판단 시작 전) | PDF/Word 가져오기·번역 원문 대조 | PDF.js로 원본만 그릴 수 있음. native 쪽·초안 보호·선택 연동이 없어 전체 대조를 혼자 완성할 수 없음 |
| 일반 문서의 안전한 부분 편집/충돌·되돌리기 receipt와 변경 관계 | 검수 단계에서 필요 | 모든 AI 문서 교정 | CLI inspect/수정/if-revision이 가능한 범위는 사용. 플러그인 화면 수정 API와 편집 후 provenance 이동 증명은 현재 미확인. receipt가 없으면 uncertain으로 중단, 직접 파일 overwrite 금지 |
| 문서+플러그인 부속 기록의 일관된 commit 또는 조정 가능한 receipt | 검수 단계에서 필요 | 번역 이력·감사 기록·요구사항 연결 | 생성은 새 디렉터리+완료 표지로 가능. 교정은 revision 검사·쓰기 결과와 기록 조정이 필요. 전체 폴더 트랜잭션 프레임워크를 미리 요구하지 않음 |
| 긴 작업 진행·중단·상태 재조회 | 검수 단계에서 필요 | 일괄 분석·내보내기 | 플러그인 소유 checkpoint와 묶음당 처리 가능. React 취소만으로 Host 중단을 주장하지 않음. 공개 invoke 수명으로 부족한 시점에 범용 작업 능력 요청 |
| 화면 맥락을 비서에게 전달/비서에서 공개 작업 호출 | 자동 전달은 없어도 됨, 파일/CLI 접근은 검수 단계 필요 | 모든 비서 작업 | 작업 파일 첨부+스킬/CLI로 시작 가능. Host가 다른 경우에도 파일이 비서에게 실제로 읽히는지 검증 필요 |
| 영속 블록 ID·모든 편집 자동 재연결 | 없어도 됨 | 장기 출처 추적 | revision별 path+보수적 uncertain으로 시작. 특정 실패가 확인되기 전 범용 identity 엔진 요청 안 함 |
| 저장소 폴더 설치 | 없어도 됨 | 모든 로컬 플러그인 | 현재 공개 artifact 설치/갱신 절차로 격리 Host에서 검증. URL 설치·배포 시스템 만들지 않음 |

2026-11-13 플랫폼 조사 결론: 병합 셀/복합 머리·머리 열, 표 전용 주석 구역과 표지, 셀 안 줄바꿈·여러 블록·목록, 정적 목차 역할은 형식에 넣지 않는다. #597/#778의 단일 표 방침을 유지한다. 병합/복합 머리의 반복·합치기·원래 범위와 검수 설명은 이 플러그인의 책임이며 플랫폼 확장을 요청하지 않는다. 수식/그림 고정 번호는 이미 공개 작성 입력에서 된다.

플랫폼에는 Docling ref·렌즈 이름·PDF 오류 규칙을 넣지 않는다. 원본 영역/문서 target/편집 receipt·수명만 중립 계약으로 요구한다. 보관 `workspace.js`의 SDK 내 parse/개별 연산을 봤다는 이유로 새 공개 경로라고 선언하지 않는다.

## 9. PR 순서와 검증

크기 S/M/L은 대략 단일 책임의 소/중/대 변경량이며 일정 약속이 아니다. 단계마다 공개 계약을 확인하고 필요한 플랫폼 PR과 플러그인 PR을 분리한다. PR 1 실제 검증 결과는 results.md에 기록했고, PR 2 중 생성 대응/인계와 표 규칙 추가 검증은 results-pr2.md에 기록했고, 설치/화면 및 PR 3 이후는 미래 계획이다.

| PR | 범위·크기 | 끝난 기준·고정 표본 단위 검사(리치오 없이) | 리치오 설치/화면 검사·선행 조건 |
| --- | --- | --- | --- |
| 1 생성과 채점(M) | importer·명시 변환 규칙·공개 authoring 요청·손실/대응 보고·CLI 생성 안내. AI/대조/교정 없음 | 두 고정 JSON의 schema/참조·요소 변환·전수 inventory, 잘못된 참조/표 겹침 거부, literal 숫자/단위 보존, 규칙별 score. 현재 계약 v2의 NIST embedded 이미지 사용 | 현재 CLI create+images→check→inspect→재열기·원본 hash·기존 파일 충돌. 새 플랫폼 능력 없이 문서 초안과 손실을 얻음. fixture 전체가 거부되면 성공을 꾸미지 않고 원인/지원 범위를 제출 |
| 2 대응·인계와 생성 화면(M) | versioned sidecar와 generation 표지, 최종 receipt 결합, 결과/손실 요약 | 다대다·셀 selector·미포함 자산·중간 실패/잘못된 hash/다른 revision 인계 거부, 재생성 시 기존 교정 보존 | 격리 Host artifact 설치→실제 invoke→결과 열기. 그림 화면 생성은 현재 공식 경로 가능 여부 확인 후 필요 시 images 확장. 설치됨은 화면 수락 아님 |
| 3 탐지·PDF 증거(M) | 7종 자료+독립 token 비교+문제 묶음. AI는 아직 없음 | 고정 오류 주입/오경보·제외 범위·스캔/회전·셀 교환·S20 음성 반례. PDF.js 번들 호환·원본 미변경 | read 작업/CLI로 현재 문서와 evidence 연결 확인. 긴 작업 수명 필요 여부를 이 단계에서 실측 |
| 4 비서 교정·되돌리기(L, 필요하면 범위별 분할) | 스킬·1–3쪽 묶음·진행·native 교정·후검증 | fake 응답으로 before 충돌·부분 실패·재개·응답 유실·역연산·출처 이동·완료 무효화. fake 통과를 AI 품질로 주장하지 않음 | 일반 편집/변경 receipt·부속 기록 일관성·rich 표현 부족분 확보가 선행. 허가된 실제 AI로 LSR 일부→전체, 즉시 교정→Undo→재교정. 모델 응답 확인은 가장 저렴한 모델 |
| 5 사람 대조·최종 완료(M/L) | 문제 목록·원본/native 대조·적용 이력·판단 불가·완료 인계 | 완료 gate·현재 revision·미검사/범위 밖 차단 | 범용 표시/이동/대조 능력 선행. 실제 bbox↔셀/문단 이동·확대·미저장 충돌·Undo·재열기. 코드/CLI/화면/소유자 시각 수락을 분리 |
| 6 수백 쪽 수락(M 측정) | 첫 끝-to-끝 실사용, 성능/사람 부담 평가 | 긴 고정 합성 조합은 용량/재개 경계만 검증, 품질 일반화 금지 | 소유자 승인 자료 200쪽 이상 1건 실측. 상한 초과를 자동 장 분할로 숨기지 않음. 실패 원인에 따라 필요한 범위만 후속 PR |

현재 공개 작성 상한은 input/source 각각 4 MiB, 입력/블록 5,000, 문자열 16,384 UTF-16 units, 표 100×32다. 이미지 입력은 별도 제한이 있다. 구현 때 유지 여부를 다시 확인하고 생성 전 크기를 검사한다. 문서가 넘으면 이유와 필요한 범위를 제시하고 무손상 거부한다. 장별 출력은 실제 초과가 생기고 소유자가 정한 뒤 추가한다. 처음부터 거대한 파일/분할 추상화를 만들지 않는다.

처리 코드·단위 검사는 플러그인 폴더 안에 두고 입력 fixtures는 읽기만 한다. 변환 서버·외부 AI가 필요한 검사는 별도 명령/결과로 기록한다. 실제 시험은 격리 Host·임시 폴더로 하고 직접 시작한 프로세스는 종료한다. 비서가 플러그인을 만드는 능력 시험을 할 경우 저장소 규칙대로 Codex `gpt-6.1-terra`, high를 사용한다. 이번 계획 작성은 그 제작 시험이 아니다.

## 10. 측정과 책임 분리

변환 서버 담당자의 `tools/`는 **PDF 기대 구조→Docling 결과**를 채점한다. 여기의 채점은 **그 Docling 결과→native 결과**와 **검수 전→검수 후**를 담당한다. 코드를 다른 플러그인에서 import하지 않고, 고정 입력/hash/기대 구조·가능하면 버전 있는 score 파일만 공유한다. 변환 채점기는 tools/score_lsr.py의 지표별 [일치, 비교] 진단이다. PR 1은 독립 native snapshot 채점기를 사용하며 그 코드를 가져오지 않는다. 이번 PR에서는 tools/contracts/fixtures를 수정하지 않는다.

| 층 | 측정 | 오류 귀속 |
| --- | --- | --- |
| PDF→Docling | 작성자 elements/relations/cases와 Docling의 역할·순서·텍스트·bbox·셀·참조 비교 | 원본에 있으나 JSON에서 없거나 다른 값이면 추출 오류 |
| Docling→native | sourceId별 출력 유무·literal text·계층·셀 위치/반복·번호·자산·관계. 표준 변환 규칙에 따른 기대 손실 따로 표시 | JSON은 맞는데 native에서 바뀌면 생성 오류. native/authoring가 못 담으면 표현 한계. 규칙상 허용 손실도 품질 비용으로 집계 |
| 검수 | 알려진 실제 오류와 후보/교정의 대응, 잔여 오류/새 오류, 사람에게 남긴 양 | 탐지 누락·오경보·잘못된 비서 판단·잘못된 편집을 나눔 |

LSR은 `ground_truth/standards*.json`의 원래 `schema`(LSR-1.0 표기), provenance, `elements/relations/cases`를 그대로 읽는다. 폴더 버전 1.1이라고 내부 schema를 바꾸지 않는다. S01/S02/S14 제목·부록·목차, S04/S07/S17 표/셀 수식, S05/S06/S16/S19 주석, S08 부호/단위, S09 경계, S10 다단 이름, S11 오탈자, S12 그림, S13/S18 수식, S15/S20/S21 본문/장식 음성 반례를 각각 보고한다. 두 북마크 입력의 비교는 해당 고정 변환 결과가 있는 범위만 하며 없으면 미측정이다. NIST는 별도 작성자 oracle이 없으므로 생성 규칙·보존·일부 수동 주석/오류 주입으로 검증하고 LSR과 합쳐 대표 정확도를 내지 않는다.

숫자/부호/단위는 문맥/영역별 정확 일치율과 중요한 mismatch 건수를 같이 낸다. 문서 token bag 일치만으로 표 행/열 정확도를 통과시키지 않는다. 계층·목록 깊이·표 span·note_reference/caption_of/continuation 관계 정확도를 독립 항목으로 낸다. native 미지원은 분모에서 몰래 빼지 않고 `pass/fail/unsupported/unmeasured`로 표시한다.

검수 지표: 후보 precision=실제 오류 후보/판정한 후보, recall=찾은 오류/알려진 전체 오류, 교정 precision=옳은 교정/전체 적용 교정, 새 중요 오류 수, 검수 전후 중요 오류 수, raw 후보 수/쪽, 묶음 수/쪽, 비서 해결률, 판단 불가율, 미검사량, 사람 확인 묶음/시간. 판정 안 한 후보는 precision 분모에 섞지 않고 건수 표시한다. 실제 오류가 완전히 주석되지 않은 문서에서는 recall을 알 수 없다고 쓴다. 별도 holdout 공개 표본 확보 전에는 LSR 튜닝 성과를 일반화하지 않는다.

실제 AI 측정은 입력 hash·스킬/모델/추론 설정·읽은 범위·이미지 수·token/시간·중단 시점·적용/Undo·재열기·잔여 오류를 기록한다. 한 번 성공은 재현성 보장이 아니다. 고정 오류 주입은 detector 평가, 실제 검수는 end-to-end 평가로 분리한다. fixture 기대 구조를 비서 정답 입력에 넣어 평가를 오염시키지 않는다.

## 11. 가정·미확인·소유자 확인 필요

### 가정

- 디지털 PDF가 주 대상이고 원본 PDF에 접근할 수 있다. PDF 글자 층도 오타/인코딩 오류가 있을 수 있어 최종 증거는 필요 시 이미지다.
- 문서·assets·sidecar를 같은 출력 묶음으로 전달할 수 있다. 단일 `.md`만 요구하는 다음 단계는 출처 인계 요건을 다시 정해야 한다.
- 첫 단계의 명시적 손실 있는 초안은 가치가 있다. 전체 완료 기준은 후속 검수·차단 손실 해소까지 적용한다.
- 비서에게 근거 있는 즉시 교정을 맡기고 사람이 되돌린다. 이전 승인 대기·모든 표/그림 사람 필수 확인을 기본으로 되살리지 않는다.

### 미확인

- **계약 v2 확인:** schema 1.10.0·record/PDF digest·embedded 그림/쪽 이미지·furniture 관찰·북마크 두 판이 확정됐다. 고정본으로만 검사하며 재변환하지 않았다.
- 삭제 이후 공개 SDK·화면 props·작성 상한·일반 편집/비서 CLI·설치 절차. 옛 review/workspace 제공은 계획의 전제가 아니다.
- PDF.js bundled Node 실행/worker·한글·회전, native rich 작성의 실제 공개 입력, 그림 저장의 화면 경로, 문서 편집 receipt와 sidecar 결합·복구 능력.
- PR 1 CLI 생성/check/inspect와 자산 bytes·충돌·원본 보존은 실행했다. 설치·화면·AI 호출·새 변환·수백 쪽 성능/정확도/사람 부담은 미실행이다.
- NIST의 현 계약 v2에는 그림과 쪽 이미지가 있다. 북마크 없는 고정 입력도 검사했다. holdout 표본·실제 오류 주석의 충분성은 미확인이다.

### 소유자 확인 필요(기다리지 않고 아래 가정으로 진행)

| 확인할 결정 | 지금의 결정과 이유 | 답이 다르면 고칠 곳 |
| --- | --- | --- |
| 대응/검수 sidecar 동반 전달 | 채택. native 유효성·가독성·다대다 대응을 함께 지키는 가장 단순한 방식 | 3절 출력 계약, requirements-extract 인계. 본문 ID 필요 시 먼저 범용 identity 계약 논의 |
| 교정 후 재생성 정책 | 새 generation만 생성, 교정 자동 이식 없음. 수동 수정 유실 방지 | 3절 재생성/비교·채택, 이후 실제 병합 요구가 있을 때만 확장 |
| 표 병합/중첩·셀 수식의 첫 단계 손실 허용 — 2026-11-13 조사 반영 | 병합/복합 머리는 형식 유지 방침에 따라 반복/합치기+원본 범위+문서 설명+전수 검수. 중첩은 공개 입력으로 이관. rich cell은 source 구조 부재와 셀 블록의 native 한계를 구분해 유지. 의미 손실이 남으면 최종 완료 차단 | 4절 규칙, 1·4단계 순서/필요 플랫폼 표현 능력 |
| 비서/사람 분담 | 비서 먼저 즉시 교정, 사람은 판단 불가·대량 삭제·최종 확정. 모든 표/그림 전수 수동 확인 안 함 | 5–7절, 완료 gate와 실제 사람 부담 지표 |
| 실사용 합격선과 측정 문서 | 200쪽 이상 1건, 사람 목록 ≤10%·100쪽당 30분을 잠정 목표로 진행. 대표성/밀도에 따라 조정 가능 | 1·10절 목표. 실제 자료 사용은 별도 허가 후 |
| 변경 receipt가 없는 수동 편집 | 대응 uncertain·완료 무효화. 추측 연결보다 잘못된 출처 방지가 우선 | 3·8절. 더 강한 유지가 필수면 공개 편집 추적/identity 능력을 앞당김 |
| 제목 계층 — 2026-11-13 소유자 답 | 북마크 있으면 정확성이 중요, 없으면 한계 감수. level 보존·북마크 증거 보고·없는 경우 검수 표시 | 4절 headingReview, 두 판 별도 측정 |
| 수식 — 2026-11-13 소유자 답 | 사람이 검토하되 기계적 오류 점검은 한다. 전수 검수 목록+값싼 의심 이유, 추측 수정 없음 | 4절 formulaReview, PDF 숫자 대조/묶음은 PR 3 |
| 회전/인쇄 쪽·셀별 쪽 증거 부족 | null/표 전체 영역으로 명시, 정밀 대응은 추측하지 않음 | PR 2 대응 계약과 PR 3 PDF 증거 |

이 문서에서 확정한 것은 플러그인의 범위와 구현 순서다. 플랫폼 기능의 구현 완료나 실제 품질 수락을 선언하지 않는다.

## PR 2 생성 대응·인계 확정 (설치/화면 제외)

[계약 v1](../../../../contracts/docling-to-litzio/README.md)과 schema/를 정본으로 삼는다. 기존 소유자 확인 필요 표는 유지한다.

- provenance.json/losses.json/complete.json은 schemaVersion 1.0.0. 원본 PDF/Docling/record bytes를 source/에 함께 보관해 이동 가능한 인계를 택했다. record의 옛 상대 경로는 바꾸지 않고 provenance의 출력 기준 상대 참조로 찾는다.
- generation.json은 진단으로 유지하고, 모든 파일의 실제 검증 뒤 complete.json을 마지막 배타적 쓰기로 게시한다. 표지 없음/손상/다른 revision/digest는 거부한다. 새 generation은 새 디렉터리만 사용한다. 미완성 출력과 사람의 교정은 보존한다.
- 기존 필드 설계의 item별 pageSize는 pages로 모았다. regions에는 원래 prov를 함께 보존한다. targets에 kind가 있는 block/list-item/cell selector와 실제 native text를 넣었다. 셀 sourceCell span과 출력 range를 분리해 다대다 구조를 같은 v1로 표현한다. 병합 native 지원을 기다리는 계획은 폐기하고 반복/머리 합치기를 플러그인이 담당한다.
- 검수 입력 요구는 유지한다. 생성 완료·current 위치는 검수 완료가 아니다. 현 v1은 unreviewed만 게시하며 requireReviewed 소비는 거부한다. 회전/인쇄 label·셀별 페이지/주석 적용 범위는 null/table precision으로 드러내고, 다음 PDF 증거/검수 단계에서 생산 측이 보강한다. 형식 유지 한계를 플랫폼 보강 예정과 혼동하지 않는다.
- PR #6 비차단 리뷰를 따라 source→실제 snapshot 독립 검사를 추가했다. 이미 oracle과 다른 source를 추가 손상시키는 변형 검사, 목록 start·code language·fixed enumerator 비교도 추가했다. 기존 oracle metric 귀속 정의는 유지하고 별도 source-audit로 생성 손상을 계수한다.
- 문서/그림 묶음의 동시 편집 원자 snapshot, 편집 후 receipt 기반 대응 갱신, review.json 이력·검수 완료, 실제 플러그인 설치/화면은 여전히 후속이다. 스키마 const unreviewed를 넘는 검수 상태 계약은 해당 단계에서 버전 규칙을 정한다.

### 2026-11-13 추가 조사 반영 — 별도 커밋

병합의 의미는 자동 추론하지 않는다. 모든 병합 표를 검수 대상으로 하고, risks에 열 묶음/행 간 공유/열 간 공유 및 합계·범위·공통 조건 가능성을 표시한다. 키워드는 판단이 아니라 추가 위험 표지다. 빈 칸으로 바꾸면 누락으로 오해하기 쉬워 값을 반복하며, 원문 좌표를 명시한 설명 문단을 바로 아래에 둔다. 설명 target의 role=explanation으로 원문 인용과 구분한다. 명시 column_header인 완전한 연속 머리 행만 합치며, 근거 없는 두 번째 머리를 추측하지 않는다. 실제 표본 전후는 table-examples.md에 있다.

손실 category는 native-format(유지되는 형식 한계), authoring-input(플랫폼 보강 예정), plugin-pending(보수적 미인식/아직 하지 않음)으로 나눈다. items.structure에 원본 parent/children·formatting/hyperlink/meta·caption/footnote/reference 관계를 들고 있으며 sourceCell은 원본 전체다. 지금은 평문으로 내보내도 앞으로 작성 요청 필드를 채울 근거를 버리지 않는다. table/figure/equation/caption 규칙은 1.1.0, 생성기는 0.3.0이다.


PR #7 리뷰 정정: v1 유지 범위는 기존 block/list-item/cell selector와 raw source 구조·다대다 target으로 표현 가능한 생성 대응에 한한다. caption/inline 부분 범위의 정밀 selector, 셀별 page precision, reviewed 상태는 현재 v1에 없다. regionPrecision=table, reviewState=unreviewed는 그대로이며 정밀 위치/검수 완료를 같은 v1에서 지원한다고 약속하지 않는다. 새 공개 snapshot을 실제 확보하면 계약 예시와 소비 검사를 추가하고 버전 변경 필요를 판단한다.

## PR 3 실제 결정과 측정

검수 대상 v1은 별도 review-targets.json/pdf-evidence.json/review-complete.json으로 확정했다. provenance v1의 current 생성 revision만 공식 파일로 읽는다. changed read-model을 이용한 주입 시험은 baseline 경로를 uncertain으로 남기며, 편집 후 identity 갱신을 구현한 것이 아니다. 결과/분포/반례/실행법은 results-pr3.md, contracts/docling-to-litzio/review-targets.md를 따른다.

PDF.js는 6.5.438 legacy ESM/worker를 묶고 Apache-2.0, 내장 core-js 3.51.0 MIT, CMaps Adobe BSD-style 원문과 hash를 보존했다. 추가 npm/native 설치 없이 Node worker에서 text layer/outline을 읽고 종료한다. 선택적 canvas/DOMMatrix/Path2D 경고는 stderr로 남기고 렌더링 지원으로 해석하지 않는다. standard font/Liberation·이미지 codec은 사용/배포하지 않는다. 글자/토큰 bbox는 근사, source 회전 결합은 미지원이다.

계획의 폭넓은 반복 머리글/열 점프 휴리스틱 대신 고정 표본에서 효과가 있고 음성 반례를 가진 규칙으로 좁혔다. furniture는 명시된 긴 문자열과 body의 정확 일치만 사용한다(숫자 쪽 번호 단독 제외). 도표 자식 축 숫자의 y 역순은 본문 순서 후보에서 제외했다. 원문 위 caption→native 뒤 문단 7관계, 병합 표, raw source cell gap, 수식 문장 혼입, 문자 token 차이, 미대응 PDF 영역과 낮은 제목 근거를 독립 근거로 남긴다. 고아 caption/주석의 적용 범위·일반 중첩 목록/continuation 의미 판정·반복 수식/길이 비율 등 효과를 입증하지 못한 추가 휴리스틱은 하지 않았다. 추측 교정 없음.

LSR 두 판은 각각 17/21묶음(1.31/1.62건/쪽), NIST는 14묶음(1.27건/쪽)이다. 같은 reason/action 비교 패턴 집합만 접어 첫 목록 11/12/8행으로 줄인다. 모든 구성원·위치·차이는 보존하며 대표 하나로 전체를 승인하지 않는다. 이는 표시 부담 감소이고 비서 해결 뒤 사람에게 남는 양의 측정이 아니다. 300쪽 외삽은 계층별 표/그림/본문 밀도에 따라 약 382–485묶음 수준일 수 있어 장문 사용성 합격으로 보지 않는다. 비서의 실제 해결률/판단 불가율/시간과 사람의 U/B/H 분량은 PR 4 이후에 측정한다.

알려진 셋째 수식/병합 표/북마크 없음/숫자 셀 4곳의 기록 부재를 잡지만, 벡터 수식의 수치 자체는 text layer에서 검증하지 못한다. 정상 빈 칸 1개도 gap 후보가 되는 오경보다. 수치/부호/단위/셀 교환/문단 누락/머리글 삽입의 주입 6종은 탐지했고, oracle와 같은 숫자 셀 21개 token 대조의 오경보는 0/21이다. 전체 문서/다른 후보의 오경보율과 시각/의미 품질은 미측정이다. 수식에서 문장 혼입을 없앤 그럴듯한 오답은 놓치며, bookmark가 있어도 개별 제목의 정확성을 보증하지 않는다.

모든 수식은 의심 유무와 별개로 formula-review-required 후보와 각 수식 scope의 검수 묶음을 가진다. 의심 없는 두 수식도 검수에서 빠지지 않으며, 같은 필수 검수 패턴의 접기는 승인/검토 생략이 아니다.

## 2026-11-13 보강된 작성 입력 적용

생성기 0.5.0, 갱신 규칙 1.2.0과 탐지기 1.1.0을 사용한다. LSR 두 판은 각각 손실 38→31, NIST는 14→0이다. 표 caption 7/7/3개를 소속 table로 옮기고, NIST 미주 7개와 LSR 표 주석 1개를 실제 연결했다. LSR 각주 5개 전부를 연결한다는 가정은 기각했다: `19` 호출부 없음, 다른 표 `a` 호출부 없음, 한 추출 표 안에 중복 `a` 두 개. 이 4개는 문단으로 보존하며 손실을 유지한다. 이관한 표 주석도 원래 전용 배치·문자 표지 손실은 유지한다.

세 고정 source에는 formatting/hyperlink가 없고 일반 중첩/문자 목록도 없어, 고정 source 사본에 명시 구조/서식을 더한 별도 반례의 실제 CLI roundtrip으로 확인했다. 식 fixed 번호 3개와 그림 K.1/K.2는 이미 이관돼 있었고 그대로 유지한다. 본문의 숫자만 보고 상호 참조를 만들지 않는다.

provenance v1과 검수 파일 v1.0.0 schema는 바꾸지 않는다. 캡션은 table/figure block, 정의는 receipt가 재배치한 footnote block, 중첩 항목은 최상위 포함 list-item target으로 연결한다. structure의 부가 생성 근거(noteBinding/noteReferences/listProjection)는 정밀 selector가 아니며 소비자가 native path로 사용하지 않는다. 기존 v1 표/목록 block의 null text 의미와 옛 묶음 읽기도 유지한다.

숫자/PDF 비교는 원래 marker를 대응 근거로 복원해 새 미주 표시 번호를 원본 값 오류로 오인하지 않는다. 모양/렌더링을 기준으로 승인하지 않는다. 표 caption이 native 소속이 되면서 기존 뒤 문단 순서 후보 7/7/3개가 사라졌고 나머지 알려진 문제·주입 검사·음성 대조는 유지한다. 최신 수치와 남은 손실은 results-richer-authoring.md가 정본이며 PR 1–3 결과 문서는 당시 측정 기록이다.
