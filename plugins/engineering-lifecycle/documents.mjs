
const ascii = text => String(text).normalize("NFKD").replace(/[^\x20-\x7E]/g, "?");
const pdfString = text => ascii(text).replace(/[\\()]/g, "\\$&");
function wrap(text, count=86) {
  const rows = [""];
  for (const word of ascii(text).split(/\s+/)) {
    if(rows.at(-1).length + word.length + 1 > count) rows.push(word);
    else rows[rows.length-1] += (rows.at(-1)?" ":"")+word;
  }
  return rows;
}

export function pagesOf(document, revision) {
  return revision.pages.map((page,n)=>({number:n+1,heading:page.title,sections:page.clauses.map(clause=>({code:clause.code,title:clause.title,lines:wrap(clause.paragraph)})),foot:document.code+" / v"+revision.version+" / Synthetic demo data"}));
}

export function makePdf(document, revision) {
  const pages=pagesOf(document,revision);
  const bodies=["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const ids=[];
  for (const page of pages) {
    const text=(value,left,top,pt=11,bold=false)=>"BT /"+(bold?"F2":"F1")+" "+pt+" Tf 1 0 0 1 "+left+" "+top+" Tm ("+pdfString(value)+") Tj ET\n";
    let body = "0.10 0.15 0.22 rg\n"+text("ENGINEERING DEMO / CUSTOMER DOCUMENT",50,770,9,true)
      +text(document.title,50,731,18,true)+text(page.heading,50,672,16,true);
    let y=625;
    for(const section of page.sections){
      body+=text("§ "+section.code+" | "+section.title,50,y,11,true); y-=20;
      for(const line of section.lines){ body+=text(line,50,y); y-=16; }
      y-=21;
    }
    body+=text(page.foot+"            "+page.number,50,45,9);
    const pageId=bodies.length+1;
    bodies.push("<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /MediaBox [0 0 595 842] /Contents "+(pageId+1)+" 0 R >>");
    bodies.push("<< /Length "+Buffer.byteLength(body)+" >>\nstream\n"+body+"endstream");
    ids.push(pageId+" 0 R");
  }
  bodies[1]="<< /Type /Pages /Kids ["+ids.join(" ")+"] /Count "+ids.length+" >>";
  let pdf="%PDF-1.4\n";const offsets=["0000000000 65535 f \n"];
  for(const [n,object] of bodies.entries()){
    offsets.push(String(Buffer.byteLength(pdf)).padStart(10,"0")+" 00000 n \n");
    pdf+=(n+1)+" 0 obj\n"+object+"\nendobj\n";
  }
  const at=Buffer.byteLength(pdf);
  return Buffer.from(pdf+"xref\n0 "+offsets.length+"\n"+offsets.join("")+"trailer\n<< /Size "+offsets.length+" /Root 1 0 R >>\nstartxref\n"+at+"\n%%EOF\n");
}
