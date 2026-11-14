# 검수 수명 재정비 PR 1

범위는 결정 1과 결정 3의 플러그인 처리 코드 부분이다. 기계 대조 통과와 규칙 승인은 다음 PR이다. 요구사항 소비자는 아직 바꾸지 않았으므로 v1.3을 수락하지 않는다.

## 바뀐 동작과 계약

기존 교정은 접수와 게시 때 모두 전 범위·사람·표현 확인을 지웠다. v1.3은 검사한 블록·표와 PDF·대응·탐지 근거의 digest를 기록한다. 같은 표의 셀 변경은 관련 검사를 무효화하고 독립된 범위는 유지한다. stop은 검사 중 범위와 완료 receipt만 무효화한다. resume만으로 완료는 되살아나지 않는다. 완료 발급과 reader는 C0~C9를 매번 재계산한다.

[v1.3 계약](../../../contracts/docling-to-litzio/review-v13.md)에 digest의 직렬화·범위·필드·사건 표를 적었다. 새 생성은 v1.3이며 기존 v1.2 완료의 reader 의미는 유지한다. 이전 원장의 새 쓰기는 거부하고 고정 변환 결과에서 새로 생성하도록 안내한다. 자동 이관·이전 형식 쓰기는 없다. 화면의 확인 표시도 처리 코드가 판정한 현재 기록을 사용한다.

오류는 안정된 code와 입력·다음 행동을 설명하는 message를 가진다. 원시 입력이나 OS 오류 경로를 message에 넣지 않는다. 작업 전수를 아래처럼 점검했다. 입력 schema와 출력 성공 형식은 유지했다.

| 공개 작업 | 유효 입력을 얻는 곳과 처리 오류 안내 |
| --- | --- |
| health, preflight, start | 작업 폴더·bundle·원본 PDF 경계, preflight fingerprint, start의 고유 requestId |
| jobs, job, summary, revision | jobs/start의 jobId와 job의 ready 상태 |
| groups, group, material, compare | groups의 실제 group id. page:N을 묶음 ID로 쓰지 않음. compare changeId는 진행 이력에서 얻음 |
| correction-submit | material의 현재 revision/값/target, 해당 check의 전체 token ID와 실제 PDF token bbox. 근거 부족은 uncertain |
| correction-undo, correction-reconcile | 진행 이력의 changeId·현재 revision, pending 관측. 응답 유실 뒤 자동 재전송 금지 |
| review-progress, review-checkpoint | scopes의 실제 scopeId·허용 상태·실제 검사 note |
| human-decision, loss-decision | compare의 현재 묶음·위치·쪽, 표현 lossId와 허용 결정·근거 note. 사람만 제출 |
| review-stop, review-resume, review-finalize | stop은 평범한 턴 종료가 아님. 재개 후에도 완료는 명시적으로 발급. gate의 미충족 조건 확인 |

## 검증한 것

재부팅 후 변경 21개 파일의 NUL·UTF-8·JSON·JS/JSX 구문을 확인했다. 작업 파일 손상은 발견하지 못했다. 임시 최종 측정 JSON과 중단된 검사 로그에는 NUL 손상이 있어 증거로 쓰지 않고 다시 실행했다.

- 기본 전체 검사 166건: 158 통과, 8 환경 skip, 실패 0.
- 격리 source-built 공식 CLI 지정 전체 검사 166건: 161 통과, 5 corpus 환경 skip, 실패 0.
- C0~C9 누락/false, 완료 후 사건, 부분 파일 변경, 직접 사람 근거의 undo, 일반 그룹의 명시적 보류를 검사한다. 새 연속 사건은 교정→완료→undo→재교정→stop→resume→명시적 완료다. 같은 bytes revision이 반복돼도 새 확인을 자기 changeCount에서 검증하고 옛 무효 기록을 되살리지 않는다.
- text/rich content/PDF 근거/대응/check/finding 변형에서 영향 범위 무효와 독립 범위 보존을 함께 검사했다. 손 편집은 독립 검사를 보존하지만 정상 인계와 완료는 계속 거부한다.
- 기존 v1.2 봉인본 수락·변형 거부와 쓰기 거부, 원장 없는 구형 묶음에서 새 원장을 만들지 않는 경계를 검사했다.
- 독립 리뷰가 지적한 반복 revision, 이전 revision의 결정 변경, 기록 수×이력 길이 비용, 손 편집의 전 범위 소거, legacy 쓰기 경계를 수정하고 재검토했다.

공개 플랫폼 master `970fe245d69b4e66029f39f9c843e08d4f23456c`를 격리 하위 checkout에서 frozen install하고 production CLI와 Editor를 빌드했다. 공개 제작 문서·CLI만 사용했다. 빌드의 chunk 크기·시간 경고는 있었고 실패는 없었다. 다섯 Host 환경 변수를 모두 자기 시험 하위 폴더로 지정했다. 스킬 설치, available 상태, 공개 CLI의 생성·목록·material 조회를 실제 AI 없이 확인했다. 이 확인은 최종 화면의 시각 수락이나 실제 비서 검수 품질 검증이 아니다. 직접 시작한 Host 트리를 종료하고 listener 0개를 확인했다. 재부팅 뒤에는 새로운 성능 결과와 공식 CLI 검사만 다시 만들었다.

## 플랫폼에 모자란 것

위 플랫폼 commit에서 다음 공개 호출로 재현했다. 입력은 유효 jobId와 잘못된 `groupId:"page:2"`다.

