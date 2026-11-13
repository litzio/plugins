# 교정본 인계 v1.1

소유자가 PR 4-가에서 허락한 덧붙이는 계약이다. 교정 없는 생성 v1.0.0의 파일·검증·거부 조건은 그대로다. 교정 후에는 `complete.json.schemaVersion`만 **1.1.0**으로 올리고 현재 문서 revision을 기록한다. 현재 소비자가 1.1.0을 모르면 거부하는 것이 옳다. 생성 v1의 `unreviewed`를 `reviewed`로 승격하지 않는다.

## 불변 생성 증거와 현재 문서

`provenance.json`, `losses.json`, `snapshot.json`, `receipt.json`, 원본·그림과 `review/`의 세 파일은 생성 당시 그대로 보존한다. 그 파일의 revision과 receipt.inputs는 **생성 revision**이다. 현재 문서 값으로 읽으면 안 된다. 편집 receipt가 create의 targets를 발급한 것처럼 수정하지 않는다.

인계 파일을 하나 추가한다: `correction-history.json` ([schema](../../plugins/docling-to-litzio/schema/correction-history.schema.json)). generationId, baselineRevision, changes와 currentSnapshot을 갖는다. changes에는 changeId/groupId/actor/time/sourceHash, beforeRevision/afterRevision, target/before/after, evidence.refs/scope, reason, 공식 단일 apply-batch receipt, inverse, undoOf, validation이 있다. currentSnapshot은 마지막 공식 inspect의 전체 읽기 출력이다. 생성 snapshot에 기록된 값 교정을 순서대로 투영한 결과와 **전체가 같아야** 하므로 다른 블록·서식·순서의 설명되지 않은 변화를 거부할 수 있다. 각 중간 snapshot이나 별도 범용 이력 저장소는 만들지 않는다.

`complete.json`의 files는 기존 파일 digest를 유지하되 document.md digest를 현재 revision으로 바꾸고, correction-history.json 및 이미 있는 review/pdf-evidence.json·review/review-targets.json digest를 추가한다. 표지는 마지막에 게시한다. 생성 대응 schema와 검수 대상 schema 자체는 1.0.0을 유지한다. currentSnapshot/changes가 없는 1.1.0, 이력이 빈 1.1.0은 거부한다. 교정 없는 생성은 계속 1.0.0이다.

## 소비자의 검증

1. complete의 1.0.0과 1.1.0을 명시적으로 구분하고 파일 종류·경로·digest와 처음/마지막 표지를 확인한다. 1.0.0은 기존 경로 그대로 검증한다.
2. 1.1.0에서는 불변 provenance/losses/snapshot/create receipt의 generation/생성 revision·원본·source-native 보존 검사를 그대로 한다. complete의 현재 documentRevision과 생성 revision의 차이를 무조건 허용하지 않는다.
3. 생성 snapshot.revision에서 시작해 모든 고리의 beforeRevision이 직전 revision인지, changeId가 유일한지, before가 직전 대상 값인지 검사한다. 공식 receipt는 ok=true, command=apply-batch, applied=1, revision=afterRevision이어야 한다. 역연산도 해당 target/값의 정확한 반대여야 한다.
4. 허용 대상은 paragraph 평문, table cell 평문, equation LaTeX뿐이다. path·종류·다른 속성·인라인 서식·원자·순서는 변하지 않는다. marks/atoms가 있는 평문 대상, 제목 단계 추정과 빈 칸 채우기는 지원하지 않는다. 이력을 투영한 전체 snapshot과 currentSnapshot이 같고 마지막 revision이 현재 문서 bytes hash여야 한다. 실제 소비 시 같은 revision의 공식 inspect와도 다시 비교한다.
5. sourceHash가 원본 PDF hash인지, groupId가 원래 검수 묶음인지 검사한다. target이 그 묶음 source item/cell의 실제 대응이어야 한다. evidence.refs는 해당 원래 check의 PDF token 전부이며 실제 검사 scope가 모든 token의 쪽/좌표를 포함해야 한다. 숫자·단위·부호 재대조 결과는 후 값에서 독립적으로 다시 계산한다. 수식의 token 일치를 의미 정확성으로 승격하지 않는다. undoOf는 직전 revision의 기록을 정확히 뒤집은 경우만 인정한다.
6. 생성 대응의 원본 인용은 유지한다. 현재 target.text/revision은 currentSnapshot에서 읽는다. 교정 대상에는 **원본 변환값과 다르게 교정됨(근거 있음)**을 표시하고 changeId/전후 값/evidence/validation을 연결한다. sourceText/sourceCell.text를 현재 문서 값이라고 사용하지 않는다. 출처는 원래 PDF 위치를 계속 가리킨다. token 재대조를 통과했어도 전체 검수 완료는 아니다.

