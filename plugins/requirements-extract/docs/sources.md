# 설계 근거와 확인 범위

2026-11-13에 읽은 자료다. 공개 표준·라이브러리·도구 안내는 웹으로 확인했다. 아래 링크는 공개 자료에만 향한다. 역사적 기록의 실행 결과를 이번 설계의 검증 결과로 주장하지 않는다.

## 저장소와 제품 계약

이 저장소의 `AGENTS.md`, `README.md`, `docs/progress.md`, `contracts/README.md`, `fixtures/lsr-1.1/README.md`, `fixtures/nist-sp1108r4/README.md`를 읽었다. LSR은 CC0 합성 자료이며 작성자 구조 기대값이 요구사항 도출 정답은 아니다.

공개 Litzio 문서는 master `4e7db394855dfbb5af806d9425f746a32c87d0c6` 기준으로 읽었다. 내부 소스는 읽지 않았다.

| 자료 | 설계에 적용한 내용 |
| --- | --- |
| [목적](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/purpose.md), [AGENTS.md](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/AGENTS.md) | 문서 중심·근거 연결·코드로 열린 문제 좁히기, 공식 의미·쓰기 경계 |
| [ADR-0022](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/adr/0022-plugin-screen-code.md), [화면 계약](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/design/plugin-screens-v1.md) | React·ui·invoke·saveDocument, 외부 라이브러리 사전 번들, 새 문서만 배타적 생성, 기존 문서 수정 미지원 |
| [ADR-0006](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/adr/0006-native-document-boundary.md), [네이티브 문서 지원](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/design/document-support-v1.md) | 허용 frontmatter·일반 블록·표 셀 제한·canonical 왕복. 임의 requirement 지시문 제외 |
| [레이블·참조](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/design/section-references-v1.md) | 제목 앞 `(label)=`, 같은 문서 참조, 문서 간 identity와 구별 |
| [README의 CLI·개발 실행·HTTP 절](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/README.md#cli개발-실행http) | check·inspect JSON·revision 조건·dry-run·공식 쓰기. 이번에는 실행하지 않음 |
| [#347 댓글](https://github.com/litzio/litzio/issues/347) | 조사안과 소유자 결정을 구별. ID·Requirement 우선·삭제 금지·기준 자료·self_ref·표준 우선 결정 |
| [Discussion #766](https://github.com/litzio/litzio/discussions/766), [#739](https://github.com/litzio/litzio/discussions/739) | GraphQL로 본문·댓글 조회. 원문/교정/대응표의 분리, 공통 문서 의미·실제 필요에 따른 전문 기능 |

## 스파이크: 가능성과 한계의 기록

- [2026-11-11 색인](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/spikes/2026-11-11-requirements-traceability.md).
- 원격 heads/tags 조회로 `spike/requirements-traceability`, `spike/2026-11-11-requirements-traceability`를 확인했다. 태그의 peeled commit은 `24e7e95b22be40a2a3672e451540cab79243ff6c`다.
- 그 commit의 [요구사항 추적 보고서](https://github.com/litzio/litzio/blob/24e7e95b22be40a2a3672e451540cab79243ff6c/docs/reviews/requirements-traceability-spike-2026-11.md)를 git show로 읽었다. Core 전용 블록·최상위 문장 hash·평문·한 단계 추적의 실험이며 현재 플러그인의 공개 API가 아니다. 코드·표본 원문을 가져오지 않았다.
- [2026-11-01 AI 제안 색인](https://github.com/litzio/litzio/blob/4e7db394855dfbb5af806d9425f746a32c87d0c6/docs/spikes/2026-11-01-ai-agent-proposal.md): 제안 분리·입력 revision 변경 거부의 참고. 현재 채택된 API로 간주하지 않는다.

## 표준·검증 도구·라이브러리

| ID | 공개 원문·확인한 부분 | 설계 판정과 한계 |
| --- | --- | --- |
| S1 | [OMG ReqIF 1.2](https://www.omg.org/spec/ReqIF/1.2), [PDF](https://www.omg.org/spec/ReqIF/1.2/PDF), [공식 XSD](https://www.omg.org/spec/ReqIF/20110401/reqif.xsd). 특히 §10.8.20, §10.8.32, §10.8.37–44 | 항목·유형·속성·관계·계층·XHTML 대응의 규범 근거. 실제 스키마 검증은 후속 구현에서 실행 |
| S2 | [prostep ivip Implementation Guideline v1.10, 2024-01-26](https://www.prostep.org/fileadmin/prod-download/ProSTEP_iViP_ImplementationGuide_ReqIF_V1-10_aw.pdf), §2.1–2.8, §2.13, §2.16, §2.19–2.23 | 비규범 상호 운용 권고. 이름 관례·UTF-8·첨부·식별자 안정성·보수적 본문·누락 처리의 근거. 본문을 복제하지 않음 |
| S3 | [Siemens 21 R1의 ReqIF 매핑 안내](https://blogs.sw.siemens.com/polarion/polarion-alm-21-r1-whats-new-and-noteworthy/), [2404 Import ReqIF IDs to Polarion Custom Fields](https://blogs.sw.siemens.com/polarion/polarion-alm-2404-whats-new-and-noteworthy/) | 유형·필드 매핑과 내부 SpecObject/Specification ID 보존 기능을 확인. 대상 버전·실제 갱신·삭제 동작은 미확인 |
| S3a | [Siemens Administrator and User Help의 ReqIF 진입점](https://docs.sw.siemens.com/en-US/doc/230235217/PL20231017526942799.polarion_help_sc.xid1465510/xid1489529) | 공식 2404 안내의 링크를 열었으나 본문이 제공되지 않아 세부 가져오기 절차를 검증하지 못함. 설계의 수락 절차는 실행 계획이며 해당 버전 매뉴얼을 읽었다는 뜻이 아님 |
| S4 | [strictdoc-project/reqif README](https://github.com/strictdoc-project/reqif/blob/main/README.md), [패키지·라이선스 선언](https://github.com/strictdoc-project/reqif/blob/main/pyproject.toml) | Python parser/writer/passthrough와 Apache-2.0 확인. 독립 검사 후보로 채택, 제품 런타임 포함은 제외. 정확한 배포 버전·의존성 고지는 후속 고정 |
| S5 | [xmlbuilder2 MIT 라이선스](https://github.com/oozcitak/xmlbuilder2/blob/master/LICENSE.txt) | Node XML builder 후보. MIT 고지를 포함해 사전 번들 가능하다고 판단. ReqIF 의미를 대신 제공하는 라이브러리는 아님. 실제 번들·버전·전이 라이선스는 미확인 |

## 이번 작업의 검증 경계

문서만 작성했다. 링크·문서 간 결정 일관성·변경 범위·민감 정보·공백 오류를 검사한다. 실제 AI 호출, 변환, Docker 조작, SDK 실행, native 예시의 admission, XSD 실행, 라이브러리 설치, Polarion 가져오기, 화면 검증은 수행하지 않았다. 제품 clone은 문서와 git 객체를 읽는 용도로만 사용했고 수정하지 않았다.
