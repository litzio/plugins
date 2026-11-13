# PR 1 실제 검증 (2026-11-13)

공개 플랫폼 checkout `8f41d0da6ad3cfe06299dfa04b39d1dcd6bea386`에서 문서대로 CLI production build 성공. fallback worktree는 사용하지 않았다. 소스/추적 파일 변경 없음. 설치된 앱/daemon 사용 없음. 모든 CLI 명령은 새 임시 출력에서 실행하고 종료했다.

단위 검사 13개와 격리 통합 검사 1개 통과. CLI 없이 실행 시 통합만 skip한다. 외부 변환/AI/Docker 호출 없음. **설치·화면·사람이 열어 본 모양·수백 쪽 성능은 미확인**.

| 입력 | 블록 | 원본 inventory | 손실 기록 | check | 생성계획↔실제 불일치 | PDF 북마크 |
| --- | --- | --- | --- | --- | --- | --- |
| lsr | 118 | 171 | 51 | 통과 | 0 | present |
| no-bookmarks | 118 | 171 | 51 | 통과 | 0 | absent |
| nist | 410 | 440 | 14 | 통과 | 0 | absent |

LSR 각 inventory: mapped 118, furniture 48, container 5, 미분류/미도달 0. NIST: mapped 413(목록의 다대일 포함), furniture 22, container 5, 미분류/미도달 0. inventory는 root/group 포함, 손실은 셀 단위 중복을 허용하는 기록 수다. LSR의 oracle furniture 65영역은 합쳐진 출력 47텍스트에 대응하므로 inventory 48(root 포함)과 모순되지 않는다.

LSR 각 손실 51: header role 22, 병합 셀 반복 10, 표 caption 별도 7, 각주 문단 5, 식 번호 연결 없음 3, 문자 그림 번호 literal 2, 정적 목차 1, group 역할 1. NIST 14: 각주 7, 목록 marker/depth 4, 표 caption 3. NIST도 현 계약에는 embedded 그림이 있으며 이미지 누락 진단은 없었다.

## 작성자 기대 구조 진단

숫자는 오류 확정 개수나 절대 정확도가 아니다. 좌표 대응/문자열의 상대 진단이며 관계/영역 중복을 포함한다. 앞 변환 채점 도구 코드는 재사용하지 않았다. 그림 oracle은 그림 collection으로 제한하고, 읽는 순서는 배열 대신 body children 순회를 사용하므로 tools 점수와 일부 다르다. 도구 수정은 하지 않았다.

| 항목 | 북마크 일치/비교 | 무북마크 일치/비교 | 변환 불일치(각 판) | 표현 한계(각 판) | 생성 추가 불일치(각 판) |
| --- | --- | --- | --- | --- | --- |
| furniture | 65/65 | 65/65 | 0/0 | 0/0 | 0/0 |
| heading | 19/19 | 19/19 | 0/0 | 0/0 | 0/0 |
| prose_role | 42/71 | 42/71 | 29/29 | 0/0 | 0/0 |
| literal | 75/130 | 75/130 | 55/55 | 0/0 | 0/0 |
| heading_level | 16/17 | 3/17 | 1/14 | 0/0 | 0/0 |
| numeric_units_literal | 42/67 | 42/67 | 25/25 | 0/0 | 0/0 |
| footnote | 0/12 | 0/12 | 7/7 | 5/5 | 0/0 |
| table_dimensions | 8/8 | 8/8 | 0/0 | 0/0 | 0/0 |
| cell_span | 127/139 | 127/139 | 2/2 | 10/10 | 0/0 |
| cell_text | 135/139 | 135/139 | 4/4 | 0/0 | 0/0 |
| numeric_cell | 55/59 | 55/59 | 4/4 | 0/0 | 0/0 |
| formula | 1/3 | 1/3 | 2/2 | 0/0 | 0/0 |
| figure | 2/2 | 2/2 | 0/0 | 0/0 | 0/0 |
| caption_link | 2/10 | 2/10 | 1/1 | 7/7 | 0/0 |
| adjacent_order | 123/130 | 123/130 | 7/7 | 0/0 | 0/0 |

수식 formula는 LaTeX strict 문자열 진단으로 수학적 동등성 판정이 아니다. 알려진 세 번째 수식은 prose-inside-formula로 의심 표시된다. 첫 두 수식은 의심 이유가 없지만 모든 수식이 검수 대상이다. pypdf outline에서 북마크 판 16항목, 없는 판 0항목을 읽었다. 변환 출력에 제목별 근거 attribution은 없어 실제 북마크 적용 여부는 단정하지 않는다.

숨은 생성 손실은 별도 integrity 검사(실제 블록 수/종류, literal text, 수준, 셀 위치, 목록 순서, 캡션)로 확인했고 세 입력 모두 0건이다. 그림 파일 bytes는 입력 digest와 일치했다. 기존 출력 디렉터리 재실행은 거부되고 원래 문서 bytes가 유지된다. 실패 주입은 incomplete 표지와 부분 파일을 남긴다. 원본 PDF/JSON digest 재확인 성공.

S01–S21별 관찰 수·귀속·미측정 관계와 입력 hash는 [score-summary.json](score-summary.json)에 별도 기록한다. note_reference/continuation/must_remain_distinct 등의 의미 관계는 자동 채점하지 않았으며 unmeasuredRelations로 남긴다.

## 플랫폼에 필요한 능력 / 진행 기록 전달안

- rich 작성 입력: 중첩 목록/문자 marker, inline 서식·위첨자·미주 관계, rich cell, 표 caption/복합 header. native 지원과 공개 작성 입력 지원을 구분한다.
- 병합 셀은 native 표현부터 필요하다. 현재 반복 표현을 손실로 드러낸다.
- 공개 작성 결과를 revision별 대응 부속 파일과 안전하게 갱신/인계하는 능력은 PR 2 이후 별도 검증한다.
- 문서 생성 경로와 처리 코드는 완료, 실제 설치/화면은 미확인. docs/progress.md는 이 PR에서 수정하지 않았다.

PDF 글자 층 숫자 대조, 수학적으로 그럴듯한 오답 검출, 회전·인쇄 쪽·셀별 페이지의 정밀 대응, oracle에 없는 NIST 의미 품질, 편집 후 출처 갱신은 미확인/후속이다. 원본의 철자·잘못된 수식은 고치지 않았다. 임시 출력은 보존하고 경로는 비공개 최종 인계에만 제공한다.
