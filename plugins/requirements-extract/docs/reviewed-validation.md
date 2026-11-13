# v1.2 완료 인계 실행 확인

공개 Litzio master `ca9675e`를 새로 받아 CLI·Editor를 소스에서 빌드했다. 플러그인 제작·화면 계약과 공식 CLI만 사용했다. 생산자 처리 코드와 계약은 시작 기준 `994b907`이며, 작업 중 master에 추가된 두 PR은 계약·교정·완료 처리 코드를 바꾸지 않았다. 다른 플러그인과 contracts는 수정하지 않았다.

## 자동 검사

- `npm test`: 1,075개 통과, 실패·skip 0. v1.2 정상/미완료, C0–C9 변형, 역사적 발급 파일, 사람 영역·인라인 content·정확한 역연산, 잘못된 원본으로의 undo 후 token gate, 빈 생성 셀의 gap 인용, 서로 다른 교정 투영의 후보 분리, 구획 예산, 저장한 제안·상위 출처 재검증, 모든 증거 필드 변형과 React 표시를 포함한다.
- `validation/legacy-bytes.mjs`: 변경 전 커밋의 소비자를 별도 폴더에서 실행했다. v1.0/v1.1 인계·resolveSource·보고서·시험 ReqIF와 requireReviewed 진단 JSON이 바이트 동일하다. XML 시각과 무작위 job ID 하나만 고정했다. SHA-256은 각각 `616b656b0e3b3a525451184be542a65550e30b62cca462b82557358ae358ee56`, `01a31b00ba9946b730668c5947e51bffb59b6d3680b01904ae4bae72606d146e`이다. 이 비교는 고정 처리 표본과 stub inspect이며 실제 Host 검증과 구별한다.
- `validation/reviewed-mutations.mjs`: 생산자가 발급한 실제 LSR 완료 묶음의 사본 20개에서 pending/중단/revision/범위 재개·누락/실패/note 누락/사람 보류·무효화/표현 철회·보류·뜻 변경·무효화·편집 횟수/stop→resume 및 문서·완료·검수 파일 일부 변경을 적용했다. 전부 검수된 출처로 수락하지 않았고 requireReviewed도 거부했다.

## 두 플러그인을 이은 공개 작업

`validation/reviewed-flow.mjs`를 격리 Host에서 실행했다. 기존 CC0 LSR 변환 결과를 복사했으며 재변환·Docling 서버·AI 호출은 없었다.

1. 생산자 preflight/start/job으로 문서와 검수 파일을 만들었다. 생성 직후 uncovered=28, human=13, expressionUnconfirmed=29였다.
2. 표현 확인 29건, 범위·물리 쪽 checkpoint 28건, 필수 사람 결정 13건을 결정적으로 제출했다. note에 실제 사람 검수·업무 승인이 아닌 시험임을 적었다. review-finalize 발급 뒤 소비자의 requireReviewed와 C0–C9가 모두 통과했다.
3. 소비자 공개 prepare/submit으로 122후보·25구획을 처리했다. 표의 서로 다른 두 셀에 있는 `0.12 s`만 합성 채택하고 다른 후보는 시험 범위 밖으로 제외했다. 상위 미연결 이유와 독립 분류, 상세의 검토 receipt를 받아 각각 확정했다. 기본 프로파일의 상한은 바꾸지 않았다.
4. 확정 전 정식 내보내기는 거부됐다. 두 항목을 확정한 뒤 새 제안 문서와 정식 ReqIF를 만들었다. 최신 artifact를 다시 설치한 후 같은 확정을 재검증해 별도 새 문서·정식 ReqIF도 생성했다. 저장본을 최신 sourceCli.read로 읽어 오류 0과 정식 재내보내기를 확인했다.
5. 두 정식 XML 모두 공식 XSD·56개 고유 ID/모든 참조·독립 reqif 파서 parse/unparse/parse 의미 일치를 통과했다. 해시 고정 XSD 캐시를 사용하는 오프라인 검사였다.

완료 묶음 전체는 기존 입력·그림·PDF를 중복하므로 fixtures에 넣지 않았다. 실제 산출물은 격리 실행 폴더에 보존하고 재현 프로그램과 작은 계약 표본만 플러그인에 둔다. fixtures는 읽기만 했다.

## 연결 과정의 마찰과 미확인

- 두 플러그인의 작업 폴더 설정은 각각 필요하다. 생산자가 만든 문서와 인계 폴더를 소비자 입력에서 다시 지정해야 한다. 화면 간 자동 인계는 없다. 이번 연결 검증은 공개 CLI 작업을 사용했으며 두 화면의 처음부터 끝까지 모든 버튼을 누른 검증은 아니다.
- source 쪽 그룹·쪽 note와 필수 사람 결정·표현 확인에 이어 요구사항 쪽 본문·조건·연결을 별도로 확정한다. 원문의 같은 영역을 다시 볼 수 있지만 서로 다른 판단이므로 하나로 합치지 않았다.
- 최초 기본 구획의 두 곳에서 문맥 예산이 최종 검사와 달라 oversized로 막혔다. v1.2는 최종 중복/문맥 예산으로 나누도록 고친 뒤 25구획을 새 epoch에서 다시 판단했다. 구버전 묶음의 구획 결과는 유지한다.
- 원장 checkpoint가 약 8.6 MB이고 누적 사슬을 매번 전수 읽는다. 실제 제출·조회·저장 지연이 크다. queued/running 조회로 처리했으며 시간 제한을 늘리거나 검사를 생략하지 않았다. 200쪽 성능·실제 AI 판단 품질·실제 사람 검수·업무 승인·Polarion/StrictDoc 수락은 확인하지 않았다.
- 첫 Host에서 추가 daemon/reset 격리 변수 두 이름을 잘못 지정해 종료 후 올바른 이름으로 재시작했다. 데이터·비서 작업·비서 설정의 필수 세 경로는 처음부터 임시 하위 폴더였다. 초기 실행은 기본 daemon/reset 기록 경로를 썼을 가능성이 있으며, 해당 사용자 경로를 임의로 읽거나 삭제하지 않았다. 종료한 초기 시험 포트의 listener가 없음을 확인했다.

