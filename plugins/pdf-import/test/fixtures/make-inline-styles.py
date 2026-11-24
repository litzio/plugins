"""Generate the CC0 inline-style regression sample. All sentences are invented."""
from pathlib import Path
from reportlab.pdfgen.canvas import Canvas

pdf = Canvas(str(Path(__file__).with_name("inline-styles.pdf")), pagesize=(612,792), invariant=1)
pdf.setTitle("Field notebook")
pdf.setAuthor("PDF import tests")


def line(x,y,*pieces):
    row = pdf.beginText(x,y)
    for words, face, size, rise in pieces:
        row.setFont("Times-"+face,size)
        row.setRise(rise)
        row.textOut(words)
    pdf.drawText(row)


def regular(text):
    return (text,"Roman",12,0)


def variable():
    return [("V","Italic",12,0),("N","Roman",8,-2)]


line(70,690,regular("Record the "),(" signal, ","Bold",12,0),regular("using "),("gentle","Italic",12,0),regular(" pressure."))
line(70,660,("Uniform lettering.","Bold",12,0))
line(70,620,regular("Compare "),*variable(),regular(" with the first reading."))
line(70,580,regular("Surface area in m"),("2","Roman",8,4),regular(" is recorded."))
line(70,540,regular("For water use H"),("2","Roman",8,-2),regular("O."))
line(70,500,regular("Compute "),("P","Italic",12,0),("2","Roman",8,4),regular(" once."))
for y in (445,415,385):
    pdf.line(70,y,430,y)
for x in (70,250,430):
    pdf.line(x,385,x,445)
line(78,426,regular("Name"))
line(258,426,regular("Observation"))
line(78,396,regular("Read "),*variable())
line(258,396,regular("Use "),("care","Bold",12,0))
pdf.save()
