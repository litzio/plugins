# PDF 독립 수식의 로컬 OCR 조사

> **보관 메모(2026-11-18, 통합 담당자):** 조사 작업자의 보고서를 그대로 옮겼다. 측정 코드·입력·가중치·출력 JSON은 보관하지 않았다(재현 절차는 아래 "미확인과 재현"). 비교 그림을 직접 확인한 결과 **LSR (2) 번호 제외의 Pix2Text 출력은 `A_{rms}`를 `A_{ms}`로 읽어 틀렸다.** 따라서 번호 제외 LSR의 완전 일치는 본문의 2/3이 아니라 **1/3**이다. 이 조사는 판단 보류 상태이며, 다음 단계 후보는 Pix2Text와 비서 비전 모델의 비교 시험과 "LaTeX 재렌더 ↔ 원본 그림" 자동 비교로 오류를 잡을 수 있는지 확인하는 것이다.

2026-11-18 · Windows x64 · 공개 합성 LSR 1.1과 추가 합성 수식

## 결론

Windows x64의 Node 24에서 Python과 비전 LLM 없이 이미지에서 LaTeX를 생성했다. 실측한 두 모델 중 **Pix2Text MFR 1.5를 로컬 검수 초안용으로 추천한다.** 기존 LSR 그림에서는 1/3, pdf.js 글자 층에서 수식 번호를 찾아 번호 영역을 제외한 그림에서는 2/3이 맞았다. 두 입력 모두 정상 종료하고 렌더되는 LaTeX를 냈지만 세제곱근을 제곱근으로 바꿨다.

- **규칙과 모델**은 기존 독립 수식 탐지 결과에서 번호를 분리해 원본 번호를 보존한다. 단일 CPU worker에서 본문만 OCR하고 원본 그림과 경고를 유지한다. 미설치·실패·취소 때도 그림으로 가져오기가 끝나도록 한다.
- **비서**는 원본과 LaTeX 재렌더를 대조하고 근호 지수·첨자·부호·소수점·괄호와 번호에서 의심되는 항목을 모은다. 비전 모델에 이미지를 보내는 검수는 문서의 외부 전송이 허용된 연결에서만 쓴다.
- **사람**은 미해결 항목과 중요한 수식을 원본과 함께 확인해 채택한다. 채택 결과는 공식 작성 경로의 MyST 수식 블록으로 반영한다. 수식 블록 작성·번호·참조는 실제 Host에서 검증할 항목이다.

## 후보

