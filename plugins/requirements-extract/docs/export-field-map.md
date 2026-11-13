# 모델과 ReqIF 필드 대응

## 방침

이 목록은 model.mjs의 요구사항 모델, document.mjs의 읽기 메타데이터, body.mjs/inline.mjs의 허용 필드, upstream.mjs의 관계 판단을 전수 대조한 것이다. 처리 결과는 **보존 / 의도적으로 제외 / 차단** 중 하나다. 새 최상위 문서·요구사항 필드는 분류를 추가하기 전 양 모드에서 unmapped-export-field로 차단한다. 본문·인라인·미주의 미지 필드는 validateBody의 unmapped-semantic으로 차단한다. STRING 속성 상한을 넘으면 export-attribute-too-long으로 차단하며 자르지 않는다.

## 요구사항

| 모델 필드 | 판정 | 출력 또는 이유 |
| --- | --- | --- |
| id | 보존 | SpecObject.IDENTIFIER·XHTML anchor |
| title/titleContent | 보존 | LONG-NAME와 ReqIF.Name XHTML. titleContent가 있으면 rich 표기가 본문 표시의 정본 |
| body | 보존/차단 | 아래 구조별 표. 미지원 의미는 시험 모드도 차단 |
| footnotes[].label/content | 보존 | 원래 참조 label과 요구사항 끝 XHTML 정의, 서식 포함 |
| kind/level/origin/strength/status/verification | 보존 | 같은 이름의 Enumeration 속성 |
| rationale | 보존 | rationale XHTML |
| sources 및 각 source의 모든 필드 | 보존 | SourceReferences 정규 JSON 전체, trace/교정 근거 포함. SourcePages에 물리 쪽 별도 표시 |
| relations 및 각 relation의 모든 필드 | 보존 | 역할별 SpecRelation + RelationJudgments 정규 JSON. 원래 sourceId/role/targetId/rationale 및 추가 판단 필드 전부 보존 |
| confirmedDigest | 의도적으로 제외 | 로컬 문서에서 최신 확정 여부를 검사하는 값. 수신 시스템에 사람 승인 권위를 발급하는 속성으로 쓰지 않음. 불일치 시 정식 내보내기 차단 |
| location | 의도적으로 제외 | 현재 문서의 진단 위치이며 업무 ID/관계/출처가 아님 |
| 그 밖의 최상위 필드 | 차단 | unmapped-export-field |

## 관계 판단

| 필드 | 판정 | 출력/검증 |
| --- | --- | --- |
| role | 보존 | refines/relatesTo 유형과 RelationJudgments |
| targetId | 보존 | TARGET과 RelationJudgments |
| rationale | 보존 | RelationJudgments의 원래 문자열. 자유 이유와 구조화 판단 문자열 모두 그대로 |
| basis/coverage/covered/remaining/reason | 보존 | upstream은 이를 rationale의 정규 JSON으로 저장한다. 그 원문을 RelationJudgments에 보존한다. 직접 모델의 별도 판단 필드도 같은 JSON에 보존 |
| 여러 방향에서 제출한 relatesTo 판단 | 보존 | 물리 관계 ID는 대칭 쌍 하나지만 원래 sourceId를 포함한 모든 assertion을 같은 속성 배열에 보존. 먼저 만난 이유 하나만 남기지 않음 |
| 관계 판단 변경 | 보존 | 관계 ID는 유지하고 판단 전체가 manifest의 의미 digest에 포함돼 LAST-CHANGE가 갱신됨 |
| 선택 schema의 input/policyDigest·scopeReview·more/hold/none·누락 분류 | 의도적으로 제외 | 관계 자체가 아닌 작업 원장과 검토 보고의 증거. 내보내는 문서 모델 필드는 아님. 미처리·보류 상태의 제안 게시는 원장 절차가 차단 |

부분 refines를 원문/남은 범위 없이 일반 연결로 보내지 않는다. 남은 범위는 관계의 STRING 속성으로 보존된다. 이것은 충족 완료나 사람 승인 증거가 아니다.

## 본문·인라인

