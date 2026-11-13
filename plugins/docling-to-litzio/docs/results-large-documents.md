# 큰 문서의 검수 작업 성능

기준은 plugins master `4f335ba`다. 공개 플랫폼 master `26c902d3c7d329603d31ea02e3af40e891785b9f`와 기존 격리 소스 빌드의 commit이 같음을 다시 확인하고 그 CLI를 사용한다. 설치된 앱·daemon·사용자 자료와 다른 플러그인·진행 기록은 변경하지 않는다.

소유자의 마무리 지시에 따라 수정 후 비교는 13쪽·130쪽·혼합 130쪽에서 닫는다. 65/260쪽은 이미 끝난 기준 측정만 참고로 남기고 수정 후 측정은 생략한다. 추가 교정 이력 10건과 화면 비교 조회의 별도 성능 측정도 실행하지 않았다. 아래 표를 더 큰 범위의 목표 달성으로 외삽하지 않는다.

## 측정 경계

각 작업을 세 번 반복한 비계측 시간의 중앙값과 최솟값–최댓값을 보고한다. 다음 한 번은 결정적 계수와 V8 샘플 프로파일용이며 중앙값에 섞지 않는다. 모든 쓰기는 같은 seed의 새로운 사본에서 실행한다. 실제 source-built CLI의 inspect/check/apply-batch를 사용하며 메모리 편집기로 대체하지 않는다. HTTP Host/RPC 전송과 화면 렌더링은 포함하지 않는다.

파일 readFile/writeFile 횟수·bytes, 플러그인 프로세스의 crypto.createHash update bytes, 이름별 최상위 schema 검증 횟수·대상 compact JSON bytes·검증 시간, CLI 호출별 명령과 시간을 계수한다. schema의 재귀 노드마다 별도 최상위 호출로 세지 않는다. CLI 내부 해시·schema·파싱은 블랙박스 CLI 시간에 포함되며 플러그인의 계수라고 주장하지 않는다. lstat/rename/잠금 handle 쓰기는 데이터 읽기/쓰기 계수에서 제외한다.

프로파일의 상위 다섯 frame과 비중은 별도 계측 실행의 V8 샘플이다. CLI 대기, GC/idle, 계측 overhead도 표시하며 중앙값 실행의 정확한 CPU 분해라고 주장하지 않는다. 파일·schema·CLI 시간은 중첩될 수 있어 단순히 더하지 않는다.

측정 중 이 작업의 빌드·단위 검사는 병행하지 않는다. 다른 작업자에게도 측정 구간을 알리고, 매 표본 전후의 프로세스 누적 CPU를 읽는다. 측정 프로세스·PowerShell 계수 도구를 제외한 외부 Node가 0.15 core, 외부 합계가 0.75 core, 단일 외부 프로세스가 0.5 core 이상이면 비정상 부하 표본으로 따로 기록하고 최대 세 번 재시도한다. 이는 완전한 OS 무부하 보장이 아니며 접근 가능한 CPU 계수의 witness다. OS 파일 캐시는 비우지 않는다.

## 표본

[합성기](../test/large-corpus.py)는 fixtures를 읽기만 하고 새 폴더에 쓴다. LSR 13쪽을 1/5/10/20회 이어 13/65/130/260쪽을 만든다. 추가 혼합본은 LSR 5구획·NIST 5구획과 10개의 구획 표지 쪽으로 130쪽이다. 표지의 `S01`–`S10`과 `1000 + 37 × 구획 index` ms 값은 구획마다 다르며 PDF와 Docling JSON 양쪽에 있다. 원래 공개 표본의 값과 본문은 그대로 반복된다. 서로 다른 두 문서의 표·본문·그림·주석 분포와 고유 표지·수치로 단순 반복의 한계를 줄였지만 독립적인 실제 장문이나 의미 품질 표본은 아니다.

