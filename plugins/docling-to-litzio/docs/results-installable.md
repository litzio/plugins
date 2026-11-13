# 설치·가져오기·결과·문제 목록 화면

2026-11-13. 플러그인 0.6.0을 공개 master `9956e8e0`의 격리 소스 빌드 Host/CLI에서 확인했다. 이 SHA가 현재 origin/master와 같음을 fetch 뒤 확인하고 앞 단계에서 만든 해당 빌드를 재사용했다. 공개 제작/화면/HTTP/문서 작성 계약, SDK의 공개 context/화면 부품 정의와 CLI help, 실제 `plugins scaffold --template screen` 결과만 사용했다. 리치오 내부 구현에 의존하거나 기존 사용자 설치/daemon을 쓰지 않았다.

## 실제로 확인한 흐름

`plugins validate → install → settings → operation invoke`와 브라우저의 실제 React 화면을 사용했다. 정적 valid/running과 실제 처리 성공을 구분했다. 설치 후 세 입력 모두 **입력 확인 → 문서 만들기 → 접수/상태 조회 → 결과/검수 목록**을 실행했다. LSR 결과 문서는 리치오 파일 탐색기로 열어 native 문서 화면을 확인했다. 원문 충실도 전수 검수나 시각적 완성도 승인은 아니다.

| 입력 | 쪽 | 블록 | 그림 | 손실 | 후보 | 묶음 / 접은 목록 | check / 생성 추가 불일치 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LSR 북마크 | 13 | 113 | 2 | 31 | 48 | 15 / 9 | 통과 / 0 |
| LSR 무북마크 | 13 | 113 | 2 | 31 | 69 | 19 / 10 | 통과 / 0 |
| NIST | 11 | 407 | 8 | 0 | 347 | 9 / 5 | 통과 / 0 |

처리/표현 규칙과 숫자는 [보강된 작성 입력 측정](results-richer-authoring.md)과 같다. 기존 generate/createReview/완료 reader를 호출하므로 화면용 변환을 다시 구현하지 않았다. provenance와 검수 대상 schema는 1.0.0 그대로다. 검수 미완료 상태를 유지한다.

실제 첫 세 작업의 접수→ready는 약 3.16/3.39/5.55초였다. worker는 접수 RPC 밖에서 동작하고 화면은 1초 간격 상태 조회를 한다. 이는 장문 처리 시간/메모리 한도 측정이 아니다. 같은 requestId의 공개 CLI 재호출은 기존 ready 작업을 반환했고 새 폴더가 생기지 않았다. 새 requestId의 후속 생성은 기존 결과를 보존했다. 재설치/reload 뒤 상태 파일에서 기존 결과를 읽었고, 결과 다시 검증도 실행했다.

화면은 반복 패턴 6개를 접은 LSR 9행과 펼친 15개 묶음을 표시한다. 선택한 알려진 셋째 수식 묶음의 원본 selfRef·쪽·bbox·native target과 세 근거(필수 수식 검수/문장 혼입/본문 혼입)를 표로 확인했다. 대표는 나머지 구성원의 승인이나 검토 생략이 아니다. 전체 근거는 별도로 펼칠 수 있다.

### 캡처

앱의 실행 계정/절대 경로를 담는 사이드바를 제외하고 실제 main/표 영역만 촬영했다. 픽셀을 덮거나 독자 미리보기로 바꾸지 않았다. 공개 합성 표본만 보인다.

- [입력 확인](assets/installable/import.png)
- [결과·손실·접은 목록](assets/installable/result.png)
- [선택 묶음의 위치와 근거](assets/installable/group.png)
- [파일 탐색기로 연 실제 native 문서](assets/installable/document.png)

## 플랫폼에 모자란 것

| 하려던 일 | 공개된 것과 실제 결과 | 현재 수단 / 필요한 범용 능력 |
| --- | --- | --- |
| 열린 폴더에서 변환 결과 묶음 선택 | 화면 props는 React/ui/invoke/saveDocument, context는 settings/secrets/platform/env/isDirectory. 폴더 목록·선택 callback 없음. 앱의 폴더 열기는 별도로 동작 | 설정한 작업 폴더 안의 상대 경로를 글자로 입력. 대상 Host의 열린 폴더/파일을 고르는 공개 선택기 필요 |
| 화면 saveDocument로 그림까지 새 문서 작성 | 공개 callback에는 images가 없음. 별도 최소 probe에서 열린 폴더를 지정한 상태로 공개 figure.imageAsset을 전달하면 **Image keys must match Figure asset references**로 거부. 문서 미게시 | 명시한 공식 CLI의 create+images 경로로 그림 게시/재읽기. 화면 callback의 공용 images 입력 또는 Host 처리 코드의 공식 작성 작업 필요 |
| 결과 버튼으로 이미 생성한 문서 열기 | 새 문서 saveDocument의 open:true만 있음. 기존 문서 열기 callback 없음 | 문서 열기 버튼은 비활성+상대 위치 안내. 실제 문서는 리치오 파일 탐색기로 열었음. 기존 문서를 같은 Host의 탭으로 여는 공개 호출 필요 |
| Host 처리 코드에서 공식 작성·읽기/검사 호출 | 공개 PluginContext에 관련 callback/자기 CLI 위치가 없음. SDK의 문서 의미 API를 직접 파일 writer로 대체하지 않음 | 작업 폴더와 source-built CLI 진입 파일을 수동 설정. 자동 탐색/숨은 HTTP 호출 없음. 공용 Host 작업 호출 또는 공식 CLI 실행 위치 계약 필요 |
| PR 4의 플러그인 스킬 전달 | 아래 최소 선언은 **assistant skill / Artifact or SDK/schema validation failed**로 설치 전 검증 거부. skills를 뺀 같은 artifact는 통과 | 이번 artifact에는 스킬을 넣지 않음. 안내와 일치하는 최소 skill 검증/설치와 필드별 오류 진단 필요. 실제 비서에 전달되는지는 미확인 |