생산 reader는 반환값의 baseline에 생성 대응을, provenance/snapshot에 현재 투영을, history에 교정 표시 근거를 제공한다. 반환된 현재 provenance의 schemaVersion 1.1.0은 이 reader의 투영이며 디스크의 생성 provenance를 덮어쓴 것이 아니다. 다른 플러그인은 코드를 import하지 않고 위 파일 의미를 구현한다.

## 중단·검수 상태

correction-ledger.json, correction-operation-*.json, lock은 플러그인 소유 처리 기록이며 소비자의 새 출처 계약이 아니다. 쓰기 의도를 먼저 저장하고, 공식 편집 뒤 receipt/실제 readback을 기록한 후 인계 표지를 갱신한다. pending이 있거나 표지/digest/사슬/문서가 맞지 않으면 인계를 차단한다. v1.1 reader는 함께 전달한 기존 원장의 pending과 각 교정 기록을 확인한다. 원장이 없거나 이력과 다르면 거부하며 원장만 보고 인계를 허용하지 않는다.

관측하지 못한 수동 편집, 구조 변경, 유실된 receipt는 stale/pending-reconcile이다. 현재 값이 after처럼 보인다는 이유로 성공이나 재전송을 추정하지 않는다. 기록된 receipt와 예상 읽기 결과가 모두 있으면 다음 실행이 재전송 없이 부속 게시를 마칠 수 있다. 수동 편집 재대응·손상 원장 복원·전원 장애 durability·임의 동시 편집의 원자 snapshot은 이번 범위가 아니다.

검수 대상은 여전히 생성 revision의 불변 후보다. 교정 뒤 상태는 이력과 범위별 진행 원장으로 읽는다. 원장의 page 범위는 모든 쪽을 처음 미검사로 두며, 후보 0건도 전수 일치가 아니다. 이번 조각은 검수 완료를 발급하지 않는다.

## 독립 리뷰 뒤 검증 경계와 원장 대조

이 검증의 목적은 **우연과 부분 변경의 발견**이다. 문서만 손으로 고친 경우, 이력·원장·문서 중 일부만 바뀐 경우, 사슬이 끊긴 경우, 이력으로 설명되지 않는 차이를 거부한다. 모든 부속 파일과 원장·문서를 의도적으로 일관되게 고쳐 쓴 위조까지 방지하지는 않는다. SHA-256 결합과 receipt JSON의 필드는 서명이나 변조 방지 증명이 아니다. 생성 v1도 같은 비인증 무결성 경계를 갖는다.

교정본 v1.1 인계에는 기존 `correction-ledger.json`도 함께 전달해야 한다. reader는 history.changes와 원장.changes를 순서대로 대조하여 changeId·대상·전후 값·전후 revision뿐 아니라 근거·receipt·검증 결과도 같아야 수락한다. 각 changeId의 submissions 기록과 상태/후 revision, generation/source hash와 진행 scope도 확인한다. 이력에만 있는 중간 revision이나 교정, 원장만 바뀐 값, 원장/제출 기록 부재는 거부한다. 원장은 출처 권위를 대체하는 새 저장소가 아니라 기존 처리 기록과의 교차 검사다. checkpoint로 갱신되므로 원장의 bytes를 complete에 고정하지 않지만 한 번의 읽기 중 원장 bytes가 바뀌면 거부한다. 게시 중 내부 검증은 기록된 pending 한 건만 마지막 고리로 대조할 수 있으며 외부 읽기는 여전히 pending을 거부한다.

인계 때 보호 토큰을 history.after에서 다시 추출하여 complete digest 및 report.evidenceFile digest에 결합된 **생성 PDF 증거**의 해당 check token 전체와 비교한다. 제출 당시의 true/false만 신뢰하지 않는다. 각 고리의 `validation.evidenceRecheck`는 다음 의미이며 소비자가 그대로 표시한다.

| 값 | 의미 |
| --- | --- |
| verified-protected-tokens | 후 값의 숫자·단위·부호를 인계 때 다시 대조함. 문장/수식의 의미 정확성 보증은 아님 |
| not-applicable | 전후 값에 보호 토큰이 없어 토큰 재확인 대상이 아님. 의미 검수 근거로 승격하지 않음 |
| undo-restoration | 역연산으로 과거 값을 복원했으나 그 값은 PDF 보호 토큰과 일치하지 않음. 교정 성공/검수 완료로 취급하지 않음 |

이 표시는 인계 검증기가 다시 계산하여 기록과 대조한다. 구조 교정은 현재 지원하지 않으므로 수락되는 구조 교정 고리를 만들거나 토큰 검증 통과로 표시하지 않는다. 수식에서 보호 토큰이 일치해도 수식 의미 검수는 별도다.
