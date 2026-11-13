# 인계 schema 사본

contracts/docling-to-litzio/README.md가 정본으로 지정한 파일 계약(JSON Schema 2020-12)만 복사했다. 다른 플러그인의 처리 코드는 import하지 않는다. 실행 시 이 폴더의 사본을 Ajv 8.20.0으로 검사한다. 원본 계약 파일은 수정하지 않았다.

- handoff-complete.schema.json: complete.schema.json, SHA-256 6774fa7b362ccea931564cd653f049f4746d2bdc12f6fd23caa080bdb75d499
- handoff-losses.schema.json: losses.schema.json, SHA-256 26d5c30567eb02a23c622869c25ee608d6879f6ef286db91063fd0084038ca2b
- handoff-provenance.schema.json: provenance.schema.json, SHA-256 1f0e4d0b18cea325a351688ba28efe3b90bdd82cf1e05bb313d11bafbf8e08e4

complete 버전 1.0.0과 1.1.0을 명시 분기한다. complete의 공통 모양은 기존 사본으로 검사하며, 1.1.0의 추가 필수 파일과 revision 의미는 소비자 코드로 검사한다. correction-history/review-targets/pdf-evidence schema 사본은 corrections.md와 review-targets.md가 지정한 정본에서 가져왔다. schema만 통과한 파일은 신뢰하지 않으며 bytes/revision/원본/위치/영역/손실/교정 사슬 검사도 모두 통과해야 한다.
