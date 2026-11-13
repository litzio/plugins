# 요구사항 원장 성능과 상세 배치

2026-11-14. 범위는 requirements-extract 내부 작업 파일과 같은 호출 안의 중복 계산이다. 다른 플러그인, contracts, fixtures, 공통 진행 기록은 변경하지 않았다.

## 입력과 측정 경계

공개 Litzio master `26c902d3c7d329603d31ea02e3af40e891785b9f`를 새 격리 checkout에서 frozen install 후 CLI와 Editor를 소스 빌드했다. 공개 제작 안내·CLI·화면 계약만 사용했다. Node 24.22.2, Windows, 같은 PC의 벽시계 측정이다. 파일 캐시를 비우지 않았고 일부 장시간 시험이 겹쳤으므로 미세한 수치 차이보다 크기와 증가 경향을 본다. CPU/디스크 시간과 RPC/렌더링 시간은 구별한다.

고정 CC0 LSR 13쪽의 변환 결과를 복사해 기존 `reviewed-flow.mjs generate/finalize`의 공개 작업으로 문서화했다. 표현 29건·범위 28건·필수 사람 결정 13건은 결정적인 합성 제출이다. 완료 후 소비자의 C0–C9 재계산을 통과했다. 재변환·Docling 서버·실제 AI·실제 사람의 검수나 업무 승인은 없다.

130쪽 상당 합성은 검증한 읽기 모델을 10회 반복하고 sourceId/sourceIds를 복사별로 결정적으로 구분한다. 동일 원본을 가리키는 후보를 의도적으로 합치는 기존 정책 때문에 키만 바꾸면 후보가 10배가 되지 않는다. 실제로 250구획·1,220후보·최종 1,220판단을 검사한다. 이 메모리 합성은 실제 130쪽 PDF나 새로 검증된 완료 인계가 아니다. 물리 쪽 증거는 원래 13쪽의 반복이다. 인계 파일은 수정하지 않고 실제 인계 검증 시간은 1회분으로 별도 표시한다.

`checkpoint-performance.mjs`는 준비 → 모든 구획의 합성 판단 검증/원장 저장 → 3회 재읽기/refresh/report/proposal → 작성 입력 직렬화/시험 XML을 측정한다. 채택은 복사별 `0.12 s` 두 위치, 나머지는 시험 범위 밖 제외다. submit 시간은 처리 검증과 saveLedger의 CAS 재읽기/해시/쓰기를 포함한다. fake 응답 만들기 자체는 포함하지 않는다. document 항목은 작성 입력 파일 직렬화이고 실제 문서 생성/검사는 아래 화면 서비스의 save에 따로 측정한다. 출력 XML은 TEST ONLY이며 실제 Host 정식 내보내기는 별도 확인했다.

변경 전 130쪽은 약 10분을 상한으로 두고 중단했다. 21회 제출/22개 유효 checkpoint까지 636.7초 이상이 걸렸으며 다음 작업 중 종료했다. 전체 완주 시간이나 최종 크기라고 읽지 않는다. 중단 파일은 지우지 않았고 프로세스를 종료했다. 증가 추세는 완료된 각 제출 시간과 게시된 checkpoint 크기로 표시한다. 변경 후는 전체를 완료한 측정값을 사용한다.

## 병목과 형식

13쪽 최종 상태 JSON은 8,523,440 bytes다. corpus 8,353,582 중 sources 2,512,657, units 2,312,760, sections 2,331,172, candidates 1,115,162, comparisons 81,769 bytes(각 필드별 JSON 길이)다. 실제 판단 responses는 164,710 bytes다. 판단마다 원문 전문을 추가로 붙이는 것이 주원인이 아니라 **동일 corpus가 모든 checkpoint에 반복**되고, corpus 안에서도 구획/unit/후보/문맥·출처 검수 증거가 중복 직렬화된다. 26개 checkpoint의 전체 상태를 매 load마다 JSON 파싱·canonical 해시하며 save 때 또 load한다.

원장은 `requirements-extract/candidates/2`로 변경했다. 다른 플러그인이 읽는 인계 계약이 아니며, producer의 correction-ledger.json과 별개의 소비자 내부 파일이다. 계약 디렉터리와 외부 소비 코드에서 이 원장 형식에 의존하는 경로는 없다.

