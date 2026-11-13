# 플러그인 사이를 오가는 파일

플러그인은 서로의 코드를 쓰지 않고 파일로만 이어진다. 이 폴더에는 각 파일의 모양을 적는다. 파일의 모양을 바꾸면 그것을 쓰는 쪽과 읽는 쪽, 그리고 이 문서를 같은 변경에서 함께 고친다.

| 만드는 쪽 | 파일 | 읽는 쪽 | 설명 |
| --- | --- | --- | --- |
| docling-convert | Docling 변환 결과 | docling-to-litzio | [변환 계약](docling-convert/README.md): 권장 기본 프로필·조정 옵션, 원본 PDF·DoclingDocument JSON·변환 기록. 서버 없이 읽는다. |
| docling-to-litzio | 리치오 문서·그림·provenance·손실·완료 표지·검수 후보 | requirements-extract | [인계 계약 v1](docling-to-litzio/README.md): 원본 bytes/digest와 생성 revision을 결합한다. 생성 완결과 검수 완료는 구분한다. [검수 대상 v1](docling-to-litzio/review-targets.md)은 독립 PDF 증거와 미검수 후보/묶음을 결합한다. |
| requirements-extract | 요구사항 결과 | 사람, 요구사항 관리 시스템 | 설계 때 정한다. |
