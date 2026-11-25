# CC0. Rebuild with Python and ReportLab.
from pathlib import Path
from reportlab.pdfbase import pdfdoc as d, pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from argparse import ArgumentParser
from reportlab.pdfgen.canvas import Canvas

pdf = Canvas(str(Path(__file__).with_name("sheet-spec.pdf")), pagesize=(600, 800), invariant=1)
parser = ArgumentParser()
parser.add_argument("font", help="Noto Sans KR TrueType font (SIL OFL)")
pdfmetrics.registerFont(TTFont("SheetSans", parser.parse_args().font))
pdf.setAuthor("PDF import tests")
pdf.setTitle("Field notes")
ref = pdf._doc.Reference
root = d.PDFDictionary({"Type": d.PDFName("StructTreeRoot")})
pdf._doc.Catalog.StructTreeRoot = root
pdf._doc.Catalog.MarkInfo = d.PDFDictionary({"Marked": d.PDFtrue})
top, nums = [], []
for page in range(6):
    pg = d.PDFObjectReference(pdf._doc.thisPageName())
    elements = []
    def element(role, parent, children):
        node = d.PDFDictionary({"Type": d.PDFName("StructElem"), "S": d.PDFName(role),
                                "P": ref(parent), "Pg": pg, "K": children})
        return node
    def line(text, x, y, size=12, font="Helvetica", parent=root, children=top):
        idx = len(elements)
        node = ref(element("P", parent, idx))
        elements.append(node)
        children.append(node)
        pdf.addLiteral(f"/P <</MCID {idx}>> BDC")
        pdf.setFont(font, size)
        pdf.drawString(x, y, text)
        pdf.addLiteral("EMC")
    for y in (775, 65, 35):
        pdf.line(30, y, 570, y)
    for x in (30, 570):
        pdf.line(x, 35, x, 775)
    pdf.line(490, 35, 490, 65)
    line(f"Sheet {page+1}", 500, 45)
    if page == 0:
        line("1 Field notes", 55, 748, 18)
    line(f"1.{page//2+1} Observation ({page%2+1} of 2)", 55, 713, 16)
    line(f"[LOG_{page+1}_01]", 55, 650)
    line("Read [LOG_6_01] before closing the observation.", 55, 625)
    line("メモを確認する。", 55, 600, font="SheetSans")
    line("[Example]", 55, 550)
    if page in (2, 4):
        for y in (520, 490, 460):
            pdf.line(55, y, 415, y)
        for x in (55, 235, 415):
            pdf.line(x, 460, x, 520)
        rows = []
        table = element("Table", root, d.PDFArray(rows))
        top.append(ref(table))
        for j in range(2):
            cells = []
            row = element("TR", table, d.PDFArray(cells))
            rows.append(ref(row))
            for i in range(2):
                paras = []
                cell = element("TD", row, d.PDFArray(paras))
                cells.append(ref(cell))
                value = "[LOG_9_01]" if (page, j, i) == (4, 1, 0) else f"Entry {j+1}-{i+1}"
                line(value, 65+180*i, 500-30*j, parent=cell, children=paras)
                cell["K"] = d.PDFArray(paras)
            row["K"] = d.PDFArray(cells)
        table["K"] = d.PDFArray(rows)
    pdf.showPage()
    obj = pdf._doc.Pages.pages[-1]
    obj.__NoDefault__ = [*obj.__NoDefault__, "StructParents"]
    obj.StructParents = page
    nums.extend([page, d.PDFArray(elements)])
root["K"] = d.PDFArray(list(reversed(top)))
root["ParentTree"] = ref(d.PDFDictionary({"Nums": d.PDFArray(nums)}))
pdf.save()
