# 후보와 비서 파일 절차 (PR3)

이 단계는 처리 모듈과 플러그인에 실을 비서 스킬이다. 화면·Host manifest/공개 작업 등록은 PR5다. `skills/requirements-candidates/SKILL.md`는 공개 제작 계약의 name/description frontmatter를 따른다. 아직 설치·자동 등록됐다는 뜻은 아니다. 별도 AI API·서비스·DB를 쓰지 않는다.

## 실행

플러그인 폴더에서 `npm ci`, `npm test`를 실행한다. Node 의존성을 추가하지 않았다. 설정 파일의 경로는 그 파일 기준이며 시험은 임시 폴더 안에서만 한다. `cliEntry`는 공개 Litzio checkout에서 문서대로 빌드한 CLI이고 설치된 앱을 쓰지 않는다. 다음은 경로를 채워야 하는 예다.

```json
{
  "cliEntry": "./litzio/packages/cli/dist/cli.mjs",
  "job": "./job",
  "outputRoot": "./results",
  "inputs": [{"key": "spec", "root": "./complete-handoff"}]
}
```

`outputRoot`는 미리 만든 일반 디렉터리여야 한다. 입력 키는 영문·숫자·밑줄·하이픈이고 고유해야 한다. `profile` 상대 경로를 주면 기본 [프로파일](../profiles/default.json)을 대체한다. canonical 문서 enum과 `unknown` 안에서 선택지·이름·탐지 어휘·단위·부정·상한·유지/분해/통합 허용을 설정한다. 프로파일 전체 digest로 변경을 감지하므로 버전 문자열만 그대로 둬도 무효화된다. 수준 간 연결 표는 PR4용이며 현재 관계 출력은 빈 배열이다.

```sh
node src/candidate-cli.mjs prepare config.json
node src/candidate-cli.mjs resume config.json
node src/candidate-cli.mjs report job
node src/candidate-cli.mjs batch job SECTION_KEY
node src/candidate-cli.mjs schema
node src/candidate-cli.mjs tokens job response.json
node src/candidate-cli.mjs submit config.json response.json
node src/candidate-cli.mjs propose config.json proposal-001
```

모든 결과는 JSON이며 오류에는 file/location/code/message가 있다. `report`와 `batch`는 **고정 checkpoint 읽기**다. 현재 파일 유효성은 `resume` 및 모든 변경 명령에서 재검사한다. 입력을 읽을 수 없으면 원장의 요청을 무효화해 기록하고 실패한다. 응답 파일은 stdout의 result에 맞춰 쓰는 래퍼가 아니라 `schema`가 설명하는 최상위 선택 객체다.

## 구획·후보와 문맥

공식 inspect의 nodes/content와 인계 파일만 읽는다. 제목/표/목록·문단 단위로 나누고 기본 후보 20개 또는 문맥·인용을 포함한 텍스트 12,000자로 다시 나눈다. 표 머리글·캡션·앞뒤 항목은 각 조각에 반복 제공한다. 하나의 항목/참조 문맥만으로 상한을 넘으면 자르지 않고 oversized-section으로 표시하며 채택을 막는다. 프로파일 상한을 조정하거나 앞 단계 문서를 적절히 나눠 다시 준비한다. 거대한 문장/셀 안의 의미를 코드가 추측해서 분할하지 않는다.

영문 shall/must/should/may, 한국어 의무·권고·허용, 수치 범위와 숫자 있는 표의 행·셀을 탐지한다. 후보 없는 구획(내용 없는 제목 포함)도 남는다. 목록은 항목별이고 중첩 부모를 문맥으로 싣는다. 위치가 없는 중첩 항목은 provisional이라 채택 전에 인계 근거가 필요하다. 미주 정의와 미지원 블록도 구획 목록에서 빠지지 않는다. 표 머리글의 rich content, 위·아래첨자, 캡션, 참조 대상 표·미주와 출처 trace를 함께 제공한다. 그림/수식 등은 원래 projection을 남기고 미지원 문제로 표시하며 채택/내보내기는 기존 PR1 정책을 따른다.