SPE와 CPE는 UniMER-Test의 단순 인쇄체와 복잡 인쇄체다. CDM은 재렌더한 문자와 배치의 유사도다. BLEU는 문자열 기반 점수이며 완전 일치율과 다르다. 표의 서로 다른 평가 세트 점수를 직접 순위로 해석하지 않는다. 크기는 십진 MB다. [CDM 논문 표 1–3](https://openaccess.thecvf.com/content/CVPR2025/papers/Wang_Image_Over_Text_Transforming_Formula_Recognition_Evaluation_with_Character_Detection_CVPR_2025_paper.pdf)

| 후보 | JS/Node 경로 | Python 설치 | 코드 / 가중치 | 가중치 | 공개 인쇄체 수치와 CPU 속도 | 업무 적합성 |
| --- | --- | --- | --- | ---: | --- | --- |
| Pix2Text MFR 1.5 | 배포자 ONNX를 Node ORT로 실행 확인. Transformers.js는 전처리·토크나이저에 사용 | 불필요 | MIT / MIT | 119.5 MB. MFR 1.0은 117.6 MB | 1.5의 공개 CPU·인쇄체 수치 미확인. 이 조사에서 직접 측정 | 상업 사용 가능 표기, 로컬 추론, 번호 분리 효과 확인. [코드](https://github.com/breezedeus/Pix2Text) · [1.5 ONNX](https://huggingface.co/breezedeus/pix2text-mfr-1.5/tree/main) · [1.0 ONNX](https://huggingface.co/breezedeus/pix2text-mfr/tree/main) |
| pix2tex / RapidLaTeXOCR | RapidAI ONNX 릴리스의 HF 미러를 Node ORT로 실행 확인 | Node 경로는 불필요. 원본 pix2tex CLI는 필요 | 두 코드 MIT / 실측 ONNX 미러 MIT | 178.9 MB | 원본 pix2tex SPE/CPE CDM 0.962/0.649. Rapid 변환본의 배치 정확도 미확인. Rapid README 단건 479 ms, 하드웨어 미기재 | 상업 사용 가능 표기, 출처·고지 보존. LSR에서 누락·반복 오류. [pix2tex](https://github.com/lukas-blecher/LaTeX-OCR) · [RapidAI](https://github.com/RapidAI/RapidLaTeXOCR) · [HF ONNX](https://huggingface.co/inYourOwnBrowser/rapid-latex-ocr-onnx) |
| Texify | Transformers.js 예제와 `onnx-community/texify-ONNX` 공개 | 불필요 | GPL-3.0 / CC BY-SA 4.0 | FP32 1,252 MB, int8 316 MB | SPE/CPE CDM 0.985/0.704. CPU 정량 미확인 | 상업 사용 가능 표기. 코드 배포와 가중치 재배포 조건 확인 필요. 원 프로젝트 보관 상태. [코드·가중치 조건](https://github.com/VikParuchuri/texify) · [ONNX](https://huggingface.co/onnx-community/texify-ONNX/tree/main/onnx) |
| UniMERNet | 제3자 변환기 공개. 가중치 주소 `Sibitorvex/unimernet-tiny-onnx` 조회는 HTTP 401. ONNX 확보 시 전처리·캐시 디코더를 Node로 옮길 수 있음 | 공식 경로와 ONNX 내보내기에 필요 | Apache-2.0 / Apache-2.0 | 공식 tiny 441 MB, small 773 MB, base 1.3 GB. 변환본 미확인 | UniMERNet SPE/CPE CDM 0.995/0.971. Tiny SPE/CPE BLEU 0.909/0.902는 Texo 프로젝트가 인용한 수치. CPU 정량 미확인 | 공식 가중치 상업 사용 가능 표기. Node용 아티팩트 확보와 검증 필요. [코드](https://github.com/opendatalab/UniMERNet) · [tiny](https://huggingface.co/wanderkid/unimernet_tiny) · [ONNX 변환 프로젝트](https://github.com/torvexlabs/unimernet-onnx) |
| PP-FormulaNet-S | `PaddlePaddle/PP-FormulaNet-S`는 Paddle 파일. ONNX 변환 시도 및 결과 불일치 사례 공개. 검증된 공개 Node 경로 미확인 | 공식 경로에서 필요 | Apache-2.0 / Apache-2.0 | HF 파일 232 MB, 모델 장부 224 MB | PaddleOCR CPU 고성능 모드 254 ms. 내부 세트 영문/중문 BLEU 87.00/45.71 | 상업 사용 가능 표기. 공식 CPU 수치를 JS에 적용할 근거 부족. [모델](https://huggingface.co/PaddlePaddle/PP-FormulaNet-S) · [평가](https://www.paddleocr.ai/v3.4.1/en/version3.x/model_list.html) · [ONNX 이슈](https://github.com/PaddlePaddle/PaddleOCR/issues/15231) |
| Nougat small | Transformers.js용 `Xenova/nougat-small` | 불필요 | MIT / 원 프로젝트 CC BY-NC, HF 원본 카드 CC BY 4.0 표기 | FP32 995 MB, int8 255 MB | Tiny-Doc-Math 문서 단위 수식 CDM 0.833, 완전 시각 일치율 60.86%. CPU 정량 미확인 | 가중치 조건이 상충해 업무 채택 보류. 페이지 단위 모델. [원 프로젝트 조건](https://github.com/facebookresearch/nougat#license) · [HF 원본](https://huggingface.co/facebook/nougat-small) · [ONNX](https://huggingface.co/Xenova/nougat-small/tree/main/onnx) |
| TrOCR printed / 수식 파생 | 일반 인쇄체 `Heliosoph/trocr-base-printed-onnx`. 수식 파생 `Hukyl/trocr-base-rukopys-formula`는 공개 ONNX 미확인 | 일반 ONNX 불필요. 수식 파생 공개 경로는 필요 | Microsoft 코드 MIT / 일반 ONNX MIT, 수식 파생 별도 허가 미확인 | 일반 FP32 ONNX 1,335 MB, 수식 파생 1,336 MB | 일반 문자 OCR과 2차원 수식 구조는 평가 기준이 다름. 이 목적의 인쇄체·CPU 수치 미확인 | 일반 인쇄체 모델은 후보에서 제외. 수식 파생은 배포 조건과 실행 경로가 미확인. [원 프로젝트](https://github.com/microsoft/unilm/tree/master/trocr) · [일반 ONNX](https://huggingface.co/Heliosoph/trocr-base-printed-onnx) · [수식 파생](https://huggingface.co/Hukyl/trocr-base-rukopys-formula) |
| TexTeller | Transformers.js용 `onnx-community/TexTeller-ONNX` | 불필요 | Apache-2.0 / ONNX 카드 Apache-2.0 | FP32 1,252 MB, int8 317 MB | 카드에 복잡 수식·행렬 개선 설명. 해당 ONNX의 인쇄체 정량·CPU ms 미확인 | 상업 사용 가능 표기. 실측 후보보다 파일 크기가 크다. [코드](https://github.com/OleehyO/TexTeller) · [ONNX](https://huggingface.co/onnx-community/TexTeller-ONNX) |
| Texo | `alephpi/FormulaNet`의 ONNX와 Transformers.js 웹 구현 공개. Node 미실측 | JS 경로는 불필요 | AGPL-3.0 / AGPL-3.0 | 인코더와 병합 디코더 80 MB, 20M 파라미터 | ONNX SPE/CPE BLEU 0.840/0.814. 절대 CPU ms 미확인 | 로컬·소형. 상업 활동이 가능하며 MIT 플러그인과 결합·배포할 때 AGPL 의무 확인 필요. [코드](https://github.com/alephpi/Texo) · [ONNX](https://huggingface.co/alephpi/FormulaNet/tree/main/onnx) · [웹 구현](https://github.com/alephpi/Texo-web) |
| PadishahIII LaTeX OCR | `PadishahIIIXXX/latex-ocr` PyTorch 가중치. 공개 ONNX 미확인 | 필요 | MIT / MIT | 269 MB, 67M 파라미터 | 저자 plain 합성 세트 BLEU 0.874, 문자열 일치율 52.2%. CPU 실행 안내, ms 미확인 | 상업 사용 가능 표기. Node 배포용 변환 필요. [코드](https://github.com/PadishahIII/latex-ocr) · [모델·평가](https://huggingface.co/PadishahIIIXXX/latex-ocr) |
| PDFluent Formula Recognition | `PDFluent/formula-recognition-onnx`의 인코더·디코더·사전 공개. Node 포팅 가능, 미실측 | SDK는 필요. 직접 ONNX 추론은 불필요 | SDK 상업 조건 별도 / 공개 ONNX AGPL-3.0 | 36.6 MB | 전체 PDF 벤치마크 0.9168. 단일 수식 정확도와 CPU ms 미확인 | 로컬·소형. AGPL 또는 별도 계약 조건 확인 필요. [모델](https://huggingface.co/PDFluent/formula-recognition-onnx) |
| Mathpix OCR API | JS HTTP 클라이언트 | 불필요 | 서비스 약관 / 비공개 가중치 | 해당 없음 | SPE/CPE CDM 0.973/0.967. 서버 CPU 시간 미확인 | **문서를 외부로 보냄.** 기본 후보에서 제외. [API](https://mathpix.com/ocr) |

## 리치오 설치 계약과 Windows 재현

GitHub 설치는 대상 폴더의 잠금 파일로 앱 내장 npm을 실행하며 lifecycle 스크립트와 선택 의존성을 생략한다. 플러그인 백엔드는 Host가 시작하는 trusted Node 하위 프로세스다. Node 24.22.2, npm 11.14.1, Windows x64에서 깨끗한 시험 폴더마다 `npm ci --ignore-scripts --omit=optional`을 실행해 확인했다. [공개 실행 계약](https://github.com/litzio/litzio/blob/master/docs/design/plugin-stage1-v1.md) · [공개 PR #1770](https://github.com/litzio/litzio/pull/1770) · [npm ci](https://docs.npmjs.com/cli/npm-ci/)

| 조합 | 제한 설치 뒤 실행 결과 |
| --- | --- |
| `onnxruntime-node@1.24.3` 단독 | import, 세션 생성, CPU 추론 성공. 잠금 파일에 설치 스크립트 표시가 있어도 Windows CPU 바이너리는 npm 패키지에 포함돼 있다. 단독 221.7 MB |
| `sharp@0.34.5` 기본 의존성 | npm 설치 성공. `@img/sharp-win32-x64`가 빠져 import 실패 |
| `@huggingface/transformers@3.8.1` 기본 의존성 | npm 설치 성공. `sharp`에서 import 실패 |
| Transformers.js와 sharp + `@img/sharp-win32-x64@0.34.5` 일반 의존성 | 별도 잠금 파일에서 바이너리가 non-optional로 유지됨. PNG 생성·읽기와 Pix2Text 전체 추론 성공. 내장 ORT 1.21.0, 설치 391.6 MB |
| `@napi-rs/canvas@1.1.1` + `@napi-rs/canvas-win32-x64-msvc@1.1.1` 일반 의존성 | PNG 출력과 pdf.js 렌더 성공. ORT 1.24.3을 포함한 최소 Rapid 실행 의존성 260.7 MB |

명시한 바이너리 두 종류는 Windows x64용이다. 같은 잠금 파일을 macOS·Linux·ARM에 배포하는 경로는 미확인이다. 실험 버전의 npm 감사는 `sharp`의 네이티브 의존성과 ORT 1.24.3 경로의 `adm-zip`을 포함해 high를 보고했다. 배포판의 의존성 버전과 플랫폼 지원은 별도로 확인해야 한다. 감사 결과(조사 폴더에만 있었음)

가중치는 플러그인 Git 트리와 digest 대상인 Host 설치본 밖에 둔다. 첫 준비 때 허용된 환경에서 HF의 고정 리비전을 받고 모델 파일 해시를 대조하는 경로가 가능하다. 회사망에서 HF가 막히면 승인된 사내 미러나 전달 묶음으로 준비한 모델 폴더를 설정에서 고른다. 이 조사에서는 다운받은 파일로만 추론했고 문서나 PNG의 외부 전송이 없었다. Pix2Text는 `allowRemoteModels=false`를 지정했다. [설치본 digest 계약](https://github.com/litzio/litzio/blob/master/docs/design/plugin-stage1-v1.md) · [Transformers.js 환경 옵션](https://huggingface.co/docs/transformers.js/api/env)

## 실측 방법

- LSR 1.1은 CC0 공개 합성 표본이다. PDF SHA-256은 `63cda884de96dfd0357843a534895f1beb7a10b24f3244398d930817a32b82ea`다. 기존 `extract`와 `convert`로 T-09 영역 세 개를 찾고 화면과 동일한 pdf.js 6.5.438, 배율 2.5, 크롭 좌표 이동을 적용했다. PNG는 1,093×163, 1,093×120, 1,068×161 px다. Node 캔버스로 렌더해 브라우저와의 PNG 바이트 동일성은 미확인이다. 정답은 기존 `canonical.latex`를 썼다. [화면 크롭 코드](../screen.jsx) · [공개 정답](../test/fixtures/standards.json) · 입력 목록·좌표(조사 폴더에만 있었음)
- 부가 실험은 같은 PNG에서 pdf.js가 읽은 번호의 왼쪽 10pt까지만 남겼다. 입력 해상도는 유지했다. 세 수식 본문은 PDF 벡터 경로로 그려져 글자 층만으로 복원할 수 없다. 번호는 글자 층에서 찾을 수 있었다.
- MathJax SVG로 분수·첨자·합·행렬·그리스 문자 5개를 만들었다. 출력 역시 MathJax display 수식으로 그려 원본·정답과 눈으로 대조했다. 문자열 완전 일치와 시각상 기호·구조 일치를 따로 채점했다. [LSR 대조](assets/formula-ocr/compare-lsr.png) · [합성 수식 대조](assets/formula-ocr/compare-synthetic.png)
- Ryzen 5 5600X의 CPU만 사용했다. 모델마다 세션을 재사용해 메인 스레드와 단일 worker에서 각각 순차 3회 실행했다. ORT intra-op 2, inter-op 1을 지정했다. 시간에는 PNG 읽기·전처리·추론·디코딩이 들어간다. CPU 시간은 프로세스 user+system 변화량으로 여러 코어가 합산된다. 최대 RSS는 OS가 집계한 프로세스 수치다.
- Rapid는 공개 Python의 처리 순서를 Node로 옮겼다. 이미지 보간은 캔버스를 썼고 greedy 디코딩 상한은 512 토큰이다. Pix2Text는 공개 설정의 DeiT 프로세서로 384×384 이미지를 처리하고 두 ONNX를 greedy로 연결했다. 실험에서 상한을 128 토큰으로 정했고 디코드 후 외곽 공백만 제거했다. Python 원 구현과 출력 동등성은 확인하지 않았다. Rapid 실행 코드(조사 폴더에만 있었음) · Pix2Text 실행 코드(조사 폴더에만 있었음) · 측정 코드(조사 폴더에만 있었음)

### 속도와 설치 크기

수식당 시간은 기본 입력 8개×3회 중앙값이다. 첫 결과는 런타임 import·로컬 모델 초기화부터 첫 LSR 전체 입력 결과까지다. 다운로드 포함 값은 별도 측정한 실제 다운로드와 첫 실행을 합산했다. npm 설치와 입력 PNG 렌더는 제외했다.

| 항목 | Rapid 메인 / worker | Pix2Text MFR 1.5 메인 / worker |
| --- | ---: | ---: |
| 가중치·모델 설정 | 179.0 MB | 119.7 MB |
| HF 파일 다운로드 | 15.90초 | 6.26초 |
| 로컬 모델 초기화 | 1.27 / 1.21초 | 0.56 / 0.50초 |
| 첫 결과, 다운로드 제외 | 34.40 / 36.23초, 한도 도달 | 1.20 / 1.09초 |
| 첫 결과, 다운로드 포함 합산 | 50.30 / 52.13초, 한도 도달 | 7.46 / 7.35초 |
| 기본 표본 경과 시간 중앙값 | 361 / 362 ms | 525 / 520 ms |
| 기본 표본 CPU 시간 중앙값 | 719 / 758 ms | 1,094 / 1,102 ms |
| 프로세스 최대 RSS | 458 / 462 MiB | 388 / 402 MiB |
| 50 ms 타이머 최대 호출 간격 | 454 / 92 ms | 259 / 63 ms |
| 실행 의존성 및 가중치 합계 | 약 440 MB | 약 511 MB |

실행 의존성 크기는 측정 도구·PDF 렌더용 의존성을 뺀 값이다. 다운로드는 이번 네트워크에서 한 차례 잰 값이다. HF 모델 리비전과 Rapid 파일 해시는 아래 기록에 있다. Pix2Text의 ONNX 두 파일은 받은 크기와 SHA-256을 HF LFS 메타데이터와 대조했다. Rapid의 공식 릴리스 네 파일 크기는 미러와 일치했고 공식 파일 해시 일치는 확인하지 않았다. Rapid 다운로드 기록(조사 폴더에만 있었음) · Rapid 리비전(조사 폴더에만 있었음) · Pix2Text 리비전(조사 폴더에만 있었음)

리치오의 3초 health 기준과 수식 하나를 끝내는 데 걸리는 시간은 별개다. Rapid의 첫 기본 입력은 32초 넘게 걸렸으나, 두 후보 모두 격리 Node의 타이머 공백은 3초 미만이었다. Pix2Text worker는 메인 타이머 최장 공백을 259 ms에서 63 ms로 줄였고 최대 RSS는 약 15 MiB 늘었다. 단일 worker, CPU 스레드 제한, 작업 시간·토큰 상한과 취소를 권한다. 실제 Host health RPC와 파일 여러 개의 작업 경쟁은 미실측이다. 네이티브 오류 격리나 프로세스 종료에 따른 메모리 회수가 필요할 때 별도 프로세스를 비교한다.

### 수식별 결과

경과/CPU 시간은 메인 스레드 3회의 중앙값이다. 동일 모델·입력의 출력 LaTeX는 세 번 같았다. 아래 링크에 출력 전문이 있다. Rapid 메인(조사 폴더에만 있었음) · Rapid worker(조사 폴더에만 있었음) · Pix2Text 메인(조사 폴더에만 있었음) · Pix2Text worker(조사 폴더에만 있었음)

| 입력 | Rapid 경과 / CPU ms | Rapid 결과 | Pix2Text 경과 / CPU ms | Pix2Text 결과 |
| --- | ---: | --- | ---: | --- |
| LSR (1) 전체 | 32,309 / 63,484 | 합 하한의 `=2` 누락, 공백 명령과 글자 반복, 512 토큰까지 EOS 없음 | 685 / 1,375 | 기호·구조 일치. `\displaystyle`, 중괄호·공백 차이 |
| LSR (2) 전체 | 3,580 / 7,172 | % 자리에 문자 추가, 끝에 무관한 숫자, 렌더 실패 | 1,296 / 2,687 | 본체 구조 유지. `100%`가 굵어지고 뒤에 `⟨2⟩` 추가 |
| LSR (3) 전체 | 690 / 1,329 | 세제곱근의 `[3]` 누락 | 523 / 1,094 | 세제곱근의 `[3]` 누락 |
| 합성 분수 | 188 / 407 | 재렌더 일치. 중괄호 차이 | 448 / 938 | `\cfrac` 여백 차이, 분자·분모 일치 |
| 합성 첨자 | 158 / 375 | 재렌더 일치. 중괄호 차이 | 475 / 985 | 재렌더 일치. 공백·중괄호 차이 |
| 합성 합 | 360 / 672 | 재렌더 일치. 중괄호 차이 | 527 / 1,094 | 재렌더 일치. 공백·중괄호 차이 |
| 합성 행렬 | 502 / 954 | 값·괄호 일치. `array` 열 정렬 차이 | 651 / 1,328 | 값·괄호 일치. 끝의 줄 바꿈 명령과 레이아웃 차이 |
| 합성 그리스 문자 | 126 / 281 | LaTeX 문자열 그대로 일치 | 351 / 766 | 재렌더 일치. 공백 차이 |
| LSR (1) 번호 제외 | 416 / 845 | 편미분 기호 추가, 분모와 첨자 오인 | 683 / 1,391 | 기호·구조 일치. 음수 간격 명령 추가 |
| LSR (2) 번호 제외 | 681 / 1,313 | `100%`가 `100^{99}`로 바뀜 | 850 / 1,719 | 기호·구조 일치. 공백과 중괄호 차이 |
| LSR (3) 번호 제외 | 305 / 608 | `[3]` 누락 | 523 / 1,172 | `[3]` 누락 |

기본 8개에서 문자열 완전 일치는 Rapid 1/8, Pix2Text 0/8이다. 기호와 수학 구조는 Rapid 5/8, Pix2Text 6/8이 맞았다. 이 집계는 동치 표기·여백·행렬 열 정렬 차이를 허용한다. 번호 제외 LSR만 세면 Rapid 0/3, Pix2Text 2/3이다. 합성 표본 수치이며 실제 문서군의 정확도로 환산할 수 없다. T-10의 표 셀 수식과 P-04의 기호 설명은 영역·읽기 순서가 다른 사례로 미실측이다. [사례집](../cases.md)

## 대안 비교

| 경로 | 정확도와 적용 범위 | 비용·설치 부담 | 문서 외부 전송 |
| --- | --- | --- | --- |
| pdf.js 글리프·위치 | 유효한 문자 매핑과 위치가 있으면 첨자·기호 후보를 복원할 수 있다. 벡터 경로만 있는 LSR에서는 번호 분리에 사용했다. 분수·행렬의 2차원 구조를 해석하려면 별도 규칙이 필요하다. | 기존 pdf.js 재사용. 추가 모델 비용 없음. 문서군별 규칙 검증 필요 | 없음 |
| Pix2Text 로컬 OCR | 벡터·래스터 수식을 처리한다. LSR 번호 분리 뒤 개선됐고 근호 지수는 여전히 빠졌다. | 기본 표본 경과 중앙값 0.52초. Win x64 실행 의존성과 모델 약 511 MB | 모델 다운로드만 원격 사용 가능. 로컬 추론에서 문서 전송 없음 |
| 비서의 비전 모델 | 문맥과 원본·재렌더를 함께 검수할 수 있다. 기호를 잘못 읽거나 추가할 수 있다. 이번 표본에서는 미실측 | 클라우드는 호출당 비용. 로컬은 모델 설치와 메모리 필요 | 클라우드에는 입력 영역 전송. 로컬·승인된 내부 연결의 전송 범위는 구성에 따름 |

## 미확인과 재현

실제 GitHub 설치형 Host에서 내장 npm·Electron Node로의 호환, 가중치 폴더 권한과 다운로드 실패 복구, MyST 수식 작성·번호·참조, 느린 CPU와 동시 작업의 3초 health, 다른 OS 및 일반 문서 정확도는 미확인이다. 다른 후보는 문헌 조사 범위다.

시험 폴더에서 `npm ci --ignore-scripts --omit=optional`과 `npm --prefix sharp-probe ci --ignore-scripts --omit=optional`로 설치를 재현할 수 있다. 가중치를 둔 뒤 `node prepare.mjs prepare`로 입력을 만들고 `node bench.mjs`, `node bench.mjs --worker`, `node bench.mjs --pix`, `node bench.mjs --pix --worker`를 각각 실행한다. `node compare.mjs`로 시각 비교를 만든다. 조사 파일·가중치·의존성은 시험 폴더에 보존했다. 시작한 조사 프로세스는 모두 종료됐다.

