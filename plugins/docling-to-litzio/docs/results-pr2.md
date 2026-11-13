> 이 문서는 해당 PR 당시 측정이다. 최신 생성·손실·탐지 수치는 [보강된 작성 입력 결과](results-richer-authoring.md)를 따른다.

# PR 2 검증 — 설치/화면 제외

단위 33개와 격리 CLI 통합 1개 통과(2026-11-13). PR 1에서 공개 소스로 만든 production CLI를 재사용했다. Node 외 제품 런타임 의존성 추가 없음. pypdf는 여전히 선택적 외부 사전 검사이며 배포물에 번들하지 않았다.

| 표본 | 원본 항목 | 블록 | 원본 셀 | 그림 | 손실 기록 | schema/인계 검증 |
| --- | --- | --- | --- | --- | --- | --- |
| lsr | 171 | 120 | 180 | 2 | 38 | 통과 |
| no-bookmarks | 171 | 120 | 180 | 2 | 38 | 통과 |
| nist | 440 | 410 | 60 | 8 | 14 | 통과 |

모든 원본 selfRef/셀과 모든 출력 body 블록을 집계했다. 숫자/공백을 임의 정규화하지 않고, 명시된 머리 합치기와 번호 이관 규칙에 따라 원본 JSON↔실제 snapshot을 대조하고, region이 실제 쪽 크기 안에 있는지, source/PDF/record/document/asset digest와 revision·generation 결합을 확인했다. 생성 계획→snapshot 검사도 별도로 유지한다. 각 판 source-native 추가 불일치는 0이다.

검사: schema/unknown version·필드·enum, 잘못된 digest/revision/generation, 원본 파일 누락, 표지 없음/잘림, source inventory 누락/중복, target/selector 범위, 원본과 일치하지만 페이지 밖인 좌표, uncertain 대응 사용 거부, JSON 속성 순서 독립성, source가 oracle과 이미 다른 상태의 추가 손상, 목록 start/code language/fixed enumerator 변형, 기존 출력 거부·교정 bytes 보존, 실패 incomplete 표지 보존. 동일 원본에 출력 range 하나를 묶어 표현해도 v1 schema/의미 검증이 통과한다(실제 플랫폼 병합 지원을 기다리거나 검증한 것은 아님).

PR #6 비차단 메모 반영:
- 1/2: 원본↔실제 snapshot 대조를 고정 검사와 source-audit.json으로 추가했다. oracle의 conversion 우선 귀속 metric은 과거 측정 의미를 보존하려고 바꾸지 않았다. 생성 손상은 별도 source-audit/원본 비교로 확인한다.
- 2: 목록 start/code language/fixed enumerator를 integrity에 추가. 이미지 bytes는 전체 인계 reader에서도 원본 embedded digest와 확인한다.
- 3: v1의 원본/문서 digest·대응·손실·완료 표지 직접 결합과 stale 거부를 확정. 편집 후 유지/검수 이력은 범위 밖이며 미검수→검수본으로 위장하지 않는다.
- 4: pypdf 배포/라이선스 고지는 이번에 번들하지 않아 변경하지 않았다. 배포에 포함하는 단계에서 고지 검증이 필요하다.

requirements-extract의 생성 시점 digest/상대 참조/다대다/원문·출력 인용/원본 셀 문맥은 제공한다. 검수 문서·교정 이력·회전/인쇄 쪽·셀별 페이지/주석 적용 범위는 아직 충족하지 않는다. 소비자의 요구를 줄이지 않고 review-unavailable 또는 null/table precision으로 보류하며 생산 측 후속 단계로 남겼다. 대조표와 예시는 contracts/docling-to-litzio에 있다. 다른 플러그인·기존 contracts·tools·fixtures·진행 기록은 수정하지 않았다.

미확인: 설치·화면·사람 시각 검토·수백 쪽·실제 소비 플러그인 호출·편집 후 대응 갱신·검수 완료. AI/변환 서버/Docker/설치된 앱/daemon 사용 없음. 모든 직접 실행 프로세스 종료, 임시 출력 보존.

진행 기록 전달안: PR 2 생성 대응/인계 v1 구현·세 표본 검증 완료, 설치/화면은 플랫폼 변경 뒤 별도. 표현 한계 보강·검수/교정 완료는 미확인으로 유지.

## 추가 조사 뒤 표/번호 규칙 결과

병합 셀은 플랫폼이 형식을 바꾸지 않는 유지 한계로 확정했다. 원본 범위를 보존하고 반복 값을 유지하되, 명시된 복합 머리는 하나로 합치고 표 바로 아래 설명을 넣었다. LSR 두 판에서 각 2표가 검수 대상이며 설명 2블록이 늘어 120블록이다. note target의 role=explanation은 source 인용과 구분된다. 각 식 3개는 orig의 명시 괄호 접두 번호(LaTeX 본문에 그 괄호 항이 그대로 남은 경우는 미인식 처리), 그림 2개는 K.1/K.2를 fixed로 이관했다. 원문 LaTeX는 그대로다. 식/그림 번호 미이관 5건은 손실에서 제거했다. 복합 머리의 개별 header role 중 보존된 부분은 중복 손실에서 빼고 compound-header-flattened로 구조 손실 2건을 명시했다.

| 입력 | native-format 유지 한계 | authoring-input 보강 예정 | plugin-pending 미인식/미구현 |
| --- | --- | --- | --- |
| lsr | 29 | 8 | 1 |
| no-bookmarks | 29 | 8 | 1 |
| nist | 0 | 14 | 0 |

실제 표본 전후는 [table-examples.md](table-examples.md), 최종 수치와 oracle 층별 결과는 [score-summary-pr2.json](score-summary-pr2.json)에 있다. 복합 머리 2행→1행 때문에 native 표 크기는 6/8 일치+표현 차이 2, cell text는 121/139 일치+변환 차이 4+머리 합치기 차이 14다. 이 차이는 생성 결함에서 제외하고 표현 손실로 분리했다. 원본↔실제 native의 명시 규칙 보존 검사는 0 불일치다. 숫자 셀은 55/59 일치+변환 차이 4, 생성 추가 차이 0이다. oracle의 셀 내용을 원문 문자열로 되돌리기 위해 생성 결과를 조작하지 않았다.

동일 v1에 structure와 target role, 손실 category를 확정했고, 원본 span과 출력 range를 분리해 rich authoring 보강 시 데이터 형식 변경 없이 손실 항목을 줄일 수 있다. 실제 native 병합 지원을 기대하는 것은 아니다. 중간 표현은 sourceCell/raw 관계/formatting을 보존하며 현재 공개 작성 입력에는 plain 표현만 전달한다.

발췌 예시는 별도 Ajv CLI 5.0.0(draft2020)에서도 schema 유효성을 확인했다. Ajv는 제품 의존성에 추가하지 않았다.