- 객체/배열을 태그로 구분하고 큰 내용 노드(인코딩 JSON 512자 이상)를 SHA-256 참조로 저장한다. 같은 값은 한 번만 싣는다. 참조는 자식부터 등록하며 알려진 노드만 참조할 수 있어 순환/없는 참조를 거부한다.
- checkpoint에는 새 내용 노드와 바뀐 슬롯만 싣는다. responses/ids/tickets는 항목별 슬롯이어서 누적 map 전체를 다시 쓰지 않는다. 사슬에는 sequence/parent/jobId와 payload digest가 유지된다.
- 매 load는 **모든 게시된 checkpoint와 모든 새 노드의 digest/참조/작업 식별자**를 다시 검사한다. 마지막 유효 상태만 복원하며 손상 이후 쓰기는 막는다. 호출 간 캐시나 이전 무결성 판정의 재사용은 없다.
- save는 lock과 최신 사슬 CAS를 유지한다. 그 save에서 방금 검증한 상태와 값이 정확히 같은 슬롯만 기존 참조로 재사용한다. corpus 값이 바뀌면 재인코딩됨을 검사했다. 임시 파일 fsync → 배타 hard link 게시 순서는 유지한다.
- 구형 owner /1은 `ledger-version`과 '새 작업 폴더에서 후보 준비부터 다시 시작' 진단으로 거부한다. 자동 이행이나 기존 폴더 덮어쓰기는 하지 않는다.

제안 재검증은 이전에 각 구획마다 Ajv schema를 컴파일하고 전체 job을 복제해 버렸다. 같은 호출에서 schema를 한 번 컴파일하고 동일한 submitChecked의 **검증 전체**를 실행한 뒤 복제/ID 발급만 생략한다. 재검증에는 요청·구획 메타데이터만 만들며 비서 표시용 출처/비교 힌트의 전체 순회를 하지 않는다. 값·문맥 전체 구간 증거와 순서, 낡은 응답, 분류·중복 사슬 검사는 그대로다. 각 응답의 임시 제외 map 복사와 실제 보고용 비교 쌍 열거 비용은 남는다. 마지막에 이 표시 힌트 비용을 제거한 뒤 동일 저장 상태의 proposal만 3회 재측정했다(130쪽 약 1.903초에서 0.065초). 전체 제출 측정 경로는 이 validationOnly 분기를 쓰지 않아 변하지 않는다.

화면 fresh는 이미 읽고 검증한 원장을 같은 호출 끝에서 다시 읽지 않는다. detail은 계획을 한 번 계산하고 confirm의 상세 검증은 그 호출에서 만든 계획을 공유한다. confirm/save/export의 마지막 fresh와 현재 입력·정책/계획/reviewRevision 대조는 유지한다. 원문/인계가 바뀌면 다음 fresh가 fingerprint를 다시 만들고 낡은 판단/확정을 무효화한다.

## 읽기·쓰기 횟수

N은 게시된 checkpoint 수다. 원장 load 1회는 owner 1개와 checkpoint N개를 읽는다. 변경 전에는 각 파일이 전체 상태이고, 변경 후에는 새 노드/변경 슬롯이다. checkpoint 파일 수는 같은 흐름에서 유지되며 바이트와 재구성 비용이 줄었다. 저장은 기존 파일을 덮어쓰지 않고 새 checkpoint 1개를 게시한다.

| 작업 | 변경 전 원장 load / proposal 검증 | 변경 후 | 기타 읽기/쓰기 |
| --- | --- | --- | --- |
| 후보 준비 | create 후 summary의 load 2회 | 1회 | 현재 인계/공식 inspect, 새 owner/checkpoint/session |
| 판단 제출(화면) | fresh 2 + CAS 1 + summary 2 = 5 | 1 + 1 + 1 = 3 | 앞/뒤 현재 인계 재검증, checkpoint/session 1회씩 |
| 다시 검사/문제 목록 | 2 / 1 | 1 / 1 | 현재 인계/정책, 실패 요청 조회 |
| 상세(연결 완료) | 2 / 3 | 1 / 1 | 현재 인계/정책, 상세 digest 생성 |
| 확정(한 항목) | 6 / 6 | 3 / 3 | fresh 3회와 마지막 대조 유지, session 1회 |
| 제안 저장/내보내기 | 4 / 2 | 2 / 2 | fresh 2회, 저장 문서 create/check/재읽기 또는 XML 생성 |

원장만 직접 쓰는 성능 프로그램의 submit은 두 버전 모두 CAS load 1회/새 checkpoint 1개다. 위 표는 screenService의 실제 호출 경로를 세어 설명한 것이며, OS/CLI 자식 프로세스 안의 모든 파일 I/O를 추적한 수치는 아니다. 인계 읽기는 complete/원장 마지막 재읽기까지 기존 독립 검증을 유지한다.

## 검증과 한계