PDF 쪽 복사에는 북마크를 복제하지 않으므로 합성본의 묶음 수를 원래 표본과 같다고 보지 않는다. 주 측정 seed의 교정 이력은 0건이며 교정 작업만 한 건을 추가한다. 13쪽 산출물 bytes 회귀는 이 합성과 별도로 원래 고정 PDF/변환 결과를 그대로 사용한다.

혼합본에는 NIST 원래 제목 `Models for the Smart Grid 2.`의 숫자 2가 source bbox 밖에 있는 보호값 차이가 구획마다 하나, 총 다섯 개 남는다. 표본이나 검증을 바꾸어 완료시키지 않는다. 혼합본의 조회·결정은 미완료 상태에서, 완료 작업은 거부 경로로 측정하며 정상 완료 네 표본과 구분한다. 합성 seed의 확인은 결정적인 시험 선언이며 실제 사람/AI 검수나 업무 승인이 아니다. 재변환·변환 서버·AI 호출은 없다.

## 프로파일로 확인한 원인과 변경

첫 130쪽 진행 프로파일은 약 11.4초였고 외부 Node CPU는 0으로 관측됐다. sourceItemText의 본문/셀 find, deep path 비교, source-audit의 JSON 경로 비교, 완료 토큰 검사에서 PDF tokens 전체를 반복 순회하는 구간이 상위를 차지했다. 13쪽에서는 CLI spawn이 약 60%였다.

- source/native 조회는 호출 안에서 만든 경로·caption·각주 표지 색인을 쓴다. 첫 일치, 같은 경로의 서로 다른 node type, JSON 경로 비교와 deep 경로 비교의 차이(negative zero 포함)를 보존한다.
- PDF token ID 색인은 중복 inventory ID를 버리지 않고 원래 PDF 순서로 결과를 복원한다. 입력 ID 순서로 바꾸지 않는다.
- provenance는 같은 검증 경로에서 schema를 한 번 검사한 뒤 의미 대조를 수행한다. 공개 validateEvidence 자체는 계속 schema와 의미를 모두 검증한다.
- 검증한 review report/evidence를 같은 호출 안에서만 재사용하고 재사용 전에 현재 캡처 bytes의 SHA-256과 검증한 digest를 다시 대조한다. 다음 호출은 파일·schema·의미를 새로 검증한다. bytes와 검수 표지를 함께 바꿔도 이전 검증 결과를 재사용하지 못하는 회귀를 추가했다.
- 이미 같은 bytes에서 해석·검증한 Docling JSON/변환 기록은 호출 안에서 material·탐지에 재사용한다. 화면 목록·비교의 wrapper도 같은 인계 context를 사용한다. 이 값은 파일로 저장하지 않는다.
- 표현 확인의 inspect는 2회→1회, 교정의 inspect/apply 호출은 5회→3회다. 같은 작업에서 이미 얻은 공식 snapshot을 사용하되 기록 직전 문서 digest, apply-batch의 if-revision, 교정 후 readback, 게시 시 digest와 새로운 인계 검증을 유지한다. 조정(reconcile)은 계속 새 inspect로 시작한다.

호출 사이의 판정 캐시는 없다. 저장 형식·계약·C0–C9·무효화·부분 변경 탐지·조회 bytes 일관성과 쓰기 직전 revision 확인을 바꾸지 않는다.

## 재현

[측정기](../test/large-benchmark.js)의 prepare/approve와 before/after 실행, [계수 도구](../test/perf-instrument.js), [외부 부하 witness](../test/perf-processes.ps1)를 사용한다. `DOCLING_TEST_CLI`와 다섯 격리 환경 변수를 자기 시험 하위 폴더로 지정한다. 패키지 설치는 임시 최상위에서 하지 않는다. 생성물은 저장소에 넣지 않는다.

시간과 ID를 시험 프로세스 안에서만 고정해 별도로 생성한 13쪽 산출물을 [bytes 비교기](../test/compare-artifacts.js)로 전수 대조한다. 문서·원본·그림·대응·손실·snapshot/receipt·검수 대상/증거/표지·사람 완료·진행 원장·완료 인계 표지 16개가 비교 대상이다. 단순 투영 일치나 JSON key 정규화 비교로 대신하지 않는다.


