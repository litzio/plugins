# pdf.js 기능 장부

PDF 가져오기가 쓰는 pdf.js(`pdfjs-dist` 6.5.438)의 기능과, 쓰지 않는 기능의 판단을 적는다. PDF 처리 기능을 계획할 때 먼저 이 장부를 본다. pdf.js 버전을 올리는 PR은 릴리스 노트를 보고 이 장부를 함께 고친다.

- 공식 설명: [API 문서(최신)](https://mozilla.github.io/pdf.js/api/), [6.5.438의 `api.js`](https://github.com/mozilla/pdf.js/blob/v6.5.438/src/display/api.js)(`PDFDocumentProxy`, `PDFPageProxy`), [6.5.438의 `TextLayer`](https://github.com/mozilla/pdf.js/blob/v6.5.438/src/display/text_layer.js).
- 상태: **사용** / **측정 중** / **미사용·유망** / **해당 없음**(지금 표본에 그 신호가 없음) / **쓰지 않기로 함**(이유를 적는다).
- 숫자는 `node pdfjs-probe.mjs <PDF>`로 잰다. 이 도구는 개수만 출력하고 쪽의 글자는 내지 않는다. 저작권이 있는 표본은 개수만 적고 내용은 옮기지 않는다.

## 표본에서 잰 값 (2026-11-18)

| 신호 | LSR 1.1 (공개 합성, 13쪽) | IEEE 1547 (138쪽) |
| --- | --- | --- |
| 책갈피 항목 | 16 | 196 |
| 쪽 표시 번호(page labels) | 없음 | 있음, 쪽 순서와 다름 |
| 태그된 쪽(구조 트리) | 0 | 104 |
| 구조 역할(많은 순) | — | TD 11877, P 3290, TR 3056, Reference 880, TH 520, LI 205, Link 132, L 88, H3 78, H2 71, Note 50, Table 50, H4 28 |
| 링크 주석(문서 안 / 밖) | 0 / 0 | 1373 / 30 |
| 그림이 있는 쪽(래스터) | 1 | 20 |
| 레이어 / 첨부 / 양식 칸 | 0 / 0 / 0 | 0 / 0 / 0 |

## 기능별 상태

| 기능(API) | 상태 | 어디에 쓰나 / 왜 안 쓰나 |
| --- | --- | --- |
| `getDocument`, `getPage`, `getViewport` | 사용 | 문서와 쪽 열기, 좌표 변환 |
| `getTextContent` | 사용 | 글자 층(줄·글자 위치·글꼴 이름). 글꼴 이름으로 굵기와 기울임을 읽는다. 이웃 조각의 크기·기준선·수평 간격으로 위첨자·아래첨자 후보를 찾는다 |
| `getOperatorList` | 사용 | 선·사각형으로 표 격자를 찾고, 그림이 그려진 영역을 찾는다 |
| `getOutline`, `getDestination`, `getPageIndex` | 사용 | 책갈피로 번호 제목을 확인하고 쪽 고르기 화면에 첫 제목을 보인다 |
| `getMetadata` | 사용 | 문서 형식 프로필 선택(제목 칸) |
| `render` | 사용 | 원본 칸의 쪽 그림, 쪽 고르기 미리 보기, 그림 블록 잘라 내기. 같은 canvas에 다시 그릴 때는 이전 작업을 `cancel()`하고 끝나기를 기다린 뒤 시작해 겹치지 않게 한다. `RenderingCancelledException`과 화면에서 내려간 쪽의 오류는 실패로 보지 않는다(`page-render.mjs`) |
| `getStructTree` + `getTextContent({includeMarkedContent:true})` | 사용(도면 용지) | 쪽 틀이 본문을 덮고 글자의 95% 이상이 P·TH·TD에 이어진 쪽에서 문단과 표 칸의 소속을 읽는다. 순서는 좌표로 정한다. IEEE·일반 프로필은 기존 글자 추출을 쓴다. |
| `getAnnotations` (Link) | 사용(그림·표 참조 및 조항·부록 제목 링크) | 문서 안 링크의 목적지(쪽·높이)에서 대상 블록을 찾아, 번호가 같은 그림·표 참조를 리치오 참조로 바꾼다. 목적지는 대개 대상보다 약 20pt 위를 가리킨다. 조항·부록 제목을 가리키면 원문 상자에서 확인한 글자를 일반 링크로 저장한다. 높이가 없는 쪽 목적지, 모호한 글자 범위와 번호 불일치는 글자로 둔다. 밖 링크(URL)는 아직 쓰지 않으며 문서의 일반 링크로 살릴 수 있다 |
| `getPageLabels` | 미사용·유망 | 인쇄된 쪽 번호. 원본 칸의 쪽 표시와 머리·바닥의 쪽 번호 줄 판단에 쓸 수 있다 |
| `TextLayer` | 미사용·유망 | 원본 칸의 글자를 고르고 복사하기, 원본 안 찾기. 지금 원본 칸은 그림으로만 그린다 |
| 래스터 그림 원본 꺼내기(`paintImageXObject`의 이미지 객체) | 미사용 | 지금은 영역을 2.5배로 다시 그려 잘라 낸다. 사진류 그림의 원래 화질이 필요할 때 검토 |
| `getOptionalContentConfig` (레이어) | 해당 없음 | 표본에 레이어가 없다 |
| `getAttachments` | 해당 없음 | 표본에 첨부 파일이 없다 |
| `getFieldObjects`, 주석 층(양식) | 해당 없음 | 표본에 양식 칸이 없다 |
