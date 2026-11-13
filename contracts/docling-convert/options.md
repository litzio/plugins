# 조정 가능한 옵션

[options.json](options.json)이 기계 판독용 정본이다. 권장 프로필은 기본값이며 아래 허용 범위 안에서 덮어쓸 수 있다. 서버가 지원하더라도 이 계약에서 검증하지 않은 모델·출력 경로를 임의로 추가하지 않는다. 기본값을 복사하고 사용자 변경을 적용한 뒤 고정값·타입·의존성을 검증해서 전체 actual_request를 전송한다. 기본 프로필 파일의 hash와 실제 옵션은 구분한다.

| 이름 | 뜻 | 구분 | 허용값 | 기본값 | 영향·제약 |
|---|---|---|---|---|---|
| target_type | 결과를 HTTP JSON 본문으로 수령 | 고정 | ["inbody"] | "inbody" | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| from_formats | 입력을 PDF로 제한 | 고정 | [["pdf"]] | ["pdf"] | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| to_formats | 구조와 좌표가 있는 JSON 출력 | 고정 | [["json"]] | ["json"] | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| image_export_mode | 이미지를 JSON 안에 포함 | 고정 | ["embedded"] | "embedded" | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| pipeline | 검증한 단계형 파이프라인 | 고정 | ["standard"] | "standard" | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| pdf_backend | 검증한 PDF 글자·도형 backend | 고정 | ["docling_parse"] | "docling_parse" | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| do_ocr | 그림 영역의 글자를 OCR 처리 | 조정 | [false,true] | true | 끄기 12.6/19.2초; 수식 문자열 1/3→0/3, 캡션 7/10→8/10. 유지 선택.  |
| force_ocr | 기존 글자 층도 OCR로 대체 | 조정 | [false,true] | false | 켜기 77.8/46.8초; furniture 65/65→64/65. 기본 false. true requires do_ocr=true |
| ocr_preset | OCR 모델 선택 | 고정 | ["rapidocr"] | "rapidocr" | 현재 계약은 이미 설치·검증한 이 모델/언어만 허용한다. 추가 모델은 별도 검증 후 계약 개정한다.  |
| ocr_lang | OCR 언어 | 고정 | [["en"]] | ["en"] | 현재 계약은 이미 설치·검증한 이 모델/언어만 허용한다. 추가 모델은 별도 검증 후 계약 개정한다.  |
| do_table_structure | 표 구조 추론 | 조정 | [false,true] | true | experiments.md의 동일 이름 옵션 실행과 항목별 점수 표 참조; 직접 시험하지 않은 값의 효과는 미검증  |
| table_structure_preset | 표 구조 모델 정확/빠름 선택 | 조정 | ["tableformer_v1_accurate","tableformer_v1_fast"] | "tableformer_v1_accurate" | fast 21.6/22.8초; 셀 내용 135/139→102/139. accurate 선택. preset suffix and table_mode must match; do_table_structure=true |
| table_mode | TableFormer 정확/빠름 모드 | 조정 | ["accurate","fast"] | "accurate" | table_structure_preset과 같은 실험; 개별 효과는 분리 측정하지 않음. preset suffix and table_mode must match; do_table_structure=true |
| table_cell_matching | 예측 셀을 PDF 글자 셀에 대응 | 조정 | [false,true] | true | 끄기 23.9/28.2초, 점수 동일. 절감 근거 없어 true 유지.  |
| layout_preset | 기본 레이아웃 모델 | 고정 | ["default"] | "default" | 현재 계약은 이미 설치·검증한 이 모델/언어만 허용한다. 추가 모델은 별도 검증 후 계약 개정한다.  |
| do_pdf_heading_hierarchy | 제목의 단계를 추론 | 조정 | [false,true] | true | 끄기 20.4/22.6초; 단계 일치 북마크 16→9/17, 무북마크 3→9/17. 북마크 기준 true 유지.  |
| pdf_heading_hierarchy_options | 북마크·번호·스타일 기반 단계 추론 조정 | 조정 | {"additional_keys":false,"boolean_keys":["use_bookmarks","use_numbering","use_style","use_font_style"],"integer_ranges":{"max_level":[1,6]},"number_ranges":{"style_size_tolerance":[0,1],"bookmark_match_threshold":[0,1]}} | {"use_bookmarks":true,"use_numbering":true,"use_style":true,"use_font_style":true,"style_size_tolerance":0.05,"max_level":6,"bookmark_match_threshold":0.8} | experiments.md의 동일 이름 옵션 실행과 항목별 점수 표 참조; 직접 시험하지 않은 값의 효과는 미검증 only applied when do_pdf_heading_hierarchy=true; max_level integer 1..6; tolerances 0..1; four use_* flags boolean |
| include_images | 그림 이미지 보존 | 고정 | [true] | true | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| include_page_images | 원문 대조용 쪽 이미지 보존 | 고정 | [true] | true | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |
| images_scale | 이미지 출력 배율 | 조정 | [1.0,2.0] | 1.0 | 1에서 16.4/17.7초, 점수 동일, 3.10MB→1.39MB. 1 선택.  |
| do_code_enrichment | 코드 영역 내용을 시각 모델로 읽기 | 조정 | [false,true] | true | 코드·수식 함께 끄기 18.3/16.7초. 코드만의 효과는 미측정.  |
| do_formula_enrichment | 수식을 LaTeX로 읽기 | 조정 | [false,true] | true | 코드·수식 함께 끄면 수식 문자열 1/3→0/3. 유지 선택.  |
| code_formula_preset | 코드·수식 모델 선택 | 고정 | ["codeformulav2"] | "codeformulav2" | 현재 계약은 이미 설치·검증한 이 모델/언어만 허용한다. 추가 모델은 별도 검증 후 계약 개정한다.  |
| do_picture_classification | 그림 유형 분류 | 조정 | [false,true] | false | 끄기 20.4/17.4초, 점수 동일, 약 9.4KB 감소. false 선택.  |
| picture_classification_preset | 그림 분류 모델 선택 | 고정 | ["document_figure_classifier_v2"] | "document_figure_classifier_v2" | 현재 계약은 이미 설치·검증한 이 모델/언어만 허용한다. 추가 모델은 별도 검증 후 계약 개정한다.  |
| do_chart_extraction | 차트 내용을 추출 | 고정 | [false] | false | 추가 모델·원격 서비스를 요구하므로 이 계약에서는 허용하지 않는다.  |
| do_picture_description | 그림을 언어로 설명 | 고정 | [false] | false | 추가 모델·원격 서비스를 요구하므로 이 계약에서는 허용하지 않는다.  |
| abort_on_error | 첫 오류에서 변환을 멈출지 결정 | 고정 | [false] | false | 오프라인 결과 소비·전체 쪽 대응 또는 검증된 파이프라인 경계를 유지한다.  |

측정값의 순서는 북마크 있는 판/없는 판이다. 기준·warm repeat·분모와 모든 수치는 [실험](experiments.md)에 있다. 허용하되 직접 바꾸어 시험하지 않은 항목(표 구조 끄기, 코드만 끄기, 제목 추론 세부 값)은 효과 미검증이다. 서버가 거절하면 실패로 알리고 다른 모델로 자동 대체하지 않는다.

conversion-record.json은 actual_request에 **전송한 옵션 전체**, overrides_from_default에 기본값과 다른 키/실제 값, server에 /version 전체, profile에 기본 프로필과 profile_sha256을 남긴다. 예: 배율을 2로 바꿨다면 overrides_from_default={"images_scale":2}다. 이 변경은 표본 권장 결과를 덮어쓰라는 뜻이 아니다.

이미지 모드·출력 형식·전체 쪽 이미지·원본 대응은 후속 소비자가 서버 없이 읽기 위한 고정 조건이다. pages-off 실험은 크기를 줄이지만 원문 대조가 불편해 기본/조정 대상에서 제외했다. VLM은 비교 시험만 했고 이 권장 계약의 조정 목록에는 넣지 않았다.