<!-- LARGE_TABLES -->

## 전후 시간

단위 ms, 중앙값 [최솟값–최댓값]. 각 칸은 부하 기준을 통과한 비계측 3회다. [원시 계수·프로파일·bytes 증거](large-document-measurements.json)에 모든 표본과 제외 표본을 남겼다. 혼합본 완료는 **5개 보호값 차이로 거부**하는 경로다.

| 표본 | 작업 | 전 | 후 |
| --- | --- | ---: | ---: |
| 13쪽 | 사람 결정 | 461.6 [440.3–461.7] | 382.5 [378.6–383.5] |
| 13쪽 | 표현 확인 | 786.5 [774.0–800.9] | 373.0 [366.1–376.7] |
| 13쪽 | 진행 조회 | 477.6 [470.4–507.3] | 370.1 [363.6–375.9] |
| 13쪽 | 교정 제출 | 2,399.9 [2,388.8–2,417.1] | 1,650.2 [1,641.8–1,652.8] |
| 13쪽 | 완료 발급 | 994.5 [966.9–1,025.4] | 804.2 [800.3–818.3] |
| 13쪽 | 인계 읽기 | 124.2 [120.2–149.4] | 53.7 [44.6–63.3] |
| 130쪽 | 사람 결정 | 8,567.8 [8,565.0–8,582.3] | 1,068.4 [1,059.4–1,090.6] |
| 130쪽 | 표현 확인 | 9,265.8 [9,211.5–9,310.4] | 1,142.8 [1,075.2–1,512.1] |
| 130쪽 | 진행 조회 | 10,910.0 [10,901.9–11,078.9] | 1,100.5 [1,097.4–1,114.7] |
| 130쪽 | 교정 제출 | 19,567.1 [19,545.2–19,764.1] | 4,836.8 [4,700.7–4,881.4] |
| 130쪽 | 완료 발급 | 19,892.0 [19,707.5–20,165.4] | 2,605.6 [2,584.7–2,642.0] |
| 130쪽 | 인계 읽기 | 7,526.8 [7,487.6–7,536.6] | 359.7 [348.6–371.0] |
| 혼합 130쪽 (미완료) | 사람 결정 | 9,264.6 [9,061.0–9,338.8] | 1,215.3 [1,198.5–1,253.4] |
| 혼합 130쪽 (미완료) | 표현 확인 | 10,773.4 [9,949.6–11,041.2] | 1,239.1 [1,229.2–1,283.0] |
| 혼합 130쪽 (미완료) | 진행 조회 | 11,009.8 [10,887.2–11,261.2] | 1,234.1 [1,219.4–1,261.7] |
| 혼합 130쪽 (미완료) | 교정 제출 | 25,352.9 [24,962.1–25,496.6] | 5,688.7 [5,620.5–5,745.0] |
| 혼합 130쪽 (미완료) | 완료 발급 | 11,180.6 [10,939.7–11,209.8] | 1,237.8 [1,218.2–1,238.4] |
| 혼합 130쪽 (미완료) | 인계 읽기 | 7,213.1 [7,212.4–7,396.8] | 274.8 [273.4–293.5] |

## 130쪽 결정적 계수

읽기/쓰기/해시는 횟수/MiB, schema는 최상위 호출 수/compact 대상 MiB다. 계측 1회 값이며 시간 표본에 섞지 않았다. schema별 개별 횟수/bytes/시간과 파일별 IO는 원시 JSON에 있다.

