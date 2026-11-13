---
name: docling-review
description: Docling 문서의 검수 묶음을 원본 PDF 근거와 대조하고 교정 또는 판단 불가를 기록한다. 검수 묶음을 처리해 달라는 요청에 사용한다.
---

# 묶음 검수

사용자가 준 jobId와 groupIds 범위만 처리한다. ID가 없으면 `jobs`, `groups`로 찾고 범위를 확인한다. `LITZIO_HOST_ORIGIN`이 없으면 중단한다. 다른 Host 주소를 추측하지 않는다. 모든 호출은 공개 CLI이며 입력 JSON은 비서 작업 폴더에 쓴다.

```powershell
litzio operation invoke local.docling-to-litzio.material --input material.json --host "$env:LITZIO_HOST_ORIGIN" --json
```

material.json은 `{"jobId":"...","groupId":"..."}`이다. 같은 형식으로 `groups`에는 jobId만 준다. CLI 응답의 result를 읽는다.

1. `review-progress`(jobId)로 pending·stopped·현재 revision을 확인한다. pending이면 `correction-reconcile`(jobId)로 관측하고 해결되지 않으면 중단한다. stopped이면 요청받은 범위를 재개할 때 `review-resume`(jobId)을 쓴다.
2. 묶음마다 `material`을 새로 읽는다. generationId/sourceHash/documentRevision, current 블록·셀, fragments의 원본 값과 대응, checks의 대상별 PDF token refs/regions, pdf의 실제 token/좌표, 앞뒤 항목을 비교한다. 서로 다른 generation을 섞지 않는다. 자료가 크면 파일로 저장하고 해당 대상·쪽을 잘라 읽는다.
3. 원본 PDF 근거로 차이가 확실하면 `correction-submit`에 아래 JSON을 제출한다. target은 fragments.mapping.cells.targets의 path와 selector.row/column(0-based), 문단은 kind=paragraph/path, 수식은 kind=equation/path다. before는 current의 현재 값 그대로다. evidence.refs는 해당 sourceId/셀 index의 check.pdfTokenIds 전부, scope는 실제 읽은 **PDF token 좌표**의 pageNo/bbox다. Docling의 check.regions는 근사 대응 상자이므로 그대로 복사하면 PDF token이 범위 밖으로 나올 수 있다. refs에 해당하는 pdf.pages의 token.bbox를 쪽별로 모두 포함하는 사각형(각 축 min/max)을 만들고 그 영역을 읽었을 때만 scope로 낸다. 숫자·단위·부호를 바꾸거나 정규화하지 않는다.

```json
{"jobId":"...","changeId":"unique-id","generationId":"...","revision":"...","groupId":"...","actor":"assistant","decision":"correct","target":{"kind":"cell","path":[1],"row":1,"column":0},"before":"현재 값","after":"PDF 근거 값","reason":"대조한 차이와 이유","evidence":{"refs":["token-id"],"scope":[{"pageNo":1,"bbox":[0,0,10,10]}]}}
```

호출 명령의 operation만 `correction-submit`으로 바꾼다. 근거가 부족하면 같은 식별 필드와 actor/reason에 `decision:"uncertain"`만 제출한다(target/before/after/evidence는 생략 가능). 수식·표 구조·이미지 증거가 부족하면 판단 불가로 남긴다. **번호만 보고 제목 추정, 빈 셀 채우기, 원문 오탈자 다듬기, 문서 파일 직접 수정·덮어쓰기·재생성은 금지한다.**

4. 제출 후 `material`과 `review-progress`를 다시 읽어 후 값/revision/history.validation을 확인한다. applied는 단일 편집·token 재대조일 뿐 의미 정확성 보증이 아니다. uncertain/pending을 성공이라고 쓰지 않는다. 응답 유실 시 같은 쓰기를 다시 보내지 말고 progress/reconcile로 관측한다.
5. 검사한 묶음만 `review-checkpoint`로 기록한다: `{"jobId":"...","scopeId":"group-id","revision":"현재 revision","state":"차이없음","note":"실제 읽은 대상/쪽/검사 종류와 결과"}`. 교정 뒤 확인했으면 state=`교정후재검사`, 판단 불가는 `판단불가`, 실패는 `실패`다. 앞 묶음을 고친 뒤 이전 checkpoint가 미검사로 돌아가면 방문 사실을 완료로 복구하지 않는다. 후보 0건·방문한 쪽을 전수 일치라고 하지 않는다. 정상 값은 고치지 않고 차이없음만 기록한다.
6. 다음 묶음으로 간다. 중단 요청/예산 부족이면 `review-stop`(jobId)을 쓰고 남은 범위를 보고한다. 마지막에는 처리/교정/판단 불가/미검사 범위와 막힌 지점을 짧게 보고한다. 최종 검수 완료/reviewed를 발급하지 않는다.
