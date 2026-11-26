# Jira Dashboard

리치오에서 Jira Data Center 이슈의 기한과 추이를 보고, 같은 검색 범위를 이슈 표와 보드에서 검토하는 읽기 전용 플러그인이다. 연결 없이 화면을 둘러볼 수 있는 합성 데모가 포함되어 있다.

## 설치와 연결

1. 리치오의 **설정 → 플러그인 → 플러그인 추가**에서 이 플러그인 폴더를 선택하고 등록·신뢰·활성화한다. 개발용 격리 Host에서는 공식 CLI `litzio plugins install <폴더> --host <Host URL>`을 사용할 수 있다.
2. **Jira Dashboard 설정**에서 **Base URL**에 Jira 주소를 입력한다. 컨텍스트 경로가 있으면 포함한다. 예를 들어 `https://jira.example.com/jira`를 입력한다.
3. **Personal access token**에 Jira에서 발급한 PAT를 그대로 입력하고 **비밀값 저장**을 누른다. **연결 확인**으로 로그인한 사용자 이름을 확인한다. 설정 직후 Host가 플러그인을 다시 불러오는 중이면 잠시 뒤 확인을 다시 누른다.
4. 작업 막대에서 **Jira Dashboard**를 열고 **Add filter → Project**로 프로젝트를 고른다. **Apply scope**를 누르면 대시보드를 조회한다. **Use demo**로 합성 데이터 화면을 열 수 있다.

PAT는 Windows Host의 공식 비밀 저장소에 보관된다. Base URL과 PAT는 독립 설정이다. 같은 저장 토큰으로 변경된 주소를 조회하므로 다른 Jira 서버로 바꿀 때에는 그 서버의 PAT로 교체한다. HTTP 주소를 입력하면 Jira 요청도 HTTP로 전송된다. Jira가 HTTPS를 제공하면 HTTPS 주소를 사용한다. 브라우저 화면은 Jira 인증 헤더를 받지 않는다.

## 화면에서 할 수 있는 일

- **Overview**에서 전체 KPI와 조회 표본 기반 차트를 구분해 읽는다. 기한 초과 KPI, 차트 항목, 임박 이슈를 눌러 관련 이슈로 이동한다.
- **Issues**에서 기본 필터나 서버 JQL로 검색한다. 담당자와 보고자는 두 글자부터 찾고, 표시 이름 아래 로그인 식별자를 확인한다. **Columns**에서 표시와 최소 너비를 조절한다. **Compact**는 표의 밀도를 바꾼다.
- **Board**는 현재 결과 페이지를 상태별로 묶어서 보여 준다. 각 열에서 이미 읽은 카드를 펼치고, **Next issue page**로 다음 페이지를 조회한다.
- 오른쪽 상세에서 댓글, 첨부 목록, 이력을 탭별로 펼친다. 원본 문서는 **Open in Jira**로 연다. 긴 이력을 읽으려면 Jira 원본을 사용한다.
- **Saved views**와 최근 검색은 현재 화면 세션에서 유지된다. 이슈에 체크한 뒤 **Export selected on page**로 현재 페이지의 선택 이슈를 리치오 문서 표로 저장할 수 있다.

[A안과 구현 화면](../../docs/jira-dashboard-design/README.md) · [개발·검증 기록](../../docs/jira-dashboard-design/implementation.md)
