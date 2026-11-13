---
name: docling-convert
description: PDF 변환 접수와 상태 확인 및 오프라인 결과 인계
---
서버 주소는 플러그인 설정에서 정한다. 기본값은 pdf-en-v2다. defaults에서 옵션 정의를 읽고 허용된 조정만 overrides로 전달한다. 고정 항목은 변경하지 않는다.
화면에서 PDF 경로, 확인한 쪽 수, 새 결과의 부모 폴더를 입력해 접수한다. 공개 convert는 write 작업이므로 비서의 read 호출로 시작할 수 없다. 사용자가 화면에서 시작하거나 외부 CLI operation invoke로 명시적으로 실행한다. files 배열은 source/pages를 가진 항목들을 순서대로 처리한다.
공개 job 읽기로 전체 작업과 task_id, 상태, 결과 위치를 확인한다. complete만 완전 성공이다. incomplete/failed/uncertain/stopped는 성공으로 전달하지 않는다. 실패를 숨기려고 프로필을 낮추거나 자동 재제출하지 않는다. ID 없는 제출 실패는 uncertain이다. 기다리기 중단은 서버 취소가 아니다. recover로 후보 기록의 task ID를 조회할 수 있다. Host 재시작 후 메모리 대기열은 복원되지 않는다.
