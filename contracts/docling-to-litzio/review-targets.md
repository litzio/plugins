# 검수 대상 파일 v1 — 생성 뒤 탐지, 검수 전

기존 [인계 v1](README.md)의 불변 생성 묶음을 읽어 새 검수 출력 디렉터리를 만든다. native 문서·원본·provenance v1을 수정하지 않는다. 비서/화면/교정/검수 완료는 포함하지 않는다. 후보는 오류 확정이 아니며 후보 없음은 올바름 판정이 아니다.

## 파일과 결합

| 파일 | 역할 |
| --- | --- |
| review-targets.json | schemaVersion 1.0.0, detectorVersion, generationId, baseline/document revision, PDF digest, 실제 provenance/snapshot bytes digest. findings·groups·series·checks·통계·한계 |
| pdf-evidence.json | schemaVersion 1.0.0, PDF bytes digest, reader 이름/고정 버전/라이선스, outline 유무, 쪽 크기/회전, 원문 text items 및 숫자·부호·단위 tokens와 좌표 |
| review-complete.json | 마지막 wx 게시. generation/revision 및 앞 두 파일 bytes SHA-256, status=generated-unreviewed |

정본 JSON Schema: [review-targets](../../plugins/docling-to-litzio/schema/review-targets.schema.json), [pdf-evidence](../../plugins/docling-to-litzio/schema/pdf-evidence.schema.json), [review-complete](../../plugins/docling-to-litzio/schema/review-complete.schema.json). 제공 validator의 기존 키워드 부분집합 안에서 정의했다.

새 디렉터리만 생성한다. 중간 실패/파일 없음/잘린 표지/unknown version/잘못된 digest·generation·revision이면 거부한다. 읽는 쪽은 원래 생성 묶음도 loadHandoff와 같은 규칙으로 재검증하고, inputs의 provenance/snapshot digest가 그 묶음 marker와 같은지 확인한다. evidenceFile.sha256, review marker의 report/evidence hash와 원본 PDF digest도 확인한다. 표지를 마지막에 재확인한다. 서명/동시 편집 원자 snapshot/전원 장애 durability는 보장하지 않는다.

공식 CLI는 **현재 생성 revision에 묶인** 파일만 낸다. 생성 뒤 문서를 교정했다면 provenance v1은 stale로 거부한다. 탐지 핵심의 시험용 changed snapshot 경로는 baseline path를 uncertain으로 표시할 뿐 새 identity를 입증하지 않는다. 그 결과를 이 reader가 검증된 파일로 받아주지는 않는다. 오류 주입 검사는 이 처리 코드의 read-model 변형이며 실제 편집 후 재연결/교정 수락 시험이 아니다.

## 후보와 묶음

finding은 `{id,kind,priority,sourceIds,selfRefs,regions,targets,evidence,status:"candidate"}`다. source가 없는 PDF 미대응 영역은 sourceIds/selfRefs/targets가 비어 있다. 위치를 이웃 원문에서 빌려오지 않는다. targets는 provenance의 path/selector/role을 유지하며 documentRevision/bindingState를 명시한다. 생성 설명 문단 role=explanation은 원문 인용으로 쓰지 않는다. evidence는 kind별 필수 키를 의미 validator가 검사한다. 알려지지 않은 kind는 schema에서 거부한다.

regions는 **PDF의 unrotated TOPLEFT pt**, 물리 pageNo 1-based다. Docling 쪽 크기와 PDF 크기의 비율을 명시적으로 적용한다. 글자 item box는 font ascent/descent로 추정하고, 토큰 box는 문자열 내 비례 위치이므로 정밀 glyph box가 아니다. start/end는 item.text 안의 **UTF-16 code unit** offset이다. source selector의 code-point 인용 범위와 혼용하지 않는다. 회전이 0이 아닌 페이지는 source 회전 결합을 증명하지 못해 geometry-unavailable로 남긴다. PDF page.status=available은 글자가 하나 이상 있다는 뜻이며 페이지 전체 의미/이미지의 검사 완료가 아니다.

checks는 sourceId·block/cell selectorKey, available/unavailable/formula-not-comparable/image-not-comparable, confidence·PDF token IDs·실제 native token 값·regions다. 벡터 수식/스캔/그림 OCR은 텍스트가 없을 수 있다. 단위·부호 비교 범위 밖을 차이 없음으로 간주하지 않는다.

group은 `{id,scope,kinds,priority,pageNos,findingIds,representativeId,reviewState:"unreviewed"}`. 표/수식 하나를 우선 단위로 묶고 연속된 최대 3쪽 창을 넘으면 나눈다. 표 전체 문맥이 여러 묶음에 걸리면 같은 scope로 연결해 모두 읽어야 한다. source·본문 위치와 근거는 finding에 있다. 모든 finding과 모든 finding page가 적어도 한 group에 있어야 하며 대표는 구성원이어야 한다.

