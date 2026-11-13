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

선택 schema v2는 additionalProperties:false이고 분류 enum·필수 이유·완전한 구획 결정 목록을 검사한다. 채택/비요구사항/중복/문맥 부족/보류가 모두 원장에 남는다. unknown·충돌·모호·판정 불가는 보류/문맥 부족으로 제출한다. 채택 본문은 기존 문서 프로파일로도 검증하며 그림·수식 PNG·미지원 참조를 진단 후 차단한다.

출력은 outputKey/title/bodyBlocks/sourceCandidateKeys/contextKeys/rationale/relations/protectedTokenMappings/sourceRegionMappings다. 아래 전체 구간 증거가 최종 통과 조건이다. 유지 1개, 분해 2개 이상, 통합 1개+복수 후보를 요구한다. 통합 상대는 같은 묶음에서 해당 채택안의 중복으로 판단한다. 구획 밖 통합은 보류하고 상한/구획을 재설정한다. 중복 대상은 실제 채택안에서 끝나야 하며 순환·보류·미처리 대상으로 끝나면 거부한다.

tokens 명령은 채택 출력마다 tokens와 regions를 준다. tokens는 **제목 → 본문 → 연결한 미주 정의**의 순서인 보조 정보다. regions는 아래 전체 문자·구조 증거다. key는 `output/<출력 인덱스>/<블록 인덱스>/...:<문자 오프셋>`이고 원문 키는 batch의 tokens에 있다. 오프셋은 JS UTF-16 문자열 기준이며 PDF 위치로 해석하지 않는다. 모든 출력 토큰은 하나의 원문 occurrence에 정확히 대응해야 하고 선택한 원문/적용 문맥의 모든 토큰은 전체 분해 결과에서 적어도 한 번 보존해야 한다. 같은 원문을 여러 결과에서 반복할 수 있지만 두 원문 occurrence를 한 출력 occurrence로 몰아 지울 수 없다. 숫자 표기·부등호·설정 단위·부정·타입 있는 위아래첨자를 정확히 비교한다. 숫자 바로 뒤의 미등록 단어도 quantity-word로 보호한다(의미상 단위 판정은 아님). 숫자 없는 머리글의 새 단위는 프로파일 단위 목록에 추가해 재검사해야 한다. 품질의 '의도된 차이'가 값 변경/환산 예외는 아니다.

모든 채택 문맥에 적용/비해당/추가 필요와 이유를 요구한다. 머리글·캡션·미주·목록 부모·표 행 문맥은 토큰이 인식되지 않아도 비해당으로 버릴 수 없으며 전체 적용 문맥으로 싣는다. 적용 문맥 key도 결과에 연결한다. 보호 토큰이 없는 조건/주체/예외의 의미는 비서 재대조가 필요하다. 토큰 통과는 의미 동등성·AI 품질 보장이 아니다. quoted는 원래 bodyBlocks와 순서를 유지하고, derived도 현재는 원문 전체 블록의 선택·복사·통합만 증명할 수 있다. 자유 문장 재작성은 사람 확인이 필요한 미지원 제안으로 거부한다. v1의 unreviewed 출처에서는 채택도 **제안 초안**이며 reviewed/confirmed가 아니다.

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


## PR14 리뷰 보강: 인식 결과가 아닌 원문 보존 증거

이 절이 위의 토큰 비교만으로 통과할 수 있었던 초기 판정을 대체한다. 전각 숫자/식별자 변경과 범위 뒤집기가 초기 head에서 모델·시험 ReqIF까지 통과하는 것을 먼저 재현했다.

선택 응답·작업 상태의 schemaVersion은 **2**, 보호 정책은 ordered-source-regions/3다. 원장 컨테이너·완료 표지는 기존 형식을 유지하고 제안 완료 표지에 protectionVersion을 명시한다. policyDigest에는 프로파일과 보호 정책 버전을 함께 결합한다. 이전 checkpoint는 resume에서 판단을 모두 무효화하고 history로만 보존한다. 기존 응답을 재승인하지 않는다. proposal도 저장된 모든 응답을 현재 검사로 다시 검증한 뒤에만 디렉터리/완료 표지를 만들 수 있다.

