
# Engineering Lifecycle 0.1.0 구현 및 검증

## 산출물

- [설치·사용 가이드](../../plugins/engineering-lifecycle/README.md), [개발 가이드](../../plugins/engineering-lifecycle/DEVELOPMENT.md), [8분 시연 스크립트](demo-script.md)
- [승인된 디자인 시안](README.md), [데이터 설계와 Automotive SPICE® 4.1 프로세스 대응표](technical-plan.md), [시연 GIF](implementation/engineering-lifecycle-demo.gif)
- [고객 원본 v2.3](samples/doc-001-v2.3.pdf), [개정 원본 v2.4](samples/doc-001-v2.4.pdf), [실행 VX-027 증거 CSV](samples/ev-051-hil-capture.csv)

두 최신 릴리즈의 초기 데이터에는 원본 문서 16건, 고객·Stakeholder 요구사항 164건, 시스템 161건, SW/HW 321건, 아키텍처·설계 요소 228건, 검증 척도 242건, 실행 259건, 증거 29건, 관계 1,738건, 변경 요청 17건, 문제 20건, 합성 사용자 10명이 있다. 각 과제에 현재 릴리즈와 이전 릴리즈가 있다. 과제와 수치, 문서·실행 증거는 모두 합성 데이터다.

| 실제 화면 | 라이트 및 다크 캡처 |
| --- | --- |
| Portfolio | [두 과제 비교](implementation/01-portfolio.png) |
| V-Cycle | [A · 프로세스 맵](implementation/02-v-cycle.png) · [A · 다크](implementation/11-v-cycle-dark.png) |
| 고객 문서 | [개정 원문과 CUS-042](implementation/03-document-intake.png) |
| 요구사항 | [SYS.2 작업 화면](implementation/04-requirements.png) |
| 추적성 | [A · 관계 그래프](implementation/05-explorer.png) · [매트릭스](implementation/06-matrix.png) · [링크 추가 후](implementation/06b-trace-linked.png) · [다크 그래프](implementation/12-explorer-dark.png) · [B · Lineage](implementation/13-lineage-dark.png) |
| 변경 | [영향 후보와 문구 비교](implementation/07-change-impact.png) |
| 평가 준비 | [증거 매트릭스](implementation/08-assessment.png) |
| 검증 | [이전 HIL 증거](implementation/09-verification-evidence.png) · [재검증 기록](implementation/10-reverification.png) · [94 ms의 결과 상세](implementation/10b-retest-result.png) |
| 문제·위험 | [위험 매트릭스](implementation/14-risks.png) |

## 검증 결과

2026-11-27. Windows용 리치오 공개판 0.0.4-beta.3 배포물의 CLI·Editor를 추출해 임시 폴더의 HTTP Host에서 테스트했다. 이 플러그인의 최종 아티팩트 검증, 신뢰와 활성화, 실제 배포 Editor에서 화면을 여는 것까지 확인했다. 사용자 설치본, 자료 및 기본 daemon에 연결하지 않았다.

