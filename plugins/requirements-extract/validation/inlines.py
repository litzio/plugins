"""Offline standard + exact mixed XHTML checks for inlines.mjs outputs."""
import json
import sys
from pathlib import Path
from lxml import etree
from standard import verify

cache, root = map(Path, sys.argv[1:])
projections = json.loads((root / 'inline-projections.json').read_text(encoding='utf-8'))
ns = {'r': 'http://www.omg.org/spec/ReqIF/20110401/reqif.xsd', 'x': 'http://www.w3.org/1999/xhtml'}

def text(c):
    return c['text'] if c['kind'] == 'text' else c['value'] if c['kind'] == 'code' else ''.join(map(text, c['children']))

for name, projection in projections.items():
    file = root / (name + '.reqif')
    verify(cache, file)
    expected = ''.join(map(text, projection['block']['content']))
    shapes = []
    for path in [file, file.with_suffix('.roundtrip.reqif')]:
        tree = etree.parse(str(path), etree.XMLParser(no_network=True, resolve_entities=False))
        p = tree.xpath('//r:SPEC-OBJECT[@IDENTIFIER="req-1593c157-e436-422d-a7aa-000000000004"]//x:p', namespaces=ns)[1]
        assert ''.join(p.itertext()) == expected, f'{name}: mixed XHTML text changed'
        # Exact text AND tail, including boundary spaces; ignore only structural
        # indentation outside the requirement's paragraph.
        shapes.append([(e.tag, sorted(e.attrib.items()), e.text, e.tail) for e in p.iter()])
    assert shapes[0] == shapes[1], f'{name}: mixed XHTML markup/text/tail changed'
    print(f'PASS exact XHTML text/tail independent roundtrip: {name}')
