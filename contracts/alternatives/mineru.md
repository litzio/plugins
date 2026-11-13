# MinerU 한정 표본 시험: 실행하지 못함

2026-11-13. 판정: **Docling 유지 — 비교 미실행**. 품질 열등 판정이 아니다. [사전 기준](mineru-criteria.md)은 변환 전에 커밋했다. a~g 모두 미검증이므로 전환을 권할 근거가 없다. [기계 판독 요약](mineru-summary.json)은 고정 Docling 결과를 기존 채점기로 다시 측정한 값과 MinerU null을 구분한다.

## 실행을 막은 조건

`docker inspect mineru-api`에서 `8000/tcp`의 HostIp가 빈 문자열이고 HostPort가 8000이다. 서버 명령도 `--host 0.0.0.0 --port 8000`이다. 이는 loopback 전용 publish가 아니다. 시작은 127.0.0.1 전용 제약과 충돌하고 재생성·설정 변경도 금지되어 **docker start를 실행하지 않았다**. 호스트 방화벽의 제한 효과를 추정해 시작하지 않았다. 추가 승인을 요청하거나 변경 우회를 하지 않았다.

컨테이너는 시작 전후 exited. Docling도 시작하지 않았다. 다른 컨테이너·이미지·volume 변경, 다운로드·빌드·새 컨테이너·외부 AI 호출·리치오 접근은 없다. 직접 시작한 장기 프로세스는 없다. 임시 증거는 보존했으며 위치는 최종 인계에만 제공한다.

## 정지 상태에서 확인한 것

- 기존 패키지를 `docker cp`로 임시 폴더에 복사해 version.py에서 **3.4.5** 확인. 실행 버전 endpoint 확인과는 구분한다.
- 컨테이너 생성일은 2026-08-19, 마지막 종료 로그는 2026-09-02. '두 달 전'은 마지막 사용 시점에 가깝고 생성일 기준 약 3개월이다.
- GPU all, mount 없음, restart=no, GPU memory utilization 인자 0.5, MINERU_MODEL_SOURCE=local.
- 이미지 inspect Size=12,993,745,956 bytes. 전달받은 약 43GB와 다르며 저장 방식별 디스크 점유를 이 숫자와 혼동하지 않는다.
- history에 `pip install -U mineru[core]>=3.4.0`와 `mineru-models-download -s huggingface -m all`가 있다. vLLM 0.21.0 기반 라벨이다. 로컬 조립 이미지와 부합하지만 누가 빌드했는지, 공식 registry에서 동일 이미지를 받을 수 있는지는 확정하지 못했다. 태그 latest는 버전 고정이 아니다.
- 복사한 공개 MinerU 패키지의 fast_api.py에 POST /file_parse, POST /tasks, GET /tasks/{task_id}, GET /tasks/{task_id}/result, GET /health가 있다. Markdown·middle JSON·model output·content list·images 반환 옵션이 있다. **라이브 OpenAPI와 도움말은 미확인**.
- pipeline 소스는 parse_method=auto에서 PDF 분류로 OCR 여부를 선택하고 ocr에서 강제 활성화한다. 그 외는 OCR false다. 실제 디지털 PDF 글자 층의 사용·수치 보존과 backend별 동작은 실행 검증하지 않았다. VLM 모델 존재·사용 가능성·추론 GPU 메모리는 미확인이다. build-time 다운로드 이력만으로 오프라인 성공을 주장하지 않는다.

## 같은 잣대의 비교

고정 권장 Docling 결과를 재채점했다. 기존 score_lsr.py와 판정 규칙은 수정하지 않았다. 기존 단위 검사 4개 통과. 숫자 후보는 audit_pdf_numbers.py로 재측정했으며 각 쪽 수치는 summary에 있다.

| 항목 | Docling 북마크 / 무북마크 | MinerU |
| --- | --- | --- |
| 표 셀 내용 | 135/139 / 135/139 | 미측정 |
| 숫자 셀 | 55/59 / 55/59 | 미측정 |
| 수식 검출 / literal | 3/3, 1/3 (양 판 동일) | 미측정 |
| 제목 계층 | 16/17 / 3/17 | 미측정 |
| furniture | 65/65 / 65/65 | 미측정 |
| 숫자 missing / extra 후보 | 1/19 (양 판 동일) | 미측정 |
| 최종 고정 변환 시간 | 20.331초 / 18.437초 | 미측정 |
| NIST 11쪽 시간 | 11.277초 | 미측정 |

