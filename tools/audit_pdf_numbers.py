"""Page-level numeric token inventory; differences are review candidates, not factual error counts."""
import collections,json,re,sys
import fitz

def tokens(s): return collections.Counter(re.findall(r'\d+(?:\.\d+)?|[±≤≥<>%−]',s))
def compare(pdf,doc):
    actual=collections.defaultdict(list)
    for x in doc.get('texts',[])+doc.get('tables',[]):
        text=x.get('text','') if 'data' not in x else ' '.join(c.get('text','') for c in x['data'].get('table_cells',[]))
        pages=set(p['page_no'] for p in x.get('prov',[]))
        for page in pages: actual[page].append(text)
    rows=[]
    with fitz.open(pdf) as source:
        for i,page in enumerate(source,1):
            expected=tokens(page.get_text()); output=tokens(' '.join(actual[i]))
            rows.append({'page':i,'missing_numeric_tokens':sum((expected-output).values()),'extra_numeric_tokens':sum((output-expected).values())})
    return rows
if __name__=='__main__':
    with open(sys.argv[2],encoding='utf-8-sig') as f: doc=json.load(f)
    print(json.dumps(compare(sys.argv[1],doc),indent=2))
