# PR1 실행 기록

2026-11-13. 공개 Litzio checkout `8f41d0da6ad3cfe06299dfa04b39d1dcd6bea386`의 문서·CLI·공개 plugin-sdk export만 사용했다. 내부 Core 구현을 읽지 않았다. 소스 CLI 실행으로 임시 합성 자료만 다뤘으며 설치된 앱·daemon·사용자 자료·Docker·AI는 사용하지 않았다. 직접 시작한 지속 프로세스는 없다.

## 공개 수단 선행 확인

- 설계 4절 예제의 H1·레이블 H2·속성 표·본문·출처 표·빈 연결 표는 공식 inspect admission에 성공했다.
- inspect JSON은 target 레이블·heading level·표 셀의 `[block,row,column]`·본문 평문·revision을 제공한다. 인라인 서식은 생략한다.
- `compare <file> <file> --json`은 `before.blocks`에 문단 인라인 content와 표 셀 의미를 제공한다. receipt revision을 inspect 및 재읽기와 대조한다. 정규식 native parser나 내부 AST를 사용하지 않는다.
- 공개 plugin-sdk의 `documentAuthoringSchema.toJSONSchema()`를 호출해 입력을 확인했다. authoring은 heading/paragraph/table 등을 받지만 target label 필드가 없다. `create --input` 뒤 insert-target의 revision 조건 배치로 레이블을 추가한다. 기존 파일 생성 거부도 실제 확인했다.
- native 문서 2개·6항목 생성/check/손 수정/문서 간 이동/재읽기/ReqIF와 format→format byte 동일성을 확인했다. 숫자·단위·부등호·범위·한글·특수 문자·상위/관련 연결·본문 표를 포함한다. 본문 strong 손 편집도 읽기와 XHTML 내보내기에서 확인했다.

## 표준·라이선스

공식 OMG ReqIF 1.2가 지정하는 20110401 reqif.xsd와 XHTML driver 전이 의존 21개를 공식 URL에서 받아 SHA-256 고정 캐시로 검증했다. 이 스키마의 REQ-IF-VERSION 고정값은 **1.0**이다. 표준 릴리스명 1.2와 파일 필드 값을 구분한다.

XSD, IDENTIFIER 65개 유일성, 모든 `*-REF` 참조, 독립 Python reqif 0.0.47 parse→unparse→parse 및 객체/속성/XHTML/관계/Specification 의미 동등성 통과. 처음 헤더를 1.2로 써 XSD가 거부했고 1.0으로 수정한 뒤 재생성 결과로 재검증했다.

OMG 스키마 원문에서 이 저장소에 재배포할 명확한 허가를 확인하지 못해 원본은 커밋하지 않는다. 다운로드 캐시와 고정 URL/해시 목록만 제공한다. W3C 의존 스키마 고지는 내려받은 원문에 보존한다. setup은 네트워크 필요, verify는 no_network resolver와 해시 검사를 사용한다.

xmlbuilder2 4.0.3·oozcitak 전이 패키지·js-yaml은 MIT, argparse는 Python-2.0이다. 설치한 패키지의 전체 LICENSE를 THIRD-PARTY-NOTICES에 보존했다. 전이 버전/integrity는 npm lock에 고정했다. Node ESM esbuild 번들 생성 성공(약 771 KiB, 비압축). Host 로드 시험은 아니다. Apache-2.0 reqif는 검증 전용이며 제품에 포함하지 않는다. Python 버전 목록은 validation/requirements.txt에 고정했다.

기본 esbuild ESM 산출물은 전이 CommonJS 의존성의 `require("url")` 때문에 직접 실행에 실패했다. Node `createRequire(import.meta.url)` banner를 넣은 ESM 번들은 6개 객체 내보내기까지 통과했다. 실제 Host bundler가 이 Node 호환 처리를 제공하는지는 후속 설치 때 확인해야 한다. 현재 처리 모듈은 npm 의존성을 그대로 사용하는 Node ESM으로 실행한다. strong과 특수 문자가 있는 별도 XHTML 출력도 XSD·독립 왕복에 통과했다.

StrictDoc 0.30.4는 pip dry-run에서 pandas/plotly/selenium 및 서버·브라우저 관련 다수 의존성과 reqif 0.1.0 교체가 필요했다. 가벼운 검사 범위를 넘으므로 설치·가져오기를 실행하지 않았다. Polarion도 미실행이다. XSD/독립 파서 성공은 ALM 수락을 뜻하지 않는다.

## 범위·후속

23개 Node 단위 검사, 별도 native 통합 흐름, 별도 표준 검사 통과. 자동 탐지·출처 어댑터·PDF 사슬·AI·설치·Host 파일 권한·화면·ALM·200쪽 부하는 미검증이다. 표본의 confirmed는 합성 시험용 확정 상태이며 코드가 실제 사용자 승인을 추정하지 않는다.

수준·강도는 설계 표의 가정을 유지한다. 생성기에는 평문 문단·표를 넣고 사람 편집 문단의 제한된 서식은 공개 compare로 읽는다. 목록 읽기·검토 메모는 PR1에서 오류로 보류하며 조용히 버리지 않는다. 임시 원본·작업 파일·패키지·스키마 캐시는 보존했다(위치는 공개 기록에 쓰지 않음).

새 플랫폼 차단은 발견하지 않았다. 공개 compare가 richer read 요구를 충족한다. SDK Host 파일 범위·비서 작업 등록·안전한 기존 문서 적용·원문 이동·PNG 렌더링은 기존 설계대로 후속 미확인이다. 진행 기록에는 PR1 처리 코드/23개 단위 검사/격리 CLI·표준 검사 완료, StrictDoc·Polarion·화면·실제 출처 미확인으로 옮긴다.
