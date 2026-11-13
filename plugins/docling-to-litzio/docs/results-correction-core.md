# PR 4-가 교정 처리 검증 결과

공개 리치오 master `b6c6f0f6c7adb665625a1cd19cfe85ebf6517c2f`를 새 격리 checkout에서 frozen install 후 CLI/Editor production build했다. 공개 plugin-stage1-v1/document-support-v1 안내, CLI help와 SDK의 공개 validateManifest/compileSchema/validatePluginSource만 사용했다. 플랫폼 내부 구현에 의존하지 않는다.

## 구현

- material: 같은 generation의 현재 공식 inspect 블록·셀, 원본 Docling 조각/인접 항목, PDF items/token/좌표, 생성·현재 revision을 읽는다.
- correction-submit: strict 입력 schema, revision/before·대상·근거 범위 검사, 단일 공식 apply-batch, 공식 inspect readback과 독립 PDF token 재대조, 이력·역연산·범위별 원장 저장.
- correction-undo: 마지막 변경 이후 revision과 대상 후 값이 같을 때만 반대 연산. 파일 전체 복원 없음.
- correction-reconcile: 기록된 receipt/관측 결과가 모두 있으면 부속 게시만 재개. 응답 유실·부분 receipt는 pending-reconcile이며 재전송 없음.
- review-progress/checkpoint/stop/resume: 묶음과 모든 PDF page를 처음 미검사로 두고 checkpoint·중단·재개를 기록. 편집 뒤 영향 범위를 좁혀 입증하지 않으므로 다른 범위 전체를 미검사로 무효화한다. 후보 없음은 전체 일치가 아니다.

교정본 인계 v1.1은 소유자 승인으로 추가했다. 생성 대응/snapshot/create receipt/손실/검수 후보는 바꾸지 않는다. 교정 이력 한 파일과 complete 1.1.0을 추가하며 현재 snapshot과 이력의 정확한 투영 일치를 검증한다. 생성 v1.0.0과 그 엄격한 원본 보존 검사는 그대로다. 계약 문서의 소비자 검증 순서를 따른다.

## 실행한 검사

기본 `node --test plugins/docling-to-litzio/test/*.test.js`: **58 통과, 8 명시 skip**. 플랫폼 없이 가짜 편집기로 교정/실패/응답 유실/불완전 receipt/중복/역연산/손 편집 거부/재개/재서명된 거짓 이력 거부를 검사했다. 이때도 고정 공개 PDF의 실제 text layer를 사용한다.

격리 CLI와 세 고정 표본 corpus를 지정한 전체 검사: **66 통과, skip 0**. CLI 없는 가짜 편집기를 실제 공식 apply-batch/inspect로 대체해 동일 시나리오를 실행했다. 이후 부속 게시 중단→재조정과 재서명된 사슬/현재 값/검증 결과 손상 검사 두 건도 실제 CLI에서 별도로 통과했다. 세 원본 표본의 기존 생성/검수 결과는 113/113/407블록, 15/19/9묶음으로 유지됐다.

실제 격리 Host에 artifact 복사→validate/install/settings→공개 operation invoke를 실행했다. material 읽기와 review-progress가 성공했고, 변환 사본의 `999`를 원본 PDF의 `0.12 s`로 고치는 correction-submit이 applied/Host success receipt를 반환했다. 이어 material 재호출에서 새 revision과 이력 1건을 확인했다. 이 시험의 변환 사본만 오류를 주입했고 fixtures와 PDF는 수정하지 않았다. 공개 쓰기 작업은 CLI 호출이며 비서 내부 read tool에 쓰기를 숨기지 않는다.

기존 requirements-extract의 코드는 읽기만 확인했다. vendored handoff-complete schema는 schemaVersion=1.0.0 const이므로 새 1.1.0은 handoff-schema로 거부한다. 기존 source-native/receipt 검사를 느슨하게 만들어 조용히 수락시키지 않았다. 실제 소비자 실행은 하지 않았다.

## 한계

실제 AI 호출·AI 교정 품질·새 화면·비서 스킬 전달·최종 reviewed/검수 완료·장문 성능·이미지 전용 교정 근거 수락은 검증하지 않았다. 스킬 본문은 문서 초안이며 manifest에 등록하지 않았다. 평문 문단/셀·수식 LaTeX 외 구조/서식 편집은 거부한다. 수식 token 일치를 의미 정확성으로 판정하지 않는다. token 없는 영역은 교정하지 않고 uncertain으로 남긴다.

pending은 새 제출/인계를 막는다. receipt가 없는 채 문서만 바뀌면 현재 값이 예상과 같아도 자동 완료하지 않는다. 원장 손상/유실, 관측하지 못한 수동 편집 재대응, 여러 Host 동시 사용, 실제 OS 강제 종료·전원 장애 durability는 수락하지 않았다. 파일 잠금은 충돌을 거부하며 죽은 PID의 lock만 다시 잡는다. 잠금 자체가 잘린 경우 추정 복구하지 않는다. 검수 완료 발급은 아직 없고 모든 결과의 reviewComplete는 false다.

직접 시작한 격리 Host와 하위 프로세스를 종료했고 사용한 포트에 listener가 없음을 확인했다. 임시 출력은 보존했다. 설치된 리치오·사용자 daemon/자료·Docling 서버·Docker는 건드리지 않았고 재변환하지 않았다. docs/progress.md와 다른 플러그인은 수정하지 않았다.
