import {inflateSync} from 'node:zlib';
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
export function decodePng(uri){
 const m=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);if(!m)throw Error('PNG data URI required');
 const b=Buffer.from(m[1],'base64');if(b.toString('base64')!==m[1]||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('PNG signature');
 let off=8,header=null,end=false;const chunks=[];
 while(off+12<=b.length){const n=b.readUInt32BE(off),type=b.toString('ascii',off+4,off+8),data=b.subarray(off+8,off+8+n);if(off+n+12>b.length||crc(b.subarray(off+4,off+8+n))!==b.readUInt32BE(off+8+n))throw Error('PNG chunk/CRC');
 if(!header&&type!=='IHDR')throw Error('PNG header order');
 if(type==='IHDR'){if(header||n!==13)throw Error('PNG header');header=data;}
 else if(type==='IDAT')chunks.push(data);
 else if(type==='IEND'){if(n)throw Error('PNG end');end=true;off+=12;break;}
 off+=n+12;
 }
 if(!header||!end||off!==b.length)throw Error('PNG incomplete');
 const w=header.readUInt32BE(0),h=header.readUInt32BE(4),depth=header[8],channels={0:1,2:3,4:2,6:4}[header[9]];
 // Current server emits non-interlaced 8-bit grayscale/RGB/RGBA PNG. Fail closed on other encodings.
 if(!w||!h||depth!==8||!channels||header[10]||header[11]||header[12])throw Error('Unsupported PNG encoding');
 const stride=w*channels,expected=(stride+1)*h;if(expected>256*1024*1024)throw Error('PNG exceeds decode limit');
 const raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:expected});if(raw.length!==expected)throw Error('PNG scanline length');
 const previous=Buffer.alloc(stride),row=Buffer.alloc(stride);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)];if(f>4)throw Error('PNG filter');for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,c=x>=channels?previous[x-channels]:0,d=previous[x];let predictor=0;if(f===1)predictor=a;if(f===2)predictor=d;if(f===3)predictor=Math.floor((a+d)/2);if(f===4){const p=a+d-c,pa=Math.abs(p-a),pb=Math.abs(p-d),pc=Math.abs(p-c);predictor=pa<=pb&&pa<=pc?a:pb<=pc?d:c}row[x]=(raw[y*(stride+1)+1+x]+predictor)&255}row.copy(previous)}
 return {width:w,height:h};
}
export function validateResult(doc,count){
 const pages=doc.pages||{},bad=[];let images=0;
 function scan(x,p){if(!x||typeof x!=='object')return;if(p.endsWith('/image')){images++;try{decodePng(x.uri)}catch(e){bad.push({path:p,error:e.message})}}for(const[k,v]of Object.entries(x))scan(v,p+'/'+k)}scan(doc,'');
 const all=Object.keys(pages).length===count&&Array.from({length:count},(_,i)=>pages[String(i+1)]?.page_no===i+1).every(Boolean);
 return {all_pages:all,offline_images:bad.length===0&&(doc.pictures||[]).every(p=>typeof p.image?.uri==='string')&&Object.values(pages).every(p=>typeof p.image?.uri==='string'),images,bad_images:bad,image_decode_verified:true};
}

export function validateServer(server,api,capabilities,request){
 if(server['docling-serve']!=='1.38.2')throw Error('검증되지 않은 docling-serve 버전');
 const schema=api.paths?.['/v1/convert/file/async']?.post?.requestBody?.content?.['multipart/form-data']?.schema;
 const fields=(schema?.$ref?api.components?.schemas?.[schema.$ref.split('/').at(-1)]:schema)?.properties;
 if(!fields||!fields.files||Object.keys(request).some(k=>!fields[k]))throw Error('서버 multipart 요청 필드가 계약과 다릅니다');
 for(const [key,value]of Object.entries(request))if(key.endsWith('_preset')){
 const stage=Object.values(capabilities.stages||{}).find(s=>s.option===key);
 if(!stage?.presets?.some(p=>p.id===value))throw Error('서버 preset 미지원: '+key);
 }
}

