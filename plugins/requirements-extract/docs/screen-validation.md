# 사람 검토 화면 검증

기준: 공개 Litzio master `2a7f3328`, 소스에서 빌드한 CLI·Editor. Host 데이터·비서 CWD·비서 설정 파일·daemon/reset 기록을 모두 시험용 하위 폴더로 격리했다. 설치된 리치오·개인 daemon·사용자 자료를 사용하지 않았다. 기존 공개 고정 표본을 썼으며 재변환·Docling 서버·실제 AI 호출은 하지 않았다.

## 자동 검사와 실제 실행

- `npm test`: 1,019개 통과. native 출처·프로파일 목록·공개 요청 상태와 기존 보호/인계/연결/ReqIF 변형 검사를 포함한다.
- 공개 `plugins validate` → install → running/health 확인. 의존성은 플러그인 폴더 안에서 `npm ci --ignore-scripts`로 준비했다. 스킬이 `litzio-plugin-local--requirements-extract---candidates`라는 이름으로 격리 비서 폴더에 설치됐고, 비서의 `/` 스킬 목록에서 표시됐다. 메시지를 보내거나 AI turn을 시작하지 않았다.
- `validation/screen-decisions.mjs`: 화면이 준비한 작업 ID로 공개 CLI `operation invoke --host`를 사용해 작업 파일 생성, schema/batch 읽기, 결정적인 가짜 판단 제출, job 조회와 summary를 실행했다. 실제 비서 추론의 품질·실제 AI turn의 셸 환경 전달은 이 검사에 포함하지 않는다.
- `validation/screen-safety.mjs`: 공식 CLI를 써서 미확정 정식 내보내기, 오래된 확정 해시, 원문 변경 후 재확정/저장, 작업 폴더 이탈을 거부했다. 입력 revision 변경 시 판단·확정이 무효화됐으며 중단/재개를 확인했다. 저장본의 confirmedDigest·nativeLocation 재읽기와 정식 ReqIF를 확인했다.
- `validation/screen-links.mjs`: 실제 native 상위 문서와 하위 제안을 읽고 결정적인 partial refines를 제출했다. covered/remaining과 이유가 모델·상세·XML에 남았고, 상위의 공식 편집 뒤 기존 확정과 내보내기가 무효화됐다.
- 화면 버튼으로 문서 picker → 후보 준비 → 가짜 판단의 원장 재읽기 → 문제 목록 → 상위 미연결 이유 → 상세·실제 renderer → 확정 → 새 문서 저장 → 정식 ReqIF를 실행했다. openDocument는 원본 편집 탭을 열었다. 화면의 확정은 브라우저 시험이 누른 합성 결정이며 소유자의 업무 승인을 뜻하지 않는다.
- `validation/screen-output.mjs`: 화면 저장본의 모든 확정 해시·native 출처를 공식 CLI로 다시 읽어 대조하고 정식 재내보내기를 확인했다. 화면 ReqIF(54 ID)와 상위/하위 partial ReqIF(58 ID) 각각 XSD·ID/참조·독립 reqif 파서 parse/unparse/parse 의미 일치 검사를 통과했다.
- 기존 생산자가 만든 실제 v1.1 인계 복사본의 122후보·24구획·288문제를 처리기에서 확인했다. 화면의 셀 경로는 표 전체를 강조했다. 되돌린 항목은 현재 값의 복원 표시와 두 이력(verified-protected-tokens / undo-restoration)을 별개로 보여 줬다. 인계를 재변환하거나 다시 봉인하지 않았다. 이 전체 문서를 사람이 검수했다고 주장하지 않는다.

독립 파서 검사는 기존 해시 고정 XSD 캐시와 별도 Python 환경을 사용하며 `standard.py verify`는 오프라인이다. 화면 시험에서 발견한 빈 미주 배열과 공식 재읽기의 표현 차이는 확정 전 모델에서 정규화했고, 저장 성공 전에 실제 confirmedDigest 일치 검사를 추가했다. 접수 기록의 파일 교체 실패 가능성은 접수·완료 파일을 분리해 없앴다. 재시작 뒤 완료 응답 없는 요청은 실패/대조 대상으로 처리한다.

## 시각 확인

1440 폭은 본문과 저장 원문을 나란히, 640 폭은 한 열로 배치한다. 계정·절대 경로가 있는 앱 탐색기는 접은 뒤 캡처했다. 원문 paragraph의 NodePath 강조를 실제 renderer에서 확인했다. 공개 DataTable의 실제 overflow가 visible이고 긴 좌표·JSON이 열을 넓혀서 상세는 항목별 한 열 표, 좁은 폭의 후보 목록도 한 열로 바꿨다. 부품 내부 CSS를 덮어쓰지 않았다.

- [입력](screenshots/inputs-1440.png)
- [1440 검토](screenshots/review-1440.png)
- [640 검토](screenshots/review-640.png)
- [셀 경로의 표 전체 강조](screenshots/table-source.png)
- [되돌림을 포함한 교정 이력](screenshots/correction-history.png)
- [스킬 목록](screenshots/skill-listed.png)

640 폭에서 native 입력과 긴 좌표·교정 JSON을 가진 인계 입력 모두 tabpanel의 clientWidth/scrollWidth가 592로 같았다. 1440 폭 native 입력은 모두 1392였다. 세로 스크롤은 유지한다. 원문 뷰는 높이 480, 내부 스크롤 높이 약 12,294였고 contenteditable=true 요소는 0개였다. 문서 전체의 읽기·렌더링 비용은 남으며 대용량 성능은 측정하지 않았다.

확인하지 않은 것: 실제 AI 판단·정확도, 소유자의 시각 승인, 미검수 Docling 출처의 정식 내보내기 성공, 여러 원문 뷰 동시 렌더링 부하, 임의 junction을 통한 플랫폼 picker 범위 검증. 해당 조건을 성공으로 기록하지 않는다.
