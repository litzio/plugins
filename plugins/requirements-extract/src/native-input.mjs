import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {basename} from 'node:path';
import {canonical,sha256} from './model.mjs';
import {checkProjectionConsistency} from './projection-consistency.mjs';
import {textOf} from './protected.mjs';
export function nativeInput(cli,file,key,mapFile) {
 const path=cli.scoped(file),snapshot=cli.run('inspect',path,'--format','json'),comparison=cli.run('compare',path,path,'--json');
 const need=(v,code)=>{if(!v)throw new Error(code);};checkProjectionConsistency(snapshot,need);
 need(snapshot.ok&&snapshot.revision===sha256(readFileSync(path)).slice(7)&&comparison.receipt.beforeRevision===snapshot.revision&&comparison.receipt.afterRevision===snapshot.revision,'native-revision');
 mapFile=mapFile.replace(/\.json$/,'-'+snapshot.revision+'.json');
 const snapshotFile=cli.scoped(mapFile),bytes=canonical(snapshot);
 if(!existsSync(snapshotFile)){try{writeFileSync(snapshotFile,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
 need(readFileSync(snapshotFile,'utf8')===bytes,'native-snapshot-conflict');
 const nativeResolver=(node,selector)=>{
  const target=selector.kind==='cell'?snapshot.nodes.find(n=>n.type==='cell'&&canonical(n.path)===canonical([...node.path,selector.row,selector.column])):node;
  const quote=selector.kind==='list-item'?textOf(node.items[selector.index].content):target?.text??target?.latex??target?.code;
  if(!quote)return [];
  return [{sourceKey:key,elementRef:'native:'+node.path.join('.'),selector:selector.kind==='cell'?'cell:'+selector.row+':'+selector.column:'full',quote,quoteDigest:sha256(quote),nativeLocation:{sourceId:sha256(snapshot.revision+canonical({path:node.path,selector})).slice(7),file,revision:snapshot.revision,path:target.path,...(selector.kind==='list-item'?{listItem:selector.index}:{}),precision:selector.kind==='cell'?'table':'block',limitations:['Native document only; no PDF provenance']}}];
 };
 return {key,blocks:comparison.before.blocks,nativeResolver,bundle:{kind:'native',snapshot,complete:{kind:'native-snapshot',documentRevision:snapshot.revision},provenance:{document:{relativePath:basename(file),revision:snapshot.revision},source:{native:{sha256:snapshot.revision}},items:[]}},registry:{sourceKey:key,artifactDigest:'sha256:'+snapshot.revision,nativeDigest:'sha256:'+snapshot.revision,nativeFile:file,mapFile}};
}
