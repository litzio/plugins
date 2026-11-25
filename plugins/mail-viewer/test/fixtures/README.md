# 시험 표본

`make-fixtures.py`가 만든 지어낸 메일 다섯 통입니다(`python make-fixtures.py`). 사람·주소는 예시 도메인(`example.com` 등)이고 글은 모두 지어낸 것이며 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode)으로 씁니다. 만드는 스크립트는 저장소의 MIT 라이선스를 따릅니다.

| 파일 | 담은 경우 |
| --- | --- |
| `ko-utf8.eml` | 두 낱말로 나뉜 UTF-8 base64 제목, 인코딩된 이름의 받는 사람 다섯, 참조, base64 본문, `>` 인용 줄 |
| `ko-euckr.eml` | `ks_c_5601-1987`(EUC-KR) Q 제목과 이름, quoted-printable 본문(부드러운 줄바꿈), 한국 시간이 아닌 날짜 |
| `html-only.eml` | HTML 본문만. 스크립트, 스타일, 원격 그림, 링크, 목록 |
| `attachments.eml` | mixed → related → alternative 중첩, 본문 그림(`cid:`), RFC 2231 한글 이름의 PDF, 인코딩된 낱말 한글 이름의 엑셀 |
| `not-mail.eml` | 메일이 아닌 글자 파일 |

줄바꿈은 메일 원래대로 CRLF이며 `.gitattributes`로 그대로 둡니다.
