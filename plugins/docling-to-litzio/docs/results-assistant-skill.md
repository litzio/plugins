# PR 4-나 — 설치 스킬과 실제 비서 수락

공개 리치오 master `f8c9dc9b95759568906e080bf846abf846f81287`을 새 격리 checkout에서 frozen install 뒤 production CLI/Editor로 빌드했다. 공개 플러그인 제작·화면·비서 계약과 CLI만 사용했고 내부 구현은 읽거나 가져오지 않았다. 완료 시점에도 원격 master SHA가 같음을 확인했다. 공개 안내에 context.cli는 아직 없어 cliEntry 설정 fallback을 그대로 유지한다.

## 설치와 화면

플러그인 0.8.0은 skills.id=`review`를 싣는다. 설치된 namespace는 `litzio-plugin-local--docling-to-litzio---review`로 **47자**이며 64자 상한 안이다. validate/install이 통과했고 설정 화면의 스킬 목록과 비서의 실제 SKILL.md 읽기로 설치를 확인했다. [본문](../skills/review/SKILL.md)은 자료→근거→교정/판단 불가→현재 결과→checkpoint·중단/재개만 안내한다.

화면은 기존 Toolbar/SummaryCard/DataTable/Button/Notice를 사용해 미검사 묶음·교정 기록·판단 불가 묶음·미검사 쪽과 전후 값/근거 쪽/재확인 범위를 표시한다. 마지막 현재 revision에 맞는 교정만 되돌릴 수 있다. 조회를 새로 하면 외부 비서가 남긴 교정과 진행을 읽는다. 원문과 문서의 나란한 대조는 넣지 않았다.

실제 Host 화면에서 [교정 목록·진행](assets/assistant-skill/corrections.png)을 확인했다. 시험 결과의 별도 사본에서 버튼을 눌러 [역연산과 진행 무효화](assets/assistant-skill/undo.png)를 확인했고, 공식 inspect가 이력의 후 값과 일치했다. 원래 비서 시험의 두 교정은 보존했다. 캡처는 계정·경로 영역을 포함하지 않는 실제 화면 일부다.

## 실제 비서 시험

모델은 Codex **gpt-6.1-terra / high**, 권한은 격리 Host의 전체 접근이었다. 공개 LSR fixture의 사본만 사용했다. 변환 JSON 사본의 서로 다른 두 표에서 `0.12 s`와 `0.22 s`를 각각 `999`, `888`로 주입했다. PDF는 불변이고 원래 fixtures를 수정하거나 재변환하지 않았다.

지시는 jobId/groupIds와 “이 여섯 묶음만 처리하고 근거 부족은 판단 불가로 남겨 달라”였다. 숫자 오류 두 묶음, 정상 수식 대조 두 묶음, 원래 근거 부족이 있는 수식/병합 표 두 묶음이다. 기대 정답·oracle를 비서 입력에 넣지 않았다. 평가 자료와 처리 도구는 설치 artifact에서 제외했고, 평가 파일은 Host Root 밖에 두었다.

| 과제 | 관측 | 사용자 지시 턴 / 셸 도구 | 시간 |
| --- | --- | --- | --- |
| 1차 | 스킬 자발적 선택/읽기, 전달된 Host 주소로 공개 CLI 호출. 잘못 안내한 scope 때문에 편집 전 거부. 재조회 후 안전 중단, 변경 0 | 1 / 9 | 재개 지시까지 177초. 관측·원인 분류·스킬 수정 시간을 포함 |
| 2차 | 수정 스킬 재읽기와 중단 작업 재개. 두 교정·PDF 재대조·현재 값 재확인, 네 판단 불가·checkpoint 기록 | 1 / 11 | 요청부터 완료 관측까지 227초. 순수 모델 실행 시간은 아님 |

첫 실패는 Docling check.regions의 근사 셀 상자를 실제 PDF token 좌표 대신 scope에 복사하게 한 **스킬 문제**였다. 토큰 상단이 그 상자보다 약 1.38pt 위였고 제출이 거부됐다. 원장과 문서에는 변경이 없었다. 스킬을 실제 읽은 PDF token bbox의 쪽별 합집합으로 고쳤다. 원인을 분류한 뒤 추가 사용자 지시 한 번으로 재개했고 더 호출하지 않았다. 공개 쓰기 오류의 일반화된 응답만으로는 원인을 알기 어려웠다는 점도 남긴다.