- 단위·변형·회귀·React 하네스 1,081개 통과, 실패/skip 0. 구형 형식 거부, 예전 고리 손상, 내부 노드 변조/없는 참조, 같은 값 재사용과 변경 corpus 재인코딩, 삭제/null/태그처럼 보이는 사용자 값, 저장 판단 변조 재검증을 추가했다.
- 실제 완료 LSR 사본 20개 변형이 모두 reviewed 소비를 거부했다. legacy v1.0/v1.1 소비 결과 bytes도 이전과 동일하다.
- 동일 저장 상태에서 제안 의미·작성 입력과 고정 시각 ReqIF를 바이트 비교했다. 실제 CLI로 저장한 두 문서는 모두 80,692 bytes이며 bytes가 같다. 실제 시각이 들어가는 XML은 고정 시각 재내보내기로 비교한다. 서로 다른 독립 실행의 무작위 job/요구사항 ID가 다르다는 것을 변경 차이로 처리하지 않는다.
- 실제 native screen-safety에서 미확정 정식 출력·오래된 확정·입력 변경 후 확정/저장·범위 이탈 차단, stop/resume, confirmedDigest 저장 왕복을 확인했다. 입력 변경과 완료 재개 등 기존 변형 검사도 전부 포함한다.
- 격리 Host에 설치한 공개 두 플러그인 흐름으로 122후보/25구획 → 2개 합성 채택 → 미연결 분류 → 각각 상세 receipt 확정 → 새 문서/정식 ReqIF를 확인했다. 실제 AI 품질·소유자의 시각 승인·업무 수락·관리 도구 수락은 미검증이다.

1440 폭에서는 상세만 높이 560 내부 스크롤, 640 폭은 한 열로 높이 320 내부 스크롤이다. 기존 ui 부품과 space 토큰을 사용했다. 상세 scrollHeight 3,061인 실제 사례에서 원문 section의 y 위치는 상세 내부 스크롤 전후 동일했다. 640 폭 grid clientWidth/scrollWidth=592/592, source 높이 512, contenteditable=true 0개였다. 실제 표 셀 강조와 저장본을 확인했다. 캡처는 상세 grid만 잘라 계정/경로가 없다. 좁은 화면은 위아래 배치라 두 영역 전체를 한 화면에 항상 담는 보장은 없다.

실제 브라우저에서 다시 검사 4.109초, 상세 4.039초, 확정 8.155초(버튼 누름부터 재활성까지, RPC/조회 polling/렌더링 포함)를 확인했다. 처리기 시간과 다른 수치이며 즉시 반응한다고 주장하지 않는다.

수백 쪽의 후보 수집/입력 검증과 상태 복원, 대량 source render, 비교 후보 쌍 출력은 여전히 비용이 있다. 반복 합성의 비교 쌍은 247 → 30,190개로 증가한다. 출력 자체가 제곱으로 많으므로 전체 시스템을 선형이라고 주장하지 않는다. 이번에는 원장 전문 중복과 제안 전수 재검증의 불필요한 전체 복제를 제거했다. 자주 reopen해서 history가 커질 때 참조 배열 메타데이터의 누적 비용은 별도 장기 시험이 남는다.

## 재현

기존 reviewed-validation.md의 격리 Host와 generate/finalize 절차를 따른다. Host를 띄우기 전에 `LITZIO_DATA_DIR`, `LITZIO_ASSISTANT_CWD`, `LITZIO_ASSISTANT_SETTINGS_FILE`, `LITZIO_DAEMON_DIR`, `LITZIO_PLUGINS_SETTINGS_FILE`을 **모두** 자기 임시 하위 폴더로 지정한다. 임시 폴더 최상위에 npm 패키지를 설치하지 않는다. 구형 코드는 별도 플러그인 사본에 의존성을 준비해 실행한다.

```sh
node validation/checkpoint-performance.mjs BUILT_CLI WORKSPACE NEW_RESULT_FOLDER 1
node validation/checkpoint-performance.mjs BUILT_CLI WORKSPACE NEW_RESULT_FOLDER 10
node validation/checkpoint-bytes.mjs BASELINE_PLUGIN SAVED_STATE_JSON RESULT_JSON
node validation/checkpoint-submit.mjs BASELINE_PLUGIN SAVED_STATE_JSON NEW_RESULT_JSON
node validation/screen-performance.mjs BUILT_CLI WORKSPACE RESULT_JSON
# 같은 상태의 비교는 위 실행이 만든 RESULT_JSON.seed.json으로 새 작업 root에서 실행
node validation/screen-performance.mjs BUILT_CLI NEW_WORKSPACE RESULT_JSON SEED_JSON
```

단위 검사는 `npm test`, 실제 인계 변형과 구형 bytes는 기존 validation/reviewed-mutations.mjs와 legacy-bytes.mjs를 사용한다. 원시 입력/상태/전체 산출물은 저장소에 넣지 않고 작은 집계와 캡처만 둔다. 재귀 삭제 명령은 쓰지 않았다.

## 측정표

파일 크기는 decimal MB, 시간은 초다. 반복 조회 항목은 3회 평균이다. 원시 집계는 [측정 JSON](checkpoint-performance-results.json)에 있다.

