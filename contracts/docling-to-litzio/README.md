# Docling → 리치오 인계 계약 v1

이 플러그인은 검수 전 리치오 문서와, 고정 원본까지 역추적할 수 있는 **생성 완결 묶음**을 내놓는다. 생성 완결은 검수 완료가 아니다. 현재 모든 reviewState는 `unreviewed`다. 다음 플러그인은 초안을 읽고 검토 대상으로 보관할 수 있지만 검수된 확정 출처로 채택해서는 안 된다. 검수 상태의 증거와 편집 후 대응 갱신은 후속 단계다. 이 요구를 줄여 미검수 문서를 확정 출처로 취급하지 않는다.

## 파일

| 파일 | 역할 |
| --- | --- |
| document.md | 공식 CLI로 만든 native 문서. 교정 정본. revision은 UTF-8 원문 bytes의 SHA-256(소문자 hex, 접두어 없음) |
| assets/* | 공식 CLI가 게시한 그림. provenance.assets에서 경로·원본 그림 bytes digest와 연결 |
| source/source.pdf | 입력 원본 PDF bytes의 불변 사본 |
| source/document.json | 입력 DoclingDocument 1.10.0 bytes의 불변 사본 |
| source/conversion-record.json | 변환 기록 bytes의 불변 사본. 그 안 source.file은 변환 당시 참조이며 이 묶음의 경로로 해석하지 않음 |
| provenance.json | 대응 schemaVersion `1.0.0`, generationId, 규칙/생성기 버전, 원본/문서 digest, 모든 원본 항목·셀·출력 대상·영역·손실 |
| losses.json | schemaVersion `1.0.0`, 같은 generationId/documentRevision, items는 provenance.items[].losses의 순서 있는 전부 |
| receipt.json / snapshot.json | 공개 create receipt의 상대 target/revision과 inspect read-model. 완료 표지의 digest로 묶음 |
| complete.json | schemaVersion `1.0.0`, status `generated`, reviewState `unreviewed`, generationId/documentRevision, 필수 파일별 상대 경로+bytes SHA-256. **마지막 배타적 쓰기** |

plan.json/request.json/check.json/integrity.json/source-audit.json/score.json/generation.json은 제작·진단 자료다. complete.json에 포함되지 않은 파일을 인계 권위로 사용하지 않는다. generation.json이 generated-draft여도 complete.json이 없으면 실패/미완성이다. 원본 사본은 경로가 다른 환경에서도 검증할 수 있도록 포함했다. 원본 파일을 다시 정규화하거나 record의 옛 상대 경로를 수정하지 않는다.

JSON Schema 2020-12의 기계 판독 정의는 설치 단위 안의 다음 파일이 정본이다. 다른 플러그인은 **파일 계약**을 구현하고 이 플러그인의 코드를 import하지 않는다.

- [provenance.schema.json](../../plugins/docling-to-litzio/schema/provenance.schema.json)
- [losses.schema.json](../../plugins/docling-to-litzio/schema/losses.schema.json)
- [complete.schema.json](../../plugins/docling-to-litzio/schema/complete.schema.json)

제공된 Node 검증기는 위 정의에서 쓰는 키워드만 해석하며 알 수 없는 키워드를 거부한다. 임의 외부 JSON Schema 검증기라고 주장하지 않는다. 소비자는 표준 JSON Schema 검증기와 아래 의미 검사를 조합해 구현할 수 있다.

## 대응의 의미

- source.pdf/docling/conversionRecord는 각 `{relativePath,sha256}`. paths는 **출력 묶음 기준** POSIX 상대 경로이며 절대 경로·역슬래시·콜론·`.`/`..` segment·symlink/junction은 거부한다. 파일 자체와 상위 디렉터리는 일반 파일/디렉터리여야 한다.
- sourceId = SHA-256(UTF-8 `doclingSha256:selfRef`), 셀은 `doclingSha256:selfRef:cellIndex`. selfRef는 이 원본 JSON 안에서만 식별된다. sourceId/path는 영속적인 문서 블록 ID가 아니다.
- items는 body/furniture/group 및 모든 원본 collection의 고유 selfRef를 전수 포함한다. disposition은 mapped/container/furniture/omitted/unsupported. mapped는 targets가 있고 그 외는 없다. losses를 숨기지 않는다. PR 1의 그림 caption이 container로 표시되면서 target을 가진 경우는 v1에서 mapped로 일관되게 분류했다(내용/블록 변화 없음).
- targets는 다대다 배열이다. `{path,documentRevision,bindingState,selector,text}`. path는 공식 receipt의 블록 경로이고 selector를 path 뒤에 붙이지 않는다. text는 해당 revision의 실제 inspect에서 읽은 literal 문자열이다. 표/목록 전체처럼 단일 문자열이 없으면 null이다.
- selector는 `{kind:"block"}`, `{kind:"list-item",index}`, `{kind:"cell",row,column,rowSpan,columnSpan}`. 모든 인덱스는 0-based이며 span은 양의 정수다. 셀 원본 span은 `cells[].sourceCell`에 별도로 있다. 현재 병합 입력은 여러 1×1 targets로 반복되지만 향후 하나의 range target도 **동일 v1 형식**이다. 표현 지원 확장 시 targets와 losses만 달라지고 sourceId나 schemaVersion은 바뀌지 않는다. 실제 플랫폼의 새 snapshot 의미를 검증하는 코드는 보강해야 한다.
- regions는 물리 PDF 1-based pageNo, TOPLEFT pt bbox `[left,top,right,bottom]`, 원래 provenance 전체(original)를 갖는다. pages에는 쪽 크기·단위·원점·rotation·printedLabel을 둔다. 입력에 회전/인쇄 쪽 근거가 없으면 null. 원래 좌표를 남기고 Docling 쪽 높이로 BOTTOMLEFT를 변환한다. 표 셀의 sourceCell.bbox는 원래 데이터다. 셀별 쪽 귀속이 없어 regionPrecision=`table`; 페이지를 추측하지 않으며 표의 모든 regions를 함께 쓴다.
- 원문 sourceText/originalText와 셀 sourceCell.text는 원본 글자 그대로다. originalText는 Docling orig이지 PDF 글자 층을 독립 추출한 값이 아니다.
- bindingState는 current/uncertain/deleted/no-source. 이번 생성기는 current만 낸다. current는 이 revision에서 위치를 확인했다는 뜻이며 **검수됨이라는 뜻이 아니다**. uncertain은 확정 위치로 사용할 수 없다. deleted/no-source는 미래의 이력 표현 값으로 예약하며 현 생성 결과에 사용하지 않는다. 편집 후 원래 경로에 자동 재연결하지 않는다.
- 손실에는 sourceId/reasonCode/originalValue/severity(blocking/advisory)/resolution(unreviewed)/targets가 있다. diagnostics에는 변환 옵션 부재·쪽 이미지 부재·부분 변환이 남는다. 미검수·차단 손실은 후속 후보에 그대로 전파한다.

## 읽는 순서와 거부 조건

1. complete.json을 읽어 정확히 지원하는 schemaVersion/status를 검증한다. 없음·잘린 JSON·unknown version은 거부한다. incomplete 파일을 완성으로 추측하지 않는다.
2. files의 중복/경로/파일 종류를 검사하고 **읽은 bytes 자체**로 digest를 확인한다. 문서·대응·손실·snapshot·receipt·원본 3개·모든 그림이 빠지면 거부한다. 알려지지 않은 진단 파일은 권위가 없다.
3. provenance/losses schema, generationId/revision의 상호 일치, 문서 bytes digest=revision, 원본 record/PDF/JSON bytes와 기록된 digest를 검사한다. 다른 generation/revision을 섞으면 거부한다.
4. 고정 Docling의 모든 selfRef와 셀 index/span/text, sourceId, 모든 원문 region과 page bounds를 전수 확인한다. snapshot의 모든 body 블록에 원본 target이 있어야 한다. targets가 실제 path/selector로 존재하고 같은 revision/text인지 확인한다. 셀 전체 영역/목록 index 범위를 검사한다. 그림 bytes는 원본 embedded 그림 hash와도 일치해야 한다.
5. losses.json이 항목별 손실의 전부인지 검사한다. 원본 JSON↔실제 snapshot의 문자·셀·제목·코드 언어·목록 start를 별도 대조한다. 추출 자체의 오류는 이 일치로 정상 판정하지 않는다.
6. 마지막에 complete.json bytes가 처음과 같은지 다시 읽는다. 이후 파일이 바뀌면 다시 검증해야 한다. 동시에 바뀌는 파일 집합의 원자 snapshot/OS lock·전원 장애 durability·악의적 재서명 방지를 보장하지 않는다. digest는 무결성 결합이며 서명/검수 증거가 아니다.
7. 이 v1 생성 결과는 미검수다. `requireReviewed` 모드에서는 항상 거부한다. current인 위치만 현재 문서 탐색에 사용할 수 있고, uncertain인 target은 원문 후보로만 표시한다. 사용자가 문서를 교정하면 문서는 보존하되 digest 불일치로 현재 대응 연결을 중단한다. 파일을 지우거나 재생성해서 교정을 덮지 않는다.

새 generation은 **새 출력 디렉터리**에서만 만든다. 기존 디렉터리가 비어 있어도 거부한다. 다중 파일 원자 쓰기를 흉내내지 않는다. 실패한 출력은 보존하며 complete.json을 만들지 않는다. 완료 표지 게시 전 모든 검사를 끝내고 표지는 `wx`로 마지막에 쓴다. 손상되거나 부분적으로 쓰인 표지는 읽는 쪽이 거부한다.

## requirements-extract 설계 5절과의 대조

| 요구 | v1 필드/판정 | 부족한 경우의 결정 |
| --- | --- | --- |
| 원본 PDF·Docling digest/문서 식별/상대 파일 | source.{pdf,docling,conversionRecord}, generationId, sourceId/selfRef. 원본 bytes를 함께 보관 | 충족. record의 옛 경로를 외부로 따라가지 않음 |
| 검수 문서 digest에 묶인 대응표 | document.revision + complete.files의 문서/대응 digest | 생성 revision 결합은 충족. 검수 문서는 아직 생성하지 않으므로 reviewState=unreviewed, 검수 완료 입력 요구는 **유지**하고 후속 검수 전 채택을 보류 |
| selfRef→현재 요소/범위 다대다 | items.targets / cells.targets / selector / bindingState | 생성 시점 충족. 편집 후 유지 요구도 유지하며 stale이면 거부; 자동 재연결은 후속 |
| 쪽·bbox·쪽 크기·단위·원점·회전/인쇄 label | regions + pages | 쪽/크기/좌표는 충족. rotation/printedLabel은 입력 증거 부재로 null. 읽는 쪽이 추측하지 않고 정밀 추적 미충족으로 표시; 다음 PDF 증거 단계에서 생산 측이 보강 |
| 원문 인용과 native 표현 문자열 | sourceText/originalText, sourceCell.text, targets.text | 생성 시점 충족. 원본 인용 digest는 소비자가 UTF-8 원문 그대로 계산. PDF 독립 글자 층 대조/교정 근거는 후속 |
| 계보·누락·제외·교정·검수 상태 | sourceId/selfRef/cellIndex, disposition, losses, reviewState/bindingState | 생성 계보/상태 충족. 편집·교정 이력은 아직 없음. 소비자 요구를 낮추지 않고 검수본 인계 보류 |
| 표 머리글·단위·주석 문맥·셀 위치 | cells.sourceCell의 role/span/text/bbox, source Docling의 captions/footnotes/references, 표 전체 regions | 추출된 증거를 보존. 셀별 쪽/주석 적용 범위는 입력에 없으면 추측하지 않음. regionPrecision=table을 전파하고 정밀 추적은 후속 생산 측 과제 |

소비자의 `full`은 block selector, `cell:r:c`는 해당 row/column을 포함하는 cell selector에 대응한다. `text:start:end`(code point)는 **원본 sourceText 기준으로 소비자가 선택**하는 범위이며 이 생성기가 native 문자열과 같은 오프셋이라고 보장하지 않는다. 새 문서를 편집하면 revision이 달라져 이 v1 연결을 재사용할 수 없다.

작은 [LSR 발췌 예시](examples/provenance.excerpt.json)는 실제 고정 입력의 문단 1개와 병합 셀 1개를 보여 준다. JSON Schema 검사는 가능하지만 전체 inventory와 완료 표지가 없는 **설명용 부분 파일**이므로 정상 인계 디렉터리로 읽으면 안 된다.
