# LSR 1.1 보관 자료

소유자 제작 합성 자료. 입력 PDF와 작성자가 변환 전에 정의한 기대 구조의 고정본이다. `ground_truth`는 **Docling 출력의 정답이나 품질 합격선이 아니다**. 옵션 조합 간 상대 진단에 사용하며 공식 규격이나 일반 정확도의 대표 표본으로 해석하지 않는다.

## 포함 파일

- `LSR-1.1-standards.pdf`: 북마크가 있는 13쪽 합성 가상 규격.
- `LSR-1.1-standards-no-bookmarks.pdf`: 북마크가 없는 13쪽 입력.
- `LSR-1.1-standards-answer-key.pdf`: 작성자 기대 구조를 주석으로 표시한 참고 PDF.
- `ground_truth/standards.json`, `ground_truth/standards-no-bookmarks.json`: 변환 전 작성한 기대 구조. 이번 작업에서 수정하지 않았다.
- `converted/document.json`, `converted/conversion-record.json`: 북마크 있는 입력의 권장 프로필 결과와 실제 변환 기록.
- `converted/no-bookmarks/`, `converted/answer-key/`: 나머지 두 PDF의 같은 구성.
- `LICENSES.md`, `resources/fonts/*-LICENSE.txt`: 라이선스·폰트 고지. 이번 작업에서 수정하지 않았다.
- `SHA256SUMS`: 목록 자신을 제외한 보관 파일의 SHA-256, 폴더 기준 상대 경로.

## 변환

2026-11-13에 docling-serve 1.38.2-cu128, [권장 기본 프로필 pdf-en-v2](../../contracts/docling-convert/pdf-en-v2.json)로 다시 변환했다. DoclingDocument schema는 1.10.0이다. 실제 상태·시각·시간·쪽 수·프로필·입력/결과 hash는 각 conversion-record.json이 정본이다. 성공은 의미 동등성이나 누락 없음을 뜻하지 않는다. 별도 페이지 PNG를 중복 저장하지 않고 JSON의 embedded 이미지로 원문을 대조한다. 원본 PDF는 record의 상대 경로로 가리킨다.

옵션별 시간·항목별 진단, 반복 결과, 눈으로 확인한 관찰은 [변환 근거](../../contracts/docling-convert/experiments.md)에 모은다. 이후 측정은 새로 변환하지 않고 이 고정 결과를 사용한다. 원본·서버·프로필을 의도적으로 바꾸는 때만 다시 변환했다.

## 설계 범위와 라이선스

북마크·제목 계층·목차·부록, 본문과 제목 구분, 복잡한 표·셀 수식, 위첨자·쪽/표 주석 범위, 부등호·소수·부호·단위, 쪽을 넘는 표·문단, 다단 목록, 원문 오탈자, 그림·그래프·캡션, 수식 번호 연결을 담는다. 설계 범위는 변환 성공을 뜻하지 않는다.

합성 내용과 작성자 주석·기대 구조는 CC0 1.0 Universal이다. [LICENSES.md](LICENSES.md)를 보존한다. 폰트에는 별도 [DejaVu](resources/fonts/DejaVu-LICENSE.txt), [Noto CJK](resources/fonts/Noto-CJK-LICENSE.txt) 고지가 적용된다. 폰트 바이너리는 포함하지 않는다. 전체 reference ZIP, 제3자 규격 원문·변환 결과·별도 쪽 PNG는 추가하지 않는다. 원본의 MIT 스크립트 고지는 원본 묶음에 대한 설명이며 이 폴더에는 해당 생성 스크립트가 없다.

입력 PDF·기대 구조를 개정할 때는 새 버전 폴더를 만들고 출처·고지·SHA-256 목록을 함께 보존한다.

- `lsr-1.1/converted`: 13쪽, 20.331초, task/result success, errors=[].

- `lsr-1.1/converted/answer-key`: 13쪽, 19.394초, task/result success, errors=[].

- `lsr-1.1/converted/no-bookmarks`: 13쪽, 18.437초, task/result success, errors=[].

현재 채점에 포함한 `standards.json`의 출처는 공개 합성 LSR 1.1 reference bundle의 `ground_truth/standards.json`(보관 태그의 원본 바이트)이며 라이선스는 CC0 1.0 Universal입니다. 책갈피 없는 사본의 정답은 중복 보관하지 않습니다.
