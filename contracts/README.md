# 플러그인 사이를 오가는 파일

플러그인은 서로의 코드를 쓰지 않고 파일로만 이어진다. 이 폴더에는 각 파일의 모양을 적는다. 파일의 모양을 바꾸면 그것을 쓰는 쪽과 읽는 쪽, 그리고 이 문서를 같은 변경에서 함께 고친다.

| 만드는 쪽 | 파일 | 읽는 쪽 | 설명 |
| --- | --- | --- | --- |
| docling-convert | Docling 변환 결과 | docling-to-litzio | [변환 계약](docling-convert/README.md): 권장 기본 프로필·조정 옵션, 원본 PDF·DoclingDocument JSON·변환 기록. 서버 없이 읽는다. |
| docling-to-litzio | 리치오 문서 | requirements-extract | 리치오의 문서 형식을 그대로 쓴다. 원문과의 대응을 어떻게 남기는지는 문서화 플러그인을 만들 때 적는다. |
| requirements-extract | 요구사항 결과 | 사람, 요구사항 관리 시스템 | 설계 때 정한다. |
