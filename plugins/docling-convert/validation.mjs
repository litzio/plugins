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
