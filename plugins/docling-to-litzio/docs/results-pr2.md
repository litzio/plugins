# PR 2 검증 — 설치/화면 제외

단위 25개와 격리 CLI 통합 1개 통과(2026-11-13). PR 1에서 공개 소스로 만든 production CLI를 재사용했다. Node 외 제품 런타임 의존성 추가 없음. pypdf는 여전히 선택적 외부 사전 검사이며 배포물에 번들하지 않았다.

| 표본 | 원본 항목 | 블록 | 원본 셀 | 그림 | 손실 기록 | schema/인계 검증 |
| --- | --- | --- | --- | --- | --- | --- |
| lsr | 171 | 118 | 180 | 2 | 51 | 통과 |
| no-bookmarks | 171 | 118 | 180 | 2 | 51 | 통과 |
| nist | 440 | 410 | 60 | 8 | 14 | 통과 |

모든 원본 selfRef/셀과 모든 출력 body 블록을 집계했다. norm 없이 원본 JSON↔실제 snapshot의 문자열/셀을 대조하고, region이 실제 쪽 크기 안에 있는지, source/PDF/record/document/asset digest와 revision·generation 결합을 확인했다. 생성 계획→snapshot 검사도 별도로 유지한다. 각 판 source-native 추가 불일치는 0이다.

검사: schema/unknown version·필드·enum, 잘못된 digest/revision/generation, 원본 파일 누락, 표지 없음/잘림, source inventory 누락/중복, target/selector 범위, 원본과 일치하지만 페이지 밖인 좌표, uncertain 대응 사용 거부, JSON 속성 순서 독립성, source가 oracle과 이미 다른 상태의 추가 손상, 목록 start/code language/fixed enumerator 변형, 기존 출력 거부·교정 bytes 보존, 실패 incomplete 표지 보존. 미래의 병합 셀 출력 하나를 range selector로 표현해도 동일 v1 schema/의미 검증이 통과한다(실제 플랫폼 병합 지원 검증 아님).

PR #6 비차단 메모 반영:
- 1/2: 원본↔실제 snapshot 대조를 고정 검사와 source-audit.json으로 추가했다. oracle의 conversion 우선 귀속 metric은 과거 측정 의미를 보존하려고 바꾸지 않았다. 생성 손상은 별도 source-audit/원본 비교로 확인한다.
- 2: 목록 start/code language/fixed enumerator를 integrity에 추가. 이미지 bytes는 전체 인계 reader에서도 원본 embedded digest와 확인한다.
- 3: v1의 원본/문서 digest·대응·손실·완료 표지 직접 결합과 stale 거부를 확정. 편집 후 유지/검수 이력은 범위 밖이며 미검수→검수본으로 위장하지 않는다.
- 4: pypdf 배포/라이선스 고지는 이번에 번들하지 않아 변경하지 않았다. 배포에 포함하는 단계에서 고지 검증이 필요하다.

requirements-extract의 생성 시점 digest/상대 참조/다대다/원문·출력 인용/원본 셀 문맥은 제공한다. 검수 문서·교정 이력·회전/인쇄 쪽·셀별 페이지/주석 적용 범위는 아직 충족하지 않는다. 소비자의 요구를 줄이지 않고 review-unavailable 또는 null/table precision으로 보류하며 생산 측 후속 단계로 남겼다. 대조표와 예시는 contracts/docling-to-litzio에 있다. 다른 플러그인·기존 contracts·tools·fixtures·진행 기록은 수정하지 않았다.

미확인: 설치·화면·사람 시각 검토·수백 쪽·실제 소비 플러그인 호출·편집 후 대응 갱신·검수 완료. AI/변환 서버/Docker/설치된 앱/daemon 사용 없음. 모든 직접 실행 프로세스 종료, 임시 출력 보존.

진행 기록 전달안: PR 2 생성 대응/인계 v1 구현·세 표본 검증 완료, 설치/화면은 플랫폼 변경 뒤 별도. 표현 한계 보강·검수/교정 완료는 미확인으로 유지.
