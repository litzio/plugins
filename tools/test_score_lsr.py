import unittest
from score_lsr import overlap, box, score
class ScoringTest(unittest.TestCase):
    def test_coordinates(self):
        self.assertEqual(box({'bbox':{'l':10,'t':90,'r':30,'b':80,'coord_origin':'BOTTOMLEFT'}},100),[10,10,30,20])
        self.assertEqual(overlap([0,0,10,10],[20,20,30,30]),0)
    def test_missing_not_success(self):
        gt={'pages':[{'page':1,'height':100,'width':100}], 'elements':[{'id':'h','page':1,'bbox':[0,0,10,10],'docling_label':'section_header','heading_level':2}], 'relations':[]}
        d={'body':{'children':[]},'texts':[]}
        self.assertEqual(score(gt,d)['heading_level'],[0,1])
    def test_scaled_page_coordinates(self):
        gt={'pages':[{'page':1,'height':100,'width':100}], 'elements':[{'id':'h','page':1,'bbox':[10,10,30,20],'docling_label':'section_header','heading_level':2}], 'relations':[]}
        d={'pages':{'1':{'size':{'width':200,'height':200}}},'body':{'children':[]},'texts':[{'label':'section_header','level':2,'prov':[{'page_no':1,'bbox':{'l':20,'t':20,'r':60,'b':40,'coord_origin':'TOPLEFT'}}]}]}
        self.assertEqual(score(gt,d)['heading_level'],[1,1])
    def test_caption_requires_match(self):
        gt={'pages':[], 'elements':[], 'relations':[{'type':'caption_of','from':'x','to':'y'}]}
        self.assertEqual(score(gt,{'body':{'children':[]}})['caption_link'],[0,1])
if __name__=='__main__': unittest.main()
