# CC0. Rebuild with python make-clause-links.py (ReportLab).
from pathlib import Path
from reportlab.pdfgen.canvas import Canvas

pdf = Canvas(str(Path(__file__).with_name("clause-links.pdf")), pagesize=(612, 792), invariant=1)
for n, name in enumerate(["Starting point", "Inspection", "Review", "Closing"], 1):
    pdf.bookmarkPage(str(n), fit="XYZ", left=72, top=708, zoom=0)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(72, 690, f"{n}. {name}")
    pdf.setFont("Times-Roman", 10)
    for row in range(10):
        pdf.drawString(72, 654-16*row, f"Record observation {row+1} on the sheet and compare the two readings.")
    for row, dest in enumerate([1, 2, 4, 4]):
        y = 440-35*row
        pdf.drawString(72, y, "Read the instructions in")
        label = "Clause " + str(dest if row != 3 else 8)
        pdf.drawString(180, y, label)
        pdf.linkRect("", str(dest), (180, y-2, 180+pdf.stringWidth(label,"Times-Roman",10), y+9), thickness=0)
    pdf.showPage()
pdf.save()
