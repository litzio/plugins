# PDF → 오프라인 Docling 변환 계약 v2

검증한 서버는 **docling-serve 1.38.2**다. 다른 버전의 지원을 주장하지 않는다. 서버/package 버전과 DoclingDocument schema 버전은 서로 다르다. 요청의 정본은 [pdf-en-v2.json](pdf-en-v2.json), 선택 근거는 [experiments.md](experiments.md)다.

## HTTP 요청부터 결과 수령까지

1. `GET /ready`가 HTTP 200인지 확인한다. `/version`, `/openapi.json`, `/v1/capabilities`를 읽어 실제 버전·필드·preset·허용 정책을 확인한다. OpenAPI 원문 바이트의 SHA-256을 기록한다. ready는 모든 모델의 실제 변환 성공을 보장하지 않는다.
2. `POST /v1/convert/file/async`에 PDF **한 개**를 multipart `files` 필드로 보낸다. MIME은 application/pdf, 이름은 원본 basename이다. profile.request의 각 키는 같은 이름의 form field다. boolean은 `true`/`false`, 숫자는 십진 문자열, 배열은 같은 필드를 반복, 객체는 JSON 문자열로 보낸다. 프로필 파일 자체를 form에 넣지 않는다. multipart boundary는 HTTP 라이브러리가 만든다.
3. 응답의 `task_id`를 보관하고 `GET /v1/status/poll/{task_id}`를 1초 간격으로 읽는다. ID는 URL 인코딩한다. `pending`/`started`이면 계속 기다리고, `success`/`partial_success`이면 `GET /v1/result/{task_id}`를 받는다. 그 외 상태는 실패로 기록하며 error_message/failure도 남긴다. inbody 결과는 application/json이다. `document.json_content`가 DoclingDocument이고 envelope에는 `status`, `errors`, `processing_time`, `timings`, `confidence`가 있다.
4. **완전 성공**은 task_status=success, result.status=success, errors=[], 원본의 모든 쪽이 pages에 존재하고 이미지가 오프라인에서 해석 가능한 상태다. HTTP 200이나 document 존재만으로 성공으로 삼지 않는다. partial_success는 부분 성공으로 표시한다. 예상 쪽 수는 PDF 라이브러리나 호출자가 확인한다. 이번 표본은 알려진 13/11쪽과 대조한다.

전체 제한은 업로드 시작부터 1800초다. 각 HTTP timeout은 남은 시간 이하로 두고 중단 신호를 연결한다. 로컬 중단·시간 초과·연결 끊김은 서버 처리 중단의 증거가 아니다. 실제 OpenAPI에는 개별 작업 취소 API가 없다. polling을 멈춰도 서버 작업은 계속될 수 있다. task ID가 있으면 상태를 다시 확인하고, ID를 받지 못한 제출 실패는 uncertain으로 기록하며 자동 재전송하지 않는다. clear/results 또는 clear/converters를 취소 대신 사용하지 않는다. 서버 재시작 뒤 작업이 이어진다고 보장하지 않는다.

## 요청 필드

| 구분 | 필드와 의미 |
| --- | --- |
| 입출력 | target_type=inbody, from_formats=[pdf], to_formats=[json]. embedded는 JSON 안의 data URI다. page_range는 생략해 API 기본값인 전체 쪽을 쓴다 |
| PDF | standard pipeline, pdf_backend=docling_parse. 예전 threaded_docling_parse는 실제 enum에 없어 교체한다 |
| OCR | do_ocr, force_ocr, ocr_preset=rapidocr, ocr_lang=[en]. force는 기존 글자 층을 OCR 결과로 바꾼다 |
| 표 | do_table_structure, table_structure_preset, table_mode, table_cell_matching. preset과 mode의 accurate/fast를 일치시킨다 |
| 제목 | do_pdf_heading_hierarchy, pdf_heading_hierarchy_options. bookmarks/numbering/style/font_style, 허용차·최대 단계·일치 문턱을 명시한다 |
| 이미지 | include_images는 그림, include_page_images는 전체 쪽, images_scale은 출력 배율이다. 이미지 생성과 그림 검출은 별개다 |
| 코드·수식 | do_code_enrichment/do_formula_enrichment와 code_formula_preset=codeformulav2를 명시한다. 현재 default인 granite_docling과 다르다 |
| 그림 | do_picture_classification과 picture_classification_preset. chart extraction/picture description은 false이며 원격 서비스 기능은 켜지 않는다 |
| 오류 | abort_on_error=false로 부분 결과를 진단하되 완전 성공 기준을 낮추지 않는다 |

