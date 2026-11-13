"""Optional test/preflight evidence producer, not needed by the Node processing module.
Install the exact version in requirements-audit.txt. Never changes the source PDF.
"""
import hashlib,json,sys
from pypdf import PdfReader, __version__
source=sys.argv[1]
raw=open(source,'rb').read()
reader=PdfReader(source)
outline=reader.outline
count=lambda xs:sum(count(x) if isinstance(x,list) else 1 for x in xs)
print(json.dumps({'pdfSha256':hashlib.sha256(raw).hexdigest(),'status':'present' if count(outline) else 'absent','outlineItems':count(outline),'method':'pypdf PdfReader.outline','toolVersion':__version__}))
