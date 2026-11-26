
# Litzio Engineering Lifecycle

가상 22kW 양방향 OBC와 통합 열관리 컨트롤러의 고객 문서, 요구사항, 설계, 검증 증거와 평가 준비를 탐색하는 Litzio 플러그인입니다. Automotive SPICE® PAM 4.1 프로세스 식별자를 사용합니다. Automotive SPICE®는 VDA의 등록 상표입니다. [VDA QMC 공식 자료](https://vda-qmc.de/en/automotive-spice/automotive-spice-veroeffentlichungen/)

## 설치 및 시작

1. Litzio **설정 → 플러그인 → 플러그인 추가**에서 이 폴더를 선택한 뒤 신뢰하고 활성화합니다. 공식 CLI를 쓸 때는 대상 Host 주소를 명시해 litzio plugins install 명령으로 같은 폴더를 설치합니다. Windows 공개판 0.0.4-beta.3으로 확인했습니다.
2. 작업 막대의 **Engineering Lifecycle**을 엽니다. 즉시 읽기 전용 합성 Portfolio를 확인할 수 있습니다.
3. 승인·검토·편집을 저장하려면 리치오에서 먼저 작업 폴더를 열고 플러그인 머리에서 **Create data pack**으로 그 폴더를 고릅니다. 다음에는 **Open data pack** 또는 탐색기의 engineering-lifecycle.ell 파일 동작에서 엽니다. 두 과제는 한 팩 안의 독립 데이터 범위입니다. 과제별 릴리즈·필터와 탐색 상태는 플러그인 내부 프로젝트 탭에 유지됩니다.
4. OBC-22 → Lifecycle → SYS.1에서 고객 사양을 고릅니다. **CUS-042**를 선택하면 개정본의 14페이지 조항이 강조됩니다. 그래프에서 SYS-042 → VM-031 → VX-027 → EV-051을 따라가고, 원문으로 역추적합니다. 원본 PDF와 검증 근거는 화면의 다운로드로 확인할 수 있습니다.
5. **Traceability Matrix**에서 누락 관계와 링크 정합성을 분리해 검토합니다. **Changes**에서 영향 후보를 분석하고 담당자 판단을 저장한 다음 변경을 승인합니다. 변경 적용과 검토를 마친 뒤 새 검증 사양 및 실행을 기록합니다. 이미 승인한 Baseline과 과거 결과는 유지됩니다.
6. **Assessment**에서 프로세스별 증거와 개선 조치를 조회하고 보고서를 리치오 문서로 저장합니다. 평가자 의견은 직접 기록합니다. 자동 Capability Level 산정이나 공식 평가 보고서는 제공하지 않습니다.

고객 원본은 **Document intake → Receive document**에서 PDF 또는 DOCX를 골라 접수합니다. 원본 바이트와 해시를 문서 리비전에 보존합니다. 이미 준비된 데모 PDF는 페이지와 조항을 바로 대조합니다. 새로 받은 문서는 원본을 다운로드해 확인한 뒤 **Record source anchor**로 페이지·문단과 정확한 인용문을 기록합니다. 원본 렌더링과 자동 추출에 대한 범위는 [개발 가이드](DEVELOPMENT.md)에 있습니다.

하단 **Reset demo**는 확인 후 열린 합성 데이터 팩을 초기 상태로 되돌립니다. 직전 팩은 .ell.bak 파일에 남습니다. 데이터 팩과 첨부 원본을 함께 보관하세요. 열린 팩이 외부에서 변경되면 **Refresh**로 리비전을 다시 읽습니다.

[8분 시연 스크립트](../../docs/engineering-lifecycle-design/demo-script.md) · [실제 화면과 검증 보고](../../docs/engineering-lifecycle-design/implementation.md)
