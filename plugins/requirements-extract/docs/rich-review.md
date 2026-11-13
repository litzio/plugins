# PR #10 독립 리뷰 수정

기준 head 2185269에서 공개 빌드 CLI로 문서를 생성·읽어 두 실패를 재현했다. 정상 문서 두 개가 각각 limits 표/참조를 가진 경우 XML ID 73개 중 고유 값은 72개였고 공식 XSD가 거부했다. 실제 이미지와 rich 캡션을 공식 create --input/images로 만든 경우 compare의 figure.caption은 배열이 아닌 `{path,text,content,editable}` 객체였으며 reader에서 TypeError가 났다. 새 회귀 검사 3개가 수정 전 실패함을 확인했다.

XHTML anchor는 문서 setId와 로컬 label을 함께 사용한다. 같은 문서의 표 레이블을 우선하며 다른 문서의 로컬 표를 잘못 참조하지 않는다. 전역 요구사항 ID 참조는 그 요구사항의 문서 scope로 연결한다. ReqIF IDENTIFIER·XHTML id·xml:id를 파일 전체에서 내보내기 직전에 전수 검사해 중복이면 duplicate-xml-id 진단과 함께 양 모드에서 차단한다.

ID를 만드는 모든 위치를 점검했다. 현재 본문 div와 표에만 XHTML ID를 만들며 둘 다 scope를 적용한다. 미주/목록은 ID를 만들지 않고, 그림/수식은 PNG/첨부 단계 전 내보내기를 차단한다. 이후 어느 요소가 ID를 만들더라도 전수 검사 대상이다.

그림 캡션 객체의 content를 모델의 caption 배열에 보존하고, 객체의 locator/표시 필드와 새로운 필드를 별도로 대조한다. 그림 위치의 attachment-required 진단으로 반환하며 파일 위치가 있는 결과를 내고 첨부를 내보내지 않는다. 전체 블록의 구조를 먼저 검사하고 예상하지 못한 모양은 projection-shape 진단으로 바꿔 예외가 호출자에게 새지 않게 했다.

fixture는 validation/rich_review.mjs가 실제 CLI 생성→inspect/compare한 JSON을 test/fixtures/review10에 저장한 것이다. 지원을 넓힌 모든 블록·인라인·제목·표 셀/캡션·중첩 목록·미주와 실제 이미지 캡션을 포함한다. 긍정 fixture를 손으로 조립하지 않았다. 모양/중복 오류 검사는 이 실제 출력/모델에 명시적으로 손상을 주는 부정 검사다.

최종 단위 59/59 통과. 추가 5개 검사는 문서별 레이블/로컬 참조, 실제 그림 객체/위치 진단, 직접 모델의 ID 충돌(양 모드), 타 문서 로컬 레이블 오인 참조, 예상 밖 구조의 진단 변환이다. 공개 빌드 CLI 재실행은 XML ID 73/73 유일성과 실제 캡션 보존을 확인했다. 공식 XSD·65개 ReqIF IDENTIFIER/참조·독립 parser 왕복도 통과했다. 설치·ALM·PNG/첨부 포장은 미검증이다. 임시 파일은 보존했고 지속 프로세스는 없다.
