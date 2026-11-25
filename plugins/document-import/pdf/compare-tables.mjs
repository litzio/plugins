// Development comparison with an independent converter, not an accuracy claim.
import{readFile}from'node:fs/promises';import{pathToFileURL}from'node:url';import{extract}from'./extract.mjs';import{convert,suggestExcludedPages}from'./rules.mjs';import{tableNorm}from'./score-answer-key.mjs';
export function compareTables(result,reference){
 const tables=[];let same=0,matched=0,total=0;
 for(const t of reference.tables){const prov=t.prov?.[0];if(!prov)continue;const p=prov.page_no,H=reference.pages[String(p)].size.height,bb=prov.bbox;const box=bb.coord_origin==='BOTTOMLEFT'?[bb.l,H-bb.t,bb.r,H-bb.b]:[bb.l,bb.t,bb.r,bb.b];
 const candidates=result.blocks.filter(b=>b.kind==='table'&&b.page===p-1).map(b=>({b,area:b.boxes.reduce((n,x)=>n+Math.max(0,Math.min(x.x1,box[2])-Math.max(x.x0,box[0]))*Math.max(0,Math.min(x.bottom,box[3])-Math.max(x.top,box[1])),0)})).sort((a,b)=>b.area-a.area);
 const b=candidates[0]?.area>0?candidates[0].b:null,g=b?.grid;const shape=!!g&&g.rows===t.data.num_rows&&g.cols===t.data.num_cols;if(shape)same++;
 let hit=0,count=0;
 if(shape)for(const c of t.data.table_cells){count++;const o=g.cells.find(o=>o.r0===c.start_row_offset_idx&&o.r1===c.end_row_offset_idx&&o.c0===c.start_col_offset_idx&&o.c1===c.end_col_offset_idx);if(o&&tableNorm(o.text)===tableNorm(c.text))hit++;}
 matched+=hit;total+=count;tables.push({page:p,status:g?'text':b?'image':'missing',reason:b?.warning?.reason,ours:g?[g.rows,g.cols]:null,reference:[t.data.num_rows,t.data.num_cols],same_shape:shape,matched_text:hit,cells:count});
 }return{same_shape:same,tables:tables.length,matched_text:matched,cells_on_same_shape_tables:total,details:tables};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const[input,reference]=process.argv.slice(2);const result=/\.json$/i.test(input)?JSON.parse(await readFile(input,'utf8')):await (async()=>{const raw=await extract(input);return convert(raw,suggestExcludedPages(raw));})();console.log(JSON.stringify(compareTables(result,JSON.parse(await readFile(reference,'utf8'))),null,2));}