| 입력 | 상태 | 원장 전체 MB | 최대 checkpoint MB | 구획 / 후보 / 판단 |
| --- | --- | ---: | ---: | --- |
| 13쪽 변경 전 | 완주 | 219.805 | 8.524 | 25 / 122 / 122 |
| 13쪽 변경 후 | 완주 | 3.122 | 2.911 | 25 / 122 / 122 |
| 130쪽 변경 전 | **미완료, 21회 제출에서 종료** | 2033.743 (그 시점) | 92.517 | 250 / 1220 / 미완료 |
| 130쪽 변경 후 | 완주 | 40.023 | 37.929 | 250 / 1220 / 1220 |

| 처리 작업 | 13쪽 전 | 13쪽 후 | 130쪽 전 | 130쪽 후 |
| --- | ---: | ---: | ---: | ---: |
| 실제 13쪽 인계 1회 읽기 | 0.598 | 0.680 | 0.562 | 0.527 |
| 후보 수집 | 0.963 | 1.193 | 11.568 | 11.800 |
| 원장 생성 | 0.243 | 0.379 | 2.599 | 4.450 |
| 판단 제출+저장 평균 | 2.900 | 0.380 | 29.583 (21회까지만) | 3.447 |
| 원장 재읽기 | 6.843 | 0.211 | 미도달 | 1.863 |
| 같은 입력 refresh | 0.135 | 0.135 | 미도달 | 1.024 |
| 문제 묶음 | 0.011 | 0.010 | 미도달 | 0.086 |
| 제안 재검증 | 4.181 | 0.028 | 미도달 | 0.065 |
| 작성 입력 파일 직렬화 | 0.003 | 0.003 | 미도달 | 0.010 |
| 시험 XML 생성 | 0.032 | 0.024 | 미도달 | 0.050 |

13쪽 전체 제출 25회의 합계는 72.511 → 9.511초다. 130쪽 변경 후 전체 250회 제출 합계는 861.763초다. 변경 전 130쪽 완주 시간은 **측정하지 못했으며 636.7초보다 크다는 하한만** 있다. 시간 상한에서 끝낸 값을 전체 평균/최종 크기로 외삽하지 않는다.

| 130쪽 변경 전 완료 제출 수 | 해당 제출 초 | 그때 게시된 checkpoint 누적 MB |
| ---: | ---: | ---: |
| 1 | 5.200 | 184.720 |
| 5 | 16.390 | 554.320 |
| 10 | 25.554 | 1016.387 |
| 15 | 38.113 | 1478.672 |
| 21 | 51.709 | 2033.743 |

상태 크기를 n, checkpoint 수를 m이라 하면 구형의 마지막 사슬 읽기는 O(n*m), 전체 제출 중 반복 읽기는 O(n*m*m)이다. 둘이 함께 커지면 마지막 조회는 제곱, 전체 반복 처리는 세제곱에 가까워질 수 있다. 위 부분 측정만으로 정확한 지수나 전체 완주 시간을 실측했다고 하지 않는다. 변경 후는 저장 바이트가 고유 내용+판단 변경에 비례한다. 매 제출의 현재 사슬/상태 검증은 여전히 입력과 이력 길이에 비례하므로 모든 제출 총시간까지 선형이라고 하지 않는다.

| 동일 완료 상태의 화면 서비스 작업 | 전(단일 초기 checkpoint) | 후(동일 상태, 단일 초기 checkpoint) |
| --- | ---: | ---: |
| refresh | 3.444 | 0.888 |
| detail | 10.853 | 1.606 |
| confirm | 20.579 | 4.130 |
| save | 11.593 | 6.230 |
| export | 9.934 | 2.719 |

두 root에 같은 seed 상태·ID·판단·원문 인계·설정을 넣어 실행했다. 각 초기 원장은 checkpoint 1개다. API 계층인 screenService를 직접 호출한 시간이며 원문 CLI 생성/검사·마지막 fresh를 포함한다. 동일 상태의 단일 판단 제출+CAS 저장은 13쪽 0.496 → 0.316초, 130쪽 4.838 → 3.421초였다. 이 개별 비교는 양쪽 모두 초기 checkpoint 1개로 시작하므로 누적 전체 사슬의 차이를 포함하지 않는다. 130쪽 화면 서비스/실제 문서 생성·확정은 실행하지 않았으며 130쪽 표는 처리기 측정이다.

[1440 상세 내부 스크롤](screenshots/checkpoint-detail-1440.png), [640 실제 저장 원문](screenshots/checkpoint-detail-640.png).

직접 시작한 브라우저와 Host를 종료하고 시험 포트 listener가 없음을 확인했다. 장시간 측정 프로세스도 종료했다. 설치된 앱·기존 daemon·사용자 자료는 조작하지 않았다.