## 완료 이후 사건과 화면

실제 producer 공개 review-checkpoint로 검사를 재개하자 소비자의 출처가 unreviewed로 내려가고 기존 확정 2건과 판단이 무효화됐다. 저장한 제안도 최신 sourceCli.read에서 stale-source-evidence로 막혔으며 옛 상태의 정식 내보내기를 거부했다.

reviewed-events의 이어하기에서 문제 그룹에 대응한 `3 cycles` 셀을 사람 영역 근거의 인라인 math로 표현했다. 공식 apply-batch/readback을 거친 이력의 beforeContent/afterContent, human-source-region/protectedTokens=false와 원본 인용을 소비자가 수락했다. 이는 결정적 시험의 비인증 actor 선언이며 실제 사람 검수 결과가 아니다. 정확한 undo 뒤 두 이력과 restored-to-conversion-value를 유지했고 현재 교정 notice는 없었다. stop→resume도 과거 완료를 되살리지 못했다. 검수 재개 직후 일반 셀을 시험 대상으로 고르려 했을 때 대응 finding/group이 없어 제출 전에 시험이 멈췄다. 실제 교정은 기존 문제 그룹의 셀로 진행했다.

완료 묶음의 보존 사본을 화면의 document/folder picker로 선택하고 후보 준비·문제 묶음·상세를 확인했다. backend의 표현 확인 2행/검수 완료 1행과 실제 표의 행이 일치했다. 상세에 ‘사람으로 기록된 확인(비인증 선언)’과 별도 요구사항 확정 경계를 표시했다. 공개 DocumentView는 이번 빌드에서 표 전체가 아닌 대상 셀을 강조했다. 원본 문서 열기는 기존 공개 openDocument 경로다.

1440/640 폭에서 tabpanel clientWidth와 scrollWidth는 각각 1392/1392, 592/592였다. 렌더러는 높이 약 478, 내부 scrollHeight 약 11,688이고 contenteditable=true는 0개였다. source 뷰는 하나만 띄운다. 전체 문서 렌더링·높이와 외부 스크롤, 긴 표현 JSON·여러 관련 후보 버튼으로 상세까지 이동하는 부담은 남는다. LSR의 미교정 intertext 식은 KaTeX 미리보기 오류를 보여 줬다. 합성 완료 제출을 문서 전수 품질 수락으로 읽지 않는다.

재현 순서는 새 격리 작업 폴더에 LSR 사본을 `lsr/`로 두고(변환하지 않음), 두 플러그인을 설치·설정한 뒤 아래 공개 실행 경로를 사용한다. 인자는 실제 빌드·작업 폴더·명시적 Host로 대체한다.

```sh
node validation/reviewed-flow.mjs BUILT_CLI WORKSPACE HOST generate
node validation/reviewed-flow.mjs BUILT_CLI WORKSPACE HOST finalize
node validation/reviewed-flow.mjs BUILT_CLI WORKSPACE HOST consumer
node validation/reviewed-flow.mjs BUILT_CLI WORKSPACE HOST current
node validation/reviewed-mutations.mjs BUILT_CLI HANDOFF NEW_MUTATIONS_FOLDER
node validation/reviewed-events.mjs BUILT_CLI WORKSPACE HOST change
node validation/reviewed-events.mjs BUILT_CLI WORKSPACE HOST undo
node validation/reviewed-flow.mjs BUILT_CLI WORKSPACE HOST view
```

change가 checkpoint 이후 제출 전에 끊기면 원장·문서를 먼저 대조한다. 아직 교정 이력이 없다는 검증이 통과할 때만 human 단계로 이어 갈 수 있다. 새 write ID로 불확실한 교정을 재전송하지 않는다. undo도 실제 사슬/원장의 결과를 읽고 성공을 판정한다.

캡처: [완료 인계 1440](screenshots/reviewed-source-1440.png), [완료 인계 640](screenshots/reviewed-source-640.png), [사람 영역·undo의 구조 이력](screenshots/reviewed-human-history-1440.png), [미완료 출처 상세 640](screenshots/reviewed-human-history-640.png). 마지막 두 캡처는 실제 공개 교정·undo 뒤의 미완료 인계다. 원본 문서 열기로 별도 문서 탭이 열리는 것도 확인했다. 계정 표시가 남은 최초 프레임은 공개 전에 교체했고 최종 파일을 시각 확인했다. 긴 JSON을 내려 읽으면 원문 뷰가 함께 화면 밖으로 나가는 배치 부담은 플러그인 화면의 문제이며 플랫폼 능력 부족으로 돌리지 않는다.

직접 시작한 브라우저 세션과 두 시험 Host를 종료했다. 두 시험 포트 listener 0개와 해당 임시 실행 경로의 잔여 Node 프로세스 0개를 확인했다. 재귀 삭제 명령은 사용하지 않았으며 원시 브라우저 기록과 산출물은 격리 실행 폴더에 보존했다.
