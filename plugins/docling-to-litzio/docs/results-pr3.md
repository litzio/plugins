# PR 3 — 문제 탐지와 독립 PDF 증거 (2026-11-13)

설치·비서·화면·교정 없이 생성 v1의 실제 native read-model/대응/고정 원본 PDF를 읽었다. 라이브 AI·변환 서버·Docker·설치된 앱/daemon을 사용하지 않았다. 생성/소비/그림 bytes 검증은 이전의 공개 소스 production CLI 빌드로 실행했다. 원본은 변경하지 않았고 임시 산출물은 보존했다.

검사 44개(단위·PDF/portable/corpus/격리 CLI 포함)를 통과했다. 기본 실행에서 corpus/CLI가 없으면 해당 검사는 skip되며 통과로 세지 않는다.

## 파일과 실행

- 생성 v1 묶음 → `node src/review.js GENERATION NEW_REVIEW_DIRECTORY`
- 인계 재검증 → `node src/review.js --read GENERATION REVIEW_DIRECTORY`
- 결과는 review-targets.json / pdf-evidence.json / review-complete.json. 모두 schemaVersion 1.0.0. [소비 계약](../../../../contracts/docling-to-litzio/review-targets.md)을 따른다.
- 자체 Node worker에서 PDF.js를 읽고 종료한다. upstream stdout 진단은 stderr로 보내 JSON stdout을 오염시키지 않는다. 표준 ESM trial은 Node 24에서 toHex 부재로 실패해 polyfill이 포함된 legacy ESM을 사용했다.

## 라이브러리·재현

pdfjs-dist 6.5.438를 소스로 묶었다. Apache-2.0 원문(2–4절), 포함된 core-js 3.51.0 MIT 원문, CMaps Adobe BSD-style 원문을 읽고 보존했다. 별도 상업 사용료/상업 라이선스 조건이 없는 자유로운 배포 조건이다. [고지·고정 hash](../vendor/pdfjs/NOTICE.md)에 파일별 SHA-256과 npm tarball integrity가 있다.

Node 24.22.2에서 npm install 없이 새 임시 디렉터리에 src/schema/vendor만 복사한 독립 프로세스로 13쪽을 읽었다. 선택적 canvas/DOMMatrix/Path2D 경고가 나지만 **텍스트 전용 경로**는 세 표본 모두 성공했다. 렌더링은 제공하지 않으며 그 경고를 렌더링 성공으로 덮지 않는다. 표준 글꼴/Liberation·native canvas·image codec/WASM은 묶지 않았다. getTextContent는 PDF 매핑/내장 metrics를 쓰고 FontFace 렌더링을 끈다. 각 작업이 끝나면 PDF loading task와 Node worker를 종료한다.

## 분량

| 입력 | 쪽 | 원시 후보 | 묶음 | 묶음/쪽 | 같은 패턴 접은 첫 목록 행 | high/medium/low 묶음 |
| --- | --- | --- | --- | --- | --- | --- |
| LSR 북마크 | 13 | 62 | 17 | 1.31 | 11 | 11/5/1 |
| LSR 무북마크 | 13 | 83 | 21 | 1.62 | 12 | 11/9/1 |
| NIST | 11 | 364 | 14 | 1.27 | 8 | 3/8/3 |

| 후보 종류 | LSR 북마크 | 무북마크 | NIST |
| --- | --- | --- | --- |
| 의미 영향 blocking 손실 | 36 | 36 | 14 |
| 글자 층 대조 불가 | 9 | 9 | 330 |
| 모든 수식 필수 검수 | 3 | 3 | 0 |
| 수식 의심 / 본문 혼입 | 1 / 1 | 1 / 1 | 0 / 0 |
| 병합 표 / 반복 병합 값 | 2 / 1 | 2 / 1 | 0 / 0 |
| source 셀 기록 부재(표 단위) | 2 | 2 | 2 |
| caption 읽는 순서 충돌 | 7 | 7 | 3 |
| 제목 근거 낮음 | 0 | 21 | 13 |
| 보호 token 차이 | 0 | 0 | 1 |
| 빈 첫 머리 칸 | 0 | 0 | 1 |

