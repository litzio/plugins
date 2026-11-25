// Writes sample.docx: a small synthetic Word document with one case of each rule.
// Run with Node 24: node test/fixtures/make-sample.mjs. The text is made up (CC0).
import { writeFileSync } from "node:fs";
import { crc32, deflateRawSync, deflateSync } from "node:zlib";

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" mc:Ignorable="wps"';
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const t = (s, rPr = "") => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(s)}</w:t></w:r>`;
const p = (body, pPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${body}</w:p>`;
const style = s => `<w:pStyle w:val="${s}"/>`;
const mark = (id, name) => `<w:bookmarkStart w:id="${id}" w:name="${name}"/>`;
const markEnd = id => `<w:bookmarkEnd w:id="${id}"/>`;
const field = (code, result) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${esc(code)} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${result}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const tab = "<w:r><w:tab/></w:r>";
const picture = (rid, id, alt, cx, cy) => `<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const cell = (content, tcPr = "") => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>${tcPr}</w:tcPr>${content}</w:tc>`;

const body = [
  // Table of contents: not moved; its numbers check the computed heading numbers.
  p(t("목차"), style("TOCHeading")),
  p(`<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${t("1.")}${tab}${t("개요")}${tab}${field("PAGEREF _Toc001 \\h", t("1"))}`, style("TOC1")),
  p(`${t("1.1")}${tab}${t("범위")}${tab}${field("PAGEREF _Toc002 \\h", t("1"))}`, style("TOC2")),
  p(`${t("2.")}${tab}${t("그림")}${tab}${field("PAGEREF _Toc003 \\h", t("2"))}<w:r><w:fldChar w:fldCharType="end"/></w:r>`, style("TOC1")),
  p(`${mark(1, "_Toc001")}${t("개요")}${markEnd(1)}`, style("Heading1")),
  p(`${t("이 문단에는 ")}${t("굵은 글자", "<w:b/>")}${t("와 ")}${t("기울인 글자", "<w:i/>")}${t(", 위첨자 x")}${t("2", '<w:vertAlign w:val="superscript"/>')}${t("와 아래첨자 H")}${t("2", '<w:vertAlign w:val="subscript"/>')}${t("O, ")}${t("밑줄", '<w:u w:val="single"/>')}${t("이 있다.")}${tab}${t("탭 뒤 글자.")}<w:r><w:br/></w:r>${t("줄바꿈 뒤 글자.")}`),
  p(t("문단 전체가 굵은 경고 문장이다.", "<w:b/>")),
  p(`${mark(2, "_Toc002")}${mark(3, "_RefScope")}${t("범위")}${markEnd(3)}${markEnd(2)}`, style("Heading2")),
  p(t("세부 범위"), style("Heading3")),
  p(t("첫째 단계 항목"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
  p(t("둘째 단계 첫 항목"), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr>'),
  p(t("둘째 단계 둘째 항목"), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr>'),
  p(t("첫째 단계 다음 항목"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
  // An empty numbered paragraph with a hidden mark: Word hides it but counts its number (1.2).
  p("", '<w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr><w:outlineLvl w:val="1"/><w:rPr><w:vanish/></w:rPr>'),
  p(t("표"), style("Heading2")),
  p(`${mark(4, "_RefTable")}${t("Table ")}${field("SEQ Table \\* ARABIC", t("1"))}${markEnd(4)}${t(" – 합성 표")}`, style("Caption")),
  `<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>` +
    `<w:tr>${cell(p(t("항목")))}${cell(p(t("값과 설명")), '<w:gridSpan w:val="2"/>')}</w:tr>` +
    `<w:tr>${cell(p(t("전압")), '<w:vMerge w:val="restart"/>')}${cell(p(t("12 V")))}${cell(p(t("첫 문단")) + p(t("둘째 문단")))}</w:tr>` +
    `<w:tr>${cell(p(""), "<w:vMerge/>")}${cell(p(t("24 V")))}${cell(p(t("한 문단")))}</w:tr></w:tbl>`,
  `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr>` +
    cell(p(t("NOTE 2 —", "<w:b/>"))) + cell(p(t("합성 참고의 ") + t("강조 글자", "<w:i/>") +
      `<w:hyperlink r:id="rIdLink">${t("와 안내 링크")}</w:hyperlink>`)) + "</w:tr></w:tbl>",
  p(`${mark(5, "_Toc003")}${t("그림")}${markEnd(5)}`, style("Heading1")),
  p(picture("rIdPng", 1, "막대 그림", 1905000, 952500)),
  p(`${mark(6, "_RefFigure")}${t("Figure ")}${field("SEQ Figure \\* ARABIC", t("1"))}${markEnd(6)}${t(" – PNG 그림")}`, style("Caption")),
  p(picture("rIdEmf", 2, "도형 그림", 1905000, 952500)),
  p(`${t("Figure ")}${field("SEQ Figure \\* ARABIC", t("2"))}${t(" – EMF 그림, ")}${field("REF _RefTable \\h", t("Table 1"))}${t(" 참고")}`, style("Caption")),
  p(`${t("참조: ")}${field("REF _RefScope \\r \\h", t("1.1"))}${t(" 절, ")}${field("REF _RefTable \\h", t("Table 1"))}${t(", ")}<w:fldSimple w:instr=" REF _RefFigure \\h ">${t("Figure 1")}</w:fldSimple>${t(", 없는 대상 ")}${field("REF _RefNowhere \\h", t("Clause 9"))}${t(", 바깥 ")}<w:hyperlink r:id="rIdLink">${t("주소")}</w:hyperlink>${t(".")}`),
  p(`${t("수식: ")}<m:oMath><m:r><m:t>a</m:t></m:r><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>+b=0</m:t></m:r></m:oMath>`),
  p(`${t("글상자 앞 글자.")}<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="1905000" cy="381000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapTopAndBottom/><wp:docPr id="3" name="Text Box 3"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="381000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr><wps:txbx><w:txbxContent>${p(t("글상자 안의 문장."))}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>${p(t("글상자 안의 문장."))}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`),
  // REF fields inside a heading and a caption stay their result text.
  p(`${t("부록 ")}${field("REF _RefScope \\r \\h", t("1.1"))}${t(" 참고")}`, style("Heading1")),
  p(t("끝 문단.")),
  // The header and the footer's page number come back on every page; they are not moved.
  '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>',
].join("");

const heading = (id, name, lvl) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:numPr><w:numId w:val="1"/></w:numPr><w:outlineLvl w:val="${lvl}"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults>` +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  heading("Heading1", "heading 1", 0) + heading("Heading2", "heading 2", 1) + heading("Heading3", "heading 3", 2) +
  '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:pPr><w:numPr><w:numId w:val="0"/></w:numPr><w:outlineLvl w:val="9"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/></w:style></w:styles>';
const lvl = (i, fmt, text, extra = "") => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/>${extra}</w:lvl>`;
const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS}>` +
  `<w:abstractNum w:abstractNumId="0">${lvl(0, "decimal", "%1.", '<w:pStyle w:val="Heading1"/>')}${lvl(1, "decimal", "%1.%2", '<w:pStyle w:val="Heading2"/>')}${lvl(2, "decimal", "%1.%2.%3", '<w:pStyle w:val="Heading3"/>')}</w:abstractNum>` +
  `<w:abstractNum w:abstractNumId="1">${lvl(0, "decimal", "%1.")}${lvl(1, "lowerLetter", "%2)")}</w:abstractNum>` +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`;
const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${p(t("합성 표본 머리글"))}</w:hdr>`;
const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${p(t("쪽 ") + field("PAGE", t("1")), '<w:jc w:val="center"/>')}</w:ftr>`;
const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
  '<Relationship Id="rIdPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>' +
  '<Relationship Id="rIdEmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.emf"/>' +
  '<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
  '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
  '<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>';
const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="png" ContentType="image/png"/><Default Extension="emf" ContentType="image/x-emf"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
  '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>합성 표본 문서</dc:title></cp:coreProperties>`;

// A 120×60 PNG: two colour bands.
function png(width, height) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * 3 + 1) + 1 + x * 3;
    raw.set(x < width / 2 ? [0x3b, 0x6e, 0xc9] : [0xe8, 0xa1, 0x3c], at);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// A 200×100 EMF: a filled rectangle and an ellipse.
function emf() {
  const records = [];
  const rec = (type, values) => {
    const b = Buffer.alloc(8 + values.length * 4);
    b.writeUInt32LE(type, 0); b.writeUInt32LE(b.length, 4);
    values.forEach((v, i) => b.writeInt32LE(v, 8 + i * 4));
    records.push(b);
  };
  rec(39, [1, 0, 0xc96e3b, 0]); // CREATEBRUSHINDIRECT
  rec(37, [1]); // SELECTOBJECT
  rec(43, [10, 10, 190, 90]); // RECTANGLE
  rec(39, [2, 0, 0x3ca1e8, 0]);
  rec(37, [2]);
  rec(42, [60, 20, 140, 80]); // ELLIPSE
  rec(14, [0, 16, 20]); // EOF
  const header = Buffer.alloc(88);
  const total = 88 + records.reduce((n, r) => n + r.length, 0);
  header.writeUInt32LE(1, 0); header.writeUInt32LE(88, 4);
  [0, 0, 199, 99, 0, 0, 6250, 3125].forEach((v, i) => header.writeInt32LE(v, 8 + i * 4));
  header.writeUInt32LE(0x464d4520, 40); header.writeUInt32LE(0x10000, 44); header.writeUInt32LE(total, 48);
  header.writeUInt32LE(records.length + 1, 52); header.writeUInt16LE(3, 56);
  [1024, 768, 320, 240].forEach((v, i) => header.writeInt32LE(v, 72 + i * 4));
  return Buffer.concat([header, ...records]);
}

function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content), packed = deflateRawSync(data), nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

writeFileSync(new URL("./sample.docx", import.meta.url), zip([
  ["[Content_Types].xml", contentTypes], ["_rels/.rels", rootRels], ["docProps/core.xml", core],
  ["word/document.xml", documentXml], ["word/_rels/document.xml.rels", rels], ["word/styles.xml", styles],
  ["word/numbering.xml", numbering], ["word/header1.xml", header], ["word/footer1.xml", footer],
  ["word/media/image1.png", png(120, 60)], ["word/media/image2.emf", emf()],
]));
