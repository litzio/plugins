"""One-off MinerU 3.4.5 content-list/middle-JSON adapter for score_lsr.
Not a DoclingDocument serializer; no guessed cell pixel coordinates.
"""
import json,sys,re
from html.parser import HTMLParser

class Table(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True);self.cells=[];self.occupied=set();self.row=-1;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr': self.row+=1;self.col=0
  if tag in ('td','th'):
   while (self.row,self.col) in self.occupied:self.col+=1
   a=dict(attrs);rs=int(a.get('rowspan',1));cs=int(a.get('colspan',1));self.cell=dict(start_row_offset_idx=self.row,start_col_offset_idx=self.col,row_span=rs,col_span=cs,text='')
   for r in range(self.row,self.row+rs):
    for c in range(self.col,self.col+cs):self.occupied.add((r,c))
  if tag=='br' and self.cell is not None:self.cell['text']+='\n'
 def handle_data(self,data):
  if self.cell is not None:self.cell['text']+=data
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:self.cells.append(self.cell);self.cell=None
 def result(self):return dict(num_rows=max((r for r,c in self.occupied),default=-1)+1,num_cols=max((c for r,c in self.occupied),default=-1)+1,table_cells=self.cells)

def adapt(envelope):
 result=next(iter(envelope['results'].values()));content=json.loads(result['content_list']);middle=json.loads(result['middle_json'])
 doc=dict(texts=[],tables=[],pictures=[],body={'children':[]},pages={str(p['page_idx']+1):{'size':{'width':1000,'height':1000}} for p in middle['pdf_info']})
 def add(x,kind='texts'):
  x['self_ref']=f'#/{kind}/{len(doc[kind])}';doc[kind].append(x)
  if x.get('content_layer')!='furniture':doc['body']['children'].append({'$ref':x['self_ref']})
  return x
 def prov(page,b):return [{'page_no':page+1,'bbox':dict(zip(['l','t','r','b'],b),coord_origin='TOPLEFT')}]
 for c in content:
  typ=c['type'];page=c['page_idx'];b=c.get('bbox')
  if not b:raise ValueError('Missing content-list bbox')
  x=dict(label='text',text=c.get('text',''),prov=prov(page,b))
  if typ in ('header','footer','page_number'):x['content_layer']='furniture'
  if 'text_level' in c:x.update(label='title' if c['text_level']==1 else 'section_header',level=c['text_level'])
  if typ=='equation':x.update(label='formula',text=re.sub(r'^\s*\$\$|\$\$\s*$','',x['text']).strip())
  if typ=='table':
   parser=Table();parser.feed(c.get('table_body',''));x.update(label='table',data=parser.result());add(x,'tables')
  elif typ in ('image','chart'):x['label']='picture';add(x,'pictures')
  else:add(x)
  if typ in ('table','image','chart'):
   # Use explicit grouped caption blocks from middle JSON, never infer by proximity.
   blocks=[b for b in middle['pdf_info'][page]['para_blocks'] if b['type'] in ('table','image','chart')]
   candidates=[b for b in blocks if [int(v*1000/middle['pdf_info'][page]['page_size'][i%2]) for i,v in enumerate(b['bbox'])]==c['bbox']]
   if candidates:
    for child in candidates[0].get('blocks',[]):
     if child['type'].endswith('_caption'):
      size=middle['pdf_info'][page]['page_size'];bbox=[v*1000/size[i%2] for i,v in enumerate(child['bbox'])]
      text=' '.join(s.get('content','') for l in child.get('lines',[]) for s in l.get('spans',[]))
      cap=add(dict(label='caption',text=text,prov=prov(page,bbox)));x.setdefault('captions',[]).append({'$ref':cap['self_ref']})
 return doc
if __name__=='__main__':
 print(json.dumps(adapt(json.load(open(sys.argv[1],encoding='utf-8-sig'))),ensure_ascii=False,indent=2))
