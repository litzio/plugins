# requirements-extract

PR1은 설치·화면·AI 없이 실행하는 Node ESM 처리 모듈이다. 기준 자료는 리치오 문서이며 ReqIF는 파생물이다. [설계](docs/design.md)와 [실제 확인 기록](docs/pr1-validation.md)을 따른다.

## 실행

Node 24에서 이 폴더를 작업 디렉터리로 사용한다.

```sh
npm ci --ignore-scripts
npm test
```

84개 단위 검사는 네트워크·리치오·Python 없이 실행한다. `test/sample.mjs`는 사람이 작성한 가상 전장 2문서·6요구사항 모델이다. `test/fixtures`는 공식 CLI가 생성한 native 문서와 고정 inspect/compare 출력이다. 출처는 합성이며 실제 PDF 대응 증거가 아니다.

실제 도구 검사는 별도다. 공개 Litzio checkout의 README에 따라 의존성을 준비하고 **새 임시 디렉터리**를 만든 뒤 다음 인자를 전달한다. 기존 자료 폴더를 지정하지 않는다. daemon을 시작하거나 연결하지 않으며 단건 프로세스는 종료한다. 임시 자료는 보존한다.

```sh
node validation/native.mjs <source-checkout> <existing-scratch-folder>
node validation/coverage.mjs <source-checkout> <another-existing-scratch-folder>
node validation/inlines.mjs <source-checkout> <inline-scratch-folder>
```

공식 create → 레이블 배치 → check → inspect/compare → 손 수정·문서 간 이동 → 재읽기 → 확정 해시 강등 → 합성 시험의 명시적 재확정 → ReqIF → format 두 번을 검사한다. 같은 이름 생성 거부도 확인한다. 실제 사람 승인·화면 수락을 대신하지 않는다.

표준 검사는 별도 Python 가상환경에서 실행한다. 패키지 설치와 setup만 네트워크를 사용하며 verify는 해시 고정 캐시만 사용한다.

```sh
python -m pip install -r validation/requirements.txt
python validation/standard.py setup <schema-cache>
python validation/standard.py verify <schema-cache> <scratch-folder>/sample.reqif
python validation/inlines.py <schema-cache> <inline-scratch-folder>
```

공식 XSD 21개 의존 파일의 URL·SHA-256은 `validation/schemas.lock.json`에 고정했다. 원본은 재배포하지 않는다. 독립 reqif 0.0.47 parse/unparse/parse 후 XSD·객체/속성/XHTML·관계·Specification 의미를 비교한다. StrictDoc·Polarion·첨부 검사는 미실행이다.

## 모듈

- `src/model.mjs`: UUID 발급, enum·강도 용어 표, 확정 digest, 집합 검증. newRequirement/newSet은 새 항목에만 사용한다. 기존 ID는 문서에서 재사용한다.
- `src/document.mjs`: 공개 CLI JSON 프로파일 읽기와 공식 authoring 입력 생성. 위치는 snapshot NodePath이며 영속 ID가 아니다. 진단은 file/location/code/severity/message를 갖는다.
- `src/cli.mjs`: 호출자가 명시한 소스 CLI·임시 루트만 사용한다. 경로 이탈·링크·덮어쓰기를 거부한다. 제품 Host 파일 권한 구현은 후속이다.
- `src/reqif.mjs`: `exportReqif(sets, {previous, now, testOnly})` → `{xml, manifest, diagnostics}`. 기본은 정식 검사다. 시험 출력도 구조 오류는 차단하고 헤더에 TEST ONLY를 넣는다. 이전 manifest로 LAST-CHANGE를 보존하고 누락 ID를 보고한다. 누락을 삭제로 전송하지 않는다.

새 authoring은 공식 rich content·표 캡션·target·미주·중첩 목록을 받는다. 본문/제목 서식과 표 셀 구조를 보존하며 프로파일 속성 표만 평문으로 제한한다. 수식·이미지·Mermaid는 모델에 보존하고 내보내기를 차단한다. 참조는 집합 안 레이블에 연결하고 없는 대상/인용은 차단한다.

실제 필드 기준의 전체 종류별 표와 확인 범위는 [읽기 프로파일](docs/read-profile.md)에 있다. text는 text, code는 **value**, strong/emphasis/subscript/superscript는 children을 보존한다. 블록 code(language/code)는 지원하지 않는다. 지원 6종·특수 문자·중첩 서식의 8개 native 표본을 canonical 및 독립 ReqIF parser로 왕복 검사하며 혼합 XHTML의 text/tail 공백도 정확히 대조한다.