| 범위 | 확인 |
| --- | --- |
| 단위 및 파일 통합 | 빌드와 Strict TypeScript 검사, Node 테스트 8건 통과. 다대다 양방향 탐색, 기준선 비교와 불변성, 중복 요청과 리비전 충돌, 붙임 원본의 바이트 보존, 다시 열기, 초기화 및 백업 확인. |
| A · 과제 이동 | OBC와 열관리 과제의 릴리즈가 각각 R1.2·R1.9로 유지됨을 브라우저에서 확인. OBC R1.2의 적용 프로세스 24곳에서 조회 화면으로 들어갔다. |
| B · 원문에서 증거까지 | DOC-001 v2.4 p.14의 100 ms 강조와 PDF 다운로드를 확인했다. SYS-042 × ARC-015의 Missing을 Linked로 변경한 뒤 그래프에서 같은 관계가 나타났다. VX-027의 EV-051 파형에서 시작해 v2.3 p.14의 200 ms로 돌아갔다. 새 PDF를 받아 페이지·조항·인용문을 기록하는 흐름도 확인했다. |
| C · 변경 승인과 재검증 | CR-014에서 직접·간접 영향 후보 11건을 판단하고 승인했다. SYS-042와 VM-031을 100 ms 기준으로 편집하고 새 실행 VX-501에 94 ms를 기록했다. 변경을 종료하고 BL-13을 생성했다. BL-12에 남아 있는 VX-027은 200 ms 기준에서 108 ms Passed를 유지했다. |
| D · 평가 준비 | SYS.2의 증거를 열고 개선 조치를 저장했다. 공식 saveDocument로 평가 증거 보고서를 생성해 리치오 문서 탭에서 열었다. 링크 CSV를 저장했다. |
| 재열기·초기화 | 같은 데이터 팩을 새 플러그인 인스턴스에서 열어 CR-014 종료와 BL-13을 확인했다. Reset Demo 취소는 종료 상태를 유지했고, 확인은 초기 Proposed 상태를 복원했다. |
| 테마·접근성 | 배포 Editor의 테마 전환으로 라이트·다크를 렌더링했다. 다크의 Reduced Motion 환경에서 그래프와 Lineage를 확인했다. 840 px 창에서 외부 가로 넘침 없이 키보드 Enter로 확대했다. 모든 개별 단축키와 스크린 리더 조합은 별도 검증 대상이다. |
| 에이전트 공개 읽기 | 공식 CLI에서 investigate를 호출해 EV-051에서 DOC-001 v2.3 p.14 §4.3.2까지 실제 연결과 성공 receipt를 얻었다. 자연어 에이전트 세션과 모델 응답은 실행하지 않았다. |

### 응답 시간

릴리즈 분량의 데이터 팩을 연 Windows 격리 Host에서 브라우저 클릭 직전부터 목표 제목이나 선택 그래프 노드가 보일 때까지 측정했다. 탭 열기·전환은 48, 58, 121, 105, 120 ms이며 중앙값 105 ms다. 선택 그래프 열기는 80, 79, 75, 64, 83 ms이며 중앙값 79 ms다. 각각 다섯 번의 측정이며 P95나 서버·하드웨어 보장으로 사용하지 않는다. 매트릭스 최대 표시 범위는 요청당 12×9, 기본 그래프 요청은 48개 객체다.

## 개발 범위와 SDK 개선

독립된 네이티브 프로젝트 탭을 열 수 있는 대상 키와 경로가 있으면 Portfolio, 작업 표시줄과 에이전트 검색 결과가 같은 과제 탭으로 이동할 수 있다. 플러그인용 저장소에서 revision 단위 쓰기, 변경 알림과 업무 폴더 권한을 제공하면 파일 저장과 재열기의 상당 부분을 공통화할 수 있다. PDF와 Word의 버전 고정 위치를 플러그인에서 여는 계약도 필요하다. 원문 다이제스트와 PDF 쪽 좌표, DOCX 문단 키를 동일한 출처 앵커로 전달하는 것이 고객 요구 검토의 대표 사용 사례다. [저장소 SDK 한계 장부](../platform-gaps.md)

신규 PDF/DOCX의 실제 원본은 다운로드로 열고 화면에서는 사용자가 기록한 인용과 위치를 대조한다. 임의 문서 자동 파싱·미리보기, 자연어 에이전트와 실제 모델 응답의 통합, ReqIF 1.2·Git 연계는 후속 범위다. Electron 앱 셸 자체와 기업용 협업·규모 조건은 별도 검증 대상이다. 내부 평가 준비 화면과 수동 평가자 기록은 VDA의 공식 평가나 인증을 제공하지 않는다. [공식 PAM 4.1](https://vda-qmc.de/wp-content/uploads/2026/09/Automotive-SPICE-PAM-v41.pdf)