| 작업 | 읽기 전→후 | 쓰기 전→후 | 해시 전→후 | schema 전→후 | CLI 횟수 전→후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 사람 결정 | 24/33.10 → 24/33.10 | 1/0.38 → 1/0.38 | 4119/50.50 → 4120/53.19 | 34/13.29 → 31/7.16 | 1 → 1 |
| 표현 확인 | 24/33.10 → 24/33.10 | 1/0.38 → 1/0.38 | 4410/50.77 → 4410/53.30 | 34/13.29 → 31/7.16 | 2 → 1 |
| 진행 조회 | 21/31.38 → 21/31.38 | 0/0.00 → 0/0.00 | 4698/50.58 → 4699/53.27 | 31/13.29 → 28/7.16 | 1 → 1 |
| 교정 제출 | 57/91.82 → 57/91.82 | 6/3.09 → 6/3.09 | 7667/121.10 → 7669/128.40 | 74/23.73 → 70/14.12 | 5 → 3 |
| 완료 발급 | 45/65.61 → 45/65.61 | 3/2.40 → 3/2.40 | 8813/95.23 → 8816/102.68 | 62/23.93 → 58/14.32 | 2 → 2 |
| 인계 읽기 | 19/31.37 → 19/31.37 | 0/0.00 → 0/0.00 | 4112/43.36 → 4114/48.12 | 26/10.64 → 25/7.16 | 0 → 0 |

| 작업 | 수정 후 CLI 호출별 ms (계측 실행) |
| --- | --- |
| 사람 결정 | inspect 661.2 |
| 표현 확인 | inspect 648.9 |
| 진행 조회 | inspect 657.7 |
| 교정 제출 | inspect 653.9; apply-batch 2491.6; inspect 648.8 |
| 완료 발급 | inspect 647.7; check 1198.4 |
| 인계 읽기 | 없음 |

## 130쪽 상위 다섯 profile frame

각 칸은 별도 계측 실행의 frame/샘플 비중이다. runtime spawn은 CLI 실행/대기를 포함한다. 계측 함수와 idle/GC도 숨기지 않았다.

| 작업 | 전 | 후 |
| --- | --- | --- |
| 사람 결정 | `rich-content.js:246:anonymous` 15.3%<br>`comparisons:284:objectComparisonStart` 14.4%<br>`rich-content.js:250:anonymous` 11.4%<br>`source-audit.js:11:same` 9.4%<br>`human-review.js:217:anonymous` 7.7% | `runtime:0:spawn` 57.1%<br>`schema.js:27:validateSchema` 8.9%<br>`runtime:0:utf8Slice` 5.7%<br>`node:inspector:115:post` 4.4%<br>`perf-instrument.js:61:globalThis.__doclingSchemaMetric` 2.8% |
| 표현 확인 | `rich-content.js:246:anonymous` 14.6%<br>`comparisons:284:objectComparisonStart` 13.9%<br>`runtime:0:spawn` 13.8%<br>`rich-content.js:250:anonymous` 10.2%<br>`source-audit.js:11:same` 8.2% | `runtime:0:spawn` 56.1%<br>`schema.js:27:validateSchema` 8.5%<br>`runtime:0:utf8Slice` 6.1%<br>`node:inspector:115:post` 4.5%<br>`runtime:0:(garbage collector)` 2.9% |
| 진행 조회 | `rich-content.js:246:anonymous` 18.7%<br>`rich-content.js:250:anonymous` 12.9%<br>`human-review.js:217:anonymous` 12.6%<br>`comparisons:284:objectComparisonStart` 11.5%<br>`source-audit.js:11:same` 6.7% | `runtime:0:spawn` 55.7%<br>`schema.js:27:validateSchema` 7.8%<br>`runtime:0:utf8Slice` 5.7%<br>`node:inspector:115:post` 4.5%<br>`runtime:0:(garbage collector)` 2.6% |
| 교정 제출 | `runtime:0:spawn` 25.7%<br>`comparisons:284:objectComparisonStart` 16.3%<br>`rich-content.js:246:anonymous` 10.5%<br>`source-audit.js:11:same` 8.1%<br>`rich-content.js:250:anonymous` 7.4% | `runtime:0:spawn` 78.8%<br>`schema.js:27:validateSchema` 4.1%<br>`runtime:0:utf8Slice` 2.8%<br>`node:inspector:115:post` 1.6%<br>`runtime:0:update` 1.4% |
| 완료 발급 | `rich-content.js:246:anonymous` 16.7%<br>`comparisons:284:objectComparisonStart` 13.2%<br>`rich-content.js:250:anonymous` 12.6%<br>`human-review.js:217:anonymous` 9.7%<br>`runtime:0:spawn` 9.1% | `runtime:0:spawn` 65.7%<br>`schema.js:27:validateSchema` 7.0%<br>`runtime:0:utf8Slice` 4.8%<br>`node:inspector:115:post` 2.2%<br>`perf-instrument.js:61:globalThis.__doclingSchemaMetric` 2.2% |
| 인계 읽기 | `rich-content.js:246:anonymous` 17.5%<br>`comparisons:284:objectComparisonStart` 17.2%<br>`rich-content.js:250:anonymous` 13.4%<br>`source-audit.js:11:same` 9.7%<br>`human-review.js:217:anonymous` 8.6% | `schema.js:27:validateSchema` 19.3%<br>`runtime:0:utf8Slice` 14.5%<br>`node:inspector:115:post` 11.7%<br>`schema.js:28:error` 7.2%<br>`perf-instrument.js:61:globalThis.__doclingSchemaMetric` 6.1% |