| 모델의 허용 필드 | 판정 | 출력/검증 |
| --- | --- | --- |
| paragraph/quote: kind, content | 보존 | p/blockquote와 인라인 XHTML |
| paragraph/quote/admonition: text | 보존 또는 의도적으로 제외 | content가 없으면 평문으로 보존. content가 있으면 공개 projection의 파생 요약 text는 중복 표시하지 않음 |
| admonition: variant/content | 보존 | 종류 이름과 본문 XHTML |
| table: rows/caption/label/align/enumerator | 보존 | 행/셀·caption·범위가 분리된 anchor·셀 정렬·표 번호 |
| list: ordered/start/style/delimiter/items[].content/items[].list | 보존/의도적으로 제외 | 기본 ol/ul 또는 명시 번호 문자열과 중첩. 지원하지 않는 번호 style은 차단. ordered=false의 번호 설정은 순서를 뜻하지 않아 제외 |
| code: language/code | 보존 | Code 언어 표시와 pre의 원문 |
| divider: kind | 보존 | hr |
| equation: latex/label/enumerator | 차단 | 검증된 PNG 없이 의미/표현 보존을 주장하지 않음 |
| figure: label/contentKind/imageUrl/imageAlt/caption/mermaidSource/enumerator | 차단 | 첨부 패키징·렌더링 검증 전 내보내기 거부 |
| text.text, code.value | 보존 | 원문/코드 XHTML |
| strong/emphasis/subscript/superscript/delete.children | 보존 | 대응 XHTML 태그 |
| link.url/children | 보존 | a href와 자식 |
| footnote.label | 보존 | label 표시와 정의 |
| reference.label/role | 보존 | 대상 anchor와 role/label 표시. 없는 대상 차단 |
| break.kind | 보존 | br |
| math.value, citation.keys/role | 차단 | PNG 또는 참고문헌 매핑 전 거부 |
| 미지 본문/인라인/미주 필드 | 차단 | unmapped-semantic/unsupported-inline/unsupported-body |

## 문서

| 모델 필드 | 판정 | 출력 또는 이유 |
| --- | --- | --- |
| setId/title/requirements 순서 | 보존 | Specification·이름·SpecHierarchy 순서 |
| registry 및 그 하위 필드 전부 | 보존 | Specification.SourceRegistry 정규 JSON. sourceKey→artifact/native digest·상대 파일 등록을 유지 |
| profile/defaultLevel/exportNamespace | 보존 | Specification.DocumentProfile 정규 JSON. namespace는 파생 ID 생성에도 사용 |
| file/revision | 의도적으로 제외 | 읽기 환경과 현재 native 파일의 변경 감지 메타데이터. 문서 집합·revision 범위는 작업 보고서에 유지하며 로컬 파일 위치를 ReqIF에 발행하지 않음 |
| heading | 의도적으로 제외 | 프로파일 경계를 표시하는 H1. 업무 제목은 title이며 SpecHierarchy의 의미 계층이 아님 |
| diagnostics | 의도적으로 제외 | 실행 진단이며 사용자 속성이 아님. error는 내보내기를 차단 |
| 그 밖의 문서 필드 | 차단 | unmapped-export-field |

검사: export-fields.test.mjs의 XML attribute JSON 재읽기, 원래 양방향 판단 전부 비교, 필드 변형·과대 값 차단, upstream.test.mjs의 폐기 상태 변형. 실제 부분 충족 새 문서 왕복 후 ReqIF XSD/독립 parser 검증은 validation/upstream.mjs로 따로 수행한다.

## 모델 확장 시 분류 누락 차단

src/export-classification.mjs의 보존/제외/차단 표는 body.mjs/inline.mjs의 모델 허용 필드 목록과 독립적이다. exporter는 문서를 처리하기 전에 모든 모델 kind와 필드를 이 표에 대조한다. 모델 목록에 새 필드가 생기면 문서에 값이 없어도 unclassified-export-model-field로 차단한다. 본문·인라인·목록 항목·미주 목록과 policy 필드를 대조하며 최상위 문서/요구사항의 실제 미분류 필드도 기존 검사로 차단한다. 모델의 허용 필드 추가가 exporter의 지원 선언으로 자동 승격되지 않는다.

export-fields.test.mjs는 모델 목록에 condition을 직접 추가한 상태를 만들고(문단/표는 실제 값 포함), 시험·정식 내보내기가 모두 막히는지 확인한 뒤 모델 목록을 복구한다. 문단·표·목록 항목·미주를 각각 검사한다.

연결 없는 문서의 XML은 #17과 bytes 전체가 같지 않다. SourceRegistry/DocumentProfile 및 두 관계 유형의 RelationJudgments 속성 정의 ID가 합계 4개 추가된다. 같은 입력·고정 시각으로 비교한 기존 SpecObject의 XML 구조/값은 동일하고 기존 Identifiable ID는 하나도 사라지지 않는다.
