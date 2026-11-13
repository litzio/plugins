import unittest
from adapt_mineru_lsr import Table
class TableTests(unittest.TestCase):
 def test_rowspan_occupies_next_row(self):
  p=Table();p.feed('<table><tr><td rowspan="2">A</td><td>0.4 &lt; u ≤ 1.3</td></tr><tr><td colspan="2">B</td></tr></table>');d=p.result()
  self.assertEqual((d['num_rows'],d['num_cols']),(2,3))
  self.assertEqual(d['table_cells'][2]['start_col_offset_idx'],1)
  self.assertEqual(d['table_cells'][1]['text'],'0.4 < u ≤ 1.3')
if __name__=='__main__':unittest.main()
