// Small, original synthetic PDFs. No converter, server, font files or canvas.
export function pdfPaintSample(kind) {
  const stream=(text,properties="")=>`<< ${properties} /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",""];
  let resources="/Font << /F1 4 0 R >>",extra="",content="BT /F1 12 Tf 20 70 Td (A) Tj ET";
  if (kind === "type3" || kind === "type3-gstate") {
    resources="/Font << /F1 6 0 R >>";
    objects.push("<< /Type /Font /Subtype /Type3 /FontBBox [0 0 600 800] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /A 7 0 R >> /Encoding << /Type /Encoding /Differences [65 /A] >> /FirstChar 65 /LastChar 65 /Widths [600] /FontDescriptor 8 0 R /Resources << >> >>",
      stream("600 0 0 0 600 800 d1 0 0 600 800 re f"),"<< /Type /FontDescriptor /FontName /SyntheticShape /Flags 4 /FontBBox [0 0 600 800] /Ascent 800 /Descent -200 /CapHeight 800 /ItalicAngle 0 /StemV 80 >>");
    if (kind === "type3-gstate") {
      resources+=" /ExtGState << /GS1 9 0 R >>";
      objects.push("<< /Type /ExtGState /Font [6 0 R 12] >>");
      content="BT /GS1 gs 20 70 Td (A) Tj ET";
    }
  } else if (kind === "xfa" || kind === "xfa-packets") {
    objects[0]="<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R /NeedsRendering true >>";
    objects.push(kind === "xfa" ? "<< /Fields [] /XFA 7 0 R >>" : "<< /Fields [] /XFA [(template) 7 0 R] >>",
      stream('<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1"><draw><value><text>Different XFA content</text></value></draw></subform></template>'));
  } else if (kind === "form" || kind === "transparency-group") {
    resources+=" /XObject << /Fm1 6 0 R >>";content+=" /Fm1 Do";
    objects.push(stream("10 10 20 20 re f","/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << >>"+
      (kind === "transparency-group" ? " /Group << /S /Transparency /CS /DeviceRGB >>" : "")));
  } else if (kind === "pattern" || kind === "stroke-pattern") {
    resources+=" /Pattern << /P1 6 0 R >>";content+=kind === "pattern" ? " /Pattern cs /P1 scn 0 0 30 30 re f" : " /Pattern CS /P1 SCN 0 0 30 30 re S";
    objects.push(stream("0 0 4 4 re f","/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>"));
  } else if (kind === "annotation" || kind === "annotation-no-appearance") {
    // Print-only appearance is absent from the default display operator list.
    extra="/Annots [6 0 R]";
    objects.push(kind === "annotation" ? "<< /Type /Annot /Subtype /Stamp /Rect [0 0 20 20] /F 36 /AP << /N 7 0 R >> >>" : "<< /Type /Annot /Subtype /Text /Rect [0 0 20 20] /Contents (Synthetic note) >>",
      stream("0 0 20 20 re f","/Type /XObject /Subtype /Form /BBox [0 0 20 20] /Resources << >>"));
  } else if (kind === "soft-mask") {
    resources+=" /ExtGState << /GS1 7 0 R >>";content="/GS1 gs "+content;
    objects.push(stream("1 g 0 0 20 20 re f","/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << >> /Group << /S /Transparency /CS /DeviceGray >>"),
      "<< /Type /ExtGState /SMask << /S /Alpha /G 6 0 R >> >>");
  } else if (kind !== "plain") throw new Error("unknown-synthetic-pdf");
  objects[2]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << ${resources} >> /Contents 5 0 R ${extra} >>`;
  objects[4]=stream(content);
  let pdf="%PDF-1.7\n",offsets=[];
  for (const [index,object] of objects.entries()) {offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;}
  const start=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map((offset)=>String(offset).padStart(10,"0")+" 00000 n \n").join("");
  return Buffer.from(pdf+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
}
