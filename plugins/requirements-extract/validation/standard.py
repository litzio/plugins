"""Separate optional network setup and offline XSD/independent parser checks."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import urlopen
from lxml import etree

BASE = 'https://www.omg.org/spec/ReqIF/20110401/reqif.xsd'
LOCK = Path(__file__).with_name('schemas.lock.json')

def setup(cache):
    cache.mkdir(parents=True, exist_ok=True)
    entries = {}
    def fetch(url):
        url = url.replace('http://', 'https://')
        if url in entries:
            return
        data = urlopen(url, timeout=40).read()
        name = hashlib.sha256(url.encode()).hexdigest() + '.xsd'
        entries[url] = {'file': name, 'sha256': hashlib.sha256(data).hexdigest()}
        (cache / name).write_bytes(data)
        root = etree.fromstring(data)
        for n in root.xpath('//*[@schemaLocation]'):
            fetch(urljoin(url, n.attrib['schemaLocation']))
    fetch(BASE)
    if LOCK.exists():
        assert entries == json.loads(LOCK.read_text()), 'Schema download differs from pinned hashes'
    else:
        LOCK.write_text(json.dumps(entries, indent=2) + '\n')
    print(f'cached {len(entries)} official schema files; original bytes retained')

def verify(cache, file):
    entries = json.loads(LOCK.read_text())
    class Resolver(etree.Resolver):
        def resolve(self, url, pubid, context):
            key = url.replace('http://', 'https://')
            # All transitive URLs are mapped before lxml may access the network.
            if key not in entries:
                raise ValueError('Unpinned schema: ' + url)
            e = entries[key]
            data = (cache / e['file']).read_bytes()
            assert hashlib.sha256(data).hexdigest() == e['sha256']
            return self.resolve_string(data, context, base_url=key)
    parser = etree.XMLParser(no_network=True, resolve_entities=False)
    parser.resolvers.add(Resolver())
    schema = etree.XMLSchema(etree.parse(BASE, parser))
    tree = etree.parse(str(file), etree.XMLParser(no_network=True, resolve_entities=False))
    schema.assertValid(tree)
    ids = tree.xpath('//@IDENTIFIER')
    assert len(ids) == len(set(ids)), 'duplicate XML identifiers'
    for n in tree.iter():
        if isinstance(n.tag, str) and etree.QName(n).localname.endswith('-REF'):
            assert n.text in ids, f'broken reference {n.text}'
    from reqif.parser import ReqIFParser
    from reqif.unparser import ReqIFUnparser
    first = ReqIFParser.parse(str(file))
    output = file.with_suffix('.roundtrip.reqif')
    output.write_text(ReqIFUnparser.unparse(first), encoding='utf-8')
    ReqIFParser.parse(str(output))
    second = etree.parse(str(output))
    schema.assertValid(second)
    def meaning(doc):
        ns = {'r': 'http://www.omg.org/spec/ReqIF/20110401/reqif.xsd'}
        def item(n):
            # Independent parser may choose a different XHTML prefix.
            def shape(e):
                return (e.tag, tuple(sorted(e.attrib.items())), (e.text or '').strip(), tuple(shape(c) for c in e))
            return shape(n)
        return {n.attrib['IDENTIFIER']: item(n) for n in doc.xpath('//r:SPEC-OBJECTS/r:SPEC-OBJECT | //r:SPEC-RELATIONS/r:SPEC-RELATION | //r:SPECIFICATIONS/r:SPECIFICATION', namespaces=ns)}
    assert meaning(tree) == meaning(second), 'independent roundtrip changed object/relation/specification meaning'
    print(f'PASS XSD, {len(ids)} unique identifiers, all references, independent parse/unparse/parse semantic equality')

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('mode', choices=['setup', 'verify'])
    p.add_argument('cache', type=Path)
    p.add_argument('file', type=Path, nargs='?')
    a = p.parse_args()
    setup(a.cache) if a.mode == 'setup' else verify(a.cache, a.file)