동일 원본 요소·selector·quoteDigest·규칙 버전의 반복 표시(병합 값 포함)는 후보 하나로 묶되 모든 문서 위치와 대체 문맥을 보존한다. 다른 문서 등록 키의 출처도 잃지 않는다. 원장에 후보의 소유 구획과 반복 위치 구획을 기록한다. 텍스트 일치/수치·부등호를 제외한 틀 일치는 possible-duplicate/possible-conflict **힌트**다. 동등성·모순을 판정하지 않는다. 비서가 원문을 읽고 선택한다.

놓친 의무는 `supplement CONFIG FILE.json`으로 추가한다. 파일은 `{"sectionKey":"...","unitKeys":["..."]}`다. 해당 구획의 기존 항목만 참조하며 새 출처를 꾸며 넣을 수 없다. 요청 ID를 바꾸므로 이전 응답은 거부한다. 수정은 `reopen CONFIG SECTION_KEY` 후 새 batch로 한다.

## 선택·보호 토큰

선택 schema는 additionalProperties:false이고 분류 enum·필수 이유·완전한 구획 결정 목록을 검사한다. 채택/비요구사항/중복/문맥 부족/보류가 모두 원장에 남는다. unknown·충돌·모호·판정 불가는 보류/문맥 부족으로 제출한다. 채택 본문은 기존 문서 프로파일로도 검증하며 그림·수식 PNG·미지원 참조를 진단 후 차단한다.

출력은 outputKey/title/bodyBlocks/sourceCandidateKeys/contextKeys/rationale/relations/protectedTokenMappings다. 유지 1개, 분해 2개 이상, 통합 1개+복수 후보를 요구한다. 통합 상대는 같은 묶음에서 해당 채택안의 중복으로 판단한다. 구획 밖 통합은 보류하고 상한/구획을 재설정한다. 중복 대상은 실제 채택안에서 끝나야 하며 순환·보류·미처리 대상으로 끝나면 거부한다.

tokens 명령은 채택 출력마다 **제목 → 본문 → 연결한 미주 정의**의 순서로 key/kind/value를 준다. key는 `output/<출력 인덱스>/<블록 인덱스>/...:<문자 오프셋>`이고 원문 키는 batch의 tokens에 있다. 오프셋은 JS UTF-16 문자열 기준이며 PDF 위치로 해석하지 않는다. 모든 출력 토큰은 하나의 원문 occurrence에 정확히 대응해야 하고 선택한 원문/적용 문맥의 모든 토큰은 전체 분해 결과에서 적어도 한 번 보존해야 한다. 같은 원문을 여러 결과에서 반복할 수 있지만 두 원문 occurrence를 한 출력 occurrence로 몰아 지울 수 없다. 숫자 표기·부등호·설정 단위·부정·타입 있는 위아래첨자를 정확히 비교한다. 숫자 바로 뒤의 미등록 단어도 quantity-word로 보호한다(의미상 단위 판정은 아님). 숫자 없는 머리글의 새 단위는 프로파일 단위 목록에 추가해 재검사해야 한다. 품질의 '의도된 차이'가 값 변경/환산 예외는 아니다.

모든 채택 문맥에 적용/비해당/추가 필요와 이유를 요구한다. 머리글·캡션·미주·목록 부모의 수치·단위·부정 토큰은 비해당으로 버릴 수 없으며 적용 문맥으로 싣는다. 적용 문맥 key도 결과에 연결한다. 보호 토큰이 없는 조건/주체/예외의 의미는 비서 재대조가 필요하다. 토큰 통과는 의미 동등성·AI 품질 보장이 아니다. quoted는 원래 bodyBlocks 구조 그대로이고 재작성은 derived+근거다. v1의 unreviewed 출처에서는 채택도 **제안 초안**이며 reviewed/confirmed가 아니다.

## 원장·새 문서와 재개

플러그인 소유의 새 job 폴더만 생성한다. owner.json과 불변 `00000001.json` 이후 checkpoint를 sequence/parent/digest로 결합한다. 파일에는 입력/정책 digest, epoch, 전체 구획·후보·출처, 선택·이유·검수 상태, 발급 UUID, 제안 digest/완료 상태가 있다. 배타적 lock과 expectedHead 비교로 동시 제출을 거부하고, 완전히 쓴 pending 파일을 배타적 hard link로 게시한다. 중단된 pending은 권위가 없으며 남겨 둔다. 손상 checkpoint는 마지막 유효 상태+진단으로 읽고 이후 쓰기는 막는다. 전원 장애의 디렉터리 fsync/파일 시스템 전체 원자성은 보장하지 않는다.