비서는 두 턴 모두 스킬을 읽었고 `LITZIO_HOST_ORIGIN`을 `--host`에 명시했다. Host가 제공한 CLI 실행 정보로 operation invoke의 읽기와 쓰기를 실행했다. 실제 입력의 숫자·출처는 public material에서 대조했으며 문서 직접 쓰기는 하지 않았다.

독립 인계 검증과 기록 검사 결과:

- 두 주입 대상만 교정, `999 → 0.12 s`, `888 → 0.22 s`. 다른 대상 변경 0, 정상 대조 묶음 변경 0.
- 두 고리 모두 verified-protected-tokens, 원장/이력/문서 인계 검증 통과, pending 없음.
- 여섯 묶음 중 교정후재검사 2, 판단 불가 4. 정상 수식도 이미지만으로 의미를 확인하지 못했으므로 올바름을 확정하지 않았다.
- 미검사 11묶음/13쪽은 그대로 남음. 최종 reviewComplete=false.

[측정 JSON](assistant-skill-results.json)을 함께 보관한다. 이 결과는 **절차가 실제 비서로 끝까지 도는지**의 작은 수락 시험이며 오류 탐지율·AI 교정 품질·일반 문서 정확성 보증이 아니다.

## 재현과 단위 검사

공식 CLI로 설치·설정한 격리 Host에서 `node test/assistant-acceptance.js WORK CLI HOST EVALUATION_FILE`이 공개 preflight/start/job으로 새 생성과 여섯 묶음 작업 파일을 만든다. 외부 평가 파일은 Host Root 밖으로 지정한다. script 자체는 AI를 호출하지 않는다. 비서 시험이 끝난 뒤 `node test/measure-assistant-acceptance.js WORK EVALUATION_FILE RESULT_FILE`로 기록을 읽기 검증한다. 매번 새 WORK 폴더가 필요하며 기존 결과를 덮지 않는다.

기본 단위·가짜 편집 검사: **61 통과/8 명시 skip(총 69)**. 이번에는 corpus 전체/CLI 회귀를 다시 돌렸다고 쓰지 않는다. 실제 새 CLI의 생성·교정·재검증·화면 역연산은 위 별도 실행으로 확인했다.

## 격리와 정리, 남은 범위

초기에는 LITZIO_DATA_DIR만 지정해 비서 작업 폴더가 전역 경로로 표시되는 실수가 있었다. AI 실행 전에 Host를 종료했다. namespace 스킬이 이번 설치 파일과 같은지 확인하여 SKILL.md 하나와 빈 폴더만 정리했고 litzio-guide는 보존했다. 당시 자동 생성/갱신된 AGENTS.md·bin·빈 attachments의 메타데이터를 소유자에게 보고했으며, 이전 내용의 증거가 없어 추측 복원하지 않았다. 플러그인 등록은 자체 임시 데이터에 있었다. “전역에 아무 변화도 없었다”고 주장하지 않는다.

그 뒤에는 공개 격리 변수 **LITZIO_DATA_DIR / LITZIO_ASSISTANT_CWD / LITZIO_ASSISTANT_SETTINGS_FILE**을 모두 자기 임시 하위 폴더로 지정하고 설정 화면의 비서 작업 폴더를 확인했다. 실제 AI 턴의 환경에서는 APPDATA/LOCALAPPDATA나 Codex 홈을 바꾸지 않았다. 두 실제 AI 턴은 이 수정된 환경에서만 실행했다. 사용자 문서·설치된 앱·기존 daemon에는 작업하지 않았다.

플러그인을 disable하고 시험 브라우저를 닫았다. Host는 interrupt 뒤에도 종료되지 않아 명령줄·생성 시각·부모 관계로 직접 시작한 인스턴스임을 재확인하고 그 프로세스 트리만 종료했다. 시험 listener와 하위 프로세스가 남지 않았음을 확인했다. 임시 결과는 보존했다. Docling 서버/Docker/다른 플러그인은 건드리지 않았다.

미검증: 장문 부담/성능·스캔본·이미지 전용 근거·전체 문서 검수 완료/최종 reviewed 인계·실사용 정확성·모든 화면 크기. context.cli·읽기 전용 문서 보기·파일 선택/기존 문서 열기의 후속 플랫폼 능력은 이번 artifact에 추측해서 넣지 않았다. 진행 기록 전달안과 플랫폼에 모자란 것은 PR 본문에 둔다.