선택기/기존 문서 열기는 공개 계약상 없음 확인이며 없는 callback을 호출하지 않았다. images는 공개 callback의 허용 authoring 필드만으로 실제 실패를 확인했다. 미지원 images 속성을 몰래 추가하거나 숨은 endpoint를 사용하지 않았다. CLI 경로는 명시적인 임시 수단이다. 그 부족을 자체 문서 미리보기/PDF 뷰어/새 문법으로 우회하지 않는다.

스킬 조사 최소 선언(임시 probe에만 보관):

```json
{"skills":[{"id":"docling-generation-status","directory":"skills/generation-status"}]}
```

```yaml
---
name: docling-generation-status
description: Read generation status.
---
```

`plugins validate PROBE_DIRECTORY --host HOST --json`에서 assistant skill 검증 오류가 났다. 따옴표 있는 최소 frontmatter도 같은 결과였다. 공개 안내 밖의 규칙을 추측하거나 비서 스킬 폴더에 직접 복사하지 않았다. 실패 원인이 frontmatter/namespace/경로 중 무엇인지는 공개 진단만으로 확정하지 못했다. 실제 AI 호출은 하지 않았다.

## PR 4 부분 교정 조사 — 구현 없음

새 임시 문서에 문단·표·수식 각 하나를 만들고 공개 CLI만 실행했다. 매번 inspect로 현재 revision/path를 읽은 뒤, 아래 **한 연산짜리 apply-batch**를 적용했다.

```json
[{"command":"update-node-text","path":"1","from":"0.73","to":"0.74"}]
```

```json
[{"command":"update-table-cell","path":"2,1,0","text":"0.74 ms"}]
```

```json
[{"command":"update-equation-latex","path":"3","from":"x = 1","to":"x = 2"}]
```

```sh
node BUILT_CLI apply-batch PROBE_MD --operations OPERATION_JSON --if-revision CURRENT_REVISION --format json
```

셋 다 exit 0, `{"ok":true,"command":"apply-batch","applied":1,"revision":"RESULT_REVISION"}`을 받았고 check를 통과했다. 오래된 revision의 단건 update-node-text는 exit 1, **revision mismatch; run inspect again; nothing was written**이고 파일 bytes가 같았다. 최초 조사에서 잘못된 update-node-text --text는 unknown option으로 쓰기 없이 거부됐으며 help의 --from/--to로 바로잡았다.

단건 수정은 새 revision JSON receipt를 내주지 않으므로 한 연산 batch가 현재 수단이다. 이 receipt는 적용 개수와 결과 revision이며 before/after target 대응·구조 이동·출처 갱신·여러 파일 commit/Undo receipt가 아니다. 이것만으로 교정과 provenance 기록의 원자 결합이나 편집 후 대응 유지가 해결됐다고 주장하지 않는다. 실제 교정/비서/이력 구현은 다음 조각이다.

## 검사와 한계

[기계 측정과 교정 조사 receipt](installable-results.json)를 함께 보관했다. 기본 npm test는 48개 통과/8개 명시 skip이며 CLI/corpus를 지정한 전체 **56개 검사 통과/skip 0**: 기존 생성/인계/탐지 회귀와 새 접수/상태·중복 ID·입력 변경·중단 표시·경로/기존 symlink 탈출 거부·실패 상태/불완전 출력 거부·실제 worker 생성/readback·기존 교정 보존을 포함한다. 스크린샷은 위 별도 실제 Host/브라우저 실행 증거다. 단위 검사로 화면을 확인했다고 세지 않았다.

상태 파일은 플러그인 소유 실행 기록이며 새 handoff 계약이 아니다. ready에서도 표지/digest/revision 전수 검증 없이는 결과를 읽지 않는다. worker 종료를 기다리는 dispose만 있고 실행 중 강제 취소·여러 Host가 같은 작업 폴더를 공유하는 동시 실행·임의 수백 쪽 처리·재시작 중 실제 process crash 수락은 미검증이다. 중단 흔적은 단위 검사로 확인했고 실제 강제 종료 시험을 했다고 주장하지 않는다. 자동 재개/삭제·검수 완료/교정·나란한 대조·실제 비서 스킬 전달은 없다.

직접 시작한 Host/브라우저/CLI/worker는 종료하고 임시 자료를 보존한다. 실제 설치된 리치오·사용자 daemon/자료, Docling 서버·재변환·Docker·AI는 건드리지 않았다. 진행 기록 전달안은 PR 본문에 두며 docs/progress.md는 수정하지 않는다.