중단 후 같은 입력/정책이면 판단·ID를 재사용하고 미처리만 읽는다. 변경 시 epoch/요청을 바꾸고 이전 판단을 history로 보존한다. 안전한 첫 구현은 **작업 전체를 재검사**하며 영향 범위만 무효화하는 최적화는 하지 않는다. 동일 후보·유지/분해/통합 방식·출처 집합 안에서 outputKey가 같은 논리 항목은 발급 UUID를 재사용한다. outputKey는 선택 응답의 영문/숫자/_/- 지역 키이며 req-ID가 아니다. 기존 논리 항목을 고치거나 이동할 때 유지하고 새 논리 항목에는 새 키를 준다. 출력 순서를 바꿔도 ID는 유지한다. 분해 방식/출처 집합/논리 키를 바꾸면 새 ID다. 코드가 내용만으로 논리적 동일성을 판정하지 않는다. 낡은 응답·중복 제출·오래된 expectedHead는 거부한다.

중단된 .writer-lock은 자동 삭제하지 않는다. 실행 주체가 끝났음을 확인하기 전 잠금을 해제하지 말고 원장을 보존한다. 손상 checkpoint는 수동으로 고쳐 서명하지 말고 새 작업으로 다시 준비하며 이전 결정을 근거로 재검토한다. 일반 오류의 파일/JSON/CLI 상세 예외는 사용자에게 그대로 새지 않는다.

모든 구획의 비서 확인 뒤에만 새 proposal 폴더를 만든다. hold/context-needed는 원장·문제 보고에 남고 문서에는 채택 초안만 들어간다. 기존 경로는 비어 있어도 거부한다. 완료 표지에 등재된 출처 파일만 새 폴더에 복사하고 다시 검증한다. 공식 create/check/inspect/compare를 거쳐 재읽고 원본 입력을 다시 확인한 뒤 proposal-complete.json을 마지막에 쓴다. 실패 폴더는 남기고 완료로 표시하지 않는다. 새 문서에 sources와 ID를 보존한다. 정식 ReqIF는 기존 미검수 출처 정책 때문에 차단되며 시험 모드만 가능하다.

## 실제 실행과 남은 범위

별도 CLI 통합 검사는 새 빈 임시 폴더를 주어 실행한다. 실제 producer가 만든 완전한 LSR 인계 폴더를 입력으로 쓰며 서버를 다시 부르지 않는다.

```sh
node validation/candidates.mjs <built-cli.mjs> <complete-handoff> <empty-scratch>
python validation/standard.py verify <schema-cache> <empty-scratch>/candidates-test.reqif
```

단위 검사의 inspect는 합성 파일용 가짜임을 코드에 명시했다. 통합 검사는 실제 CLI/파일 체인과 **가짜 선택 응답**만 검사한다. 실제 비서 판단·누락률·수백 쪽 성능·사람 확정·화면 수락을 시험하지 않는다.

공개 master ad62b3cc의 제작 안내는 `skills` 선언과 assistant:true 읽기 operation, 명시적 `--host`, 접수 후 짧은 상태/결과 조회 관례를 제공한다. 이번에는 Host 등록/화면을 만들지 않아 그 경로를 실행하지 않는다. 비서 셸로 Host 주소가 자동 전달되는 계약은 읽은 공개 문서에서 확인되지 않았고 임의 origin/operation을 만들지 않는다. 파일 CLI로 처리 완료는 가능하다. Host 스킬 자동 등록·공개 작업 실제 호출은 PR5에서 공개 능력으로 연결해 확인해야 한다.

실행 결과: 새 공개 master CLI 빌드 후 실제 LSR 인계 23구획(빈 후보 구획 8개), 후보 122개의 결정적 가짜 판단을 저장·재개했다. 새 문서 1초안의 공식 check/inspect/compare와 출처/본문 왕복, 기존 결과 거부를 확인했다. 시험 ReqIF는 공식 XSD, 50개 ID·모든 참조, reqif 독립 parse/unparse/parse 의미 왕복을 통과했다. 이 수치는 후보 정확도나 실제 비서의 검토 결과가 아니다. PDF 끝점 대조를 새로 수행하지 않았다.
