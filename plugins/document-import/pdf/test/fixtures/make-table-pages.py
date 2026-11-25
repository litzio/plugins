# Builds table-pages.pdf: a two-page synthetic sample with one ruled table that continues onto the
# next page with its header row repeated and nothing between the two parts. All text is invented
# for these tests (CC0). Requires reportlab: python make-table-pages.py
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

body = ParagraphStyle("body", fontName="Times-Roman", fontSize=10, leading=11.5, alignment=TA_JUSTIFY, spaceAfter=9)
head = ParagraphStyle("head", fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=8, spaceAfter=8)
caption = ParagraphStyle("caption", fontName="Helvetica-Bold", fontSize=9, leading=11, spaceAfter=6, alignment=1)
filler = (
    "Each shelf in the sample archive is checked once a week. The checker writes the shelf number, the "
    "number of boxes found and the temperature of the room, and signs the line before moving on. A shelf "
    "that was not checked keeps an empty line, so that the gap shows in the weekly summary."
)


def furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(306, 760, "Synthetic sample for PDF import tests")
    canvas.drawCentredString(306, 40, str(doc.page))
    canvas.restoreState()


rows = [["Shelf", "Boxes", "Room (°C)", "Checked by"]]
for i in range(1, 49):
    rows.append([f"S-{i:02d}", str(10 + (i * 7) % 23), f"{18 + (i % 5) * 0.5:.1f}", ["Ana", "Ben", "Cleo", "Dev"][i % 4]])
table = Table(rows, colWidths=[90, 70, 90, 110], repeatRows=1)
table.setStyle(TableStyle([
    ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
    ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story = [
    Paragraph("1. Weekly shelf checks", head),
    Paragraph(filler, body),
    Paragraph(filler, body),
    Paragraph("Table 1. Shelf check record", caption),
    table,
    Spacer(1, 10),
    Paragraph("The record above continues from one page to the next without a second caption. The header row "
              "is printed again at the top of the second page so that each page can be read on its own.", body),
]
SimpleDocTemplate(
    "table-pages.pdf", pagesize=letter, leftMargin=90, rightMargin=90, topMargin=72, bottomMargin=100,
    title="Synthetic table across pages", author="pdf-import tests", subject="", creator="", producer="", invariant=1,
).build(story, onFirstPage=furniture, onLaterPages=furniture)
