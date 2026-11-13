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

보관 프로필 파일은 LF로 정규화한다. profile_sha256은 보관된 파일의 hash이고 execution_profile_sha256은 실행 때 읽은 프로필 원문 바이트의 hash다. 두 값이 줄바꿈 때문에 달라도 actual_request의 값은 같으며 둘 다 보존한다.

## 다음 플러그인이 읽는 필드의 필수성 (2026-11-13)

공개 모델의 `default`/선택 선언만으로 인계에 필요한 필드를 선택으로 취급하지 않는다. `docling-to-litzio`가 읽거나 인계 구조에 보존하는 필드는 제공돼야 하며, `false`·`null`·빈 배열도 **명시적으로 존재하는 값**이다. 정상 생략이 확인된 타입에 필드를 새로 만들어 요구하지 않는다.

`contracts/docling-to-litzio/README.md`와 다음 처리 코드를 읽기 전용으로 대조했다: `src/convert.js`, `table-rule.js`, `provenance.js`, `score.js`, `source-audit.js`, `formula.js`. 전체 필드/타입별 판정과 네 표본별 존재 수, 원본 코드 hash는 [consumer-fields.json](../../plugins/docling-convert/schemas/consumer-fields.json)에 고정한다. 검사 도구는 그 플러그인의 코드를 import하지 않는다.

| 소비 경로 | 필수성 |
| --- | --- |
| 본문 순서·출처·좌표: self_ref/parent/children/$ref/prov/page_no/bbox/charspan/pages/size | 기존 필수 유지. 좌표 원점 coord_origin과 Size.width/height도 schema에서 필수화 |
| 표: num_rows/num_cols/table_cells, text, 시작·끝 index | 기존 필수 유지 |
| 표 셀의 역할·범위·원문 보존 | row_span/col_span/column_header/row_header/row_section/bbox/fillable을 TableCell·RichTableCell에서 필수화. nullable bbox는 null 허용. 셀 객체 전체를 sourceCell로 인계하는 경로도 소비로 포함 |
| 라벨·furniture·제목·목록·코드 | 적용 가능한 타입의 label/content_layer/level/marker/enumerated/code_language를 필수화. 일반 문단에 목록/코드 전용 필드를 요구하지 않음 |
| 수식·그림·각주·참조·서식의 원문 인계 | text/orig/image/uri 및 참조는 기존 필수 유지. 적용 타입의 captions/footnotes/references/formatting/hyperlink/meta를 필수화 |

변환 기록에서 읽는 source.file/sha256/bytes, document.sha256/schema/version/page_count, task.task_status, result.status/errors, actual_request에서 읽는 변환·이미지·제목 옵션도 대조했다. 이들은 기존 생성·검증 필수 항목이며 Docling 문서 선택 목록에는 없으므로 그대로 유지한다.

기존 선택 목록에서 **103개 schema 필드 위치(이름 22종)**를 옮겼다. 50개 위치는 LSR 세 판(각 13쪽)과 NIST(11쪽)의 해당 타입 인스턴스에서 항상 제공됐다. 나머지 53개는 CodeItem/RichTableCell 등의 해당 타입이 네 표본에 없어 정상 수락을 검증하지 못한 소비 필수 선언이다. 이것을 정상 생략의 증거로 삼지 않고 fail-closed로 필수화했다. 미관측 타입에는 schema 수준의 합성 삭제 검사만 했으며 실제 응답을 검증했다고 주장하지 않는다.

선택으로 남기는 것: 그룹의 prov/text/formatting, 일반 텍스트의 code_language/marker/level처럼 **그 타입의 schema에 없고 네 정상 출력에서도 실제로 빠진** 항목(65개 타입·필드 조합), 소비자가 읽지 않는 계산 grid·TableItem.image·origin.uri·source/comments 등, 독립적으로 선택하는 하위 annotation/metadata 키, 서버 작업의 부가 정보. meta/formatting 객체 자체의 존재와 nullable 값은 적용 타입에서 필수다. 전체 선택 목록은 [optional-fields.json](../../plugins/docling-convert/schemas/optional-fields.json)에 남긴다.

검사: 네 표본 모두 단일 성공 판정을 통과했다(기존 fixture의 반올림된 uint64만 알려진 PDF hash 토큰으로 복원한 검사 입력). 관측된 승격 필드마다 표본별 삭제 변형 195건이 성공·게시 모두 거부됐다. 미관측 타입의 승격 53건은 schema 수준 삭제 거부를 확인했다. 기존 head에서 `#/tables/2/data/table_cells/0/column_header`만 삭제하면 성공·게시 gate가 허용됐고, 보완 후 같은 입력은 거부됐다. Docling 서버는 시작하지 않았다.
