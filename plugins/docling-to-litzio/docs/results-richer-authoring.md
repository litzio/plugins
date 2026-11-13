# 보강된 작성 입력 적용 결과

2026-11-13 공개 리치오 master `9956e8e0`을 별도 임시 checkout에서 frozen install 후 `pnpm --filter @litzio/cli build`로 빌드했다. [공식 작성 입력·JSON 읽기 계약](https://github.com/litzio/litzio/blob/9956e8e0/docs/design/document-support-v1.md#공식-문서-작성-입력), 목록·미주 계약과 CLI `help create`/`help insert-block`을 읽었다. 세부 InlineContent 모양은 공개 SDK의 `documentAuthoringSchema`를 JSON Schema로 조회하고 실제 CLI로 확인했다. 내부 구현을 가져다 쓰지 않았다.

비교 전 생성기는 이 저장소 PR #9 병합 커밋 `2552fcd`의 artifact 사본이다. **전·후 모두 같은 새 CLI**, 같은 고정 변환 결과와 PDF로 생성했다. 원본 재변환, 설치된 CLI/daemon, 실제 AI·화면은 사용하지 않았다. 생성기 0.5.0, 갱신 규칙 1.2.0, 탐지기 1.1.0이다. [기계 측정](richer-authoring-results.json)을 함께 보관한다. 기존 PR 1–3 결과 문서는 당시의 기록이다.

## 생성·손실 전후

| 표본 | 블록 전→후 | 손실 전→후 | native-format / authoring-input / plugin-pending 후 | check / 생성·읽기 추가 불일치 / source audit |
| --- | --- | --- | --- | --- |
| LSR 북마크 | 120→113 | 38→31 | 29 / 0 / 2 | 통과 / 0 / 0 |
| LSR 무북마크 | 120→113 | 38→31 | 29 / 0 / 2 | 통과 / 0 / 0 |
| NIST | 410→407 | 14→0 | 0 / 0 / 0 | 통과 / 0 / 0 |

NIST 손실 0은 변환/PDF 의미가 옳다는 뜻이 아니다. 원래 있던 표현 손실 항목이 해소됐다는 뜻이며 PDF와 비교되지 않는 그림/OCR, 저신뢰 제목과 별도 token 후보는 남는다. LSR의 숫자 셀 55/59와 나머지 변환 차이 4개도 그대로다. 작성자 기대 구조의 생성 탓 불일치는 두 판 모두 0이며, 미주 이동의 읽는 순서 차이는 표현 차이로 명시했다.

| 옮긴 것 | LSR 각 판 | NIST | 남는 한계 |
| --- | --- | --- | --- |
| 표 캡션 | 7개를 소속 table.caption으로 | 3개 | 유일한 확실한 번호만 fixed. 중복 Table 3 등은 글자 그대로, 자동 번호 없음 |
| 각주→미주 | 5개 중 1개 | 7개 전부 | 아래의 호출부 근거 부족 4개와 원래 표 전용 배치·문자 표지는 유지 손실 |
| 목록 | 기존 한 항목 목록 유지 | 불릿 4항목의 잘못된 marker 손실 제거 | 세 원본에는 일반 중첩/문자 목록이 없음. 별도 명시 구조 사본으로 실제 CLI 확인 |
| 인라인 | 원본 formatting/hyperlink 없음 | 원본 formatting/hyperlink 없음 | 원본에 없는 서식은 추측하지 않음. 별도 사본으로 bold/italic/delete·super/sub·link를 생성·읽기 검증 |
| 수식 번호 | 기존 fixed 1/2/3 유지, LaTeX 불변 | 해당 없음 | 본문의 숫자만으로 상호 참조를 만들지 않음. 번호 연결 손실은 PR 2에서 이미 제거됨 |

inline code/math는 공식 입력이 지원하지만 고정 source에 해당 구조가 없다. 셀의 `\\`/`$` 문자열을 임의로 파싱해 수학 구조를 만들지 않는다. 수식·code 블록 자체의 LaTeX/원문 줄은 그대로다. unsupported formatting은 plugin-pending 손실로 남긴다. 셀 블록, 병합 셀, 복합 머리·머리 열과 정적 목차 역할은 유지 한계다. 병합 값 반복·원본 범위·설명·검수 표시는 유지한다.

## 각주를 연결한 근거와 보류

문자가 같다는 이유만으로 연결하지 않는다. 원본 source의 단일 marker occurrence, PDF 글자 층에서 그 marker만 있는 작은 raised item, 인접한 큰 baseline item, source 영역/물리 쪽과 표 소유 범위를 함께 확인한다. 서식은 근사 bbox에 근거하므로 문맥을 사람이 확인해야 하며, 알려진 모호함은 자동 연결하지 않는다.

- LSR `#/texts/45`: 표 `#/tables/3`의 원본 셀 8, `≥ 0.932 u a`의 작은 raised `a`를 연결했다. 원래 `a`와 표 아래 전용 배치는 리치오의 숫자 미주로 달라지므로 dedicated-table-note 손실을 유지한다.
- LSR `#/texts/48`의 `19`: source 본문과 독립 PDF 글자 층에서 호출부가 없다. `#/texts/55`의 표 주석 `a`도 호출부를 확정할 수 없다. 둘 다 문단으로 보존한다.
- LSR `#/texts/133`, `134`: 두 `a` 정의가 같은 추출 표 `#/tables/9` 아래 들어 있다. Route A/B 문구로 소유를 추측해 고치지 않고 둘 다 문단+손실로 남긴다.
- NIST 원래 표지 9–15는 각 raised 호출부를 확인했다. 정의 7개를 첫 참조 순서의 미주로 옮겼고 원래 표지와 PDF item/쪽/좌표, source 호출 위치를 생성 근거에 남겼다. 표시 번호는 리치오 정책으로 1–7이 된다.

## v1 계약 유지

provenance/losses/complete 및 review-targets/pdf-evidence/review-complete의 **schemaVersion 1.0.0과 schema 파일은 바꾸지 않았다**. 생성기와 규칙 버전만 바뀐다. 모든 source 요소·문서 블록·셀·좌표/revision과 그림 bytes를 다시 검증했다. 이전 v1 세 묶음도 현재 reader로 읽혔다.

- 표 캡션은 원문 selfRef/regions → 소속 table의 기존 block selector다. table block의 스칼라 text=null 의미를 유지하고 caption은 공개 snapshot.table.caption으로 검사한다.
- 미주는 원문 정의 selfRef/regions → create receipt가 가리키는 실제 재배치된 footnote block이다. 호출부를 담은 본문/셀은 원래 target을 유지한다.
- 중첩 목록의 하위 source item은 최상위 포함 list-item target으로 연결한다. 원본 계층과 부가 listProjection.indexPath는 검사 근거이며 정밀 native selector가 아니다. 현재 v1로 하위 항목의 정밀 선택을 충족했다고 주장하지 않는다.
- opaque structure의 noteBinding/noteReferences/listProjection은 부가 생성 근거다. 상호 참조·원래 marker·index 경로를 검증하지만 이들을 영속 locator로 소비하지 않는다. 편집 후 대응 자동 갱신은 여전히 없다.

## 탐지 회귀와 분량

| 표본 | 후보 전→후 | 묶음 전→후 | 후 묶음/쪽 | 접은 목록 전→후 |
| --- | --- | --- | --- | --- |
| LSR 북마크 | 62→48 | 17→15 | 1.15 | 11→9 |
| LSR 무북마크 | 83→69 | 21→19 | 1.46 | 12→10 |
| NIST | 364→347 | 14→9 | 0.82 | 8→5 |

해소된 의미 손실과 뒤 문단 caption 순서 후보 7/7/3개가 빠졌다. 새 caption·미주 때문에 보호 token 차이가 늘지 않았다(LSR 0/0, NIST 기존 1개). PDF token 비교는 생성 근거의 원래 marker로 미주 atom을 읽어, 새로 계산된 미주 표시 번호를 숫자 오류로 오인하지 않는다. 내용의 숫자 자체는 그대로 비교한다.

알려진 셋째 수식·병합 표 2개·빠진 숫자 셀 4곳·무북마크 제목 후보는 유지된다. 주입 6종을 모두 잡고, 첫 5종은 독립 PDF 비교도 잡았다. 정상 숫자 셀 오경보 0/21, 앞 두 수식 의심 0/2, 알려진 정상 빈 칸 gap 오경보 1개도 그대로다. 전체 오경보율·수백 쪽 사람 부담의 합격은 측정하지 않았다.

## 검사와 미확인

전체 **50개 통과/skip 0**: 새 CLI의 세 표본 생성/check/inspect/그림 digest/원문 inventory, 미주·caption 대응/revision, 기존 PR 3 후보·주입·음성 대조, 구조/표지 변조 거부, 별도 사본의 중첩·문자 목록·인라인, 서식만 제거/미주 연결만 평문화한 손상, 중첩 항목 합계 상한을 포함한다. 생성/readback과 원본→native 검사를 분리했다.

실제 플러그인 설치·saveDocument 화면·시각적 렌더링·비서·교정·임의 고객 자료/다른 언어·장문 사람 분량은 미확인이다. 공식 CLI create가 공유하는 작성 경로만 실행했다. PDF 글자 층이 없는 벡터 수식의 값 검증, 일반 문맥의 각주 연결/상호 참조 복원은 하지 않는다. 직접 시작한 CLI/PDF worker는 종료했고 임시 산출물을 보존했다.

진행 기록 전달안: 보강된 공개 작성 입력으로 LSR 두 판 손실 38→31, NIST 14→0. 표 캡션 7/7/3개, LSR 미주 1개와 NIST 미주 7개 연결. LSR 호출부/표 소유가 불명확한 4개와 전용 표 주석 배치는 손실 유지. 두 v1 schema와 기존 묶음 호환을 유지했고 세 표본 check/추가 생성 불일치 0, 전체 50개 검사 통과. 탐지 후보 48/69/347개·묶음 15/19/9개. UI/비서/교정·장문 사람 부담은 미확인. docs/progress.md 자체는 수정하지 않음.