`Accept-Docling-Document-Version`은 제출 endpoint의 실제 OpenAPI에 있다. 이번에는 보내지 않고 네이티브 schema **1.10.0**을 보존한다. 향후 특정 버전을 요구한다면 하향 변환과 실제 결과 schema를 별도로 검증한다. 결과 GET에는 이 헤더가 공개돼 있지 않다.

## 파일 구성과 기록

입력 하나마다 폴더를 만들고 `source.pdf`, `document.json`, `conversion-record.json`을 둔다. record에는 다음을 남긴다.

- 입력 basename/상대 경로·바이트 수·SHA-256
- /version의 package 버전들, OpenAPI 원문 SHA-256
- 프로필 전체·ID·프로필 파일 SHA-256
- task ID/status, UTC 시작·완료 시각, elapsed_ms
- result status/errors·원본 HTTP body SHA-256
- 저장 document SHA-256/schema/version/page_count

서버와 프로필 버전을 하나로 합치지 않는다. 실패해도 task ID와 진단 기록을 남긴다. 임시 후보 폴더에 파일을 완성한 뒤 공개하며 중단된 후보를 완전 결과로 취급하지 않는다.

fixtures는 기존 PDF를 중복 복사하지 않고 record.source.file의 상대 경로로 가리킨다. JSON 안의 이미지를 그대로 저장하고 같은 PNG를 별도로 중복 저장하지 않는다. DoclingDocument의 prov(page_no/bbox/charspan), coord_origin, pages의 크기, self_ref와 관계를 바꾸지 않는다. 소비자는 data URI를 복원할 수 있다. 원문·이미지·좌표·schema를 서버 없이 읽는 최소 구성이다. 예전 .docling ZIP의 전용 adapter/cache는 도입하지 않는다.

## v1.32.0 이후 API 확인

실제 OpenAPI/capabilities와 [공식 릴리스](https://github.com/docling-project/docling-serve/releases)를 대조했다.

- v1.33: multipart model_fields_set 수정. 생략한 필드를 명시된 값으로 가정하지 않는다. 고정 의도가 있는 값은 보낸다.
- v1.35: deprecated openapi-3 endpoint 제거. /openapi.json을 쓴다.
- v1.37: 코드·수식 default preset 수정. 실제 capabilities 값은 granite_docling이다.
- v1.38: 문서 버전 헤더. 실제 제출 OpenAPI에서 확인했다.
- code_formula_custom_config는 OpenAPI에 string으로 있지만 허용 정책은 별개다. DOCLING_SERVE_ALLOW_CUSTOM_CODE_FORMULA_CONFIG 기본 false, capabilities.custom_config_option=null이다. 고정 preset만 사용하고 이 허용 설정을 켜지 않는다.

## 한계

스캔 PDF, 수백 쪽, 다른 언어·서버 버전, 동시 사용자, 비정상 종료 복구, 리치오 설치·화면은 미검증이다. 13쪽 합성 문서 하나에서 얻은 권장값을 실제 고객 문서의 최적값으로 단정하지 않는다. 변환 성공은 원문과의 의미 동등성을 보증하지 않는다.

## 기본값과 옵션 조정

권장 프로필은 플러그인의 기본값이다. [옵션 표](options.md)와 [기계 판독용 정의](options.json)의 고정/조정 구분, 허용값·기본값·영향·의존성을 따른다. 변환 기록에는 actual_request 전체와 overrides_from_default, 기본 프로필 hash를 추가로 남긴다. 임의 변환 결과의 채점은 [tools 사용법](../../tools/README.md)을 따른다.