숫자는 실제 오류 개수가 아니다. 같은 수식의 문장 혼입이 수식/본문 오분류 두 근거로 잡힐 수 있고 같은 표의 손실·병합·caption을 한 묶음으로 함께 읽는다. NIST의 330개는 주로 그림 내부 OCR 글자처럼 PDF text layer가 없는 영역이며, 330개가 틀렸다는 뜻이 아니다. 그림 자식 숫자 축의 y 역순을 본문 오류로 잡던 초기 규칙은 제거했다. 알려진 furniture와 정확 일치하는 긴 본문만 확인하고 숫자 쪽 번호 단독은 제외해 초기 `10` 오경보를 없앴다. prose 안의 단어 hyphen도 수치 부호와 구분했다. 최종 규칙은 별도 [기계 측정 결과](detection-results.json)에 기록했다.

표/수식 하나와 연속 1–3쪽을 묶음 기본 단위로 한다. 같은 kind/reason/action 비교 패턴 집합만 series로 접고 대표+전체 구성원을 남긴다. 서로 다른 숫자 오류나 근거를 대표 판단 하나로 승인하지 않는다. 접기는 표시만 줄이며 어떤 후보도 삭제/검수 완료로 바꾸지 않는다.

300쪽 단순 외삽은 이 밀도로 약 392/485/382묶음이다(원인/표·그림 밀도 계층별로 페이지를 나누어 추정해야 함). 첫 목록 행 수를 300쪽에 그대로 곱해 사람 분량으로 주장하지 않는다. 실제 비서 해결률·판단 불가율·검토 시간의 측정이 아직 없다. 원문 전 페이지를 사람에게 확인시키는 절차는 없지만 **장문 사람 부담 합격은 아직 증명하지 않았다**. 후속 비서가 먼저 모든 구성원을 확인하고 사람에게 남길 U/B/H와 최종 요약을 측정해야 한다. 미대응·이미지·저신뢰 항목을 감춘 채 완료하지 않는다.

## 알려진 문제에서 잡은 것·놓친 것

- LSR 11쪽 셋째 수식: 문장 혼입으로 의심과 formula-prose 후보를 냈다. 앞 두 식에는 수식 의심 0건. 근 지수/합 범위의 수학적 의미는 판정하지 않는다. 문장 혼입을 뺀 그럴듯한 오답은 통과할 수 있다는 반례도 고정했다.
- 병합 표 2개: 모두 검수 후보. 원본 범위·반복 값·본문 의미 위험을 유지한다. 0/N/A 등 우연한 값 반복 자체를 일괄 오류로 잡지 않는다.
- 북마크 없는 판: PDF 자체의 outline=absent와 변환 record를 확인해 21개 source heading을 저신뢰로 표시했다. 그중 oracle 수준이 틀린 14개를 포함하지만 21개 모두 틀렸다는 뜻은 아니다. 북마크 판의 16/17 중 나머지 1개 수준 오류는 자동으로 판정하지 못한다.
- 숫자 셀 55/59의 나머지 4개: 원본 셀 기록이 없는 R4/C2–5를 모두 구조 후보로 잡았다. 이 수식 값들은 PDF text layer에도 없어 **독립 숫자 값 비교/복구는 하지 못했다**. 원문 그림 증거를 봐야 한다. 구조 gap은 두 표의 7자리이며, 그중 R7/C4는 oracle에서도 정상 빈 칸이다. 이 정상 빈 칸 1개도 후보에 포함되는 알려진 오경보다. 두 번째 표의 다른 수식 셀 부재도 함께 검수로 남긴다.
- 읽는 순서: LSR 원문 caption이 위인데 native는 뒤 문단인 7개 관계를 잡았다. 이것은 위치/기대 순서 충돌 후보이지 의미 오류 확정이 아니다. 다단 본문·주석·별개 문단 continuation의 논리적 순서를 모두 판정하지 못한다.
- NIST의 보호 token 차이 1건·빈 header·source gaps·caption 3건은 oracle/전수 시각 truth가 없어 미판정 후보다. 임의 정답률을 계산하지 않았다.

