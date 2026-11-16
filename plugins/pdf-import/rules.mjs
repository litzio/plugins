// Digital text-layer rules. Bookmarks are used for measurement only.
const HEAD=/^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/, ANNEX=/^([A-Z](?:\.\d+)+)\s+(\S.*)$/, TOP=/^Annex\s+([A-Z])\b\s*(.*)$/;
const CAP=/^(Table|Figure)\s+([A-Z]\.\d+|\d+)\s*[—–-]/;
export const BULLET=/^[—–•\-]\s*/;
const LIST=/^(?:[a-z]\)|\d+\)|[—–•\-]|NOTE\b)/, END=/[.:;?!)\]”"]$|\[\^\w+\]$/;
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,''), chars=s=>s.replace(/\s/g,'').length;
// Python round uses ties to even; row ordering must retain that behavior.
const round=x=>Math.abs(x%1)===.5?2*Math.round(x/2):Math.round(x);
const box=(page,b)=>({page,x0:Math.min(b[0],b[2]),top:Math.min(b[1],b[3]),x1:Math.max(b[0],b[2]),bottom:Math.max(b[1],b[3])});
function addBox(b,l){const a=b.boxes.find(x=>x.page===l.page);if(a){a.x0=Math.min(a.x0,l.x0);a.top=Math.min(a.top,l.y0);a.x1=Math.max(a.x1,l.x1);a.bottom=Math.max(a.bottom,l.y1);}else b.boxes.push(box(l.page,l.bbox));}
function line(raw,page){const spans=raw.spans.filter(s=>s.text.trim()),main=spans.reduce((a,s)=>!a||s.text.length>a.text.length?s:a,null),main_size=main?round(main.size*10)/10:0;return {page,bbox:raw.bbox,x0:raw.bbox[0],y0:raw.bbox[1],x1:raw.bbox[2],y1:raw.bbox[3],spans,plain:raw.spans.map(s=>s.text).join('').trim(),size:Math.max(0,...spans.map(s=>s.size)),main_size,bold:spans.length>0&&spans.filter(s=>s.size>=7).every(s=>s.flags&16),first_size:spans[0]?.size||0,kind:null,text(){return spans.map(s=>(s.flags&1)&&s.size<main_size&&s.text.trim()?s.text.trim().split(/[,\s]+/).map(x=>'[^'+x+']').join(''):s.text).join('').replace(/\s+/g,' ').trim();}};}
const inside=(l,r)=>{const x=(l.x0+l.x1)/2,y=(l.y0+l.y1)/2;return r[0]-2<=x&&x<=r[2]+2&&r[1]-2<=y&&y<=r[3]+2;};
export function convert({pages,toc}){
 const all=pages.map((p,i)=>p.raw.map(r=>line(r,i)).filter(l=>l.plain).sort((a,b)=>round(a.y0/3)-round(b.y0/3)||a.x0-b.x0));
 const sizes=new Map();for(const lines of all)for(const l of lines)sizes.set(l.main_size,(sizes.get(l.main_size)||0)+l.plain.length);
 const body=[...sizes].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;
 const seen=new Map(),key=l=>l.plain.replace(/\d+/g,'#'),margin=(l,i)=>l.y1<pages[i].height*.10||l.y0>pages[i].height*.90;
 all.forEach((ls,i)=>{for(const k of new Set(ls.filter(l=>margin(l,i)).map(key)))seen.set(k,(seen.get(k)||0)+1);});
 all.forEach((ls,i)=>{for(const l of ls)if(margin(l,i)&&((seen.get(key(l))||0)>=pages.length*.3||/^[ivxlc\d]+$/.test(l.plain)))l.kind='margin';
  const rest=ls.filter(l=>!l.kind),tail=[];for(const l of rest.toReversed()){if(l.main_size<=body-1.5)tail.unshift(l);else break;}
  while(tail.length&&!(tail[0].spans[0].size<=body*.7&&/^\d+/.test(tail[0].spans[0].text.trim())))tail.shift();for(const l of tail)l.kind='footnote';
  for(const l of ls){if(l.kind)continue;if(pages[i].tables.some(t=>inside(l,t)))l.kind='table';else if(pages[i].figures.some(f=>inside(l,f)))l.kind='figure';}
  for(const t of pages[i].tables){let y=t[3],note=false;for(const l of ls){if(l.kind||l.y0<t[3]-2)continue;if(l.y0-y>16)break;const starts=l.first_size<=body*.7||(l.main_size<body&&/^NOTE/.test(l.plain)&&l.x0>t[0]-2&&l.x0-t[0]<12&&l.x0>92);if(starts||(note&&l.main_size<body)){l.kind='table';note=true;y=l.y1;}else break;}}
  let prev=null;for(const l of ls){if(l.kind){prev=null;continue;}const t=l.text();if(l.bold&&CAP.test(t))l.kind='caption';else if(prev?.kind==='caption'&&l.y0-prev.y1<6&&l.x0>92)l.kind='caption';else if(l.bold&&l.size>=body&&(HEAD.test(t)||ANNEX.test(t)||TOP.test(t)))l.kind='heading';else if(l.size>body+.5)l.kind='heading_unnumbered';prev=l;}for(const l of ls)l.kind??='body';
 });
 let start=all.findIndex(ls=>ls.some(l=>l.kind==='heading'&&/^1\.?\s/.test(l.text())));if(start<0)start=0;
 for(let i=0;i<start;i++)for(const l of all[i])if(l.kind!=='margin')l.kind='front';
 const blocks=[],excluded=[];let joins=0;
 const push=(kind,text,l,level)=>{const b={id:'',kind,text,page:l.page,boxes:[],...(level?{level}:{})};addBox(b,l);blocks.push(b);return b;};
 for(let p=start;p<pages.length;p++){let prev=null,first=true,obj=null;for(const l of all[p]){if(['margin','front'].includes(l.kind))continue;const t=l.text();
  if(['table','figure'].includes(l.kind)){if(obj&&obj.kind===l.kind&&obj.page===p){obj.text+=' '+t;addBox(obj,l);}else obj=push(l.kind,t,l);prev=null;continue;}obj=null;
  if(l.kind==='footnote'){const m=l.plain.match(/^\[?\^?(\d+)\]?\s*(.*)$/);if(l.spans[0].size<=body*.7&&m)push('footnote','[^'+m[1]+']: '+m[2],l);else if(blocks.at(-1)?.kind==='footnote'){blocks.at(-1).text+=' '+l.plain;addBox(blocks.at(-1),l);}prev=null;continue;}
  if(l.kind==='heading'){const m=t.match(HEAD)||t.match(ANNEX);push('heading',t,l,TOP.test(t)?1:m[1].split('.').length);prev=l;continue;}
  if(l.kind==='heading_unnumbered'){const last=blocks.findLast(b=>b.kind!=='footnote');if(last&&['heading','heading_unnumbered'].includes(last.kind)&&last.page===p&&prev&&l.y0-prev.y1<20){last.text+=' '+t;addBox(last,l);}else push(l.kind,t,l);prev=l;continue;}
  if(l.kind==='caption'){if(blocks.at(-1)?.kind==='caption'&&prev&&l.y0-prev.y1<6&&!CAP.test(t)){blocks.at(-1).text+=' '+t;addBox(blocks.at(-1),l);}else push('caption',t,l);prev=l;continue;}
  const same=prev?.kind==='body'&&l.y0-prev.y1<prev.size*.75&&Math.abs(l.main_size-prev.main_size)<.6&&!LIST.test(t);
  if(prev?.kind==='caption'&&l.bold&&l.y0-prev.y1<6){blocks.at(-1).text+=' '+t;addBox(blocks.at(-1),l);continue;}
  if(same){const b=blocks.at(-1);b.text+=(b.text.endsWith('-')?'':' ')+t;addBox(b,l);}else{let joined=false;if(first&&!LIST.test(t)){const b=blocks.findLast(b=>['para','heading','caption','table','figure'].includes(b.kind));if(b?.kind==='para'&&b.page===p-1&&!END.test(b.text)&&/^[a-z(]/.test(t)){b.text+=(b.text.endsWith('-')?'':' ')+t;addBox(b,l);blocks.splice(blocks.indexOf(b),1);blocks.push(b);joined=true;joins++;}}if(!joined)push('para',t,l);}first=false;prev=l;
 }}
 all.forEach(ls=>{for(const l of ls)if(['margin','front'].includes(l.kind))excluded.push({page:l.page,kind:l.kind,box:box(l.page,l.bbox)});});
 // Extend object boxes to the detected geometry, including table notes.
 for(const b of blocks.filter(b=>['table','figure'].includes(b.kind))){const ls=all[b.page].filter(l=>l.kind===b.kind&&inside(l,[b.boxes[0].x0,b.boxes[0].top,b.boxes[0].x1,b.boxes[0].bottom]));for(const r of pages[b.page][b.kind==='table'?'tables':'figures'])if(ls.some(l=>inside(l,r))){addBox(b,{page:b.page,bbox:r});}}
 // Geometry without any text still needs an image block in reading order.
 for(let p=start;p<pages.length;p++)for(const [kind,rs] of [['table',pages[p].tables],['figure',pages[p].figures]])for(const r of rs)if(!blocks.some(b=>b.page===p&&b.kind===kind&&b.boxes.some(x=>x.x0<=r[0]+2&&x.top<=r[1]+2&&x.x1>=r[2]-2&&x.bottom>=r[3]-2))){const b={id:'',kind,text:'',page:p,boxes:[box(p,r)]};const at=blocks.findIndex(x=>x.page>=p&&(x.page>p||x.boxes[0].top>r[1]));if(at<0)blocks.push(b);else blocks.splice(at,0,b);}
 blocks.forEach((b,i)=>b.id='b'+i);
 const stats=measure(pages,toc,all,blocks,start,body,joins);suspects(blocks,stats);
 for(const b of blocks)if(b.kind==='para')b.kind=BULLET.test(b.text)?'list':'paragraph';
 return {pages:pages.map(p=>({width:p.width,height:p.height})),blocks,excluded,stats};
}
function measure(pages,toc,all,blocks,start,body,joins){
 const headings=blocks.filter(b=>b.kind==='heading'),truth=toc.filter(([,t])=>HEAD.test(t)||ANNEX.test(t)||TOP.test(t)),used=new Map(),levels={},missing=[];let matched=0,level_correct=0;
 for(const b of headings){levels[b.level]=(levels[b.level]||0)+1;const k=norm(b.text.replace(/\[\^\w+\]/g,'')),i=truth.findIndex(([,t],i)=>!used.has(i)&&norm(t)===k);if(i>=0){used.set(i,true);matched++;if(truth[i][0]===b.level)level_correct++;}}
 truth.forEach((t,i)=>{if(!used.has(i))missing.push(t);});const buckets={};for(const ls of all)for(const l of ls)buckets[l.kind]=(buckets[l.kind]||0)+chars(l.plain);
 const refs=new Map(),defs=new Map();for(const b of blocks){if(b.kind==='footnote'){const n=b.text.match(/^\[\^(\d+)\]/)?.[1];if(n)defs.set(n,(defs.get(n)||0)+1);}else if(['para','heading','caption'].includes(b.kind))for(const m of b.text.matchAll(/\[\^(\d+)\]/g))refs.set(m[1],(refs.get(m[1])||0)+1);}
 return {pages:pages.length,body_start_page:start+1,body_font_size:body,chars_total:pages.reduce((n,p)=>n+p.nchars,0),chars_by_kind:buckets,chars_unaccounted:pages.reduce((n,p)=>n+p.nchars,0)-Object.values(buckets).reduce((a,b)=>a+b,0),headings:{detected:headings.length,bookmarks_numbered:truth.length,matched,level_correct,missing,detected_by_level:levels,unnumbered_candidates:blocks.filter(b=>b.kind==='heading_unnumbered').length,numbering_gaps:[]},paragraphs:{cross_page_joined:joins},objects:{table_captions:blocks.filter(b=>b.kind==='caption'&&b.text.startsWith('Table')).length,figure_captions:blocks.filter(b=>b.kind==='caption'&&b.text.startsWith('Figure')).length},footnotes:{definitions:[...defs.values()].reduce((a,b)=>a+b,0),refs:[...refs.values()].reduce((a,b)=>a+b,0),refs_without_definition:[...refs.keys()].filter(n=>!defs.has(n)),definitions_without_ref:[...defs.keys()].filter(n=>!refs.has(n))}};
}
function suspects(blocks,stats){
 const warn=(b,code,reason)=>{if(b.warning)b.warning.reason+=' · '+reason;else b.warning={code,reason};};const seen=new Set();
 for(const b of blocks){if(b.kind==='heading_unnumbered')warn(b,'unnumbered-heading','번호 없는 제목 후보');if(b.kind==='heading'){const m=b.text.match(HEAD)||b.text.match(ANNEX);if(!m)continue;const n=m[1],parts=n.split('.'),parent=parts.slice(0,-1).join('.'),last=parts.at(-1),reasons=[];if(parent&&!seen.has(parent)&&!(parts.length===2&&/^[A-Z]$/.test(parts[0])))reasons.push('상위 번호 없음');if(/^\d+$/.test(last)&&+last>1&&!seen.has((parent?parent+'.':'')+(+last-1)))reasons.push('앞 번호 없음');if(seen.has(n))reasons.push('번호 중복');seen.add(n);for(const reason of reasons){stats.headings.numbering_gaps.push({page:b.page+1,number:n,reason});warn(b,'heading-number',reason);}}}
 const seq=blocks.filter(b=>b.kind!=='footnote');seq.forEach((b,i)=>{if(b.kind==='para'){if(!END.test(b.text)&&!LIST.test(b.text)&&!(seq[i+1]?.kind==='para'&&LIST.test(seq[i+1].text)))warn(b,'paragraph-end','끝맺음 없이 끝나는 문단');if(/^[a-z]{2,}/.test(b.text)&&!LIST.test(b.text)&&!(/^[^.]{2,90}:/.test(b.text)))warn(b,'paragraph-start','소문자로 시작하는 문단');}});
 for(const b of blocks){const missing=stats.footnotes.refs_without_definition.filter(n=>b.text.includes('[^'+n+']'));const unused=stats.footnotes.definitions_without_ref.filter(n=>b.kind==='footnote'&&b.text.startsWith('[^'+n+']'));if(missing.length||unused.length)warn(b,'footnote-pair','각주 표시와 정의의 짝이 맞지 않음');}
}
// Keep unmatched markers as literal text; never invent an endnote relationship.
export function footnoteContent(text, stats) {
 const missing=new Set(stats.footnotes.refs_without_definition);
 const content=[];let at=0;
 for(const m of text.matchAll(/\[\^(\d+)\]/g)){
  if(m.index>at)content.push({kind:'text',text:text.slice(at,m.index)});
  content.push(missing.has(m[1])?{kind:'text',text:'['+m[1]+']'}:{kind:'footnote',label:m[1]});at=m.index+m[0].length;
 }
 if(at<text.length)content.push({kind:'text',text:text.slice(at)});
 return content;
}

