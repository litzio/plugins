"""Read-only, optional text-layer evidence for explicitly selected candidates."""
import json
import sys
from pathlib import Path
import fitz

report_path, pdf_path = map(Path, sys.argv[1:])
report = json.loads(report_path.read_text(encoding='utf-8'))
pdf = fitz.open(pdf_path)
results = []
seen = set()
normalize = lambda s: ' '.join(s.split())  # whitespace only; never numbers/signs
for requirement in report['requirements']:
    for source in requirement['sources']:
        key = (source['elementRef'], source['selector'])
        if key in seen:
            continue
        seen.add(key)
        trace = source['trace']
        pages = []
        for region in trace['regions']:
            page = pdf[region['pageNo'] - 1]
            assert page.rect.width == next(p['width'] for p in trace['pages'] if p['pageNo'] == region['pageNo'])
            extracted = page.get_text('text', clip=fitz.Rect(region['bbox']))
            pages.append({'pageNo': region['pageNo'], 'bbox': region['bbox'], 'quoteFoundWithWhitespaceOnlyNormalization': normalize(source['quote']) in normalize(extracted)})
            image = report_path.parent / ('pdf-page-' + str(region['pageNo']) + '.png')
            if not image.exists():
                page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(image)
        results.append({'elementRef': key[0], 'selector': key[1], 'pages': pages, 'precision': trace['precision'], 'result': 'formula semantic equivalence unverified' if trace.get('sourceLabel') == 'formula' else 'quote found within declared PDF region' if any(p['quoteFoundWithWhitespaceOnlyNormalization'] for p in pages) else 'PDF text correspondence unverified', 'perCellPageAttribution': 'not supplied by handoff contract'})
(report_path.parent / 'pdf-text-evidence.json').write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(results, indent=2, ensure_ascii=False))
