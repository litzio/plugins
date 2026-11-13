"""Diagnostic LSR oracle comparison, not an absolute quality grade."""
import json, re, sys
from collections import defaultdict

def norm(s):
    return re.sub(r'\s+', '', s or '')

def box(p, height):
    b=p['bbox']
    if b.get('coord_origin')=='BOTTOMLEFT': return [b['l'],height-b['t'],b['r'],height-b['b']]
    return [b['l'],b['t'],b['r'],b['b']]

def overlap(a,b):
    x=max(0,min(a[2],b[2])-max(a[0],b[0])); y=max(0,min(a[3],b[3])-max(a[1],b[1]))
    return x*y/max(1,min((a[2]-a[0])*(a[3]-a[1]),(b[2]-b[0])*(b[3]-b[1])))

def score(gt,doc):
    items=doc.get('texts',[])+doc.get('tables',[])+doc.get('pictures',[])
    heights={p['page']:p['height'] for p in gt['pages']}
    widths={p['page']:p['width'] for p in gt['pages']}
    matches={}
    for e in gt['elements']:
        candidates=[]
        for item in items:
            for p in item.get('prov',[]):
                if p['page_no']==e['page']:
                    size=doc.get('pages',{}).get(str(e['page']),{}).get('size',{'width':widths[e['page']],'height':heights[e['page']]})
                    b=box(p,size['height'])
                    b=[b[0]*widths[e['page']]/size['width'],b[1]*heights[e['page']]/size['height'],b[2]*widths[e['page']]/size['width'],b[3]*heights[e['page']]/size['height']]
                    ov=overlap(e['bbox'],b)
                    if ov>=.5: candidates.append((ov,item))
        if candidates: matches[e['id']]=max(candidates,key=lambda v:v[0])[1]
    counts=defaultdict(lambda:[0,0])
    def add(k,ok): counts[k][1]+=1; counts[k][0]+=bool(ok)
    for e in gt['elements']:
        m=matches.get(e['id'],{}); label=e.get('docling_label')
        if label in ['title','section_header']:
            add('heading_label',m.get('label')==label)
            if 'heading_level' in e: add('heading_level',m.get('level')==e['heading_level'])
        elif label in ['text','paragraph']: add('prose_label',m.get('label') in ['text','paragraph'])
        if e.get('layer')=='furniture': add('furniture',m.get('content_layer')=='furniture')
        if e.get('text') and e.get('text_scoring')=='strict': add('literal_text',norm(e['text'])==norm(m.get('text')))
        if e.get('text') and re.search(r'[0-9≤≥±%]',e['text']) and label!='formula':
            add('numeric_literal',norm(e['text'])==norm(m.get('text')))
        if label=='footnote': add('note_label',m.get('label')=='footnote')
        if label=='formula':
            add('formula_detection',m.get('label')=='formula')
            add('formula_literal',norm(e['text'])==norm(m.get('text')))
        if 'table' in e:
            t=e['table']; actual=m.get('data',{})
            add('table_dimensions',(t['num_rows'],t['num_cols'])==(actual.get('num_rows'),actual.get('num_cols')))
            cells=actual.get('table_cells',[])
            for c in t['cells']:
                found=next((v for v in cells if v.get('start_row_offset_idx')==c['r0'] and v.get('start_col_offset_idx')==c['c0']),{})
                add('cell_span',(c['r1']-c['r0'],c['c1']-c['c0'])==(found.get('row_span'),found.get('col_span')))
                add('cell_text',norm(c['text'])==norm(found.get('text')))
                if re.search(r'[0-9≤≥±%]',c['text']): add('numeric_cell',norm(c['text'])==norm(found.get('text')))
    for rel in gt['relations']:
        if rel['type']=='caption_of':
            caption=matches.get(rel['from'],{}); target=matches.get(rel['to'],{})
            add('caption_link',any(x.get('$ref')==caption.get('self_ref') for x in target.get('captions',[])) and bool(caption))
    order=[]
    def walk(ref):
        obj=doc
        for p in ref.removeprefix('#/').split('/'): obj=obj[int(p)] if isinstance(obj,list) else obj[p]
        order.append(ref)
        for c in obj.get('children',[]): walk(c['$ref'])
    walk('#/body')
    by_page=defaultdict(list)
    for e in gt['elements']:
        if e.get('order') is not None and e['id'] in matches:
            ref=matches[e['id']].get('self_ref')
            if ref in order: by_page[e['page']].append((e['order'],order.index(ref)))
    for values in by_page.values():
        values.sort()
        for a,b in zip(values,values[1:]): add('adjacent_order',a[1]<=b[1])
    return dict(counts)

if __name__=='__main__':
    with open(sys.argv[1],encoding='utf-8-sig') as f: gt=json.load(f)
    with open(sys.argv[2],encoding='utf-8-sig') as f: doc=json.load(f)
    print(json.dumps(score(gt,doc),indent=2))