- batch의 후보/문맥 regions에는 전체 블록의 구조, 원래 문자열 fields의 path와 UTF-16 [start,end), 정규 비교값이 있다. **모든 문자와 구조가 보호 대상**이므로 전각·분수·한글 단위·새 신호명처럼 tokenizer가 모르는 표기도 보호 대상 없음으로 지나가지 않는다.
- sourceRegionMappings의 각 항목은 `{outputRegionKey,sourceRegionKey}`다. tokens 명령의 출력 regions를 실제 선택 후보/적용 문맥의 regions에 연결한다. 출력의 모든 본문/미주 구간을 정확히 한 번 연결하고, 선택한 원문/적용 문맥의 모든 구간도 결과들에서 보존해야 한다. 제목은 코드의 중립 제목 `요구사항 제안` 또는 같은 방식으로 증명된 원문 전체 구간만 허용한다.
- 원문의 **블록 전체가 최소 증거 구간**이다. 숫자 하나씩을 따로 따서 범위·부등식·주체·신호 이름에서 떼어 재조립할 수 없다. 값마다 기존 occurrence 대응도 검사하되, 전체 구간의 문자와 구조 일치가 반드시 함께 필요하다. source region의 원래 field 경로와 문자 구간이 인식되지 않은 값의 위치 증거이기도 하다.
- 원문 블록 순서는 코드가 정한 원문 후보 순서이고, 적용 문맥은 본문 다음 부록/미주로 붙인다. 각 출력의 실제 구간 순서가 그 순서를 따라야 한다. mapping 배열의 순서를 바꿔 우회할 수 없다. 동일 구간은 서로 다른 분해 결과에서 반복할 수 있지만 한 결과에서 여러 원문 구간을 자리 바꾸거나 한 구간을 중복 재조립할 수 없다.
- quoted는 원문 본문 전체와 순서를 유지한다. derived도 현 단계에서는 완전한 원문 블록들의 선택/복사/통합을 증명하는 범위다. 하나의 블록 안을 여러 의무로 재서술하거나 수치/조건을 옮겨 적는 자유 재작성은 **원문과 같다는 증거를 제공할 수 없으므로 거부**한다. 블록 분해가 필요하면 앞 단계에서 원문을 검수·구획화해 새 인계를 만들거나 보류한다. 사람 확인을 표시했다고 검사 우회가 허용되지는 않는다.

허용 정규화는 아래 **닫힌 목록**뿐이다.

| 대상 | 허용 |
| --- | --- |
| 일반 text 문자열 | CRLF를 LF로 표현하는 직렬화 차이 |
| 인접한 순수 text-run | 동일 문자열의 분할·병합(문자 추가/삭제 없음) |
| 문단/인용/주의 상자의 text와 content | 같은 평문을 공개 content로 표현. content가 있으면 text는 읽기용 요약으로 취급 |

가로 공백/탭 축약·trim·연산자 주변 공백 제거, NFC/NFKC, 전각/반각, 숫자/분수/지수 표기, 부호·대소문자·단위·식별자 정규화는 **없다**. code/value, code block, 링크 URL·참조 label 등 원자 필드는 CRLF까지 원문 문자 그대로다. 같은 뜻처럼 보여도 이 목록 밖이면 보류한다.

회귀 검사는 기계 생성한 **696개 변형**을 quoted/derived 본문과 출처가 있는 제목에 적용한다. 치환·삭제·복제·인접 자리 바꿈·범위 뒤집기·전각/반각·지수/분수·한글 단위·신호/문서 번호 변형은 전부 거부한다. 변경 없는 대조군, 허용 정규화, 전체 블록 순서, 잘못된 proof, 저장된 옛 판단의 재검사를 별도로 검사한다.

