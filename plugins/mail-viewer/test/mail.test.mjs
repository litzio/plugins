import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readMail } from "../mail.mjs";

const fixture = name => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const people = list => list.map(p => `${p.name} <${p.address}>`);

test("Korean UTF-8: encoded subject and names, base64 body, quoted lines kept", async () => {
  const mail = await readMail(fixture("ko-utf8.eml"));
  assert.equal(mail.subject, "다음 주 회의 자료 안내");
  assert.deepEqual(people(mail.from), ["이영희 <younghee@example.com>"]);
  assert.deepEqual(people(mail.to), ["김민수 <minsu@example.com>", "박지훈 <jihoon@example.com>", "최수진 <sujin@example.com>", "정하늘 <haneul@example.com>", "강도윤 <doyun@example.com>"]);
  assert.deepEqual(people(mail.cc), ["Team <team@example.org>"]);
  assert.deepEqual(mail.date, { text: "2026-11-25 14:30", original: null });
  assert.equal(mail.body.from, "plain");
  assert.match(mail.body.text, /^김민수 님께,\n\n다음 주 회의 자료를 보내 드립니다\.\n/);
  assert.match(mail.body.text, /\n> 지난번 메일에서 물으신 일정은\n> 11월 28일 오후 2시입니다\.\n/);
  assert.deepEqual(mail.attachments, []);
  assert.deepEqual(mail.problems, []);
});

test("Korean EUC-KR (ks_c_5601-1987): Q subject, quoted-printable soft breaks, other time zone in KST", async () => {
  const mail = await readMail(fixture("ko-euckr.eml"));
  assert.equal(mail.subject, "견적서 검토 결과");
  assert.deepEqual(people(mail.from), ["홍길동 <gildong@example.com>"]);
  assert.deepEqual(people(mail.to), [" <sales@example.com>"]);
  assert.deepEqual(mail.date, { text: "2026-11-25 10:05", original: "Mon, 24 Nov 2026 20:05:00 -0500" });
  assert.equal(mail.body.text, "안녕하세요.\n견적서 검토 결과를 알려 드립니다. 이 줄은 일부러 길게 써서 quoted-printable의 부드러운 줄바꿈이 들어가도록 합니다.\n\n홍길동");
  assert.deepEqual(mail.problems, []);
});

test("HTML only: text keeps paragraphs, list and link target; scripts, styles and remote pictures are gone", async () => {
  const mail = await readMail(fixture("html-only.eml"));
  assert.equal(mail.body.from, "html");
  assert.equal(mail.body.text, "Dear customer,\n\nYour order has shipped.\nIt should arrive soon.\n\n• Item one\n• Item two & three\n\nTrack it here (https://shop.example.com/track?id=42).\n\nThanks,\nExample Shop");
  assert.doesNotMatch(mail.body.text, /<|alert|document\.write|steal|color:red|tracker\.example\.net|Ignored/);
  assert.deepEqual(mail.date, { text: "2026-11-19 18:00", original: "Wed, 19 Nov 2026 09:00:00 +0000" });
});

test("Attachments: plain text chosen over HTML, Korean file names, inline picture marked", async () => {
  const mail = await readMail(fixture("attachments.eml"));
  assert.equal(mail.body.from, "plain");
  assert.equal(mail.body.text, "Please see the two files attached.\nThe chart is below.");
  assert.deepEqual(mail.attachments, [
    { name: "(이름 없음)", kind: "본문 그림", size: 70 },
    { name: "검토 의견서.pdf", kind: "PDF", size: 2026 },
    { name: "예산표.xlsx", kind: "XLSX 파일", size: 504 },
  ]);
  assert.deepEqual(mail.problems, []);
});

test("A file that is not a mail is refused with one sentence", async () => {
  await assert.rejects(readMail(fixture("not-mail.eml")), { message: "메일 형식이 아닙니다." });
});