series는 **같은 kind/reasonCode 또는 비교 범위 패턴 집합**인 묶음만 접는 표시 지침이다. 대표·groupIds·pattern·defaultCollapsed가 있으며 모든 원래 group/finding을 보존한다. 다른 값/실체를 한 판단으로 자동 승인하는 뜻이 아니다. 표시 우선순위는 해당 구성원의 가장 높은 priority다. 접힌 고위험 항목도 보류/미검수로 남는다. 합계·범위·개별 숫자의 다른 문제는 임의로 한 그룹으로 합치지 않는다.

## 탐지 종류와 evidence

| kind | 근거/필수 evidence | 한계 |
| --- | --- | --- |
| protected-token-difference | 해당 영역의 pdfValues/nativeValues·missing/extra·selectorKey·confidence | 글자 층과 변환이 오류를 공유할 수 있음. 영역·근사 token box·단위 사전 한계 |
| source-native-change | 원본↔실제 native의 명시 보존 규칙 차이, selfRef/kind/reason | PDF 의미 정답 판정 아님. 편집 뒤 path는 uncertain |
| source-cell-unavailable | 원본 span으로 덮이지 않은 grid gaps와 출력 셀 좌표 | 정상 빈 칸도 포함. PDF에 값이 없는 벡터 수식은 숫자를 복구하지 못함 |
| merged-table-review / repeated-merged-values | 원래 mergedRanges·위험 이유, 본문의 행/열 공유 값 | 반복된 N/A/0 자체를 오류로 잡지 않음. 공통 조건의 의미는 검수 필요 |
| empty-table-header / table-row-width | 빈 header columns / 실제 rowWidths·expected | 빈 corner는 정상일 수 있음. malformed read-model에 대한 검사 |
| formula-review-required | 모든 수식의 독립 scope, reason | 의심이 없어도 검수 필요. 오류 검출 건수가 아님 |
| formula-suspicion / formula-prose-suspect | 구문·빈/해독 실패·intertext 문장 혼입 reasons/latex | 그럴듯한 근 지수/합 범위 오답은 놓침. 모든 수식은 별도 검수 대상 |
| picture-prose-suspect | 그림 영역의 40단어 이상·문장 종결 2개 이상 PDF text | 정상 텍스트 도표도 가능. 고정 본문을 잘못 picture로 분류한 반례 검사만 있고 실제 양성 표본 없음 |
| reading-order-caption | PDF의 위 caption이 native에서는 표 뒤 문단, captionRef | 기대한 논리 순서와 물리 순서는 다를 수 있어 후보만 생성 |
| reading-order-backtrack | 같은 열에서 12pt 이상 위로 역행, previousSelfRef | 도표 자식은 제외. 다단/주석의 실제 읽는 순서를 판정하지 못함 |
| unmapped-pdf-text / unmapped-table-tokens | PDF item/token이 본문/원본 셀 box와 대응하지 않음 | 스캔·벡터 글자 누락을 찾지 못함. geometry 불일치 가능 |
| furniture-in-body | 명시 furniture의 8자 이상·문자 포함 문자열이 native body와 정확 일치 | 숫자 쪽 번호 단독·새로운 머리글 변형은 일부러 잡지 않음. 반복되는 진짜 본문 삭제 금지 |
| heading-basis-low | PDF outline 부재/미확인 또는 변환 북마크 옵션 꺼짐 | bookmark 있음이 개별 제목 유래/올바름 증거는 아님. 단계 수정 없음 |
| meaning-loss | blocking loss의 reasonCode/category/originalValue | 표현 비용/검수 필요라는 뜻, 내용 오답 확정 아님 |
| text-layer-unavailable / geometry-unavailable | 영역 내 PDF 글자 없음 또는 source 회전 결합 미지원 | 미검사/대조 불가이며 정상 아님 |

[수식 후보 발췌](examples/review-formula.example.json), [셀 부재 후보 발췌](examples/review-table-gap.example.json)는 실제 LSR finding 하나씩이다. 전체 report/marker가 아니며 finding 하위 schema만 적용한다.

## 검증·다음 소비자

소비자는 schema 외에도 source/token/group ID 참조, revision, finding별 필수 근거, 1–3쪽 범위, 모든 mapped 수식의 필수 검수 후보·blocking 손실 근거 포함, 모든 finding/page의 group 포함, 대표/series 포함, 통계 재계산을 검사한다. 후보와 근거를 직접 읽은 뒤에만 검사 이력을 남길 수 있다. 대표 하나를 읽고 series 전체를 검수 완료로 바꾸지 않는다. 현재 schema는 unreviewed/candidate만 허용한다. 이후 비서 지침/화면은 이 파일을 읽되 reviewed/교정 이력은 별도 계약을 확정해야 한다.

교정 뒤에도 이 세 검수 파일과 생성 revision은 불변이다. [교정본 v1.1](corrections.md)의 이력과 플러그인 진행 원장이 현재 revision의 변경/검사 상태를 설명한다. 기존 후보를 고쳤다고 원본 findings/status나 모든 page 범위를 검사 완료로 바꾸지 않는다.
