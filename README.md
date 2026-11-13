# Litzio plugins

[리치오](https://github.com/litzio/litzio) 위에서 도는 플러그인 모음이다. 비공개 저장소다.

세 플러그인이 파일로 이어져 하나의 흐름을 이룬다.

1. `plugins/docling-convert` — PDF를 변환 서버로 보내 변환 결과를 받는다.
2. `plugins/docling-to-litzio` — 변환 결과를 리치오 문서로 만들고 검수한다.
3. `plugins/requirements-extract` — 리치오 문서에서 요구사항을 뽑아 연결한다.

작업 규칙은 [AGENTS.md](AGENTS.md), 진행 상황과 열린 질문은 [진행 기록](docs/progress.md), 플러그인 사이를 오가는 파일의 모양은 [contracts](contracts/README.md)에 있다.
