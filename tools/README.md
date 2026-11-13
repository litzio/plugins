# LSR 옵션 결과 진단 도구

```sh
python -X utf8 tools/score_lsr.py fixtures/lsr-1.1/ground_truth/standards.json path/to/document.json
python -X utf8 tools/score_lsr.py fixtures/lsr-1.1/ground_truth/standards-no-bookmarks.json path/to/other-document.json
python -X utf8 -m unittest discover -s tools -p test_score_lsr.py
```

임의의 DoclingDocument JSON을 받는다. HTTP envelope라면 document.json_content를 먼저 추출한다. 서버나 리치오를 호출하지 않는다. 출력은 지표마다 `[일치 수, 비교 수]`다. 변환 전 정의된 기대 구조와 좌표로 대응시킨 상대 진단이며 절대 품질 점수가 아니다.

쪽과 bbox를 TOPLEFT로 변환하고 출력 pages.size와 기대 PDF 크기의 비율로 정규화한 뒤 작은 영역 면적 기준 겹침 50% 이상인 후보 중 최대 겹침을 대응시킨다. 같은 출력이 여러 기대 요소에 대응할 수 있으므로 literal_text가 낮다고 그만큼의 문단이 누락됐다고 단정하지 않는다. 다중 행 병합·분할도 문자열 불일치에 포함된다. 표는 시작 행·열로 셀을 대응시키고 범위와 문자열을 따로 센다. 공백만 정규화하고 숫자·부호·대소문자·LaTeX 중괄호는 바꾸지 않는다.

- heading_label / heading_level: 제목 라벨과 단계
- prose_label: 기대 본문이 text/paragraph인가
- table_dimensions / cell_span / cell_text: 행·열 수, 병합 포함 셀 범위, 내용
- formula_detection / formula_literal: 수식 검출과 LaTeX 문자열(수학적 동등성 판정 아님)
- numeric_literal / numeric_cell: 숫자 또는 ≤≥±%를 포함한 원문/셀 문자열의 완전 일치. 단위·부호 오류만의 개수와는 다르다
- note_label: 각주 라벨. 위첨자 위치·주석 참조 범위·표 주석 의미 연결은 미채점
- furniture: 머리글·바닥글·쪽 번호의 furniture 층
- caption_link: captions 참조 관계
- adjacent_order: 같은 쪽 기대 순서의 인접 대응 쌍이 body 순회 순서에서 역전되지 않았는가

원문에 없는 내용, 비대응 출력, 의미 누락·위첨자·주석 범위는 자동 확정하지 않는다. 원문 PDF와 시각 대조가 필요하다. 좌표 매칭 자체도 오차가 있어 개별 오답 개수로 해석하지 않는다.

추가 숫자 진단: `python -X utf8 tools/audit_pdf_numbers.py input.pdf document.json`. PyMuPDF(`pip install pymupdf`)가 필요하다. 쪽별 PDF 글자 층과 출력의 숫자·부등호·부호 token 다중집합 차이를 센다. 벡터 수식, 표 중복·분할, 서로 다른 tokenization 때문에 차이가 생기므로 missing/extra는 검토 후보 수이며 누락·환각의 확정 개수가 아니다. 단위는 numeric_literal/numeric_cell의 전체 문자열 대조로 함께 본다.
`python -X utf8 tools/adapt_mineru_lsr.py result.json > adapted.json`: MinerU 3.4.5 한정 실험 어댑터. content_list의 0–1000 TOPLEFT 좌표와 middle JSON의 명시 캡션 관계, HTML rowspan/colspan을 기존 채점 입력으로 옮긴다. 셀 픽셀 좌표는 생성하지 않는다.