// Preserve uint64 origin hashes as numeric JSON tokens, without Number rounding.
export function parseServerJson(bytes){
 return JSON.parse(bytes.toString('utf8'),(key,value,context)=>
  typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value)
   ? JSON.rawJSON(context.source):value);
}
export function validateTaskIdentity(response,task,required=false){
 if((required||Object.hasOwn(response,'task_id'))&&response.task_id!==task)
  throw Error('task_id mismatch or missing: expected '+task+', received '+String(response?.task_id));
}
export function validateDocument(doc,source){
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const require=(condition,message)=>{if(!condition)throw Error('Invalid DoclingDocument: '+message)};
 require(object(doc)&&doc.schema_name==='DoclingDocument'&&doc.version==='1.10.0','schema_name/version');
 require(typeof doc.name==='string'&&object(doc.origin),'name/origin');
 require(doc.origin.filename===source.basename&&doc.origin.mimetype==='application/pdf','source filename/MIME mismatch');
 const token=doc.origin.binary_hash?.rawJSON??doc.origin.binary_hash;
 require((typeof token==='number'&&Number.isSafeInteger(token))||(typeof token==='string'&&/^\d+$/.test(token)),'origin binary_hash uint64');
 require(BigInt(token)===BigInt('0x'+source.sha256.slice(-16)),'source digest mismatch');
 const nodes=new Map();
 function node(item,ref,root=false){
  require(object(item)&&item.self_ref===ref&&Array.isArray(item.children)&&typeof item.label==='string',ref+' node');
  require(root?item.parent===null:object(item.parent)&&typeof item.parent.$ref==='string',ref+' parent');
  require(new Set(item.children.map(c=>c?.$ref)).size===item.children.length,'duplicate child');
  nodes.set(ref,item);
 }
 node(doc.body,'#/body',true);node(doc.furniture,'#/furniture',true);
 for(const key of ['groups','texts','pictures','tables','key_value_items','form_items']){
  require(Array.isArray(doc[key]),key+' collection');
  doc[key].forEach((item,i)=>{node(item,`#/${key}/${i}`);
   if(key==='texts')require(typeof item.text==='string'&&typeof item.orig==='string','text/orig');
   if(key==='tables')require(object(item.data)&&Array.isArray(item.data.table_cells)&&Number.isInteger(item.data.num_rows)&&item.data.num_rows>=0&&Number.isInteger(item.data.num_cols)&&item.data.num_cols>=0,'table data');
  });
 }
 require(object(doc.pages),'pages object');
 for(const [key,page]of Object.entries(doc.pages)){
  require(object(page)&&String(page.page_no)===key&&Number.isInteger(page.page_no)&&page.page_no>0,'page_no');
  require(object(page.size)&&['width','height'].every(k=>Number.isFinite(page.size[k])&&page.size[k]>0),'page size');
 }
 function references(x){if(!object(x)&&!Array.isArray(x))return;
  if(Object.hasOwn(x,'$ref'))require(typeof x.$ref==='string'&&nodes.has(x.$ref),'unresolved reference');
  for(const value of Object.values(x))references(value);
 }
 references(doc);
 for(const [ref,item]of nodes){
  for(const child of item.children)require(object(child)&&nodes.has(child.$ref)&&nodes.get(child.$ref).parent?.$ref===ref,'child/parent relation');
  if(item.parent)require(nodes.get(item.parent.$ref)?.children.some(c=>c.$ref===ref),'parent/child relation');
  if(!['#/body','#/furniture'].includes(ref)&&!ref.startsWith('#/groups/')){
   require(Array.isArray(item.prov),'provenance');
   for(const p of item.prov)require(object(p)&&Number.isInteger(p.page_no)&&object(doc.pages[p.page_no])&&object(p.bbox)&&['l','t','r','b'].every(k=>Number.isFinite(p.bbox[k]))&&['TOPLEFT','BOTTOMLEFT'].includes(p.bbox.coord_origin),'provenance page/bbox');
  }
 }
 const visited=new Set(),active=new Set();
 function visit(ref){require(!active.has(ref),'children cycle');if(visited.has(ref))return;active.add(ref);for(const c of nodes.get(ref).children)visit(c.$ref);active.delete(ref);visited.add(ref)}
 visit('#/body');visit('#/furniture');require(visited.size===nodes.size,'unreachable node');
}
