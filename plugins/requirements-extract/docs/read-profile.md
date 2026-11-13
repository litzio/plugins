# 공개 읽기 출력과 PR1 처리 표

공개 Litzio checkout `8f41d0da6ad3cfe06299dfa04b39d1dcd6bea386`의 document-support-v1, document-editing-v1, CLI help와 실제 inspect/compare 출력 기준이다. Core 내부 코드는 읽지 않았다. 이 표는 PR1 범위이며 플랫폼의 native 지원 전체와 구별한다. 새 의미 필드는 매핑 전까지 진단 후 차단한다.

## 인라인: compare의 paragraph.content

| 실제 kind | 실제 의미 필드(kind 제외) | PR1 본문 처리 |
| --- | --- | --- |
| text | text | 보존 |
| strong | children | 재귀 보존, XHTML strong |
| emphasis | children | 재귀 보존, XHTML em |
| subscript | children | 재귀 보존, XHTML sub |
| superscript | children | 재귀 보존, XHTML sup |
| code | **value** | 그대로 보존·escape, XHTML code |
| delete | children | 진단 후 차단 |
| link | url, children | 진단 후 차단 |
| math | value | 진단 후 차단 |
| reference | role, label | ref/eq/numref 모두 진단 후 차단 |
| footnote | label | 진단 후 차단 |
| citation | role, keys | 진단 후 차단 |
| break | 없음 | 진단 후 차단 |

위 13종을 실제 공개 출력에서 확인했다. 삭제 서식과 hard break는 공식 insert-block --content / insert-hard-break로 만들었다. subscript/superscript는 공개 계약의 `{sub}`/`{sup}` 역할을 사용했다. `~2~`/`^2^`와 `~~삭제~~`는 이 실행 환경에서 해당 의미 kind를 만들지 않았으므로 지원 검사의 근거로 삼지 않는다. code는 text나 children을 읽지 않는다. 인라인 허용 필드는 coverage/model/XHTML이 공유하는 src/inline.mjs 한곳에 둔다.

제목·속성·출처/관계 표·본문 표 셀의 인라인은 text만 지원하며 나머지는 진단 후 차단한다. 위 지원 서식은 요구사항의 본문 문단에 적용한다. 새 rich authoring은 여전히 후속이며 최소 생성기는 평문을 받는다.

## 블록: compare의 blocks

path와 editable은 좌표·편집 정보다. 아래는 그 밖의 실제 필드 이름이다.

| 실제 block | 실제 의미 필드(block 제외) | PR1 처리 |
| --- | --- | --- |
| heading | level, text, content | 프로파일의 H1/H2/H3 경계와 평문 제목을 보존, 다른 경계/서식은 진단 |
| target | label | 요구사항 id와 일치하는 경계 레이블 보존, 다른 위치는 진단 |
| paragraph | text, content | 지원 인라인만 보존 |
| table | rows[].cells[]: text, content, header, path | 캡션 없는 평문 직사각형 표 보존; 추가 의미 속성은 진단 |
| table의 선택 필드 | caption | 적용 조건을 포함해 진단 후 차단(앞 리뷰에서 실제 확인) |
| quote | text, content | 진단 후 차단 |
| divider | 없음 | 진단 후 차단 |
| admonition | variant, text, content | 진단 후 차단 |
| code | language, code | 블록 code는 진단 후 차단, 인라인 code.value와 구별 |
| list | ordered, items[].content, items[].list | 중첩을 포함해 요소 전체 진단 후 차단 |
| figure | label, contentKind, imageUrl, imageAlt, caption, mermaidSource | 이미지·캡션·Mermaid 전체 진단 후 차단(선택 필드는 종류별로 다름) |
| equation | latex, label | 진단 후 차단 |
| footnote | label, text, content | 정의 전체 진단 후 차단 |

위 12개 블록 종류를 실제 출력에서 확인했다. equation은 공식 insert-equation으로 생성했다. 네이티브 계약상 병합 셀·임의 HTML은 admission에서 먼저 거부된다. 가상 snapshot에 새 병합 필드가 들어오는 경우도 전수 대조로 차단한다. inspect의 자동 numbers/captionNumberText와 heading referenceText/section만 파생 표시 정보로 구별한다.

## 확인한 왕복

validation/inlines.mjs는 지원 6종을 각각 포함한 8개 표본(text/strong/emphasis/subscript/superscript/code/codeEscape/nested)에 대해 check → inspect/compare → 모델 → 합성 재확정 → 정식 ReqIF → format → 재읽기 digest 동일성을 확인한다. 실제 긍정 출력은 test/fixtures/inline-projections.json에 고정했다. 문자열 검사뿐 아니라 XML DOM의 문단 전체와 code 요소의 textContent를 원래 의미 값과 비교한다.

validation/inlines.py는 같은 8개 파일에서 XSD·ID/참조·독립 reqif 왕복 후, 문단 내부의 text와 tail 및 서식을 공백까지 정확히 비교한다. 출력 XML은 혼합 XHTML에 들여쓰기를 넣지 않는다. root에만 구조 공백을 두어 reqif 0.0.47의 namespace 캡처가 self-closing root를 만들지 않게 한다. 임의 사용자 본문을 문자열로 보정하지 않는다.

미지원 인라인/블록은 별도 7그룹(otherInline/citation/blocks/mermaid/delete/break/equation)에서 실제 native admission 성공 후 진단·시험 내보내기 차단을 확인한다. 기존 캡션·병합 셀 검사는 validation/coverage.mjs와 단위 검사에 유지한다. 이 결과는 미래 projection이나 Host 설치·화면·ALM 수락을 증명하지 않는다.