실제 CLI 검사도 별도다: `node validation/value-proof.mjs <built-cli.mjs> <empty-scratch>`. 공식 CLI로 합성 native 문서를 작성/읽고 완전한 합성 인계 파일로 세 사례 × 두 origin을 확인한다. 변형 제출과 저장된 변형 판단은 결과 디렉터리 생성 전에 차단되고, 바꾸지 않은 6대조군은 새 문서·완료 표지·시험 ReqIF까지 원문을 보존한다. 이 합성 인계의 PDF bytes는 처리 검사용이므로 실제 producer/PDF 대응 품질 증거가 아니다. 실제 LSR 인계 경로도 v2 schema로 재실행해 23구획/122후보의 결정적 가짜 판단과 1초안 왕복·공식 XSD/50 ID/참조·독립 파서 왕복을 확인했다. 합성 대조군 6건의 ReqIF도 각각 공식 XSD/54 ID/참조·독립 파서 왕복을 통과했다. native 재읽기는 ID뿐 아니라 본문/출처/미주/상태의 의미 전체를 대조한 뒤 완료 표지를 쓴다.


## 결과별 공통 조건 보존(PR14 재검토)

후보의 apply 판단은 해당 후보에서 나오는 **모든 결과**에 상속한다. 통합에서는 모든 출처 후보의 apply 문맥을 같은 원칙으로 검사한다. 표 머리글·절 전제·단위·미주·캡션·부모 항목·행·참조 등 kind와 토큰 인식 여부에 의존하지 않는다. contextKeys에 적는 것뿐 아니라 각 결과 본문/미주에 전체 원문 구간 증거가 있어야 한다. 다른 형제 결과의 조건 보존으로 대신할 수 없다. 미주 끝 주석에 실제 보존된 것은 정상이다.

결과에서 조건을 뺄 때는 선택 schema v2의 선택 필드 `contextExclusions: [{contextKey,reason}]`에 **그 결과의 비해당 판단과 구체적인 이유**를 적는다. 이유 없는 누락, 빈 이유, 알 수 없는/미적용 키, 포함과 제외의 중복·모순을 거부한다. 모든 결과가 제외하더라도 각각 이유가 있어야 하며 각각 사람 검토 대상이다. 이 예외는 원래 후보 본문 값의 삭제나 기존 프로파일 검사 우회를 허용하지 않는다.

`report.reviewFirst`에 output-context-excluded를 따로 모으고 problems의 맨 앞에도 놓는다. 결과 outputKey/요구사항 ID, 조건 key/kind/text, 출처 후보, 제외 이유, needsHumanReview=true를 싣는다. 완료 표지에도 같은 보고가 남는다. 채택 초안은 계속 draft이며 사람이 확인됐다는 뜻이 아니다. 스킬은 일반 채택안보다 이 묶음을 먼저 보도록 한다.

보호 정책 ordered-source-regions/3을 policyDigest에 결합한다. 이전 /2 판단은 resume에서 무효화하며, 저장된 응답도 제안 생성 전에 결과별 조건을 재검사한다. 이 수정은 schema v2에 선택 필드를 추가한 것이며 정상적으로 모든 조건을 보존한 응답에는 빈 제외 배열을 추가할 필요가 없다.

검증: 수정 전 온도 머리글을 한 분해 결과에서만 빠뜨려도 모델·시험 ReqIF까지 통과함을 회귀 검사로 재현했다. 머리글/절 전제/단위/미주/캡션/목록 부모/표 행/참조 8종에서 두 출력 각각의 누락과 허위 포함, 정상 보존·명시적 제외·우선 검토 보고, 통합의 각 출처 조건 및 저장 판단을 검사한다. 추가 45개는 결정적 합성 처리 검사이며 이번 수정에서 실제 CLI/AI 시험을 새로 수행했다고 주장하지 않는다.