## 기준 규모 증가

65/260쪽은 수정 전 측정만 끝났으며, 마무리 지시에 따라 수정 후는 생략했다.

| 작업 | 전 13쪽 | 전 65쪽 | 전 130쪽 | 전 260쪽 | 후 13→130 비율 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 사람 결정 | 461.6 | 2,650.0 | 8,567.8 | 32,262.1 | 2.79배 |
| 표현 확인 | 786.5 | 3,087.1 | 9,265.8 | 33,616.6 | 3.06배 |
| 진행 조회 | 477.6 | 3,206.9 | 10,910.0 | 41,984.7 | 2.97배 |
| 교정 제출 | 2,399.9 | 7,360.5 | 19,567.1 | 67,016.7 | 2.93배 |
| 완료 발급 | 994.5 | 5,930.5 | 19,892.0 | 75,879.8 | 3.24배 |
| 인계 읽기 | 124.2 | 2,056.2 | 7,526.8 | 30,305.8 | 6.70배 |

기준 진행 조회의 130→260쪽 시간 비율은 3.85배, 같은 표본의 쪽 수 2배에 대해 제곱 증가(4배)에 가깝다. 수정 후에는 두 크기만 비교했으므로 선형성을 입증했다고 표현하지 않는다.

## 검증과 목표 미달 / 다음에 할 것

부하 기준 미통과 표본은 전 2개·후 1개이며 중앙값과 정상 프로파일에서 제외했다. 각 작업의 정상 시간 3회와 정상 계수/프로파일 1회를 모두 확보했다. 원래 LSR 13쪽(15묶음)은 고정 PDF/변환 결과로 별도 재생성해 인계의 16개 파일이 전부 bytes 동일함을 확인했다. 합성 13쪽(19묶음)의 bytes 비교도 앞서 통과했다.

| 130쪽 화면 작업의 개별 처리 | 후 중앙값 | 1초 초과 |
| --- | ---: | ---: |
| 사람 결정 | 1,068.4 ms | 68.4 ms |
| 표현 확인 | 1,142.8 ms | 142.8 ms |
| 진행 조회 | 1,100.5 ms | 100.5 ms |

**1초 목표는 미달이다.** 추가 최적화 없이 여기서 마무리한다. HTTP/RPC·실제 화면 지연도 수락하지 않았다. 현재 화면은 사람/표현 기록 뒤 progress를 다시 호출한다. 개별 중앙값을 단순 합산하면 각각 2.17초/2.24초이며 실제 버튼 연속 호출을 직접 측정한 값은 아니다.

### 플랫폼에 모자란 것

130쪽 진행의 공식 inspect 호출은 계측 실행에서 657.7ms, V8 spawn frame 비중은 55.7%다. 교정에는 inspect/apply-batch/inspect가 필요하며, 위 표에서 apply-batch 자체가 약 2.49초다. 이는 프로세스 시작과 문서 읽기·파싱·검사·쓰기 전체를 포함한다. 순수 시작 시간만으로 귀속하지 않는다.

