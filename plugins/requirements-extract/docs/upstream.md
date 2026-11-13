# 상위 연결과 누락 파일 절차

화면이나 AI API 없이 같은 프로파일의 상위·하위 기준 문서를 공식 CLI로 읽는다. `src/upstream.mjs`는 순수 처리, `src/upstream-cli.mjs`는 기존 불변 checkpoint/CAS 원장을 사용하는 파일 절차다. 기존 문서·확정값을 덮어쓰지 않는다.

## 실행

설정은 artifact 밖의 JSON 파일이다. 경로는 설정 파일 기준으로 해석한다. `root`는 시험용 기존 폴더, `file`은 그 안의 상대 문서 이름이다. 공개 소스 빌드 CLI를 지정한다. CLI를 실행할 때 LITZIO_DATA_DIR, LITZIO_ASSISTANT_CWD, LITZIO_ASSISTANT_SETTINGS_FILE을 모두 임시 작업 영역으로 지정한다.

```json
{"cliEntry":"BUILT_CLI","job":"NEW_JOB_DIRECTORY","upper":[{"root":"UPPER_DIRECTORY","file":"upper.md"}],"lower":[{"root":"LOWER_DIRECTORY","file":"lower.md"}]}
```

```sh
node src/upstream-cli.mjs schema
node src/upstream-cli.mjs prepare CONFIG
node src/upstream-cli.mjs batch CONFIG LOWER_ID
node src/upstream-cli.mjs all CONFIG LOWER_ID
node src/upstream-cli.mjs submit CONFIG DECISION_JSON
node src/upstream-cli.mjs report CONFIG
node src/upstream-cli.mjs classify CONFIG GAP_DECISION_JSON
node src/upstream-cli.mjs reopen CONFIG LOWER_ID
node src/upstream-cli.mjs resume CONFIG
node src/upstream-cli.mjs propose CONFIG NEW_NAME
```

batch는 상위 5개와 결정적 공유 용어·출처 점수, 각 후보의 전체 본문·미주·출처, 상위 전체 목록을 반환한다. all로 순위에서 탈락한 상위의 전체 내용도 읽는다. 동의어는 프로파일의 작은 표이며 검색만 바꾸고 본문은 바꾸지 않는다. 공통 원문은 artifact digest와 selfRef/selector/quoteDigest로 대조한다. NodePath나 문장 순서를 업무 식별자로 쓰지 않는다.

선택 schema의 lowerId/inputDigest/policyDigest, 전체 상위 검토 확인·이유, choices가 필수다. choice는 refines/relatesTo/none/more/hold다. 관계는 여러 상위를 선택할 수 있다. refines는 `basis=satisfies-obligation`, coverage=full/partial, covered 설명이 필요하고 partial이면 remaining도 필수다. topic-only는 refines 근거가 될 수 없다. 실제 충족 해석은 비서·사람의 일이며 코드가 자유 설명의 진실을 보증하지 않는다. relatesTo는 충족 집계에 넣지 않는다. none/more/hold는 관계와 혼합하지 않는다. 기존 관계를 조용히 버리지 않고 전부 명시적으로 재검토해야 한다. 관계 삭제는 이 조각에서 지원하지 않는다.

report는 선택한 문서 setId/revision과 제외 정책, 상위별 하위 목록·수, 상위에 하위 없음/하위에 상위 없음/선택 범위 밖 대상, 미처리·보류·추가 요청·부분 충족·순환을 낸다. classify는 gapKey에 실제 누락/범위 밖/독립/보류와 이유를 결합한다. 미확인 외부 대상을 실제 부재나 충족으로 분류할 수 없다. 독립은 하위 고아에만 허용하며 프로파일 허용 목록을 따른다. 이유 있는 범위 밖 분류도 조회에서 숨기지 않는다.

입력·상위 revision·본문·정책 변경은 전체 연결 판단과 누락 분류를 무효화하고 history에 보존한다. 늦은 판단을 거부한다. 상위가 바뀌면 내용이 같은 하위도 재검토한다. 손상된 checkpoint에서는 쓰지 않는다. 기존 문서의 입력 읽기가 실패하면 명령은 실패하고 완료 표지를 만들지 않는다.

propose는 모든 하위를 판단하고 누락을 분류한 뒤 **같은 하위 문서 폴더에 새 이름**으로 문서를 만든다. 따라서 원래 상대 출처 등록도 같은 위치에서 유효하다. 생성 전 기존 이름을 거부하고, 공식 생성/check/재읽기와 입력 재대조·원장 CAS 후에만 완료 표지를 게시한다. 실패한 새 파일은 남을 수 있으나 완료로 읽지 않는다. 원래 ID·본문·출처를 유지하고 관계 이유에 coverage/covered/remaining을 기록한다. 새 문서는 draft이며 confirmedDigest는 비어 있다. 부분 충족은 사람 검토 초안에 포함하되 report에 남기고 fulfillmentComplete는 항상 false다. 연결 개수를 충족 완료로 해석하지 않는다. 화면·사람 확정·ALM 동작은 이 절차의 완료가 아니다.

## 검증 기록

`test/fixtures/upstream-public.json`은 고정 공개 LSR 변환 결과에서 30개 텍스트를 선택한 파생 표본이다. 원본 fixtures는 수정하거나 재변환하지 않았다. 내용에는 비요구사항 설명도 포함되므로 이 표본은 **연결 처리용 합성 정답**이며 후보 추출·실제 요구사항 판단의 정답은 아니다. 상위 하나에 같은 원문을 유지한 Implementation A/B 하위 둘을 만들어 30/60과 기대 연결 60개를 고정한다. 원문 참조/어휘가 분명한 쉬운 기준선이며 자유 재작성·다른 용어로 된 실제 자료의 검색 성능을 입증하지 않는다.

| 측정 | 결과 |
| --- | --- |
| 기대 상위의 top-5 포함 | 60/60 (100%) |
| top-1 비정답 | 0/60 |
| top-5 비정답 후보 | 240/300 |
| 정답표대로 제출한 연결의 거짓 연결 | 0/60 (가짜 결정 시험; AI 품질 아님) |
| 자동 확정한 연결 | 0 |

순위 결과와 관계 판단을 분리해 비정답 후보를 숨기지 않는다. 추가 36개 단위 검사는 누락 양방향, 잘못된 refines 근거/수준, 부분 범위, 관계없는 유사성, 분류 이유·정책, 상위 변경·늦은 응답, 기존 관계 유실, 순환·중복·범위 밖과 기계적 schema 변형을 다룬다.

실제 검증은 `node validation/upstream.mjs BUILT_CLI EXISTING_SCRATCH`로 별도 실행했다. 공개 master 87785088 빌드 CLI에서 30/60 기준 문서 생성→공식 재읽기→원장→새 관계 제안 문서→공식 재읽기에서 ID·관계 60개를 확인했다. 기존 이름 재게시 거부와 반복 ReqIF ID 동일성을 확인했다. 시험 ReqIF의 공식 XSD·289개 ID/참조·독립 reqif parser 왕복을 통과했다. 최종 단위 검사는 전체 962개 통과다.

사람의 실제 관계 판정, AI 후보 정확도, 검색 시간 절반 목표, 화면, StrictDoc/Polarion, 실제 ALM 반복 가져오기는 미검증이다. Host·daemon·Docling 서버를 시작하지 않았으며 설치된 앱·사용자 자료는 변경하지 않았다.

