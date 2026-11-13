# 공개 읽기 출력과 현재 처리 표

기준: 공개 Litzio master `9956e8e0`, document-support-v1의 공식 JSON 읽기/작성 입력 절과 빌드 CLI help. 별도 임시 worktree에서 의존성을 준비하고 CLI를 빌드했다. 원래 clone의 체크아웃·파일과 내부 구현은 사용하지 않았다.

| 실제 구조/필드 | 모델 | ReqIF XHTML |
| --- | --- | --- |
| text.text, code.value | 보존 | 평문/code, escape |
| strong/emphasis/subscript/superscript/delete.children | 재귀 보존 | strong/em/sub/sup/del로 의미 유지 |
| link.url/children, break | 보존 | a/br |
| footnote.label + footnote 블록 label/content | 요구사항별 사용 정의 결합 | 표시 [label] + 본문 끝 주석, 정의 서식 보존 |
| math.value, equation.latex/label | 원문 LaTeX 보존 | 검증된 PNG 없으면 양 모드 차단 |
| reference.role/label | 보존 | 같은 내보내기의 요구사항/표 label에 XHTML anchor로 연결, 역할과 label 표시 |
| citation.role/keys | 보존 | 참고문헌 데이터 매핑 전 차단 |
| heading.level/content | 요구사항 제목 서식 보존 | ReqIF.Name XHTML; 프로파일 경계 제목은 평문 |
| table.rows[].cells[].content/header, caption | rich 셀·캡션 보존 | 표/머리글/셀/caption |
| table.label/align/enumerator | 보존 | 안정적인 anchor/정렬/명시 번호 |
| list.ordered/start/style/delimiter/items[].content/list | 재귀 보존 | 중첩 목록. 비기본 번호는 항목에 원래 번호를 명시 |
| paragraph/quote/admonition.content, variant | 보존 | p/blockquote/종류 표시 div |
| code.language/code, divider | 보존 | 언어 표시 + pre / hr |
| figure.imageUrl/imageAlt/mermaidSource/caption/label | 캡션 포함 보존 | 첨부 패키징이 없어 양 모드 차단 |
| 새 블록·필드/대응 누락·병합 셀 | 진단 | 차단 |

문단·제목·인용·주의 상자·미주 정의·표 셀의 content, table.caption, list.items를 공개 읽기 출력에서 얻는다. 같은 revision의 compare snapshot과 전수 대조한다. path/text/editable/자동 번호는 조회·파생 값이며 rich 의미는 content를 기준으로 한다. 속성/출처/관계 표는 문자열 필드 계약이므로 서식은 진단한다. 알 수 없는 필드는 조용히 버리지 않는다.

새 공식 작성 입력으로 content·표 caption·중첩 items·target·미주를 그대로 생성하고 다시 읽는다. 기존 문자열 입력과 PR1 ID는 유지한다. 미주 정의가 여러 요구사항에 쓰이면 각 ReqIF 본문 끝에 동일 정의를 싣는다. 미사용/없는 정의는 오류다.

ReqIF XSD는 ol@start를 허용하지 않는다. 시작 번호/스타일/구분자를 잃지 않도록 비기본 순서 목록은 ul 안에 원래 번호(3., c), IV. 등)를 명시한다. 4000 이상 로마 숫자는 진단한다. 자동 표시 번호를 원문 번호로 추정하지 않는다. 그림/수식 PNG·ReqIFZ·선택 집합 밖 참조·참고문헌 대상 매핑은 미완료다.

검증: test/fixtures/rich는 새 빌드 CLI의 실제 inspect/compare 출력이다. validation/rich.mjs는 공식 생성→읽기→재작성→재읽기 digest, 지수 10³/단위 m³/s/아래첨자 H₂O, 캡션 조건, rich 셀, 중첩 목록, 미주를 검사한다. 공식 XSD·ID/참조·독립 reqif 왕복도 별도 실행한다. 설치·화면·ALM은 미확인이다. PR1의 과거 표와 실행 결과는 커밋 이력과 pr1-validation.md에 남긴다.

그림의 compare caption은 `{path,text,content,editable}` 객체이며 table.caption 배열과 구별한다. 모델에는 그 content 배열을 보존한다. 자세한 실제 fixture·scope/ID/예외 경계 검증은 [PR #10 리뷰 수정](rich-review.md)에 있다. XHTML ID는 setId와 label로 문서별 구분하며 파일 전체 중복 검사를 통과해야 반환한다.


## PR5 native 출처 위치

화면의 인계 없는 입력은 출처 표의 선택 JSON 열 `nativeLocation`에 `{sourceId,file,revision,path,precision,limitations,listItem?}`을 보존한다. file은 작업 폴더 기준 상대 경로, revision은 공식 읽기와 파일 바이트가 같은 SHA-256, path는 공식 NodePath다. listItem은 목록 블록 안의 0부터 시작하는 항목 번호이며 화면 이동은 그 블록을 강조한다. native 입력에는 PDF trace를 만들지 않는다. 선택 열은 기존 필수 5열 뒤에 trace, nativeLocation 순서이며 각 열은 실제 값이 있을 때만 작성한다. ReqIF의 SourceReferences JSON에는 nativeLocation도 통째로 남긴다.
