import {readFile} from 'node:fs/promises';
export function activate(context) {
 return {status:()=>({available:true,message:'Ready'}),operations:{
  bytes:async ({path,offset=0,length})=>{const t=performance.now();const b=await readFile(path);return {size:b.length,base64:b.subarray(offset,length===undefined?undefined:offset+length).toString('base64'),readMs:performance.now()-t};},
  json:async ({path})=>JSON.parse(await readFile(path,'utf8'))
 },dispose(){}};
}
