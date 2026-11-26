
# Engineering Lifecycle 개발 가이드

## 빌드와 검증

```shell
npm ci
npm run typecheck
npm run build
npm test
```

TypeScript는 개발 의존성입니다. 로컬 설치 파일의 실행 의존성은 Litzio Host, 공개 Litzio Plugin SDK 및 표준 Node 기능입니다. domain의 엄격한 TypeScript를 runtime의 ESM으로 빌드하고 presentation의 JSX와 스타일을 screen.jsx 진입점에 묶습니다. runtime 및 screen.jsx가 배포 계약의 일부입니다. 도메인·화면 변경과 배포 파일을 함께 갱신합니다.

- **domain/model.mts와 seed.mts**는 버전별 프로세스 카탈로그, 2개 독립 과제와 릴리즈, 합성 사용자 및 참조 무결성을 정의합니다.
- **domain/operations.mts**는 관계 인덱스, 영향 전파, 범위별 지표, 검증 개정 일치, Baseline과 쓰기 명령을 관리합니다. 링크 양방향과 커버리지는 하나의 관계 집합에서 계산합니다.
- **store.mjs와 documents.mjs**는 원본 접수, 합성 PDF 생성, 영속 작업 팩과 CSV 파일을 담당합니다. 작업 팩은 절대 경로를 입력받는 폼 없이 공개 폴더·파일 선택기로 고릅니다.
- **host.mjs**는 SDK 활성 수명, JSON 화면 호출, 오류 메시지, 공개 읽기 작업을 연결합니다. **presentation/**은 리치오 React·공용 화면 부품과 상속 토큰을 사용합니다.
- **test/domain.test.mjs**는 외부 서버 없이 도메인 동작과 임시 파일의 저장·충돌·다시 열기·초기화를 확인합니다. 브라우저와 공개 CLI 통합 검증은 별도 보고서에 있습니다.

## 쓰기 및 범위 계약

모든 쓰기는 열린 팩, 프로젝트, 릴리즈 및 예상 팩 리비전을 확인합니다. 화면은 호출마다 작업 키를 보내며 저장 팩에 최근 80개 키를 두어 중복 제출을 감지합니다. Host 작업 큐와 파일 옆의 배타 잠금이 동시 쓰기를 제어합니다. 임시 파일을 같은 폴더에 써서 flush하고 백업과 현재 파일을 각각 교체합니다. 첫 생성은 기존 파일을 덮어쓰지 않습니다. 강제 종료 후 .ell.lock이 남으면 쓰기 프로세스 종료를 확인하고 백업한 뒤 잠금 파일을 치웁니다. 수작업 복구는 열린 팩이 없는 상태에서 합니다. 네트워크 공유 드라이브와 동시 온라인 협업은 검증 범위 밖입니다.

Baseline은 생성 시점의 객체와 링크, 검토와 범위 정책을 복제합니다. 과거 실행의 관측값·판정·기준선을 그대로 보존합니다. 새 실행은 척도 리비전과 연결된 요구사항·설계 리비전을 기록하고 영향이 확정된 척도는 새 실행을 요구합니다. 기존 링크를 검토할 때에만 정합성 상태를 확정합니다. 패키지에 든 숫자는 합성 데이터입니다. 평가 준비 점검, 요구사항 매핑, 검증 실행률과 합격률의 분모는 [Phase 1 설계](../../docs/engineering-lifecycle-design/technical-plan.md)를 따릅니다.

## 공개 SDK 계약

- manifest의 React 화면 및 fileActions
- 주제별 ScreenLayout, Button, Status, EmptyState, Notice, ContextMenu, 테마 토큰
- pickPath, confirm, saveDocument 및 파일 재열기
- PluginPublicError, 화면 전용 invoke, 공개 schema·receipt 및 비서 읽기 작업
- 플러그인 기여 스킬. 공개 operation local.engineering-lifecycle.investigate에 project, release, question을 보냅니다. baseline, target, process를 선택할 수 있습니다. 질문 유형은 summary, missing-trace, unverified, impact, failed-evidence, readiness, trace입니다.

## 범위

두 과제의 모든 데이터와 역할은 합성입니다. 계정 인증·공식 심사 권한 또는 전자서명과 연결하지 않습니다. 저장 시 한 Host가 한 데이터 팩을 활성 대상으로 삼습니다. 동일 팩의 서로 다른 프로젝트 탭이 데이터를 격리합니다.

새로 접수한 PDF/DOCX는 원본 다운로드와 수동 인용·위치 기록을 지원합니다. 데모 PDF는 표시용 구조와 내려받는 원본을 같은 조항 데이터에서 만듭니다. 임의 외부 PDF/DOCX의 자동 가져오기·원본 미리보기·정확한 PDF 바운딩 박스 추출과 실제 AI 초안 생성, ReqIF 1.2, Git 연결, 외부 ALM 연결은 개발하지 않았습니다. 비서 도구는 읽기만 제공합니다. 평가는 평가자 기록과 증거 준비 상태를 구별합니다.

[공개 실행 계약](https://github.com/litzio/litzio/blob/d952b460f7f9/docs/design/plugin-stage1-v1.md) · [공개 화면 계약](https://github.com/litzio/litzio/blob/d952b460f7f9/docs/design/plugin-screens-v1.md)
