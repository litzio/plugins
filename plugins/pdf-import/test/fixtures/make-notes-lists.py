# Builds notes-lists.pdf: a three-page synthetic sample with NOTE paragraphs,
# a list that continues across a page and two adjacent lists. All text is invented
# for these tests (CC0). Requires reportlab: python make-notes-lists.py
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

body = ParagraphStyle("body", fontName="Times-Roman", fontSize=10, leading=11.5, alignment=TA_JUSTIFY, spaceAfter=9)
note = ParagraphStyle("note", parent=body, fontSize=9, leading=10.4)
item = ParagraphStyle("item", parent=body, leftIndent=36, bulletIndent=18, spaceAfter=5)
head = ParagraphStyle("head", fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=8, spaceAfter=8)
cover = ParagraphStyle("cover", fontName="Helvetica", fontSize=12, leading=16, spaceAfter=10)
filler = (
    "Every reading in the sample log is copied into the review sheet before the shift ends, and the "
    "reviewer compares the copied value with the instrument display. Differences larger than the stated "
    "tolerance are marked for a second reading, and the second reading replaces the first only when both "
    "readers sign the sheet."
)


def furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(306, 760, "Synthetic sample for PDF import tests")
    canvas.drawCentredString(306, 40, str(doc.page))
    canvas.restoreState()


story = [
    Paragraph("IEEE Std 0000-2026 (synthetic test sample, not an IEEE publication)", cover),
    Paragraph("Sample procedure for recording readings", cover),
    PageBreak(),
    Paragraph("1. Overview", head),
    Paragraph(filler, body),
    Paragraph("NOTE 1—The reviewer keeps the original sheet and files only a copy with the weekly summary.", note),
    Paragraph("NOTE 2—A second reading is not required when the display is steady for one full minute.", note),
    Paragraph("2. Recording steps", head),
    Paragraph(filler, body),
    Paragraph("The reader records each value in the following order:", body),
    Paragraph("Write the date and the name of the instrument at the top of the sheet.", item, bulletText="a)"),
    Paragraph("Read the display twice and write the larger of the two values.", item, bulletText="b)"),
    PageBreak(),
    Paragraph("Compare the value with the previous shift and mark any change above the tolerance.", item, bulletText="c)"),
    Paragraph("Sign the sheet and pass it to the reviewer before leaving.", item, bulletText="d)"),
    Paragraph("NOTE—The order above matches the layout of the printed sheet.", note),
    Paragraph("3. Checks", head),
    Paragraph("The reviewer applies two groups of checks:", body),
    Paragraph("The value is inside the range printed on the sheet.", item, bulletText="1)"),
    Paragraph("The signature matches the reader on duty.", item, bulletText="2)"),
    Paragraph("The sheet has no blank rows between readings.", item, bulletText="a)"),
    Paragraph("Corrections are crossed out once and initialled.", item, bulletText="b)"),
    Spacer(1, 6),
    Paragraph(filler, body),
]
SimpleDocTemplate(
    "notes-lists.pdf", pagesize=letter, leftMargin=90, rightMargin=90, topMargin=72, bottomMargin=100,
    title="Synthetic notes and lists sample", author="pdf-import tests", subject="", creator="", producer="",
).build(story, onFirstPage=furniture, onLaterPages=furniture)
