# 출처 근거의 보관과 참조

생산자 인계 v1.3을 바꾸지 않는 소비자 자기 자료 형식이다. 새 요구사항 문서에서는 trace의 길이·버전과 관계없이 이 경로 하나를 사용한다. 기존 inline trace 문서는 계속 읽지만 새 쓰기는 inline JSON을 넣지 않는다.

문서와 같은 디렉터리의 `.requirements-traces/<id>.json`이 전체 trace를 가진다. 파일은 정확히 `{schemaVersion:"1.0.0",trace:<원래 trace 객체>}`다. bytes는 객체 키를 ECMAScript 문자열 sort로 모든 깊이에서 정렬하고 배열 순서를 유지한 JSON.stringify 결과의 UTF-8이다. BOM·끝 개행·Unicode 정규화가 없고 revision도 제외하지 않는다. id는 이 **원문 bytes**의 소문자 SHA-256 hex 64자다. 같은 ID 파일이 있으면 원문 Buffer가 같을 때만 재사용한다. 기존 파일의 UTF-8 replacement decoding으로 같다고 판단하지 않는다.

traceRef는 닫힌 객체 `{kind:"requirements-extract/trace/1",id:<64 hex>,digest:"sha256:"+id}`다. ID로 파일 이름을 결정하므로 경로를 입력받지 않는다. sourceCli의 허용 root·링크 거부를 그대로 거치며 읽는 파일은 일반 파일이어야 한다.

문서 출처 표는 기존 열 뒤에 trace, nativeLocation(있는 경우), traceRef 순서로 더한다. trace에는 사람이 읽는 요약, traceRef에는 위 객체의 compact JSON을 넣는다. 같은 표의 trace 없는 행은 trace="", traceRef=null이다. 읽기는 callback으로 참조를 풀고 원문 bytes digest·ID·닫힌 record·요약 일치를 검증한 뒤 원래 trace만 모델에 복원한다. traceRef를 본문 의미나 confirmedDigest에 추가하지 않으므로 저장 전후 요구사항 의미는 같다. resolver가 없거나 참조가 깨지면 오류 진단이며 모델 전용 내보내기도 거부한다. 읽기 마지막에 캡처한 파일 bytes를 재대조한다.

요약은 `출처 완료 조건 충족` 또는 `미검수 출처`, `대상 N개`, `기계 전용 <쉼표 구분 쪽 또는 없음>`, `규칙 승인 없음` 또는 `대표 규칙 승인: <중복 제거한 규칙 이름>; human 비인증 선언`을 ` · `로 잇는다. 규칙 이름은 merged-cell-repeated=병합 값 반복, compound-header-flattened=복합 머리 합침, table-header-role=머리 역할 평문 표현이다. 승인 순서를 유지하며 unknown ID는 그대로 쓴다. 요약은 전체 확인·업무 승인을 주장하지 않는다.

ReqIF SourceReferences의 trace 있는 항목은 `{summary,traceRef}`만 내보낸다. summary는 sourceKey, elementRef, selector, 위 요약을 ` · `로 이은 값이다. trace 없는 native 출처는 기존 짧은 출처 형식을 유지한다. trace는 모든 버전에 같은 참조 경로를 쓴다. 전체 trace 파일을 ReqIF에 넣지 않고 소비자 자료에 보관한다. 공개 내보내기 작업은 참조를 저장·해결·검증하고 연결 기준 문서도 다시 읽는다. STRING 상한 65,535는 그대로이며 넘으면 자르지 않고 실패한다. 모델 전용 exportReqif는 이미 읽은 snapshot으로 XML을 만드는 함수이며 파일 검증은 공개 처리기·sourceCli의 책임이다.

**지금 하지 않는 것: 근거 파일을 ReqIF와 함께 묶어 내보내기 / 다시 볼 조건: 받는 쪽 도구에서 전체 근거가 실제로 필요해질 때.** ReqIF 파일만으로는 전체 출처 근거가 따라가지 않는다. 문서·인계·`.requirements-traces` 자료를 함께 보존한다.

LSR의 문맥 출처 17개가 389,256자가 된 이유는 같은 표의 손실·규칙 승인·대표 열람·검증 자료를 각 셀 출처 trace에 반복 포함하기 때문이다. 이번에는 그 중복 구조를 고치지 않는다.