| 읽은 요소 | PR1 처리 |
| --- | --- |
| 문단 평문·strong/emphasis/subscript/superscript/code | 본문·확정 digest·XHTML에 보존 |
| 캡션·추가 의미 속성이 없는 평문 직사각형 표 | 머리행·셀을 본문·digest·XHTML에 보존 |
| 표 캡션·rich 셀 | 본문·digest·XHTML에 보존; 미지원 의미 속성은 차단 |
| 그림·그림 캡션·Mermaid·첨부 | 요소 전체를 진단 후 차단 |
| 미주 정의·표시 | 보존·끝 주석. 다른 참조/인용은 대상 매핑 전 차단 |
| 목록·중첩 목록 | 재귀 보존. 비기본 번호는 명시적으로 표시 |
| 코드 블록·인용·주의 상자·구분선 | 보존. 수식/미지원 블록은 내보내기 차단 |
| 병합 셀 | native admission에서 거부; 공개 스냅샷/직접 모델 변형도 진단 후 차단 |
| 새 블록·새 의미 필드·대응하지 않는 요소 | 전수 대조에서 진단 후 차단 |

coverage 검사는 실제 native 캡션·그림·미주·중첩 목록·수식의 check 성공 뒤 reader 진단과 두 내보내기 모드 차단, 병합 표의 native 거부를 확인한다. `src/coverage.mjs`는 inspect/compare의 모든 블록·셀 대응과 중첩 의미 필드를 대조한다. 위치·편집 가능 여부·자동 표시 번호 같은 파생 데이터만 제외하며 미지원 캡션을 버리지 않는다.

readInspection에는 동일 revision의 공식 compare snapshot도 필요하다. inspect만 주면 projection-unverified 오류로 내보내기를 막는다. sourceCli.read는 revision 일치와 읽기 경쟁 조건을 검사한다. 사용자 편집으로 confirmedDigest가 달라져도 자동 재확정하지 않는다.

런타임은 xmlbuilder2 4.0.3이며 전이 버전/integrity는 package-lock에 고정했다. [전체 고지](docs/THIRD-PARTY-NOTICES.md)를 배포물에도 포함해야 한다. Host 진입점·설치 manifest·화면·출처 어댑터는 만들지 않는다.

## 현재 rich body 지원 (PR 가)

기존 PR1의 차단 목록은 [현재 읽기 프로파일](docs/read-profile.md)이 대체한다. 위·아래첨자, 표 캡션/rich 셀, 중첩 목록, 미주, 인용·주의 상자·코드 블록·링크·취소선·줄바꿈을 보존한다. 수식 LaTeX와 그림/캡션도 모델에는 보존하지만 PNG/첨부가 필요한 내보내기는 차단한다. 참조는 집합 안 요구사항/표 label에 연결하며, 없는 대상과 참고문헌 인용은 차단한다. 현재 단위 검사 59개.

새 CLI 검사는 별도 최신 master 임시 worktree에서 `pnpm install --frozen-lockfile`, `pnpm --filter @litzio/cli build` 후 실행한다. 인자는 빌드한 cli.mjs와 기존의 빈 임시 폴더다.

```sh
node validation/rich.mjs <built-cli.mjs> <scratch-folder>
python validation/standard.py verify <schema-cache> <scratch-folder>/rich.reqif
```

PR #10 리뷰 수정: 문서별 로컬 레이블과 XHTML ID 전수 검사, 실제 figure.caption 객체 보존, 예상 밖 읽기 모양의 위치 진단을 추가했다. [검증 기록](docs/rich-review.md)을 참고한다. 추가 실제 CLI 검사는 `node validation/rich_review.mjs <built-cli.mjs> <new-scratch-folder>`다.

## 출처 어댑터 (PR 나)

`src/provenance.mjs`는 확정된 인계 계약 v1을 파일로만 읽는다. 현재 문서를 공식 inspect로 재확인하고 complete/digest/revision/inventory/target/좌표/손실/그림을 독립 검사한다. 출처의 선택 trace JSON 열은 native 왕복과 ReqIF SourceReferences/SourcePages에 보존한다. 계약 v1은 unreviewed이므로 정식 내보내기와 requireReviewed는 항상 거부한다. 시험 출력은 명시적으로 표시한다.

[출처 실행 방법·결과·한계](docs/provenance.md)를 따른다. 현재 단위 검사 84개(출처 25개). 실제 고정 LSR 생성물의 출처 4후보·다대다·복수 쪽·병합 경고·수식 차단, native trace 왕복과 시험 ReqIF 표준 검증을 별도 확인했다. PDF 글자 층은 표 전체 영역의 인용 4개만 확인했으며 셀별 쪽/수식 의미 동등성/검수 완료는 미확인이다. 새 Node 의존성 Ajv는 정확 버전/lock과 전이 고지를 포함하고 PDF 도구는 제품에 묶지 않는다.
