"""Writes the made-up .eml samples in this folder. Run: python make-fixtures.py"""
import base64, quopri, pathlib, textwrap

here = pathlib.Path(__file__).parent

def b64(data):
    return "\r\n".join(textwrap.wrap(base64.b64encode(data).decode(), 76))

def word(text, charset="utf-8", enc="B"):
    data = text.encode(charset)
    if enc == "B":
        return f"=?{charset}?B?{base64.b64encode(data).decode()}?="
    q = "".join(chr(c) if (48 <= c <= 57 or 65 <= c <= 90 or 97 <= c <= 122) else ("_" if c == 32 else f"={c:02X}") for c in data)
    return f"=?{charset}?Q?{q}?="

def write(name, text):
    (here / name).write_bytes(text.replace("\n", "\r\n").encode("ascii"))

# 1. Korean UTF-8: base64 body, subject split over two encoded words, five recipients.
body = "김민수 님께,\n\n다음 주 회의 자료를 보내 드립니다.\n자세한 내용은 https://example.com/meeting 에서 볼 수 있습니다.\n\n> 지난번 메일에서 물으신 일정은\n> 11월 28일 오후 2시입니다.\n\n감사합니다.\n이영희 드림\n"
to = ", ".join(f"{word(n)} <{a}@example.com>" for n, a in [("김민수", "minsu"), ("박지훈", "jihoon"), ("최수진", "sujin"), ("정하늘", "haneul"), ("강도윤", "doyun")])
write("ko-utf8.eml", f"""From: {word("이영희")} <younghee@example.com>
To: {to}
Cc: Team <team@example.org>
Subject: {word("다음 주 회의 자료 ")}
 {word("안내")}
Date: Tue, 25 Nov 2026 14:30:00 +0900
Message-ID: <ko-utf8@example.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: base64

{b64(body.encode("utf-8"))}
""")

# 2. Korean EUC-KR (ks_c_5601-1987 label): quoted-printable body, Q-encoded subject, another time zone.
body = "안녕하세요.\n견적서 검토 결과를 알려 드립니다. 이 줄은 일부러 길게 써서 quoted-printable의 부드러운 줄바꿈이 들어가도록 합니다.\n\n홍길동\n"
qp = quopri.encodestring(body.encode("euc-kr").replace(b"\n", b"\r\n")).decode("ascii")
write("ko-euckr.eml", f"""From: {word("홍길동", "ks_c_5601-1987")} <gildong@example.com>
To: sales@example.com
Subject: {word("견적서 검토 결과", "ks_c_5601-1987", "Q")}
Date: Mon, 24 Nov 2026 20:05:00 -0500
MIME-Version: 1.0
Content-Type: text/plain; charset="ks_c_5601-1987"
Content-Transfer-Encoding: quoted-printable

{qp.replace(chr(13), "")}""")

# 3. HTML only, with a script, a style, a remote picture and a link.
html = """<html><head><title>Ignored</title><style>p{color:red}</style>
<script>alert("hello")</script></head><body>
<p>Dear customer,</p>
<p>Your order has <b>shipped</b>.<br>It should arrive soon.</p>
<img src="https://tracker.example.net/pixel.gif" width="1" height="1">
<ul><li>Item one</li><li>Item two &amp; three</li></ul>
<p>Track it <a href="https://shop.example.com/track?id=42">here</a>.</p>
<script type="text/javascript">document.write("x")</script>
<p onclick="steal()">Thanks,<br>Example Shop</p>
</body></html>
"""
write("html-only.eml", f"""From: Example Shop <shop@example.com>
To: customer@example.com
Subject: Your order has shipped
Date: Wed, 19 Nov 2026 09:00:00 +0000
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

{quopri.encodestring(html.encode("utf-8")).decode("ascii")}""")

# 4. Two attachments with Korean names (RFC 2231 and encoded word) and one inline picture.
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
pdf = b"%PDF-1.4\n% made-up sample\n" + b"0" * 2000
xlsx = b"PK\x03\x04" + b"\x00" * 500
from urllib.parse import quote
write("attachments.eml", f"""From: Jane Doe <jane@example.com>
To: John Roe <john@example.com>
Subject: Files for review
Date: Thu, 20 Nov 2026 16:45:00 +0900
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="outer"

This is a multi-part message in MIME format.

--outer
Content-Type: multipart/related; boundary="rel"

--rel
Content-Type: multipart/alternative; boundary="alt"

--alt
Content-Type: text/plain; charset=utf-8

Please see the two files attached.
The chart is below.

--alt
Content-Type: text/html; charset=utf-8

<p>Please see the two files attached.</p><img src="cid:chart@example.com">

--alt--

--rel
Content-Type: image/png
Content-ID: <chart@example.com>
Content-Disposition: inline
Content-Transfer-Encoding: base64

{b64(png)}
--rel--

--outer
Content-Type: application/pdf
Content-Disposition: attachment;
 filename*=utf-8''{quote("검토 의견서.pdf")}
Content-Transfer-Encoding: base64

{b64(pdf)}
--outer
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;
 name="{word("예산표.xlsx")}"
Content-Disposition: attachment
Content-Transfer-Encoding: base64

{b64(xlsx)}
--outer--
""")

# 5. Not a mail: a plain note saved with the .eml extension.
(here / "not-mail.eml").write_bytes("이 파일은 메일이 아닙니다.\n그냥 메모입니다.\n".encode("utf-8"))
