# NIST SP 1108r4 보관 자료

Gopstein et al. (2021), *NIST Framework and Roadmap for Smart Grid Interoperability Standards, Release 4.0*. [원문 PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1108r4.pdf), DOI: 10.6028/NIST.SP.1108r4.

- `source.pdf`: 전체 보고서 PDF 28~38쪽(인쇄 12~22쪽), 총 11쪽 발췌본. 이번 작업에서 바꾸지 않았다.
- `converted/document.json`: 권장 프로필로 다시 변환한 DoclingDocument. 쪽·그림 이미지는 embedded로 저장해 서버 없이 읽는다.
- `converted/conversion-record.json`: 실제 서버/package 버전, 프로필·보낸 옵션, API 상태·오류·UTC 시각·시간·쪽 수와 hash.
- `SHA256SUMS`: 목록 자신을 제외한 파일의 SHA-256과 폴더 기준 상대 경로.

2026-11-13에 docling-serve 1.38.2-cu128, [pdf-en-v2](../../contracts/docling-convert/pdf-en-v2.json)로 다시 변환했다. schema는 1.10.0이다. 실제 실행 정보는 conversion-record.json을 따른다. 기대 구조가 없는 표본이므로 LSR처럼 채점하지 않는다. 원문과의 시각 대조·관찰은 [변환 근거](../../contracts/docling-convert/experiments.md)에 기록한다. 성공은 내용 정확도 보증이 아니다. 이후 실험은 이 결과를 재사용하며 서버/프로필을 바꿀 때만 재변환한다.

## 라이선스와 출처 고지

미국 정부 NIST 직원 저작물로 미국 내 저작권 보호 대상이 아니다. NIST 자료를 저장소 MIT로 재라이선스하지 않는다. 제3자 자료에는 별도 권리가 적용될 수 있다. 기존 발췌본 외 제3자 원문이나 별도 자료를 추가하지 않는다. [NIST 이용 정책](https://www.nist.gov/nist-research-library/nist-publications#copyright-use-and-licensing).

Republished courtesy of the National Institute of Standards and Technology.
Reprinted courtesy of the National Institute of Standards and Technology, U.S. Department of Commerce. Not copyrightable in the United States.

- `nist-sp1108r4/converted`: 11쪽, 11.277초, task/result success, errors=[].