## 오류 주입과 정상 대조

고정 native **read-model 사본**에 한 종류씩 주입했다. 실제 디스크 문서를 편집한 뒤 path를 안전하게 재연결하는 시험이 아니다. 변경 revision의 모든 baseline target을 uncertain으로 표시한다. 공식 reader는 stale 생성 묶음/이런 시험용 결과를 현재 인계로 받아들이지 않는다.

| 주입 | 잡힘 | 독립 PDF 대조 | 추가 근거 |
| --- | --- | --- | --- |
| 숫자 0.7→0.8 | 1/1 | 잡음 | source-native-change |
| ≤→< | 1/1 | 잡음 | source-native-change |
| Hz→kHz | 1/1 | 잡음 | source-native-change |
| 두 숫자 셀 교환 | 1/1 | 각 셀 영역으로 잡음 | source-native-change |
| 문단 하나 삭제 | 1/1 | 영역 token 누락/미대응으로 잡음 | source-native-change |
| 알려진 머리글 본문 삽입 | 1/1 | 글자 층 값 비교가 아닌 furniture evidence | furniture-in-body |

추가 반례: source 본문의 picture 오분류, row cell 삭제도 후보를 냈다. source/native 공유 변환 오류만으로 잡혔다고 독립 PDF 탐지로 포장하지 않았다.

사전 정의한 LSR std-matrix의 oracle와 같은 본문 숫자 셀 21개는 전부 비교 가능했고 token 오경보는 **0/21(0%)**였다. 수식의 알려진 정상 두 개 의심은 **0/2**, 바꾸지 않은 native의 furniture 오경보는 0건이다. 반면 source-cell-unavailable은 알려진 정상 빈 칸 1개를 잡는다. 서로 다른 종류/분모를 합쳐 절대 정확도를 만들지 않는다. 전체 후보(특히 NIST/geometry/의미 손실)의 오경보율은 전수 truth가 없어 미측정이다.

## 한계·진행 기록 전달안

비교는 정확한 문자열 token 다중집합이며 숫자 소수점/영점·부호 문자·단위 대소문자를 바꾸지 않는다. 단위 사전은 명시된 SI/표본 단위 일부이며 임의 단위/차원·의미 비교가 아니다. PDF item/문자 비례 bbox는 근사다. 단일 쪽의 명시 셀 bbox만 cell-level 비교하고, 복수 쪽 표/좌표 없는 셀은 정밀 대조 불가다. PDF/Docling이 같은 glyph 매핑 오류를 공유하면 놓친다. 이미지/벡터 영역·font/ligature·회전·다른 언어·실제 수백 쪽은 별도 검증이 필요하다. 예산/시간 측정과 재개·비서·UI·교정/완료 계약은 후속이다.

진행 기록 전달안: PR 3 독립 PDF 텍스트/문제 후보·검수 묶음 계약과 고정 표본 측정 완료. 알려진 수식/병합/저신뢰/셀 부재를 후보로 노출. 숫자 셀 4개는 vector/text 부재라 값 검증 실패를 유지. 정상 빈 칸 오경보 1건 및 장문 사람 부담/전체 오경보율 미측정을 남김. docs/progress.md 자체는 수정하지 않았다.

모든 수식은 의심 유무와 별개로 formula-review-required 후보와 각 수식 scope의 검수 묶음을 가진다. 의심 없는 두 수식도 검수에서 빠지지 않으며, 같은 필수 검수 패턴의 접기는 승인/검토 생략이 아니다.