[공개 Node 계약](https://github.com/litzio/litzio/blob/26c902d3c7d329603d31ea02e3af40e891785b9f/docs/design/plugin-stage1-v1.md)은 공식 CLI 실행 정보를 제공한다. 다음 논의는 현재 revision과 bytes를 결합해 읽기/검사를 한 번에 처리하는 공식 호출 또는 상주 Host의 범용 능력이다. 플랫폼 내부 Core import나 비공개 daemon 경로에 기대어 우회하지 않았다.

### 플러그인 안에서 다음에 논의할 것

기록 뒤 별도 progress 조회를 줄이는 응답/화면 흐름, 남은 호출 내 schema·JSON 해석·전체 대조 비용을 다룰 수 있다. 새 흐름도 같은 bytes와 쓰기 직전 revision 확인을 유지해야 한다. 호출 사이 판정 캐시를 다음 후보로 제안하지 않는다. 대규모 실사용·누적 교정 이력·화면 비교 조회는 별도 수락이다.

### 계약 변경

이번 최적화에 인계 파일 형식 변경은 필요하지 않았다. 현재 측정만으로 계약 변경의 필요성을 입증하지 않았으며, 공개 플랫폼 능력과 플러그인 내 흐름을 먼저 논의한다. docs/progress.md와 요구사항 플러그인은 변경하지 않는다.

## 최종 검사와 인계

공식 source-built CLI를 지정한 기존 검사 전부: **150개 중 145 통과, 5 corpus 환경 skip, 실패 0**. 비계측 단위 실행도 150개 중 142 통과/8 환경 skip/0 실패였다. 첫 일치/타입별 경로/negative zero/중복 token 순서, 캡처 bytes 변경, 재사용 readback 뒤 외부 변경의 회귀를 포함한다. 원래 LSR 13쪽 인계 16파일의 bytes 전수 일치 증거는 원시 JSON에 있다.

Host/화면·실제 AI·변환 서버는 시작하지 않았다. 직접 시작한 준비·측정·검사 프로세스의 종료를 확인했다. CI·실제 화면·장문 업무 품질 수락으로 확대해 표시하지 않는다. 요구사항 플러그인, fixtures, 인계 계약 파일과 docs/progress.md는 변경하지 않았다.

재현 시 Node 24.22.2, pypdf 6.14.2, reportlab 5.0.0을 사용했다. `DOCLING_TEST_CLI`에 동일 플랫폼 빌드 entry를 지정하고 `LITZIO_DATA_DIR`, `LITZIO_ASSISTANT_CWD`, `LITZIO_ASSISTANT_SETTINGS_FILE`, `LITZIO_DAEMON_DIR`, `LITZIO_PLUGINS_SETTINGS_FILE`을 모두 시험 하위 폴더로 지정한다. 아래 대문자 인자는 자기 격리 위치로 바꾸며 `PERF_LOAD_STRICT=1`을 설정한다.

```text
node plugins/docling-to-litzio/test/large-benchmark.js BASELINE_PLUGIN WORK prepare PREPARE_RESULT 13,130,mixed
node plugins/docling-to-litzio/test/large-benchmark.js BASELINE_PLUGIN WORK before BEFORE_RESULT 13,130,mixed
node plugins/docling-to-litzio/test/large-benchmark.js plugins/docling-to-litzio WORK after AFTER_RESULT 13,130,mixed
node plugins/docling-to-litzio/test/large-benchmark.js BASELINE_PLUGIN BYTES_BEFORE original ORIGINAL_BEFORE_RESULT 13
node plugins/docling-to-litzio/test/large-benchmark.js plugins/docling-to-litzio BYTES_AFTER original ORIGINAL_AFTER_RESULT 13
node plugins/docling-to-litzio/test/compare-artifacts.js BYTES_BEFORE/seed-13 BYTES_AFTER/seed-13 BYTE_RESULT
```