Docling 수식 11쪽 세 번째의 근 지수·합 범위 실패는 기존 experiments.md의 관찰을 인용한 것이며 이번에 시각 재검사하지 않았다. MinerU의 세 수식, 표 병합·머리행·쪽 넘김·위첨자·주석, 재현성·시간·크기·GPU는 전부 미측정이다. 입력 3개 모두 MinerU 변환 횟수 0이다.

## 원문 대응과 문서화

실제 MinerU 결과가 없어 plan.md 3~4절과 design.md 5절에 필요한 다음 정보를 **채울 수 있는지 확인하지 못했다**: 블록·표 셀·목록·수식·그림·캡션의 안정 참조, 쪽·bbox·쪽 크기·원점·단위·회전, 다중 쪽 대응, 제외 furniture의 원문, 인용·텍스트, 머리행·단위·주석 문맥, 캡션 관계. 이것은 MinerU가 정보를 제공하지 않는다는 뜻이 아니다. 원본 hash와 생성 ID는 소비자가 만들 수 있지만 세부 원문 대응의 대체 증거가 아니다.

Markdown/HTML 재해석이 필요한 범위와 구조 JSON 직접 대응 범위, 북마크 활용 여부·PDF 북마크 별도 보완의 단순성도 미확인이다. 출력 스키마·좌표를 추측하는 실험 어댑터는 만들지 않았고 tools README도 변경하지 않았다. 재개 시 실제 출력으로 어댑터와 검증을 작성해야 하며 이번 PR은 비교 실험 완료 PR이 아니다.

## 라이선스·설치와 버전 차이

[3.4.5 LICENSE](https://github.com/opendatalab/MinerU/blob/mineru-3.4.5-released/LICENSE.md)는 Apache 2.0에 추가 조건이 있다. 상업 사용은 허용하되 계열사 합산 MAU 1억 초과 또는 월 매출 USD 2천만 초과 시 별도 상업 라이선스가 필요하고, 제3자 온라인 서비스에는 사용 표시 의무가 있다. HTTP 호출만 한다고 서버 측 조건이 사라진다고 단정할 수 없다. 실제 사용자 해당 여부·법률 결론은 판단하지 않는다. **동봉 모델별 이름·revision·라이선스는 미확인**이어서 기준 g는 충족 판정을 못 한다.

[공식 Docker 설치 안내](https://github.com/opendatalab/MinerU/blob/master/docs/en/quick_start/docker_deployment.md)는 NVIDIA Linux/Windows WSL2와 Dockerfile 빌드 방식을 안내한다. 현재 안내는 4.x이므로 기존 3.4.5에 그대로 적용하지 않는다. [모델 준비 안내](https://github.com/opendatalab/MinerU/blob/master/docs/en/usage/model_source.md)의 사전 준비·검증 후 오프라인 실행 방식은 설치 검토 근거이며 이 PC나 프록시 뒤 WSL Engine에서 실증하지 않았다. 이미지 복사만으로 모델 완전성·드라이버 호환을 보장하지 않는다. 필요한 실제 GPU 메모리는 미측정이다.

확인 시 [최신 릴리스](https://github.com/opendatalab/MinerU/releases)는 4.2.1(11월 11일)이다. 디지털 PDF native text 복원 시 360도 근처 방향 오차로 본문이 빠지는 문제 수정은 이 비교 목적에 영향을 줄 수 있다. 4.x Docker 안내는 새로운 CLI/API·모델 검증 체계를 설명하므로 API·모델 준비 조건도 달라질 수 있다. 이번 결과를 최신 버전 품질로 일반화할 수 없고 전체 중간 릴리스 변경의 전수 분석은 하지 않았다. 최신 이미지·모델은 받지 않았다.

## 한계와 진행 기록 인계안

예정 표본은 13쪽 합성 문서 하나의 북마크 두 판과 11쪽 공개 발췌 하나이며 실제 MinerU 실행은 0건이다. 스캔본·수백 쪽·실제 문서·리치오 화면은 미시험이다. 기존 버전과 최신 버전의 품질 비교도 없다. docs/progress.md는 요청대로 수정하지 않았다. 인계할 기록: 'MinerU 한정 시험은 기존 컨테이너의 all-interface 포트 공개와 loopback 전용/설정 변경 금지 조건 충돌로 미실행. 사전 기준 a~g 미검증으로 Docling 유지. Docker 상태 변경 없음. 재개는 소유자가 별도로 정함.'