```powershell
litzio operation invoke local.docling-to-litzio.material --input bad-group.json --host <격리 Host origin> --json
```

처리 코드의 group-not-found code와 다음 행동 message가 CLI에서는 `Plugin operation failed. Check plugin settings and the target.`로 가려졌다. start의 requestId가 빠진 입력 schema 거부는 `Invalid operation input`만 반환했다. 플러그인 출력 union이나 입력 schema 이관으로 우회하지 않았다. code/message의 범용 전달과 schema 필드 진단은 리치오 작업으로 분리됐으며, 해당 SDK 형식이 정해지면 작은 후속 조각에서 연결한다.

## 13쪽·130쪽 측정

[측정기](../test/large-benchmark.js)와 고정 합성기를 사용했다. 반복 내용의 13쪽/130쪽, 19/196묶음, 시작 교정 이력 0건이다. 제출만 한 교정을 추가한다. 실제 공식 inspect/check/apply-batch를 사용한다. 숫자 비교용 seed의 확인은 결정적 선언이며 실제 검수가 아니다.

재부팅 뒤 새 폴더에 다시 생성했다. 첫 strict quiet 측정은 외부 Node 부하가 3회 연속 기준을 초과해 중단했다. 이후 오케스트레이터 결정에 따라 **다른 작업자의 빌드·검사 부하를 통제하지 않은 채** 전체 작업을 측정했다. 이 실행의 모든 표본은 quiet=false다. 아래는 비계측 1회와 별도 계측 1회 전부이며 중앙값·최솟값 선별을 하지 않았다. 중단한 첫 시도의 반복값도 [전체 수치](review-v13-pr1-measurements.json)에 따로 보존했다. PR 2 때 승인된 조용한 창에서 재측정한다.

| 작업 | 13쪽 비계측 / 계측 ms | 130쪽 비계측 / 계측 ms | 이전 130쪽 비계측 중앙값 ms |
| --- | ---: | ---: | ---: |
| 진행 조회 | 793 / 563 | 2725 / 2228 | 1100.5 |
| 교정 제출 | 2476 / 2174 | 10586 / 6889 | 4836.8 |
| 사람 결정 | 548 / 687 | 1653 / 1803 | 1068.4 |
| 표현 확인 | 596 / 750 | 1515 / 1848 | 1142.8 |
| 완료 발급 | 1749 / 1067 | 3929 / 3992 | 2605.6 |
| 인계 읽기 | 78 / 142 | 664 / 895 | 359.7 |
| 규칙 승인 | 미구현 | 미구현 | 없음 |

이전 수치는 [기존 측정](results-large-documents.md)의 부하 기준을 통과한 3회 중앙값이다. 이번 수치는 모두 더 느리고 조건도 달라, 차이 전체를 코드 비용으로 귀속할 수 없다. 범위 digest 계산과 재계산 증거의 증가도 실제 추가 비용이다. 개선했다고 주장하지 않는다.

다음은 시간보다 우선 보는 결정적 계수다. readFile의 읽기 횟수와 bytes, 최상위 schema 검증 횟수를 센다. CLI 내부 검증은 블랙박스이며 schema 계수에 섞지 않는다. 파일 witness 재읽기도 읽기 계수에 포함한다.

| 작업 | 13쪽 읽기 횟수 / bytes | 130쪽 읽기 횟수 / bytes | schema 횟수 13→130 | 해시 횟수 13→130 |
| --- | ---: | ---: | ---: | ---: |
| 진행 조회 | 21 / 3514745 | 21 / 33535699 | 28→28 | 2770→27379 |
| 교정 제출 | 57 / 10243313 | 57 / 97493240 | 70→70 | 2176→21103 |
| 사람 결정 | 24 / 3714439 | 24 / 35519530 | 31→31 | 1786→17554 |
| 표현 확인 | 24 / 3714439 | 24 / 35519530 | 31→31 | 1815→17844 |
| 완료 발급 | 45 / 7357294 | 45 / 70346104 | 58→58 | 3626→35684 |
| 인계 읽기 | 19 / 3513967 | 19 / 33534921 | 25→25 | 1331→13070 |

기존 130쪽 측정과 읽기 횟수·schema 횟수·CLI 호출 수는 같다. bytes는 digest 기록과 확인 내용 때문에 증가했다. 새 digest 해시 횟수는 10배 쪽 수에서 약 9.7~9.9배다. 블록·항목·쪽·check 색인을 호출 안에서 한 번 만들고 해시를 조합한다. revision 목록도 확인마다 만들지 않고 호출 안에서 재사용한다. 이 두 점의 계수로 모든 실제 문서나 임의의 이력 길이에 대한 성능을 보증하지 않는다.

| 파일 | 13쪽 bytes | 130쪽 bytes |
| --- | ---: | ---: |
| complete.json | 2329 | 2329 |
| correction-ledger.json | 167716 | 1663223 |
| human-review.json | 112899 | 1131349 |
| review/review-targets.json | 283711 | 2820981 |
| review/pdf-evidence.json | 216539 | 2170869 |

## 남은 검증

규칙 승인 시간·새 규칙 화면의 1440/640 확인은 PR 2 범위다. 실제 AI 호출·변환 서버·fixtures 재변환·사용자 설치·daemon·자료 접근은 하지 않았다. 130쪽은 반복 내용을 잇는 합성이며 실제 문서의 품질·사람 부담 수락이 아니다. docs/progress.md는 수정하지 않고 PR 본문에 진행 기록 전달안을 제공한다.
